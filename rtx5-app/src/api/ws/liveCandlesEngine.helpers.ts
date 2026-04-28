import {
  DEFAULT_CANDLE_HISTORY_LIMIT,
  isTrustworthyCandleBootstrapSeed,
  mergeRecentHistoryIntoCandles,
  sortAndDedupeCandles,
} from '../../domain/candles';
import type { Candle } from '../../state/tradingState';

export const FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT = Math.min(DEFAULT_CANDLE_HISTORY_LIMIT, 200);

export const shouldBackfillBootstrapHistory = (
  loadedCount: number,
  requestedLimit: number,
  fullLimit: number = DEFAULT_CANDLE_HISTORY_LIMIT,
): boolean =>
  loadedCount > 0 &&
  requestedLimit > 0 &&
  requestedLimit < fullLimit &&
  loadedCount < fullLimit;

/**
 * Compatibility helper for older tests/callers. New live buckets always open
 * at the first backend tick observed for that bucket. Previous closes are not
 * used to fabricate continuity.
 */
export const buildQuoteRolloverCandle = (
  bucketTime: number,
  _previousClose: number,
  observedPrice: number,
  _hasActiveLiveOverlay: boolean,
  volume: number = 0,
): Candle => {
  const open = observedPrice;

  return {
    time: bucketTime,
    open,
    high: Math.max(open, observedPrice),
    low: Math.min(open, observedPrice),
    close: observedPrice,
    volume: Math.max(volume, 0),
  };
};

/**
 * History refreshes must not collapse an already healthy chart window down to
 * a shorter partial snapshot. We merge fetched history forward into the
 * existing trusted window so transient backend truncation cannot reduce the
 * visible context to a handful of bars.
 */
export const mergeFetchedHistoryIntoWindow = (
  currentHistory: Candle[],
  fetchedHistory: Candle[],
  timeframe: string,
): Candle[] => {
  const normalizedFetched = sortAndDedupeCandles(fetchedHistory).slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
  if (currentHistory.length === 0) {
    return normalizedFetched;
  }

  const mergedExistingWindow = mergeRecentHistoryIntoCandles(currentHistory, normalizedFetched, timeframe);
  const currentLastTime = currentHistory[currentHistory.length - 1]?.time ?? 0;
  const appendedNewerHistory = normalizedFetched.filter((candle) => candle.time > currentLastTime);

  return sortAndDedupeCandles([...mergedExistingWindow, ...appendedNewerHistory]).slice(
    -DEFAULT_CANDLE_HISTORY_LIMIT,
  );
};

export const shouldAcceptBootstrapHistory = (
  fetchedHistory: Candle[],
  timeframe: string,
): boolean => isTrustworthyCandleBootstrapSeed(fetchedHistory, timeframe);
