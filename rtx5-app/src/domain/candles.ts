/**
 * Candle domain logic — OHLC aggregation for live + historical series.
 *
 * Semantics (MT5 / TradingView parity):
 *
 *   1. Bars are bucket-aligned to their timeframe interval.
 *   2. Closed bars are immutable. Only the active (current-bucket) bar mutates
 *      in response to live ticks.
 *   3. A tick that rolls into the IMMEDIATE next bucket opens the new live bar
 *      from the previous close so the visible handoff stays continuous until
 *      REST history heals the bucket's true open. If one or more whole buckets
 *      were missed, the sparse live bar opens at the first observed tick price
 *      instead of stretching a synthetic body across unseen time.
 *   4. Wick extremes never shrink within a bucket — highs are monotonically
 *      non-decreasing, lows monotonically non-increasing.
 *   5. Late / out-of-order ticks update their owning bucket; they never corrupt
 *      a newer bar.
 *   6. **Missing buckets are never fabricated.** If a tick rolls past the
 *      active bucket by more than `maxGapBuckets`, the caller must resync from
 *      REST — silent flat-fill is dishonest and hides connection problems.
 *   7. Timestamp unit (seconds / ms / µs / ns) is detected once by magnitude.
 */

import { Candle } from '../state/tradingState';
import { normalizeSymbol as normalizeMarketSymbol } from './symbols';

export const DEFAULT_CANDLE_HISTORY_LIMIT = 500;
export const MAX_CANDLE_SERIES_LENGTH = 2500;

// ─── Timeframes ─────────────────────────────────────────────────────────────

const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
  MN: 2592000,
};

const TIMEFRAME_ALIASES: Record<string, string> = {
  '1M': 'M1',
  '5M': 'M5',
  '15M': 'M15',
  '30M': 'M30',
  '1H': 'H1',
  '4H': 'H4',
  '1D': 'D1',
  '1W': 'W1',
  '1MO': 'MN',
};

export const normalizeSymbol = (symbol: string): string => normalizeMarketSymbol(symbol);

export const normalizeTimeframe = (timeframe: string): string => {
  const tf = timeframe.trim().toUpperCase();
  return TIMEFRAME_ALIASES[tf] ?? tf;
};

export const getTimeframeSeconds = (timeframe: string): number => {
  return TIMEFRAME_SECONDS[normalizeTimeframe(timeframe)] ?? 60;
};

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;

export const requiresHistoryAnchorForLiveBucketing = (timeframe: string): boolean => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  return normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN';
};

const addUtcMonthsClamped = (timeInSeconds: number, monthOffset: number): number => {
  const date = new Date(timeInSeconds * 1000);
  const targetMonthIndex = date.getUTCMonth() + monthOffset;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = date.getUTCDate();
  const lastDayOfSourceMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const resolvedDay = targetDay === lastDayOfSourceMonth
    ? lastDayOfTargetMonth
    : Math.min(targetDay, lastDayOfTargetMonth);

  return Math.floor(
    Date.UTC(
      targetYear,
      targetMonth,
      resolvedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ) / 1000,
  );
};

const addTradingDaysPreservingTime = (timeInSeconds: number, dayOffset: number): number => {
  const direction = dayOffset >= 0 ? 1 : -1;
  let remainingDays = Math.abs(dayOffset);
  const date = new Date(timeInSeconds * 1000);

  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remainingDays -= 1;
    }
  }

  return Math.floor(date.getTime() / 1000);
};

const alignTimeToUtcWeek = (timeInSeconds: number): number => {
  const date = new Date(timeInSeconds * 1000);
  const startOfDay = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return startOfDay - daysSinceMonday * DAY_SECONDS;
};

