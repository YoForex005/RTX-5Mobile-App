import {
  DEFAULT_CANDLE_HISTORY_LIMIT,
  isTrustworthyCandleBootstrapSeed,
  mergeRecentHistoryIntoCandles,
  sortAndDedupeCandles,
} from '../../domain/candles';
import type { Candle } from '../../state/tradingState';

/**
 * When the engine has not observed any live bucket yet and the first quote
 * lands in the immediate bucket after REST history, using the previous close
 * as the new bucket open can fabricate a huge body on cold start. In that
 * case we prefer the first observed quote as the provisional open until a
 * recent history heal can restore the authoritative bucket open.
 */
export const buildQuoteRolloverCandle = (
  bucketTime: number,
  previousClose: number,
  observedPrice: number,
  hasActiveLiveOverlay: boolean,
  volume: number = 1,
): Candle => {
  const open = hasActiveLiveOverlay ? previousClose : observedPrice;

  return {
    time: bucketTime,
    open,
    high: Math.max(open, observedPrice),
    low: Math.min(open, observedPrice),
    close: observedPrice,
    volume: Math.max(volume, 1),
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
