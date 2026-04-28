import { normalizeSymbol } from '../../domain/symbols';
import { resolveQuoteTickTimestamp } from './quoteTimestamp';

export type QuoteTickEvent = {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
  timestamp: number;
};

export type NormalizedQuoteFeedUpdate = {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
  timestamp: number | null;
  timestampSource: 'feed' | 'received_at' | 'missing';
  rawKeys: string[];
};

export type QuoteTickNormalizationResult =
  | { ok: true; update: NormalizedQuoteFeedUpdate }
  | { ok: false; reason: 'missing_payload' | 'missing_symbol' | 'missing_bid_ask'; rawKeys: string[] };

const SYMBOL_KEYS = ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol'];
const BID_KEYS = ['bid', 'Bid', 'BID', 'bidPrice', 'BidPrice', 'bid_price', 'b', 'B'];
const ASK_KEYS = ['ask', 'Ask', 'ASK', 'askPrice', 'AskPrice', 'ask_price', 'a', 'A'];
const LAST_KEYS = ['last', 'Last', 'LAST', 'lastPrice', 'LastPrice', 'last_price', 'price', 'p', 'P', 'close', 'c'];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getCandidateRecords = (input: Record<string, unknown>): Record<string, unknown>[] => {
  const nestedQuote = asRecord(input.quote);
  const nestedData = asRecord(input.data);
  const nestedPayload = asRecord(input.payload);
  const nestedTick = asRecord(input.tick);
  const nestedMessage = asRecord(input.message);
  const nestedEvent = asRecord(input.event);
  const nestedDataQuote = nestedData ? asRecord(nestedData.quote) : null;
  const nestedDataTick = nestedData ? asRecord(nestedData.tick) : null;
  const nestedPayloadQuote = nestedPayload ? asRecord(nestedPayload.quote) : null;
  const nestedPayloadTick = nestedPayload ? asRecord(nestedPayload.tick) : null;
  return [
    input,
    nestedQuote,
    nestedData,
    nestedPayload,
    nestedTick,
    nestedMessage,
    nestedEvent,
    nestedDataQuote,
    nestedDataTick,
    nestedPayloadQuote,
    nestedPayloadTick,
  ].filter((record): record is Record<string, unknown> => record !== null);
};

const pickFirstValue = (
  records: Record<string, unknown>[],
  keys: readonly string[],
): unknown => {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }

  return undefined;
};

const toFinitePrice = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveTimestamp = (
  records: Record<string, unknown>[],
  fallbackMs: number | null,
): { timestamp: number | null; timestampSource: NormalizedQuoteFeedUpdate['timestampSource'] } => {
  const fromFeed = resolveQuoteTickTimestamp({
    timestamp: pickFirstValue(records, ['timestamp', 'Timestamp', 'TIMESTAMP']),
    time: pickFirstValue(records, ['time', 'Time', 'TIME']),
    t: pickFirstValue(records, ['t', 'T', 'ts', 'TS']),
    lastTickAt: pickFirstValue(records, ['lastTickAt', 'last_tick_at', 'last_tick_time']),
    serverTime: pickFirstValue(records, [
      'serverTime',
      'server_time',
      'serverTimestamp',
      'server_timestamp',
      'createdAt',
      'created_at',
      'updatedAt',
      'updated_at',
      'receivedAt',
      'received_at',
    ]),
  });

  if (fromFeed !== null) {
    return { timestamp: fromFeed, timestampSource: 'feed' };
  }

  const fallback = resolveQuoteTickTimestamp({}, fallbackMs);
  return fallback === null
    ? { timestamp: null, timestampSource: 'missing' }
    : { timestamp: fallback, timestampSource: 'received_at' };
};

export const normalizeQuoteTickPayload = (
  payload: unknown,
  fallbackTimestampMs: number | null = null,
): QuoteTickNormalizationResult => {
  const input = asRecord(payload);
  if (!input) {
    return { ok: false, reason: 'missing_payload', rawKeys: [] };
  }

  const records = getCandidateRecords(input);
  const rawKeys = Object.keys(input);
  const symbol = normalizeSymbol(String(pickFirstValue(records, SYMBOL_KEYS) ?? ''));
  if (!symbol) {
    return { ok: false, reason: 'missing_symbol', rawKeys };
  }

  const bid = toFinitePrice(pickFirstValue(records, BID_KEYS));
  const ask = toFinitePrice(pickFirstValue(records, ASK_KEYS));
  if (bid === null || ask === null || ask < bid) {
    return { ok: false, reason: 'missing_bid_ask', rawKeys };
  }

  const last = toFinitePrice(pickFirstValue(records, LAST_KEYS)) ?? undefined;
  const resolvedTimestamp = resolveTimestamp(records, fallbackTimestampMs);
  return {
    ok: true,
    update: {
      symbol,
      bid,
      ask,
      last,
      timestamp: resolvedTimestamp.timestamp,
      timestampSource: resolvedTimestamp.timestampSource,
      rawKeys,
    },
  };
};