const alignTimeToUtcMonth = (timeInSeconds: number): number => {
  const date = new Date(timeInSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
};

const alignMonthlyBucketWithReference = (timeInSeconds: number, referenceBucketTime: number): number => {
  const referenceDate = new Date(referenceBucketTime * 1000);
  const currentDate = new Date(timeInSeconds * 1000);
  let monthOffset =
    (currentDate.getUTCFullYear() - referenceDate.getUTCFullYear()) * 12 +
    (currentDate.getUTCMonth() - referenceDate.getUTCMonth());
  let candidate = addUtcMonthsClamped(referenceBucketTime, monthOffset);

  while (candidate > timeInSeconds) {
    monthOffset -= 1;
    candidate = addUtcMonthsClamped(referenceBucketTime, monthOffset);
  }

  while (true) {
    const nextCandidate = addUtcMonthsClamped(referenceBucketTime, monthOffset + 1);
    if (nextCandidate > timeInSeconds) {
      return candidate;
    }
    monthOffset += 1;
    candidate = nextCandidate;
  }
};

// ─── Stream event shape (consumed by candlesSocket) ─────────────────────────

export type CandleStreamEvent =
  | { type: 'full_sync'; symbol: string; tf: string; candles: Candle[]; reason: 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch' }
  | { type: 'replace_last'; symbol: string; tf: string; candle: Candle }
  | { type: 'append'; symbol: string; tf: string; candle: Candle }
  | { type: 'resync_required'; symbol: string; tf: string; reason: string };

export type NormalizedIncomingCandle = {
  candle: Candle;
  hasExplicitHighLow: boolean;
};

// ─── Primitives ─────────────────────────────────────────────────────────────

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasFiniteField = (input: Record<string, unknown>, keys: string[]): boolean => {
  for (const key of keys) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return true;
  }
  return false;
};

/**
 * Single-shot magnitude detection for timestamp units.
 *
 *   > 4.2e16 → nanoseconds
 *   > 4.2e13 → microseconds
 *   > 4.2e10 → milliseconds
 *   else     → seconds
 */
const coerceTimestampToSeconds = (value: number): number => {
  if (value > 4.2e16) return Math.floor(value / 1_000_000_000);
  if (value > 4.2e13) return Math.floor(value / 1_000_000);
  if (value > 4.2e10) return Math.floor(value / 1_000);
  return Math.floor(value);
};

// ─── Bucket alignment ───────────────────────────────────────────────────────

export const alignTimeToBucket = (timeInSeconds: number, timeframe: string): number => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'W1') {
    return alignTimeToUtcWeek(timeInSeconds);
  }

  if (normalizedTimeframe === 'MN') {
    return alignTimeToUtcMonth(timeInSeconds);
  }

  const intervalSeconds = getTimeframeSeconds(normalizedTimeframe);
  return Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
};

export const alignTimeToBucketWithReference = (
  timeInSeconds: number,
  timeframe: string,
  referenceBucketTime?: number | null,
): number => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (!Number.isFinite(referenceBucketTime)) {
    return alignTimeToBucket(timeInSeconds, normalizedTimeframe);
  }

  if (normalizedTimeframe === 'MN') {
    return alignMonthlyBucketWithReference(timeInSeconds, Number(referenceBucketTime));
  }

  const intervalSeconds = getTimeframeSeconds(normalizedTimeframe);
  const anchor = Number(referenceBucketTime);
  return anchor + Math.floor((timeInSeconds - anchor) / intervalSeconds) * intervalSeconds;
};

export const normalizeTimestampToSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;

  let seconds: number | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    seconds = coerceTimestampToSeconds(value);
  } else if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      seconds = coerceTimestampToSeconds(numeric);
    } else {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        seconds = Math.floor(parsed / 1000);
      }
    }
  }

  if (seconds === null || seconds <= 0) return null;

  return seconds;
};

const normalizeTimeValue = (
  value: unknown,
  timeframe: string,
  referenceBucketTime?: number | null,
): number | null => {
  const seconds = normalizeTimestampToSeconds(value);
  if (seconds === null) return null;

  return alignTimeToBucketWithReference(seconds, timeframe, referenceBucketTime);
};

