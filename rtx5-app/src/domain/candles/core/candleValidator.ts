import type { Candle } from './candleTypes';

/**
 * Type guard to check if a value is a valid, finite number.
 */
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Strictly validates a candle object to ensure its geometric and numeric integrity.
 * 
 * Rules:
 * - Time, Open, High, Low, Close must all be finite numbers.
 * - Time must be positive.
 * - High must be >= Open, Close, and Low.
 * - Low must be <= Open, Close, and High.
 * 
 * @param candle The raw or partial candle object to validate.
 * @returns True if the candle is geometrically valid.
 */
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

/**
 * Safely logs a warning to the console if an invalid candle is detected, 
 * but only in development environments. Prevents console spam in production.
 */
export const logInvalidCandleInDevelopment = (label: string, raw: unknown): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[candles] rejected invalid candle: ${label}`, raw);
  }
};
