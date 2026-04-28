import type { Candle, LiveCandle, MutableCandle, Tick } from './candleTypes';
import { getBucketStart, getBucketGapCount } from './timeframeUtils';
import { validateCandle, validateTick } from './candleValidator';

export type ApplyTickOptions = {
  historyCutoffTime?: number | null;
  maxLateBuckets?: number;
};

export type ApplyCandleResult = {
  candle: Candle | null;
  changed: boolean;
  ignored: boolean;
  reason?: string;
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

export const createCandleFromTick = (bucketStart: number, tick: Tick): MutableCandle => ({
  time: bucketStart,
  open: tick.price,
  high: tick.price,
  low: tick.price,
  close: tick.price,
  volume: tick.volume ?? 0,
  firstTickTime: tick.timestamp,
  lastTickTime: tick.timestamp,
  lastSequence: tick.sequence,
  source: 'live_tick',
  closed: false,
});

export const updateCandleFromTick = (
  existing: MutableCandle,
  tick: Tick,
): MutableCandle => {
  const existingLastTickTime = existing.lastTickTime;
  const existingLastSequence = existing.lastSequence;
  const isNewerClose =
    existingLastTickTime === undefined ||
    tick.timestamp > existingLastTickTime ||
    (tick.timestamp === existingLastTickTime &&
      (existingLastSequence === undefined ||
        tick.sequence === undefined ||
        tick.sequence >= existingLastSequence));

  return {
    ...existing,
    high: Math.max(existing.high, tick.price),
    low: Math.min(existing.low, tick.price),
    close: isNewerClose ? tick.price : existing.close,
    volume: tick.volume === undefined ? existing.volume ?? 0 : (existing.volume ?? 0) + tick.volume,
    firstTickTime:
      existing.firstTickTime === undefined
        ? tick.timestamp
        : Math.min(existing.firstTickTime, tick.timestamp),
    lastTickTime: isNewerClose ? tick.timestamp : existing.lastTickTime,
    lastSequence: isNewerClose ? tick.sequence : existing.lastSequence,
    source: existing.source === 'history' ? 'live_tick' : existing.source,
    closed: false,
  };
};

export const applyTickToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: Tick,
  timeframe: string,
  options: ApplyTickOptions = {},
): ApplyCandleResult => {
  if (!validateTick(tick)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_tick' };
  }

  const bucketStart = getBucketStart(tick.timestamp, timeframe);
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(bucketStart);
  if (!existing) {
    const currentTail = Array.from(candleMap.keys()).sort((a, b) => b - a)[0];
    if (currentTail !== undefined && bucketStart < currentTail) {
      const maxLateBuckets = options.maxLateBuckets ?? 20;
      if (getBucketGapCount(bucketStart, currentTail, timeframe) > maxLateBuckets) {
        return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
      }
      return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
    }

    const next = createCandleFromTick(bucketStart, tick);
    candleMap.set(bucketStart, next);
    return { candle: toPublicCandle(next), changed: true, ignored: false };
  }

  const before = toPublicCandle(existing);
  const updated = updateCandleFromTick(existing, tick);
  if (!validateCandle(updated)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  candleMap.set(bucketStart, updated);
  const after = toPublicCandle(updated);
  return {
    candle: after,
    changed: !areCandlesEqual(before, after),
    ignored: false,
  };
};

export const applyLiveCandleToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  liveCandle: LiveCandle,
  timeframe?: string,
  options: ApplyTickOptions = {},
): ApplyCandleResult => {
  if (!validateCandle(liveCandle)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_live_candle' };
  }

  const bucketStart = timeframe ? getBucketStart(liveCandle.time, timeframe) : liveCandle.time;
  if (bucketStart === null) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_bucket' };
  }

  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && bucketStart <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  const existing = candleMap.get(bucketStart);
  if (!existing) {
    const currentTail = Array.from(candleMap.keys()).sort((a, b) => b - a)[0];
    if (currentTail !== undefined && bucketStart < currentTail) {
      return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
    }
  }

  const eventTime = liveCandle.time;
  const next: MutableCandle = {
    time: bucketStart,
    open: liveCandle.open,
    high: liveCandle.high,
    low: liveCandle.low,
    close: liveCandle.close,
    volume: liveCandle.volume ?? 0,
    source: 'live_candle',
    closed: liveCandle.closed ?? false,
    firstTickTime: eventTime,
    lastTickTime: eventTime,
  };

  if (!existing) {
    candleMap.set(bucketStart, next);
    return {
      candle: toPublicCandle(next),
      changed: true,
      ignored: false,
    };
  }

  if (existing.source === 'history' && typeof historyCutoff !== 'number') {
    candleMap.set(bucketStart, next);
    return {
      candle: toPublicCandle(next),
      changed: !areCandlesEqual(toPublicCandle(existing), toPublicCandle(next)),
      ignored: false,
    };
  }

  const existingLastTickTime = existing.lastTickTime;
  const isNewerClose =
    existingLastTickTime === undefined ||
    eventTime >= existingLastTickTime;

  // When the backend sends a newer, complete live candle update, trust its
  // OHLCV entirely. The old merge kept `existing.high`/`existing.low` in
  // Math.max/Math.min which made wicks only ever grow — never correct back
  // to the server's canonical values after a stale local extreme.
  const merged: MutableCandle = isNewerClose
    ? {
        ...existing,
        time: bucketStart,
        open: existing.source === 'live_candle' ? existing.open : next.open,
        high: next.high,
        low: next.low,
        close: next.close,
        volume: Math.max(existing.volume ?? 0, next.volume ?? 0),
        firstTickTime:
          existing.firstTickTime === undefined
            ? eventTime
            : Math.min(existing.firstTickTime, eventTime),
        lastTickTime: eventTime,
        source: 'live_candle',
        closed: liveCandle.closed ?? existing.closed ?? false,
      }
    : {
        ...existing,
        time: bucketStart,
        open: existing.source === 'live_candle' ? existing.open : next.open,
        high: Math.max(existing.high, next.high),
        low: Math.min(existing.low, next.low),
        close: existing.close,
        volume: Math.max(existing.volume ?? 0, next.volume ?? 0),
        firstTickTime:
          existing.firstTickTime === undefined
            ? eventTime
            : Math.min(existing.firstTickTime, eventTime),
        lastTickTime: existing.lastTickTime,
        source: 'live_candle',
        closed: liveCandle.closed ?? existing.closed ?? false,
      };

  if (!validateCandle(merged)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_live_candle' };
  }

  candleMap.set(bucketStart, merged);

  return {
    candle: toPublicCandle(merged),
    changed: !areCandlesEqual(toPublicCandle(existing), toPublicCandle(merged)),
    ignored: false,
  };
};