export const normalizeTimestampToBucket = (
  value: unknown,
  timeframe: string,
  referenceBucketTime?: number | null,
): number | null => {
  return normalizeTimeValue(value, timeframe, referenceBucketTime);
};

// ─── OHLC validation ────────────────────────────────────────────────────────

export const isStructurallyValidCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> => {
  if (!candle) return false;

  return (
    Number.isFinite(candle.time) &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close) &&
    candle.high >= candle.low
  );
};

export const isBucketAlignedCandle = (candle: Pick<Candle, 'time'>, timeframe: string): boolean => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN') {
    return Number.isFinite(candle.time);
  }

  return candle.time === alignTimeToBucket(candle.time, normalizedTimeframe);
};

// ─── Parsing ────────────────────────────────────────────────────────────────

export const normalizeCandle = (input: Record<string, unknown>, timeframe: string): Candle | null => {
  const explicitOpen = toFiniteNumber(input.open ?? input.o);
  const explicitHigh = toFiniteNumber(input.high ?? input.h);
  const explicitLow = toFiniteNumber(input.low ?? input.l);
  const hasExplicitBarShape = explicitOpen !== null || explicitHigh !== null || explicitLow !== null;
  const rawTime = normalizeTimestampToSeconds(input.time ?? input.timestamp ?? input.ts ?? input.t);
  const time =
    rawTime === null
      ? null
      : hasExplicitBarShape
        ? rawTime
        : alignTimeToBucket(rawTime, timeframe);
  const close = toFiniteNumber(input.close ?? input.c ?? input.price ?? input.p ?? input.bid ?? input.ask);
  const volume = toFiniteNumber(input.volume ?? input.v) ?? 0;

  if (time === null || close === null) return null;

  const open = explicitOpen ?? close;
  const high = explicitHigh ?? Math.max(open, close);
  const low = explicitLow ?? Math.min(open, close);

  if (explicitHigh !== null && explicitHigh < Math.max(open, close)) return null;
  if (explicitLow !== null && explicitLow > Math.min(open, close)) return null;
  if (explicitHigh !== null && explicitLow !== null && explicitHigh < explicitLow) return null;

  const candle: Candle = {
    time,
    open,
    high,
    low,
    close,
    volume: Math.max(volume, 0),
  };

  return isStructurallyValidCandle(candle) && (hasExplicitBarShape || isBucketAlignedCandle(candle, timeframe)) ? candle : null;
};

export const parseIncomingCandlePayload = (
  input: unknown,
  timeframe: string,
): NormalizedIncomingCandle | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const payload = input as Record<string, unknown>;
  const candle = normalizeCandle(payload, timeframe);
  if (!candle) return null;

  return {
    candle,
    hasExplicitHighLow:
      hasFiniteField(payload, ['high', 'h', 'High', 'H']) &&
      hasFiniteField(payload, ['low', 'l', 'Low', 'L']),
  };
};

// ─── Merge ──────────────────────────────────────────────────────────────────

/**
 * Merge a tick/bar update into the active bar of the same bucket.
 * Wick extremes expand monotonically; close follows the newest tick; open is
 * pinned (it was set by the first tick in the bucket and never changes).
 */
export const mergeCandleUpdate = (existing: Candle, incoming: Candle): Candle | null => {
  const merged: Candle = {
    time: existing.time,
    open: existing.open,
    high: Math.max(existing.high, incoming.high, incoming.close),
    low: Math.min(existing.low, incoming.low, incoming.close),
    close: incoming.close,
    volume: (Number.isFinite(incoming.volume) && incoming.volume > 0) ? incoming.volume : existing.volume,
  };

  if (!isStructurallyValidCandle(merged)) return null;

  if (
    merged.time === existing.time &&
    merged.open === existing.open &&
    merged.high === existing.high &&
    merged.low === existing.low &&
    merged.close === existing.close &&
    merged.volume === existing.volume
  ) {
    return existing;
  }

  return merged;
};

// ─── Series ops ─────────────────────────────────────────────────────────────

