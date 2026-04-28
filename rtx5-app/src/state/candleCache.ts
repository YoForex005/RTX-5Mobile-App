/**
 * Shared chart candle cache.
 *
 * The cache is keyed strictly by normalized symbol + timeframe and stores only
 * sanitized backend/live candles. It never fills missing buckets and never
 * mixes data across chart contexts.
 */
import { sanitizeCandlesForChart } from '../candles/chartAdapter';
import {
  MAX_CANDLE_SERIES_LENGTH,
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../domain/candles';
import type { Candle } from './tradingState';
import { useTradingState } from './tradingState';
import { persistCanonicalCandleCache } from './persistedCandleCache';

const areCandlesEqual = (left: Candle, right: Candle): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  (left.volume ?? 0) === (right.volume ?? 0);

const areSeriesEqual = (left: Candle[], right: Candle[]): boolean => {
  if (left === right || left.length !== right.length) {
    return left === right;
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
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);

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
  _options?: SyncMergedCandleCacheOptions,
): boolean => {
  const normalized = normalizeCandleKey(symbol, timeframe);
  if (!normalized) {
    return false;
  }

  const nextCandles = sanitizeCandlesForChart(candles).slice(-MAX_CANDLE_SERIES_LENGTH);
  if (!isTrustworthyCandleBootstrapSeed(nextCandles, normalized.timeframe)) {
    return false;
  }

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

  const nextCandles = sanitizeCandlesForChart(historyCandles).slice(-MAX_CANDLE_SERIES_LENGTH);
  const currentCandles = useTradingState.getState().candles[normalized.key] ?? [];
  if (!areSeriesEqual(currentCandles, nextCandles)) {
    useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
    persistCanonicalCandleCache(normalized.symbol, normalized.timeframe, nextCandles);
  }

  return nextCandles;
};
