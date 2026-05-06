import type { Candle } from '../../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import {
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../../core/timeframeUtils';
import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import { useTradingState } from '../../../../state/tradingState';
import { buildRestHistorySeedCandles } from '../../core/candleProvenance';
import type {
  BufferedLiveEvent,
  CandleHistorySnapshot,
  CandleParams,
  HistorySeedSnapshot,
} from './types';

export const shouldLog = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

export const logDebug = (event: string, details?: Record<string, unknown>): void => {
  if (shouldLog()) {
    console.log(`[CANDLE-STREAM] ${event}`, details ?? {});
  }
};

export const toCandleParams = (candles: Candle[]): CandleParams[] => candles as CandleParams[];

export const getHistorySeedSnapshot = (history: CandleHistorySnapshot): HistorySeedSnapshot => {
  const seed = buildRestHistorySeedCandles(history.closedCandles, history.currentCandle);
  return {
    candles: sanitizeCandlesForChart(seed.candles).slice(-MAX_CANDLE_SERIES_LENGTH),
    closedHistoryLastTime: seed.closedHistoryLastTime,
    currentCandleTime: seed.currentCandleTime,
  };
};

export const getStoreCache = (symbol: string, timeframe: string): Candle[] => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return [];
  }
  const cached = useTradingState.getState().candles[`${normalizedSymbol}.${normalizedTimeframe}`] ?? [];
  return sanitizeCandlesForChart(cached).slice(-MAX_CANDLE_SERIES_LENGTH);
};

export const getEventTime = (event: BufferedLiveEvent): number =>
  event.type === 'live_candle' ? event.candle.time : event.time;

export const isSameSeries = (left: readonly Candle[], right: readonly Candle[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.time !== b.time ||
      a.open !== b.open ||
      a.high !== b.high ||
      a.low !== b.low ||
      a.close !== b.close ||
      (a.volume ?? 0) !== (b.volume ?? 0)
    ) {
      return false;
    }
  }
  return true;
};
