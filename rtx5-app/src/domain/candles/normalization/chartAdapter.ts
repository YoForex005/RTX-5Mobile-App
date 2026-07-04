import type { Candle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { sortAndDedupeCandles } from '../series/candleSeriesMerger';

type CandleWithLiveMetadata = Candle & {
  source?: 'history' | 'live_candle';
  closed?: boolean;
};

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

export type SanitizeCandlesForChartOptions = {
  timeframe?: string;
  pruneSyntheticFlatLiveTail?: boolean;
};

const arePricesEqual = (left: number, right: number): boolean => {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
};

const isFlatCandle = (candle: Candle): boolean =>
  arePricesEqual(candle.open, candle.high) &&
  arePricesEqual(candle.high, candle.low) &&
  arePricesEqual(candle.low, candle.close);

const isSyntheticFlatLiveTailCandle = (
  candle: CandleWithLiveMetadata,
  previous: Candle | undefined,
): boolean => {
  if (!previous || candle.source !== 'live_candle' || candle.closed === true) {
    return false;
  }

  const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
  return (
    volume <= 1 &&
    isFlatCandle(candle) &&
    arePricesEqual(previous.close, candle.close)
  );
};

const pruneSyntheticFlatLiveTail = <TCandle extends Candle>(candles: TCandle[]): TCandle[] => {
  let firstSyntheticTailIndex = candles.length;

  for (let index = candles.length - 1; index > 0; index -= 1) {
    const candle = candles[index] as CandleWithLiveMetadata;
    const previous = candles[index - 1];
    if (!isSyntheticFlatLiveTailCandle(candle, previous)) {
      break;
    }
    firstSyntheticTailIndex = index;
  }

  return firstSyntheticTailIndex === candles.length ? candles : candles.slice(0, firstSyntheticTailIndex);
};

export const sanitizeCandlesForChart = (
  candles: readonly Candle[],
  options: SanitizeCandlesForChartOptions = {},
): Candle[] => {
  const normalized = sortAndDedupeCandles(candles).filter(validateCandle);
  return options.pruneSyntheticFlatLiveTail ? pruneSyntheticFlatLiveTail(normalized) : normalized;
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
