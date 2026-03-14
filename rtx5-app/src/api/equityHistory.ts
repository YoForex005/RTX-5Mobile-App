import { apiClient } from './apiClient';

/** Single equity data point from GET /api/account/equity-history */
export interface EquityDataPoint {
  timestamp: string;   // ISO 8601
  equity: number;
  balance: number;
  margin?: number;
}

/** Statistics summary returned alongside the history */
export interface EquityStatistics {
  max_equity?: number;
  min_equity?: number;
  avg_equity?: number;
  total_return?: number;
  total_return_pct?: number;
}

/** Full API response shape */
export interface EquityHistoryResponse {
  count: number;
  message?: string;
  history: EquityDataPoint[];
  statistics: EquityStatistics;
}

/**
 * Fetches the equity curve data for portfolio performance charts.
 * Uses JWT auth.
 *
 * GET /api/account/equity-history?period=30d&interval=1d
 *
 * @param period   - Time period (e.g. '7d', '30d', '90d', '1y')
 * @param interval - Data interval (e.g. '1h', '4h', '1d')
 */
export async function getEquityHistory(
  period: string = '30d',
  interval: string = '1d',
): Promise<EquityHistoryResponse> {
  const params = new URLSearchParams();
  params.set('period', period);
  params.set('interval', interval);

  const response = await apiClient(`/api/account/equity-history?${params.toString()}`);

  if (!response.ok) {
    let errorMsg = 'Failed to fetch equity history';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return response.json();
}
