import type { Candle, MutableCandle, Timeframe } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import {
  getBucketStart,
  normalizeSymbol,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from '../core/timeframeUtils';

export type LiveTickPriceField = 'price' | 'bid' | 'ask' | 'mid' | 'last';

export type NormalizedLiveTick = {
  symbol?: string;
  timeframe?: Timeframe;
  time: number;
  bucketTime: number;
  price: number;
  field: LiveTickPriceField;
  volume: number;
};

export type NormalizeLiveTickOptions = {
  expectedSymbol?: string;
  expectedTimeframe?: string;
};

export type ApplyTickOptions = NormalizeLiveTickOptions & {
  historyCutoffTime?: number | null;
};

export type ApplyTickResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
};

const TIME_KEYS = ['time', 'timestamp', 'ts', 't', 'date', 'datetime', 'serverTime', 'server_time'] as const;
const SYMBOL_KEYS = ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol'] as const;
const TIMEFRAME_KEYS = ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval'] as const;
const VOLUME_KEYS = ['volume', 'Volume', 'VOLUME', 'vol', 'tickVolume', 'tick_volume', 'v', 'V'] as const;
const PRICE_KEYS: readonly LiveTickPriceField[] = ['price', 'bid', 'ask', 'mid', 'last'];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getNestedTickRecord = (raw: unknown): Record<string, unknown> | null => {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  return asRecord(record.tick) ?? asRecord(record.quote) ?? asRecord(record.data) ?? record;
};

const pickFirst = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickPrice = (record: Record<string, unknown>): { price: number; field: LiveTickPriceField } | null => {
  for (const key of PRICE_KEYS) {
    const price = toFiniteNumber(record[key]);
    if (price !== null && price > 0) {
      return { price, field: key };
    }
  }
  return null;
};

const toPublicCandle = (candle: MutableCandle): Candle => ({
  time: candle.time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume ?? 0,
});

const areCandlesEqual = (left: Candle, right: Candle): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  (left.volume ?? 0) === (right.volume ?? 0);

const getCurrentTail = (candleMap: Map<number, MutableCandle>): number | null => {
  let tail: number | null = null;
  for (const time of candleMap.keys()) {
    if (tail === null || time > tail) {
      tail = time;
    }
  }
  return tail;
};

const expectedSymbolMatches = (tickSymbol: string | undefined, expectedSymbol: string | undefined): boolean => {
  if (!expectedSymbol || !tickSymbol) {
    return true;
  }
  return normalizeSymbol(tickSymbol) === normalizeSymbol(expectedSymbol);
};

const expectedTimeframeMatches = (
  tickTimeframe: Timeframe | undefined,
  expectedTimeframe: string | undefined,
): boolean => {
  if (!expectedTimeframe || !tickTimeframe) {
    return true;
  }
  return tickTimeframe === normalizeTimeframeStrict(expectedTimeframe);
};

export const normalizeLiveTick = (
  raw: unknown,
  timeframe: string,
  options: NormalizeLiveTickOptions = {},
): NormalizedLiveTick | null => {
  const record = getNestedTickRecord(raw);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!record || !normalizedTimeframe) {
    return null;
  }

  const time = normalizeTimestampToSeconds(pickFirst(record, TIME_KEYS));
  const price = pickPrice(record);
  if (time === null || price === null) {
    return null;
  }

  const bucketTime = getBucketStart(time, normalizedTimeframe);
  if (bucketTime === null) {
    return null;
  }

  const symbolValue = pickFirst(record, SYMBOL_KEYS);
  const tickSymbol = typeof symbolValue === 'string' ? normalizeSymbol(symbolValue) : undefined;
  if (!expectedSymbolMatches(tickSymbol, options.expectedSymbol)) {
    return null;
  }

  const timeframeValue = pickFirst(record, TIMEFRAME_KEYS);
  const tickTimeframe = normalizeTimeframeStrict(timeframeValue);
  if (!expectedTimeframeMatches(tickTimeframe ?? undefined, options.expectedTimeframe ?? timeframe)) {
    return null;
  }

  const rawVolume = toFiniteNumber(pickFirst(record, VOLUME_KEYS));
  const volume = rawVolume !== null && rawVolume > 0 ? rawVolume : 0;

  return {
    ...(tickSymbol ? { symbol: tickSymbol } : {}),
    ...(tickTimeframe ? { timeframe: tickTimeframe } : {}),
    time,
    bucketTime,
    price: price.price,
    field: price.field,
    volume,
  };
};

export const aggregateTickToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: NormalizedLiveTick,
  options: ApplyTickOptions = {},
): ApplyTickResult => {
  if (!expectedSymbolMatches(tick.symbol, options.expectedSymbol)) {
    return { candle: null, changed: false, ignored: true, reason: 'symbol_mismatch' };
  }
  if (!expectedTimeframeMatches(tick.timeframe, options.expectedTimeframe)) {
    return { candle: null, changed: false, ignored: true, reason: 'timeframe_mismatch' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && tick.bucketTime <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(tick.bucketTime);
  if (
    existing?.source === 'live_candle' &&
    typeof existing.lastUpdateTime === 'number' &&
    tick.time < existing.lastUpdateTime
  ) {
    return { candle: null, changed: false, ignored: true, reason: 'stale_tick' };
  }

  if (!existing) {
    const currentTail = getCurrentTail(candleMap);
    if (currentTail !== null && tick.bucketTime < currentTail) {
      return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
    }
  }

  const next: MutableCandle = existing
    ? {
        ...existing,
        high: Math.max(existing.high, tick.price),
        low: Math.min(existing.low, tick.price),
        close: tick.price,
        volume: (existing.volume ?? 0) + tick.volume,
        source: 'live_candle',
        closed: false,
        firstUpdateTime:
          existing.firstUpdateTime === undefined
            ? tick.time
            : Math.min(existing.firstUpdateTime, tick.time),
        lastUpdateTime: tick.time,
      }
    : {
        time: tick.bucketTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        source: 'live_candle',
        closed: false,
        firstUpdateTime: tick.time,
        lastUpdateTime: tick.time,
      };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  const publicCandle = toPublicCandle(next);
  const changed = !existing || !areCandlesEqual(toPublicCandle(existing), publicCandle);
  candleMap.set(tick.bucketTime, next);
  return { candle: publicCandle, changed, ignored: false };
};