export const sortAndDedupeCandles = (candles: Candle[]): Candle[] => {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];

  for (const candle of sorted) {
    if (!isStructurallyValidCandle(candle)) continue;

    const last = deduped[deduped.length - 1];
    if (!last || last.time !== candle.time) {
      deduped.push(candle);
      continue;
    }

    const merged = mergeCandleUpdate(last, candle);
    if (merged) deduped[deduped.length - 1] = merged;
  }

  return deduped;
};

export const dedupeIncomingCandlePayloads = (
  entries: NormalizedIncomingCandle[],
): NormalizedIncomingCandle[] => {
  const sorted = [...entries].sort((a, b) => a.candle.time - b.candle.time);
  const deduped: NormalizedIncomingCandle[] = [];

  for (const entry of sorted) {
    const last = deduped[deduped.length - 1];
    if (!last || last.candle.time !== entry.candle.time) {
      deduped.push(entry);
      continue;
    }

    const merged = mergeCandleUpdate(last.candle, entry.candle);
    if (!merged) continue;

    deduped[deduped.length - 1] = {
      candle: merged,
      hasExplicitHighLow: last.hasExplicitHighLow || entry.hasExplicitHighLow,
    };
  }

  return deduped;
};

export const extractIncomingCandlePayloads = (
  payload: unknown,
  timeframe: string,
): NormalizedIncomingCandle[] => {
  const parsed: NormalizedIncomingCandle[] = [];

  const pushParsed = (item: unknown) => {
    const candle = parseIncomingCandlePayload(item, timeframe);
    if (candle) parsed.push(candle);
  };

  if (Array.isArray(payload)) {
    payload.forEach(pushParsed);
    return dedupeIncomingCandlePayloads(parsed);
  }

  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    record.data.forEach(pushParsed);
  } else if (Array.isArray(record.candles)) {
    record.candles.forEach(pushParsed);
  } else {
    pushParsed(record.candle ?? payload);
  }

  return dedupeIncomingCandlePayloads(parsed);
};

export const normalizeCandleSeries = (candles: unknown[], timeframe: string): Candle[] => {
  const normalized = candles
    .map((item) => (item && typeof item === 'object' ? normalizeCandle(item as Record<string, unknown>, timeframe) : null))
    .filter((item): item is Candle => item !== null);

  return sortAndDedupeCandles(normalized);
};

// ─── Bucket horizon helpers ─────────────────────────────────────────────────

export const getExpectedNextCandleTime = (lastTime: number, timeframe: string): number => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'MN') {
    return addUtcMonthsClamped(lastTime, 1);
  }

  if (normalizedTimeframe === 'W1') {
    return lastTime + WEEK_SECONDS;
  }

  if (normalizedTimeframe === 'D1') {
    return addTradingDaysPreservingTime(lastTime, 1);
  }

  return lastTime + getTimeframeSeconds(normalizedTimeframe);
};

export const getCurrentBucketTime = (
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): number => {
  return alignTimeToBucket(nowInSeconds, timeframe);
};

