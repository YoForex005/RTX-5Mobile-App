import type { Candle, MutableCandle } from '../core/candleTypes';
import { bucketCandle } from '../core/candleUtils';
import { materializeCandleMap, sortAndDedupeCandles } from './candleSeriesMerger';
import { areCandlePricesCoherent } from './priceCoherence';

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

const getLiveMetadata = (
  candle: Candle,
  existing?: MutableCandle,
): Partial<MutableCandle> => {
  const runtime = candle as Candle & Partial<MutableCandle>;
  return {
    firstUpdateTime: runtime.firstUpdateTime ?? existing?.firstUpdateTime,
    lastUpdateTime: runtime.lastUpdateTime ?? existing?.lastUpdateTime,
    lastBackendUpdateTime: runtime.lastBackendUpdateTime ?? existing?.lastBackendUpdateTime,
    lastQuoteTime: runtime.lastQuoteTime ?? existing?.lastQuoteTime,
  };
};

const putLiveCandle = (
  map: Map<number, MutableCandle>,
  candle: Candle,
  timeframe: string,
  closedHistoryLastTime?: number | null,
) => {
  const bucketed = bucketCandle(candle, timeframe);
  if (!bucketed) {
    return;
  }
  if (
    typeof closedHistoryLastTime === 'number' &&
    Number.isFinite(closedHistoryLastTime) &&
    bucketed.time <= closedHistoryLastTime
  ) {
    return;
  }

  const existing = map.get(bucketed.time);
  const metadata = getLiveMetadata(candle, existing);
  if (!existing || !areCandlePricesCoherent(existing, bucketed)) {
    map.set(bucketed.time, { ...bucketed, ...metadata, source: 'live_candle', closed: false });
    return;
  }

  map.set(bucketed.time, {
    ...existing,
    ...bucketed,
    ...metadata,
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
  options: { closedHistoryLastTime?: number | null; preserveProvenance?: boolean } = {},
): Candle[] => {
  const map = new Map<number, MutableCandle>();

  for (const candle of sortAndDedupeCandles(historyCandles)) {
    putHistoryCandle(map, candle, timeframe);
  }

  for (const candle of sortAndDedupeCandles(liveCandles)) {
    putLiveCandle(map, candle, timeframe, options.closedHistoryLastTime);
  }

  return materializeCandleMap(map, limit, { preserveMetadata: options.preserveProvenance === true });
};

export const materializeLiveCandleMap = (
  liveCandleMap: Map<number, MutableCandle>,
  closedHistoryLastTime: number | null,
  options: { preserveProvenance?: boolean } = {},
): Candle[] => {
  const liveCandles = materializeCandleMap(liveCandleMap, undefined, {
    preserveMetadata: options.preserveProvenance === true,
  });
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
