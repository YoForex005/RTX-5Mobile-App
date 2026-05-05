import type { Candle } from '../core/candleTypes';

/**
 * Deprecated compatibility function.
 *
 * Production chart candles must come from backend history plus backend live
 * candle snapshots. Callers receive an empty series instead of fabricated
 * OHLC data.
 */
export function generateMockCandles(_symbol: string, _timeframe: string, _count: number = 200): Candle[] {
  return [];
}
