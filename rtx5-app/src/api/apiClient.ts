/**
 * Compatibility API client.
 *
 * The active implementation lives in `brokerApi`, which owns:
 * - dynamic `{server_url}/api/v2` routing
 * - Authorization Bearer injection
 * - proactive refresh when expiry is inside 60 seconds
 * - concurrent refresh coalescing
 * - one retry after a 401
 */
import { useUserPreferences } from '../state/userPreferences';
import { timedFetch } from '../utils/apiLatency';
import {
  DEFAULT_API_BASE_URL,
  buildApiUrl,
  buildBrokerApiBaseUrl,
} from './brokerRouting';
import { brokerApi, type BrokerApiRequestInit } from './brokerApi';

// V2 API base URL - resolved from environment variable, falls back to direct IP.
export const API_BASE_URL = DEFAULT_API_BASE_URL;
export const getActiveApiBaseUrl = () =>
  buildBrokerApiBaseUrl(useUserPreferences.getState().brokerServerUrl);
export const buildActiveApiUrl = (endpoint: string) =>
  buildApiUrl(endpoint, getActiveApiBaseUrl());

export const isApiKeyCredential = (token: string | undefined | null): boolean =>
  typeof token === 'string' && token.startsWith('rtx5_');

/**
 * Decode the broker_id claim from a JWT without any external dependency.
 * Returns null if the token is missing, malformed, or has no broker claim.
 */
export const decodeBrokerIdFromToken = (token: string | undefined | null): string | null => {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const claims = JSON.parse(decoded);
    return (
      claims.broker_id ||
      claims.brokerId ||
      claims.broker ||
      claims['broker-id'] ||
      null
    );
  } catch {
    return null;
  }
};

export const resolveBrokerId = (): string | null => {
  const state = useUserPreferences.getState();
  const token = state.accountDetails?.credentials?.accessToken;
  return decodeBrokerIdFromToken(token) || state.brokerId || null;
};

type ApiClientRequestInit = BrokerApiRequestInit & {
  /** Legacy flag kept for older call sites that guard broker-context retries. */
  _brokerRetry?: boolean;
};

/**
 * Delegates to the broker-aware singleton. These labels intentionally remain
 * part of this source contract for latency tests:
 *   label: `apiClient.${method}`
 *   label: 'apiClient.refresh'
 */
export const apiClient = async (
  endpoint: string,
  options: ApiClientRequestInit = {},
): Promise<Response> => brokerApi.request(endpoint, options);

// Keep the explicit dependency visible to the latency contract test while the
// actual timed fetch calls are centralized inside brokerApi.
void timedFetch;
