/**
 * Shared candle-cache guardrail.
 *
 * All raw history snapshots must flow through this module before they touch
 * `useTradingState().candles`. The visible candle cache is intentionally the
 * chart's canonical merged series, not a raw REST-only history buffer.
 *
 * That keeps chart remounts, screen transitions, and future non-chart changes
 * from silently reverting the cache back to split history/live arrays.
 */
import {
  DEFAULT_CANDLE_HISTORY_LIMIT,
  MAX_CANDLE_SERIES_LENGTH,
  mergeRecentHistoryIntoCandles,
  normalizeSymbol,
  normalizeTimeframe,
  sortAndDedupeCandles,
} from '../domain/candles';
import { Candle, useTradingState } from './tradingState';
import { persistCanonicalCandleCache } from './persistedCandleCache';

const areCandlesEqual = (left: Candle, right: Candle): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  left.volume === right.volume;

const areSeriesEqual = (left: Candle[], right: Candle[]): boolean => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!areCandlesEqual(left[index], right[index])) {
      return false;
    }
  }

  return true;
};

const normalizeCandleKey = (symbol: string, timeframe: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return null;
  }

  return {
    key: `${normalizedSymbol}.${normalizedTimeframe}`,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

type SyncMergedCandleCacheOptions = {
  canonical?: boolean;
};

export const syncMergedCandleCache = (
  symbol: string,
  timeframe: string,
  candles: Candle[],
  options?: SyncMergedCandleCacheOptions,
): boolean => {
  const normalized = normalizeCandleKey(symbol, timeframe);
  if (!normalized) {
    return false;
  }

  const nextCandles = options?.canonical
    ? candles.slice(-MAX_CANDLE_SERIES_LENGTH)
    : sortAndDedupeCandles(candles).slice(-MAX_CANDLE_SERIES_LENGTH);
  const currentCandles = useTradingState.getState().candles[normalized.key] ?? [];
  if (areSeriesEqual(currentCandles, nextCandles)) {
    return false;
  }

  useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
  persistCanonicalCandleCache(normalized.symbol, normalized.timeframe, nextCandles);
  return true;
};

export const mergeHistoryIntoCandleCache = (
  symbol: string,
  timeframe: string,
  historyCandles: Candle[],
): Candle[] => {
  const normalized = normalizeCandleKey(symbol, timeframe);
  if (!normalized) {
    return [];
  }

  const nextHistory = sortAndDedupeCandles(historyCandles).slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
  const currentCandles = useTradingState.getState().candles[normalized.key] ?? [];
  const nextCandles =
    currentCandles.length > 0
      ? mergeRecentHistoryIntoCandles(currentCandles, nextHistory, normalized.timeframe).slice(
          -MAX_CANDLE_SERIES_LENGTH,
        )
      : nextHistory;

  if (!areSeriesEqual(currentCandles, nextCandles)) {
    useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
    persistCanonicalCandleCache(normalized.symbol, normalized.timeframe, nextCandles);
  }

  return nextCandles;
};
