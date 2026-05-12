import type { Candle, MutableCandle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { createCandleMap, materializeCandleMap, sortAndDedupeCandles } from './candleSeriesMerger';
import { getBucketStart } from '../core/timeframeUtils';
import { areCandlePricesCoherent } from './priceCoherence';

/**
 * Builds a clean, unified array of candles from a combination of authoritative historical data
 * and live streaming data. History acts as the baseline while live candles overwrite or merge
 * with overlapping history buckets.
 *
 * During merging, the REST history candle is considered authoritative for the `open` price,
 * while the live candle is authoritative for `close` and `volume`. High/Low bounds are expanded.
 *
 * @param historyCandles - Base historical candles fetched from the REST API.
 * @param liveCandles - Live candles accumulated via WebSocket or active ticks.
 * @param timeframe - The string representation of the timeframe (e.g. 'M1', 'H1').
 * @param limit - Optional maximum number of candles to return.
 * @returns A sorted array of public Candles ready for the UI.
 */
export const buildFreshHistoryLiveCandleSeries = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  timeframe: string,
  limit?: number,
): Candle[] => {
  const map = new Map<number, MutableCandle>();

  for (const candle of sortAndDedupeCandles(historyCandles)) {
    const bucketStart = getBucketStart(candle.time, timeframe) ?? candle.time;
    map.set(bucketStart, {
      ...candle,
      source: 'history',
      closed: true,
    });
  }

  // We merge live candles with historical ones. We keep the REST seed `open`
  // as it represents the true open price. We use Math.max/min to preserve
  // the true high/low, and we use the live candle's close as authoritative.
  for (const candle of liveCandles) {
    if (!validateCandle(candle)) {
      continue;
    }

    const bucketStart = getBucketStart(candle.time, timeframe) ?? candle.time;
    const existing = map.get(bucketStart);

    if (existing && areCandlePricesCoherent(existing, candle)) {
      map.set(bucketStart, {
        ...existing,
        ...candle,
        time: bucketStart, // Always use bucket-aligned time
        open: existing.open, // REST seed `open` is authoritative
        high: Math.max(existing.high, candle.high),
        low: Math.min(existing.low, candle.low),
        close: candle.close, // Live candle `close` is authoritative
        volume: Math.max(existing.volume ?? 0, candle.volume ?? 0),
        source: 'live_candle',
        closed: false,
      });
    } else {
      map.set(bucketStart, {
        ...candle,
        time: bucketStart,
        source: 'live_candle',
        closed: false,
      });
    }
  }

  return materializeCandleMap(map, limit);
};

/**
 * Converts a mutable internal live candle map into a public, sorted array of Candles,
 * while intentionally filtering out any live candles that belong to fully closed historical periods.
 * 
 * This ensures that live updates don't accidentally render in the past if history has already
 * advanced beyond them.
 *
 * @param liveCandleMap - The stateful map of accumulated live candles.
 * @param closedHistoryLastTime - The timestamp of the most recent closed historical bucket.
 * @returns A filtered and sorted array of public Candles.
 */
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

/**
 * Cleans up the internal live candle map by completely discarding any live candles 
 * whose bucket time falls entirely within a closed historical period.
 * 
 * This prevents the real-time map from growing infinitely and ensures that once the REST API
 * serves authoritative history for a time window, the live map stops tracking it.
 *
 * @param liveCandleMap - The stateful map of accumulated live candles.
 * @param closedHistoryLastTime - The timestamp of the most recent closed historical bucket.
 * @returns A newly cloned map with old, history-covered candles removed.
 */
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
