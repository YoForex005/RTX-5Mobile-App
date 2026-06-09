import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { resolveQuoteTickTimestamp } from './quoteTimestamp';

export type QuoteTickEvent = {
  symbol: string;
  rawSymbol?: string;
  bid: number;
  ask: number;
  last?: number;
  high?: number;
  low?: number;
  open?: number;
  dailyOpen?: number;
  previousClose?: number;
  changePct?: number;
  spread?: number;
  volume?: number;
  digits?: number;
  point?: number;
  tickSize?: number;
  feedTickAt?: number;
  receivedAt: number;
  timestamp: number;
};

export type NormalizedQuoteFeedUpdate = {
  symbol: string;
  rawSymbol: string;
  bid: number;
  ask: number;
  last?: number;
  high?: number;
  low?: number;
  open?: number;
  dailyOpen?: number;
  previousClose?: number;
  changePct?: number;
  spread?: number;
  volume?: number;
  digits?: number;
  point?: number;
  tickSize?: number;
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
const OPEN_KEYS = ['open', 'Open', 'OPEN', 'daily_open', 'dailyOpen', 'dayOpen'];
const PREVIOUS_CLOSE_KEYS = ['previous_close', 'previousClose', 'prev_close', 'prevClose'];
const HIGH_KEYS = ['high', 'High', 'HIGH', 'high_bid', 'highBid', 'daily_high', 'dailyHigh', 'dayHigh'];
const LOW_KEYS = ['low', 'Low', 'LOW', 'low_bid', 'lowBid', 'daily_low', 'dailyLow', 'dayLow'];
const CHANGE_KEYS = ['changePct', 'dailyChangePct', 'daily_change_pct', 'change_pct', 'changePercent'];
const SPREAD_KEYS = ['spread', 'Spread', 'SPREAD'];
const VOLUME_KEYS = ['volume', 'Volume', 'VOL', 'tick_volume', 'tickVolume'];
const DIGITS_KEYS = [
  'digits',
  'Digits',
  'DIGITS',
  'precision',
  'pricePrecision',
  'price_precision',
  'symbolDigits',
  'symbol_digits',
  'priceDigits',
  'price_digits',
  'quoteDigits',
  'quote_digits',
  'quotePrecision',
  'quote_precision',
  'decimalPlaces',
  'decimal_places',
];
const POINT_KEYS = ['point', 'Point', 'POINT', 'pricePoint', 'price_point'];
const TICK_SIZE_KEYS = [
  'tickSize',
  'TickSize',
  'TICK_SIZE',
  'tick_size',
  'tick-size',
  'priceTickSize',
  'price_tick_size',
  'minimumPriceIncrement',
  'minimum_price_increment',
];

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

const toFiniteOptionalNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveOptionalNumber = (value: unknown): number | undefined => {
  const parsed = toFiniteOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const withSessionRecords = (records: Record<string, unknown>[]): Record<string, unknown>[] => {
  const sessionRecords = records
    .map((record) => asRecord(record.session))
    .filter((record): record is Record<string, unknown> => record !== null);

  return [...records, ...sessionRecords];
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
  const rawSymbol = normalizeQuoteSymbolKey(String(pickFirstValue(records, SYMBOL_KEYS) ?? ''));
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return { ok: false, reason: 'missing_symbol', rawKeys };
  }

  const bid = toFinitePrice(pickFirstValue(records, BID_KEYS));
  const ask = toFinitePrice(pickFirstValue(records, ASK_KEYS));
  if (bid === null || ask === null || ask < bid) {
    return { ok: false, reason: 'missing_bid_ask', rawKeys };
  }

  const last = toFinitePrice(pickFirstValue(records, LAST_KEYS)) ?? undefined;
  const metricRecords = withSessionRecords(records);
  const dailyOpen = toFiniteOptionalNumber(pickFirstValue(metricRecords, OPEN_KEYS));
  const previousClose = toFiniteOptionalNumber(pickFirstValue(metricRecords, PREVIOUS_CLOSE_KEYS));
  const high = toFiniteOptionalNumber(pickFirstValue(metricRecords, HIGH_KEYS));
  const low = toFiniteOptionalNumber(pickFirstValue(metricRecords, LOW_KEYS));
  const changePct = toFiniteOptionalNumber(pickFirstValue(metricRecords, CHANGE_KEYS));
  const spread = toFiniteOptionalNumber(pickFirstValue(metricRecords, SPREAD_KEYS));
  const volume = toFiniteOptionalNumber(pickFirstValue(metricRecords, VOLUME_KEYS));
  const digits = toFiniteOptionalNumber(pickFirstValue(metricRecords, DIGITS_KEYS));
  const point = toPositiveOptionalNumber(pickFirstValue(metricRecords, POINT_KEYS));
  const tickSize = toPositiveOptionalNumber(pickFirstValue(metricRecords, TICK_SIZE_KEYS));
  const resolvedTimestamp = resolveTimestamp(records, fallbackTimestampMs);
  return {
    ok: true,
    update: {
      symbol,
      rawSymbol,
      bid,
      ask,
      last,
      open: dailyOpen,
      dailyOpen,
      previousClose,
      high,
      low,
      changePct,
      spread,
      volume,
      digits,
      point,
      tickSize,
      timestamp: resolvedTimestamp.timestamp,
      timestampSource: resolvedTimestamp.timestampSource,
      rawKeys,
    },
  };
};
