import type { Candle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { sortAndDedupeCandles } from '../series/candleSeriesMerger';
import { filterIsolatedPriceOutliers, isCandleInternallyCoherent } from '../series/priceCoherence';

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartLinePoint = {
  time: number;
  value: number;
};

export const sanitizeCandlesForChart = (
  candles: readonly Candle[],
  options: { timeframe?: string } = {},
): Candle[] => {
  const structurallySafe = sortAndDedupeCandles(candles).filter(
    (candle) => validateCandle(candle) && isCandleInternallyCoherent(candle),
  );

  return options.timeframe
    ? filterIsolatedPriceOutliers(structurallySafe, { timeframe: options.timeframe })
    : structurallySafe;
};

export const convertCandlesForChart = (candles: readonly Candle[]): ChartCandle[] =>
  sanitizeCandlesForChart(candles).map((candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));

export const convertCandlesToLinePoints = (candles: readonly Candle[]): ChartLinePoint[] =>
  sanitizeCandlesForChart(candles).map((candle) => ({
    time: candle.time,
    value: candle.close,
  }));
