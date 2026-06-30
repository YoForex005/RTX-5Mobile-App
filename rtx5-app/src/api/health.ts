/**
 * Gateway Health Check Service (V2)
 * 
 * Defines the ping interval logic to ensure the Node JS Backend system
 * is alive. Not used for MT5 connection checks.
 */

import { useUserPreferences } from '../state/userPreferences';
import { timedFetch } from '../utils/apiLatency';
import { apiClient } from './apiClient';
import {
  buildBrokerHealthUrl,
  getBrokerBackendDomainUnavailableMessage,
  isBrokerServiceBaseUrl,
} from './brokerRouting';

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
  const state = useUserPreferences.getState();
  const brokerServerUrl = state.brokerServerUrl;
  if (state.isLoggedIn && !isBrokerServiceBaseUrl(brokerServerUrl)) {
    throw new Error(getBrokerBackendDomainUnavailableMessage(state.brokerId));
  }

  if (isBrokerServiceBaseUrl(brokerServerUrl)) {
    const response = await timedFetch(buildBrokerHealthUrl(brokerServerUrl), {
      headers: { accept: 'application/json' },
    }, {
      label: 'health.broker',
      method: 'GET',
      endpoint: '/health',
      source: 'broker',
    });

    if (!response.ok) {
      throw new Error(`Gateway unhealthy: HTTP ${response.status}`);
    }

    return response.json();
  }

  const response = await apiClient('/health');

  if (!response.ok) {
    throw new Error(`Gateway unhealthy: HTTP ${response.status}`);
  }

  return response.json();
}
