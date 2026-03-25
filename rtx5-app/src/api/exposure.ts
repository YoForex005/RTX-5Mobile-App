import { apiClient } from './apiClient';

/** Single exposure item from GET /api/v1/exposure */
export interface ExposureItem {
  symbol: string;
  digits: number;
  volume_clients: number;
  volume_coverage: number;
  price_rate: number;
  volume_net: number;
}

/** Full API response */
export interface ExposureResponse {
  success: boolean;
  count: number;
  exposure: ExposureItem[];
}

/**
 * Fetches real-time currency/symbol exposure data from MT5.
 * Returns client volume, coverage volume, net volume, and price rates.
 *
 * GET /api/v1/exposure
 *
 * Use cases: Risk dashboards, heatmaps, exposure monitoring.
 * Server: Proxied through the Gateway.
 */
export async function getExposure(): Promise<ExposureResponse> {
  const response = await apiClient('/exposure');

  if (!response.ok) {
    let errorMsg = 'Failed to fetch exposure data';
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
