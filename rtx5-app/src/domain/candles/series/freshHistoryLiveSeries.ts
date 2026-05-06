import type { Candle, MutableCandle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { createCandleMap, materializeCandleMap, mergeCandleIntoMap } from './candleSeriesMerger';

export const buildFreshHistoryLiveCandleSeries = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  limit?: number,
): Candle[] => {
  const map = createCandleMap(historyCandles);

  for (const candle of liveCandles) {
    if (!validateCandle(candle)) {
      continue;
    }

    mergeCandleIntoMap(map, candle, {
      source: 'live_candle',
      closed: false,
      volumeStrategy: 'sum',
    });
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

  return liveCandles.filter((candle) => candle.time > closedHistoryLastTime);
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
    if (time > closedHistoryLastTime) {
      next.set(time, { ...candle });
    }
  }
  return next;
};
