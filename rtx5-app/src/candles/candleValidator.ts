import type { Candle, Tick } from './candleTypes';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const validateCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Candle => {
  if (!candle) {
    return false;
  }

  return (
    isFiniteNumber(candle.time) &&
    candle.time > 0 &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    candle.high >= candle.open &&
    candle.high >= candle.close &&
    candle.high >= candle.low &&
    candle.low <= candle.open &&
    candle.low <= candle.close &&
    candle.low <= candle.high
  );
};

export const validateTick = (tick: Tick | null | undefined): tick is Tick => {
  if (!tick) {
    return false;
  }

  return (
    typeof tick.symbol === 'string' &&
    tick.symbol.length > 0 &&
    isFiniteNumber(tick.price) &&
    tick.price > 0 &&
    isFiniteNumber(tick.timestamp) &&
    tick.timestamp > 0 &&
    (tick.volume === undefined || (isFiniteNumber(tick.volume) && tick.volume >= 0))
  );
};

export const logInvalidCandleInDevelopment = (label: string, raw: unknown): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[candles] rejected invalid candle: ${label}`, raw);
  }
};

export const logInvalidTickInDevelopment = (label: string, raw: unknown): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[candles] rejected invalid tick: ${label}`, raw);
  }
};
