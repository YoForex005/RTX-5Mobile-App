/**
 * Market Status API (V2)
 *
 * Provides real-time market open/closed status per symbol.
 *
 * Endpoints:
 *  GET /api/v2/market/status          — overall market status
 *  GET /api/v2/market/status/{symbol} — status for a specific symbol
 */

import { apiClient } from './apiClient';

export interface MarketStatusDTO {
  symbol: string;
  status: 'open' | 'closed' | 'pre_market' | 'after_hours';
  /** Unix timestamp (seconds) — current session open time */
  session_open: number;
  /** Unix timestamp (seconds) — current session close time */
  session_close: number;
}

/**
 * Fetch market status for a specific symbol.
 * Returns open/closed status and the current session open/close timestamps.
 */
export async function fetchMarketStatus(symbol: string): Promise<MarketStatusDTO> {
  const res = await apiClient(`/market/status/${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch market status for ${symbol}`);
  }
  return res.json();
}
