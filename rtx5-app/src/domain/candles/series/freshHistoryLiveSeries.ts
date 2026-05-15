import type { Candle, MutableCandle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { getBucketStart } from '../core/timeframeUtils';
import { materializeCandleMap, sortAndDedupeCandles } from './candleSeriesMerger';
import { areCandlePricesCoherent } from './priceCoherence';

const bucketCandle = (candle: Candle, timeframe: string): Candle | null => {
  if (!validateCandle(candle)) {
    return null;
  }

  const bucketStart = getBucketStart(candle.time, timeframe);
  if (bucketStart === null) {
    return null;
  }

  const next: Candle = {
    time: bucketStart,
    open: candle.open,
    high: Math.max(candle.high, candle.open, candle.close),
    low: Math.min(candle.low, candle.open, candle.close),
    close: candle.close,
    volume: Number.isFinite(candle.volume) ? candle.volume : 0,
  };

  return validateCandle(next) ? next : null;
};

const putHistoryCandle = (
  map: Map<number, MutableCandle>,
  candle: Candle,
  timeframe: string,
) => {
  const bucketed = bucketCandle(candle, timeframe);
  if (!bucketed) {
    return;
  }

  const existing = map.get(bucketed.time);
  if (!existing) {
    map.set(bucketed.time, { ...bucketed, source: 'history', closed: true });
    return;
  }

  map.set(bucketed.time, {
    ...existing,
    high: Math.max(existing.high, bucketed.high),
    low: Math.min(existing.low, bucketed.low),
    close: bucketed.close,
    volume: Math.max(existing.volume ?? 0, bucketed.volume ?? 0),
    source: 'history',
    closed: true,
  });
};

const putLiveCandle = (
  map: Map<number, MutableCandle>,
  candle: Candle,
  timeframe: string,
) => {
  const bucketed = bucketCandle(candle, timeframe);
  if (!bucketed) {
    return;
  }

  const existing = map.get(bucketed.time);
  if (!existing || !areCandlePricesCoherent(existing, bucketed)) {
    map.set(bucketed.time, { ...bucketed, source: 'live_candle', closed: false });
    return;
  }

  map.set(bucketed.time, {
    ...existing,
    ...bucketed,
    time: bucketed.time,
    high: Math.max(existing.high, bucketed.high, bucketed.open, bucketed.close),
    low: Math.min(existing.low, bucketed.low, bucketed.open, bucketed.close),
    volume: Math.max(existing.volume ?? 0, bucketed.volume ?? 0),
    source: 'live_candle',
    closed: false,
  });
};

export const buildFreshHistoryLiveCandleSeries = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  timeframe: string,
  limit?: number,
): Candle[] => {
  const map = new Map<number, MutableCandle>();

  for (const candle of sortAndDedupeCandles(historyCandles)) {
    putHistoryCandle(map, candle, timeframe);
  }

  for (const candle of sortAndDedupeCandles(liveCandles)) {
    putLiveCandle(map, candle, timeframe);
  }

  return materializeCandleMap(map, limit);
};

export const materializeLiveCandleMap = (
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
): Candle[] => {
  const liveCandles = materializeCandleMap(liveCandleMap);
  if (closedHistoryLastTime === null) {
    return liveCandles;
  }

  return liveCandles.filter((candle) => candle.time >= closedHistoryLastTime);
};

export const pruneLiveCandleMapCoveredByHistory = (
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
): Map<number, MutableCandle> => {
  if (closedHistoryLastTime === null) {
    return new Map(liveCandleMap);
  }

  const next = new Map<number, MutableCandle>();
  for (const [time, candle] of liveCandleMap.entries()) {
    if (time >= closedHistoryLastTime) {
      next.set(time, { ...candle });
    }
  }
  return next;
};
