import type { Candle, LiveCandle, MutableCandle } from './candleTypes';
import { getBucketStart } from './timeframeUtils';
import { validateCandle } from './candleValidator';

export type ApplyCandleOptions = {
  historyCutoffTime?: number | null;
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

export const applyLiveCandleToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  liveCandle: LiveCandle,
  timeframe?: string,
  options: ApplyCandleOptions = {},
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
  const eventTime = liveCandle.time;
  if (
    existing?.source === 'live_candle' &&
    typeof existing.lastUpdateTime === 'number' &&
    eventTime < existing.lastUpdateTime
  ) {
    return { candle: null, changed: false, ignored: true, reason: 'stale_live_candle' };
  }

  if (!existing) {
    const currentTail = Array.from(candleMap.keys()).sort((a, b) => b - a)[0];
    if (currentTail !== undefined && bucketStart < currentTail) {
      return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
    }
  }

  const next: MutableCandle = {
    time: bucketStart,
    open: liveCandle.open,
    high: liveCandle.high,
    low: liveCandle.low,
    close: liveCandle.close,
    volume: liveCandle.volume ?? 0,
    source: 'live_candle',
    closed: liveCandle.closed ?? false,
    firstUpdateTime:
      existing?.firstUpdateTime === undefined
        ? eventTime
        : Math.min(existing.firstUpdateTime, eventTime),
    lastUpdateTime: eventTime,
  };

  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_live_candle' };
  }

  candleMap.set(bucketStart, next);

  return {
    candle: toPublicCandle(next),
    changed: !existing || !areCandlesEqual(toPublicCandle(existing), toPublicCandle(next)),
    ignored: false,
  };
};
