export type MinimalEngineCandle = {
  time: number;
};

import { getBucketGapCount } from '../../domain/candles';

const areSeriesStructurallyEqual = (
  currentCandles: MinimalEngineCandle[],
  cachedCandles: MinimalEngineCandle[],
): boolean => {
  if (currentCandles === cachedCandles) {
    return true;
  }

  if (currentCandles.length !== cachedCandles.length) {
    return false;
  }

  for (let index = 0; index < currentCandles.length; index += 1) {
    if (currentCandles[index].time !== cachedCandles[index].time) {
      return false;
    }
  }

  return true;
};

export const shouldRenderBootstrapPreview = (
  _historyCandlesLength: number,
  _visibleCandlesLength: number,
): boolean => true;

export const shouldAdoptCachedSeries = (
  status: 'idle' | 'bootstrapping' | 'ready',
  historyCandlesLength: number,
  currentCandles: MinimalEngineCandle[],
  cachedCandles: MinimalEngineCandle[],
): boolean => {
  if (cachedCandles.length === 0 || areSeriesStructurallyEqual(currentCandles, cachedCandles)) {
    return false;
  }

  const cachedLastTime = cachedCandles[cachedCandles.length - 1]?.time ?? 0;
  const liveLastTime = currentCandles[currentCandles.length - 1]?.time ?? 0;

  return (
    currentCandles.length === 0 ||
    status !== 'ready' ||
    historyCandlesLength === 0 ||
    cachedCandles.length > currentCandles.length ||
    cachedLastTime > liveLastTime
  );
};

export type VisibleSeriesMode = 'empty' | 'current' | 'history' | 'merged';

export const resolveVisibleSeriesMode = (
  historyCandles: MinimalEngineCandle[],
  liveCandles: MinimalEngineCandle[],
  currentCandles: MinimalEngineCandle[],
  timeframe: string,
): VisibleSeriesMode => {
  if (historyCandles.length === 0) {
    return liveCandles.length > 0 || currentCandles.length > 0 ? 'current' : 'empty';
  }

  if (liveCandles.length === 0) {
    return 'history';
  }

  const historyLastTime = historyCandles[historyCandles.length - 1]?.time ?? 0;
  const firstLiveTime = liveCandles[0]?.time ?? 0;

  if (getBucketGapCount(historyLastTime, firstLiveTime, timeframe) > 1) {
    return currentCandles.length > 0 ? 'current' : 'history';
  }

  return 'merged';
};

export const shouldKeepBootstrappingOnHistoryFailure = (
  historyCandlesLength: number,
  visibleCandlesLength: number,
): boolean => historyCandlesLength === 0 && visibleCandlesLength === 0;
