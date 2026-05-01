import {
  normalizeHistoryCandle,
  normalizeHistoryCandles,
  normalizeLiveCandle,
} from '../candles/candleNormalizer';
import {
  createCandleMap,
  materializeCandleMap,
  mergeHistoryAndLiveMaps,
  sortAndDedupeCandles as canonicalSortAndDedupeCandles,
} from '../candles/candleMerger';
import { validateCandle } from '../candles/candleValidator';
import {
  createCandleStreamKey,
  getBucketGapCount,
  getBucketStart,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  isSupportedTimeframe,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
  SUPPORTED_TIMEFRAMES,
} from '../candles/timeframeUtils';
import type { Candle, MutableCandle } from '../candles/candleTypes';

export type { Candle } from '../candles/candleTypes';
export {
  createCandleStreamKey,
  getBucketGapCount,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  isSupportedTimeframe,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
  SUPPORTED_TIMEFRAMES,
};

export const MAX_CANDLE_SERIES_LENGTH = 2500;
export const DEFAULT_CANDLE_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
export const MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT = 8;

export type CandleStreamEvent =
  | { type: 'full_sync'; symbol: string; tf: string; candles: Candle[]; reason: 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch' }
  | { type: 'replace_last'; symbol: string; tf: string; candle: Candle }
  | { type: 'append'; symbol: string; tf: string; candle: Candle }
  | { type: 'resync_required'; symbol: string; tf: string; reason: string };

export type NormalizedIncomingCandle = {
  candle: Candle;
  hasExplicitHighLow: boolean;
};

export const alignTimeToBucket = (timeInSeconds: number, timeframe: string): number =>
  getBucketStart(timeInSeconds, timeframe) ?? Math.floor(timeInSeconds);

export const alignTimeToBucketWithReference = (
  timeInSeconds: number,
  timeframe: string,
  _referenceBucketTime?: number | null,
): number => alignTimeToBucket(timeInSeconds, timeframe);

export const normalizeTimestampToBucket = (
  value: unknown,
  timeframe: string,
  _referenceBucketTime?: number | null,
): number | null => {
  const timestamp = normalizeTimestampToSeconds(value);
  return timestamp === null ? null : alignTimeToBucket(timestamp, timeframe);
};

export const isStructurallyValidCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> => validateCandle(candle);

export const isBucketAlignedCandle = (candle: Pick<Candle, 'time'>, timeframe: string): boolean => {
  if (!Number.isFinite(candle.time)) {
    return false;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN') {
    return true;
  }

  return alignTimeToBucket(candle.time, normalizedTimeframe) === candle.time;
};

export const parseIncomingCandlePayload = (
  input: unknown,
  _timeframe: string,
): NormalizedIncomingCandle | null => {
  const candle = normalizeLiveCandle(input);
  if (!candle) {
    return null;
  }

  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const nested = record.candle && typeof record.candle === 'object' && !Array.isArray(record.candle)
    ? (record.candle as Record<string, unknown>)
    : record;
  const hasExplicitHighLow =
    ['high', 'h', 'High', 'H'].some((key) => Number.isFinite(Number(nested[key]))) &&
    ['low', 'l', 'Low', 'L'].some((key) => Number.isFinite(Number(nested[key])));

  return { candle, hasExplicitHighLow };
};

export const dedupeIncomingCandlePayloads = (
  entries: NormalizedIncomingCandle[],
): NormalizedIncomingCandle[] => {
  const byTime = new Map<number, NormalizedIncomingCandle>();
  for (const entry of entries) {
    if (validateCandle(entry.candle)) {
      byTime.set(entry.candle.time, {
        candle: { ...entry.candle },
        hasExplicitHighLow: entry.hasExplicitHighLow,
      });
    }
  }
  return Array.from(byTime.values()).sort((left, right) => left.candle.time - right.candle.time);
};

export const extractIncomingCandlePayloads = (
  payload: unknown,
  timeframe: string,
): NormalizedIncomingCandle[] => {
  const parsed: NormalizedIncomingCandle[] = [];
  const push = (value: unknown) => {
    const entry = parseIncomingCandlePayload(value, timeframe);
    if (entry) parsed.push(entry);
  };

  if (Array.isArray(payload)) {
    payload.forEach(push);
    return dedupeIncomingCandlePayloads(parsed);
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const nested = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.candles)
      ? record.candles
      : Array.isArray(record.items)
        ? record.items
        : null;

  if (nested) {
    nested.forEach(push);
  } else {
    push(record.candle ?? record);
  }

  return dedupeIncomingCandlePayloads(parsed);
};

export const normalizeCandleSeries = (candles: unknown[], _timeframe: string): Candle[] =>
  canonicalSortAndDedupeCandles(normalizeHistoryCandles(candles));

export const sortAndDedupeCandles = (candles: Candle[]): Candle[] =>
  canonicalSortAndDedupeCandles(candles);

export const mergeCandleUpdate = (_existing: Candle, incoming: Candle): Candle | null =>
  validateCandle(incoming) ? { ...incoming } : null;

export const getCurrentBucketTime = (
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): number => alignTimeToBucket(nowInSeconds, timeframe);

export const isWithinLiveBucketHorizon = (
  candleTime: number,
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean => candleTime <= getExpectedNextCandleTime(getCurrentBucketTime(timeframe, nowInSeconds), timeframe);



export const hasDetachedShortCandleTail = (
  candles: Candle[],
  timeframe: string,
  maxDetachedTailCandles: number = 3,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  if (normalized.length <= 1) {
    return false;
  }

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    if (getBucketGapCount(normalized[index].time, normalized[index + 1].time, timeframe) <= 1) {
      continue;
    }
    return normalized.length - (index + 1) <= maxDetachedTailCandles;
  }
  return false;
};

export const isTrustworthyCandleBootstrapSeed = (
  candles: Candle[],
  _timeframe: string,
  minCandles: number = MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  return normalized.length >= minCandles;
};

export const isRecentCandleBootstrapSeed = (
  candles: Candle[],
  timeframe: string,
  maxStalenessBuckets: number = 2,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  const last = normalized[normalized.length - 1];
  if (!last) {
    return false;
  }

  let allowed = last.time;
  for (let index = 0; index < maxStalenessBuckets; index += 1) {
    allowed = getExpectedNextCandleTime(allowed, timeframe);
  }
  return nowInSeconds <= allowed;
};

export const isRenderableCandleBootstrapSeed = (
  candles: Candle[],
  timeframe: string,
  minCandles: number = MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT,
  maxStalenessBuckets: number = 2,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean =>
  isTrustworthyCandleBootstrapSeed(candles, timeframe, minCandles) &&
  isRecentCandleBootstrapSeed(candles, timeframe, maxStalenessBuckets, nowInSeconds);

export const hasExcessiveLivePriceGap = (
  candles: Candle[],
  price: number,
  timestamp: unknown,
  timeframe: string,
  maxGapCandles: number = 5,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  const last = normalized[normalized.length - 1];
  const incomingTime = normalizeTimestampToBucket(timestamp, timeframe);
  return Boolean(
    last &&
      incomingTime !== null &&
      Number.isFinite(price) &&
      incomingTime > last.time &&
      getBucketGapCount(last.time, incomingTime, timeframe) > maxGapCandles,
  );
};

export const pruneLiveCandlesCoveredByHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
): Candle[] => {
  const history = sortAndDedupeCandles(historyCandles);
  const live = sortAndDedupeCandles(liveCandles);
  const historyLast = history[history.length - 1]?.time;
  return historyLast === undefined ? live : live.filter((candle) => candle.time > historyLast);
};

export const materializeHistoryAndLiveCandles = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  _timeframe: string,
): Candle[] => mergeHistoryAndLiveMaps(historyCandles, liveCandles, MAX_CANDLE_SERIES_LENGTH);

export const materializeCanonicalHistoryAndLiveCandles = materializeHistoryAndLiveCandles;



export const overlayLiveCandlesOnHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
): Candle[] => mergeHistoryAndLiveMaps(historyCandles, liveCandles, MAX_CANDLE_SERIES_LENGTH);

export const mergeRecentHistoryIntoCandles = (
  candles: Candle[],
  recentHistory: Candle[],
  _timeframe: string,
): Candle[] => {
  const map = createCandleMap(candles);
  for (const candle of sortAndDedupeCandles(recentHistory)) {
    map.set(candle.time, { ...candle, source: 'history', closed: true } as MutableCandle);
  }
  return materializeCandleMap(map, MAX_CANDLE_SERIES_LENGTH);
};
