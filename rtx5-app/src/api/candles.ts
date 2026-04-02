/**
 * Historical Candlestick Data API (V2)
 * 
 * Fetches paginated OHLCV (Open, High, Low, Close, Volume) data
 * required to render the initial state of the Lightweight Charts.
 */

import { apiClient } from './apiClient';
import { Candle } from '../state/tradingState';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeCandleSeries, normalizeSymbol, normalizeTimeframe } from '../domain/candles';

/** Response shape from GET /api/v1/candles */
export interface CandleHistoryResponse {
  symbol: string;
  timeframe: string;
  count: number;
  candles: Candle[];
}

/**
 * Fetches historical candlestick data for a given symbol and timeframe.
 *
 * GET /api/v1/candles?symbol={symbol}&timeframe={timeframe}&count={count}
 *
 * @param symbol    - Trading pair (e.g. 'EURUSD', 'XAUUSD')
 * @param timeframe - Candle period (e.g. 'M1', 'M5', 'H1', 'D1')
 * @param count     - Number of candles to fetch (default 200)
 */
export async function getCandleHistory(
  symbol: string,
  timeframe: string,
  count: number = DEFAULT_CANDLE_HISTORY_LIMIT,
  signal?: AbortSignal,
): Promise<CandleHistoryResponse> {
  const requestedSymbol = normalizeSymbol(symbol);
  const requestedTimeframe = normalizeTimeframe(timeframe);
  const params = new URLSearchParams();
  params.set('timeframe', requestedTimeframe);
  params.set('limit', String(count));

  const response = await apiClient(`/candles/${requestedSymbol}?${params.toString()}`, { signal });

  if (!response.ok) {
    let errorMsg = 'Failed to fetch candle history';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (_e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  const payload = await response.json();
  const normalizedCandles = normalizeCandleSeries(
    Array.isArray(payload?.candles) ? payload.candles : [],
    payload?.timeframe ?? requestedTimeframe,
  );

  return {
    symbol: requestedSymbol,
    timeframe: normalizeTimeframe(payload?.timeframe ?? requestedTimeframe),
    count: normalizedCandles.length,
    candles: normalizedCandles,
  };
}