export const isWithinLiveBucketHorizon = (
  candleTime: number,
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean => {
  const currentBucket = getCurrentBucketTime(timeframe, nowInSeconds);
  return candleTime <= getExpectedNextCandleTime(currentBucket, timeframe);
};

/**
 * Build flat-valued bars between two non-contiguous bucket times.
 * Kept as a utility for explicit callers (e.g. `candlesSocket` historical
 * patches); the live aggregator deliberately does NOT call this any more,
 * because fabricated bars hide real connection issues.
 */
export const buildFlatGapCandles = (
  lastCandle: Candle,
  incomingTime: number,
  timeframe: string,
): Candle[] => {
  const candles: Candle[] = [];
  let nextTime = getExpectedNextCandleTime(lastCandle.time, timeframe);

  while (nextTime < incomingTime) {
    candles.push({
      time: nextTime,
      open: lastCandle.close,
      high: lastCandle.close,
      low: lastCandle.close,
      close: lastCandle.close,
      volume: 0,
    });
    nextTime = getExpectedNextCandleTime(nextTime, timeframe);
  }

  return candles;
};

export const getBucketGapCount = (fromTime: number, toTime: number, timeframe: string): number => {
  if (toTime <= fromTime) return 0;

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (!requiresHistoryAnchorForLiveBucketing(normalizedTimeframe)) {
    const intervalSeconds = getTimeframeSeconds(normalizedTimeframe);
    return Math.floor((toTime - fromTime) / intervalSeconds);
  }

  let cursor = fromTime;
  let bucketCount = 0;

  while (cursor < toTime) {
    const nextTime = getExpectedNextCandleTime(cursor, normalizedTimeframe);
    bucketCount += 1;

    if (nextTime >= toTime || nextTime <= cursor) {
      return bucketCount;
    }

    cursor = nextTime;
  }

  return bucketCount;
};

export const hasExcessiveLivePriceGap = (
  candles: Candle[],
  price: number,
  timestamp: unknown,
  timeframe: string,
  maxAutoGapFillCandles: number = 5,
): boolean => {
  if (candles.length === 0) return false;

  const normalized = normalizeCandle({ bid: price, timestamp }, timeframe);
  if (!normalized) return false;

  const lastCandle = candles[candles.length - 1];
  return (
    normalized.time > lastCandle.time &&
    getBucketGapCount(lastCandle.time, normalized.time, timeframe) > maxAutoGapFillCandles
  );
};

/**
 * Protect the visible series from a stale REST snapshot that ends far behind a
 * newly formed live tail. When that handoff gap exceeds the tolerated bucket
 * count, keep only the recent live segment and let background resync backfill
 * history later instead of rendering detached price regions together.
 */
export const pruneLiveCandlesCoveredByHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
): Candle[] => {
  const normalizedLive = sortAndDedupeCandles(liveCandles);
  if (normalizedLive.length === 0 || historyCandles.length === 0) {
    return normalizedLive.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  const historyLastTime = historyCandles[historyCandles.length - 1].time;
  return normalizedLive
    .filter((candle) => candle.time >= historyLastTime)
    .slice(-MAX_CANDLE_SERIES_LENGTH);
};

export const materializeHistoryAndLiveCandles = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  timeframe: string,
): Candle[] => {
  const normalizedHistory = sortAndDedupeCandles(historyCandles);
  const normalizedLive = sortAndDedupeCandles(liveCandles);

  if (normalizedHistory.length === 0) {
    return normalizedLive.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  if (normalizedLive.length === 0) {
    return normalizedHistory.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  const historyLastTime = normalizedHistory[normalizedHistory.length - 1].time;
  const firstLiveTime = normalizedLive[0].time;

  if (getBucketGapCount(historyLastTime, firstLiveTime, timeframe) > 1) {
    return normalizedLive.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  return sortAndDedupeCandles([...normalizedHistory, ...normalizedLive]).slice(-MAX_CANDLE_SERIES_LENGTH);
};

/**
 * Fast-path materializer for callers that already maintain both inputs as
 * individually sorted + de-duplicated candle arrays.
 *
 * This preserves the same visible-series semantics as
 * `materializeHistoryAndLiveCandles` but avoids re-sorting the entire merged
 * history window on every live tick. Live candles override history buckets
 * with the same timestamp, which is exactly what the chart needs once the live
 * overlay starts mutating the active bar.
 */
export const materializeCanonicalHistoryAndLiveCandles = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  timeframe: string,
): Candle[] => {
  if (historyCandles.length === 0) {
    return liveCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  if (liveCandles.length === 0) {
    return historyCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  const historyLastTime = historyCandles[historyCandles.length - 1].time;
  const firstLiveTime = liveCandles[0].time;

  if (getBucketGapCount(historyLastTime, firstLiveTime, timeframe) > 1) {
    return liveCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  const merged: Candle[] = [];
  let historyIndex = 0;
  let liveIndex = 0;

  while (historyIndex < historyCandles.length && liveIndex < liveCandles.length) {
    const history = historyCandles[historyIndex];
    const live = liveCandles[liveIndex];

    if (history.time < live.time) {
      merged.push(history);
      historyIndex += 1;
      continue;
    }

    if (history.time > live.time) {
      merged.push(live);
      liveIndex += 1;
      continue;
    }

    // Live overlay wins for the same bucket because it carries the freshest
    // close/wick shape for the active candle.
    merged.push(live);
    historyIndex += 1;
    liveIndex += 1;
  }

  while (historyIndex < historyCandles.length) {
    merged.push(historyCandles[historyIndex]);
    historyIndex += 1;
  }

  while (liveIndex < liveCandles.length) {
    merged.push(liveCandles[liveIndex]);
    liveIndex += 1;
  }

  return merged.slice(-MAX_CANDLE_SERIES_LENGTH);
};

// ─── Live tick application ──────────────────────────────────────────────────

type ApplyLivePriceOptions = {
  /**
   * Max contiguous empty buckets tolerated between the active bar and the
   * incoming tick. Beyond this the aggregator returns the series unchanged,
   * signalling the engine to refetch REST history instead of inventing bars.
   */
  maxAutoGapFillCandles?: number;
  /**
   * When true, append the incoming tick as a fresh bar even if the gap
   * exceeds `maxAutoGapFillCandles`. Intended for engines that want to keep
   * the tape alive while a resync is in flight. The intermediate buckets
   * are left missing (no synthetic flat bars).
   */
  allowSparseAppendOnGap?: boolean;
};

const resolveApplyLivePriceOptions = (
  input: number | ApplyLivePriceOptions | undefined,
): Required<ApplyLivePriceOptions> => {
  if (typeof input === 'number') {
    return { maxAutoGapFillCandles: input, allowSparseAppendOnGap: false };
  }

  return {
    maxAutoGapFillCandles: input?.maxAutoGapFillCandles ?? 5,
    allowSparseAppendOnGap: input?.allowSparseAppendOnGap ?? false,
  };
};

/**
 * Apply a single live tick to a bucket-aligned series.
 *
 *   1. Tick inside the active bucket → merge: expand wick, update close.
 *   2. Tick rolls into the NEXT bucket → close active bar, open the new bar at
 *      the previous close so the live handoff stays visually continuous.
 *   3. Tick rolls past several buckets → the gap exceeds `maxAutoGapFillCandles`:
 *        - default: return series unchanged; caller must resync.
 *        - `allowSparseAppendOnGap`: append the new bar at the tick's price
 *          and leave the intermediate buckets missing.
 *   4. Tick falls into an earlier bucket (late / out-of-order) → merge into
 *      that bucket only.
 */
export const applyLivePriceToCandleSeries = (
  candles: Candle[],
  price: number,
  timestamp: unknown,
  timeframe: string,
  options?: number | ApplyLivePriceOptions,
): Candle[] => {
  const { maxAutoGapFillCandles, allowSparseAppendOnGap } = resolveApplyLivePriceOptions(options);
  const normalized = normalizeCandle({ bid: price, timestamp }, timeframe);
  if (!normalized) return candles;

  if (candles.length === 0) return [normalized];

  const nextCandles = [...candles];
  const lastCandle = nextCandles[nextCandles.length - 1];

  // Case 1 — active bucket update.
  if (normalized.time === lastCandle.time) {
    const merged = mergeCandleUpdate(lastCandle, normalized);
    if (!merged || merged === lastCandle) return candles;
    nextCandles[nextCandles.length - 1] = merged;
    return nextCandles;
  }

  // Cases 2 & 3 — forward rollover.
  if (normalized.time > lastCandle.time) {
    const gapBuckets = getBucketGapCount(lastCandle.time, normalized.time, timeframe) - 1;
    const nextOpen = gapBuckets === 0 ? lastCandle.close : normalized.close;
    const nextLiveCandle: Candle = {
      time: normalized.time,
      open: nextOpen,
      high: Math.max(nextOpen, normalized.close),
      low: Math.min(nextOpen, normalized.close),
      close: normalized.close,
      volume: normalized.volume,
    };

    if (gapBuckets > maxAutoGapFillCandles) {
      if (!allowSparseAppendOnGap) return candles;
      nextCandles.push(nextLiveCandle);
      return nextCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
    }

    nextCandles.push(nextLiveCandle);
    return nextCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  // Case 4 — late tick for an earlier bucket.
  const existingIndex = nextCandles.findIndex((candle) => candle.time === normalized.time);
  if (existingIndex === -1) return candles;

  const mergedHistorical = mergeCandleUpdate(nextCandles[existingIndex], normalized);
  if (!mergedHistorical || mergedHistorical === nextCandles[existingIndex]) return candles;

  nextCandles[existingIndex] = mergedHistorical;
  return nextCandles;
};

// ─── History overlay / heal ─────────────────────────────────────────────────

export const overlayLiveCandlesOnHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
): Candle[] => {
  if (historyCandles.length === 0) return liveCandles.slice(-MAX_CANDLE_SERIES_LENGTH);
  if (liveCandles.length === 0) return historyCandles.slice(-MAX_CANDLE_SERIES_LENGTH);

  return sortAndDedupeCandles([...historyCandles, ...liveCandles]).slice(-MAX_CANDLE_SERIES_LENGTH);
};

/**
 * Heal the active bar using a recent REST snapshot. REST is authoritative for
 * the bar's true open (the first tick of the bucket, which the live stream
 * often misses if it subscribed mid-bucket); the live stream is authoritative
 * for the latest close. Wick extremes expand from both sources.
 */
const mergeActiveCandleWithRecentHistory = (
  existing: Candle,
  historical: Candle,
): Candle | null => {
  const healed: Candle = {
    time: existing.time,
    open: historical.open,
    high: Math.max(existing.high, historical.high, historical.open, historical.close, existing.close),
    low: Math.min(existing.low, historical.low, historical.open, historical.close, existing.close),
    close: existing.close,
    volume: Math.max(existing.volume, historical.volume),
  };

  if (!isStructurallyValidCandle(healed)) return null;

  if (
    healed.time === existing.time &&
    healed.open === existing.open &&
    healed.high === existing.high &&
    healed.low === existing.low &&
    healed.close === existing.close &&
    healed.volume === existing.volume
  ) {
    return existing;
  }

  return healed;
};

export const mergeRecentHistoryIntoCandles = (
  candles: Candle[],
  recentHistory: Candle[],
  timeframe: string,
): Candle[] => {
  if (candles.length === 0) return sortAndDedupeCandles(recentHistory);

  const currentLastTime = candles[candles.length - 1].time;
  const cacheTimes = new Map(candles.map((candle, index) => [candle.time, index]));
  const nextCandles = [...candles];
  let changed = false;

  for (const historical of recentHistory) {
    if (!isStructurallyValidCandle(historical) || !isBucketAlignedCandle(historical, timeframe)) continue;

    const existingIndex = cacheTimes.get(historical.time);
    if (existingIndex === undefined) {
      if (historical.time < currentLastTime) {
        nextCandles.push(historical);
        changed = true;
      }
      continue;
    }

    const existing = nextCandles[existingIndex];
    const healed =
      historical.time < currentLastTime
        ? historical
        : mergeActiveCandleWithRecentHistory(existing, historical) ?? historical;

    if (
      existing.time !== healed.time ||
      existing.open !== healed.open ||
      existing.high !== healed.high ||
      existing.low !== healed.low ||
      existing.close !== healed.close ||
      existing.volume !== healed.volume
    ) {
      nextCandles[existingIndex] = healed;
      changed = true;
    }
  }

  return changed ? sortAndDedupeCandles(nextCandles) : candles;
};
