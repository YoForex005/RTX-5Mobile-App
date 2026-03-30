/**
 * Gateway Health Check Service (V2)
 * 
 * Defines the ping interval logic to ensure the Node JS Backend system
 * is alive. Not used for MT5 connection checks.
 */

import { apiClient } from './apiClient';

/** Response from GET /health */
export interface HealthResponse {
  status: string;
  timestamp: number;
  version: string;
}

/**
 * Checks if the Gateway Backend is running.
 *
 * GET /health
 */
export async function getHealth(): Promise<HealthResponse> {
  const response = await apiClient('/health');

  if (!response.ok) {
    throw new Error(`Gateway unhealthy: HTTP ${response.status}`);
  }

  return response.json();
}
