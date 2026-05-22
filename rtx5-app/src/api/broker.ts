/**
 * White-Label Broker Configuration API (V2)
 * 
 * Dynamically resolves the branding, URLs, feature flags, and max leverage settings
 * based on the user's specific broker tenant. This configures the entire UI theme.
 */

import { timedFetch } from '../utils/apiLatency';
import { apiClient } from './apiClient';
import {
  PUBLIC_BROKER_DIRECTORY_BASE_URL,
  buildBrokerHealthUrl,
  normalizeBrokerServerUrl,
} from './brokerRouting';

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Broker Config API — https://backend.orrnn.com/api/v2/broker/config
//
// Endpoint integrated:
//   GET /broker/config — Returns broker-specific configuration
//
// Broker resolution order:
//   1. broker_id query param (explicit)
//   2. Bearer token (auto-detects logged-in user's broker)
//   3. Falls back to platform defaults if neither provided
//
// This endpoint provides the app with broker branding, feature flags,
// leverage limits, supported currencies, and legal/compliance URLs.
//
// Error responses handled:
//   200 — Success (full config or platform default fallback)
//   401 — Unauthorized (handled automatically by apiClient token refresh)
//   422 — Validation error (malformed broker_id)
//   429 — Rate limited (too many requests)
//   500 — Internal server error
//   503 — Service unavailable (backend down or maintenance)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Error Class ────────────────────────────────────────────────────────────────

/**
 * Structured error for broker config API failures.
 * Consumers can check `statusCode` to differentiate error types
 * (e.g., show a "server down" banner for 503 vs. a validation toast for 422).
 */
export class BrokerConfigError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'BrokerConfigError';
    this.statusCode = statusCode;
  }
}

// ─── Response Types ─────────────────────────────────────────────────────────────

/**
 * Full broker config response when a valid broker_id is resolved.
 * GET /broker/config?broker_id=abc → 200
 */
export interface BrokerConfigResponse {
  broker_id: string;
  broker_name: string;
  server_name: string;
  supported_currencies: string[];
  default_leverage: number;
  max_leverage: number;
  max_accounts: number;
  max_instruments: number;
  max_managers: number;
  registration_enabled: boolean;
  copy_trading_enabled: boolean;
  prop_firm_enabled: boolean;
  status: string;
  logo_url: string;
  theme_color: string;
  support_email: string;
  terms_url: string;
  privacy_url: string;
}

/**
 * GET /broker/servers — single entry in the broker server directory.
 * Each row describes one reachable broker endpoint that an account can be
 * created on / signed into. Multiple rows can share `broker_id` when the
 * broker exposes more than one server (region, demo/live, fallback IPs).
 */
export interface BrokerServer {
  id: number;
  broker_id: string;
  broker_name: string;
  server_url?: string;
  logo_url?: string;
  protocol: string;     // 'http' | 'https' | 'mt5' | ...
  region: string;
  server: string;       // host:port — used as the human-readable Server name
  server_ip: string;
  server_port: number;
  enabled?: boolean;
  created_at: number;   // epoch seconds
}

/**
 * Fallback response when broker_id is not found or not provided.
 * The API returns 200 with platform defaults that have a different shape
 * (some fields are string-typed numbers, different field names).
 */
export interface BrokerConfigFallbackResponse {
  broker_name: string;
  logo_url: string;
  theme_color: string;
  support_email: string;
  support_phone: string;
  terms_url: string;
  privacy_url: string;
  max_leverage: string;        // Note: string in fallback, number in full response
  min_deposit: string;
  min_withdrawal: string;
  maintenance_mode: string;    // "true" | "false" as strings
  allowed_countries: string;   // JSON string array
}

// ─── Status-specific error messages ─────────────────────────────────────────────

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: 'Authentication required — please log in again',
  403: 'Access denied — insufficient permissions for this broker',
  404: 'Broker not found',
  422: 'Invalid broker ID format — please check and try again',
  429: 'Too many requests — please wait a moment and retry',
  500: 'Server error — the trading platform encountered an issue',
  502: 'Bad gateway — unable to reach the trading backend',
  503: 'Service unavailable — the trading platform is under maintenance',
  504: 'Gateway timeout — the trading backend took too long to respond',
};

// ─── Type guard ─────────────────────────────────────────────────────────────────

/**
 * Checks if the response is a full broker config (has broker_id field)
 * versus a platform default fallback.
 */
// Keep broker directory lookups bounded so login/account navigation never
// waits on a long network stall before the next touch can be handled.
const BROKER_SERVERS_TIMEOUT_MS = 3500;
const BROKER_HEALTH_TIMEOUT_MS = 2500;

export function isBrokerConfigFull(
  data: BrokerConfigResponse | BrokerConfigFallbackResponse
): data is BrokerConfigResponse {
  return 'broker_id' in data && typeof (data as BrokerConfigResponse).broker_id === 'string';
}

// ─── API Function ───────────────────────────────────────────────────────────────

/**
 * GET /broker/config
 *
 * Fetches broker-specific configuration. Uses apiClient for automatic
 * Bearer token injection and 401 refresh handling.
 *
 * @param brokerId - Optional broker ID. If omitted, the backend resolves
 *                   the broker from the JWT Bearer token or falls back to
 *                   platform defaults.
 * @returns BrokerConfigResponse with branding, feature flags, limits, and URLs
 * @throws BrokerConfigError with status-specific message on failure:
 *         - 422: Invalid/malformed broker_id
 *         - 429: Rate limited
 *         - 500: Internal server error
 *         - 503: Service unavailable / maintenance mode
 *         - Other non-200: Generic error with HTTP status
 */
export async function getBrokerConfig(brokerId?: string): Promise<BrokerConfigResponse> {
  // Build endpoint with optional broker_id query parameter
  const endpoint = brokerId
    ? `/broker/config?broker_id=${encodeURIComponent(brokerId)}`
    : '/broker/config';

  let response: Response;

  try {
    response = await apiClient(endpoint);
  } catch (networkError) {
    // Network-level failures (DNS, timeout, connection refused)
    throw new BrokerConfigError(
      0,
      'Network error — unable to connect to the trading server. Please check your connection.'
    );
  }

  // ─── Handle non-200 HTTP responses with status-specific messages ────────
  if (!response.ok) {
    let serverMessage = '';
    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch (_e) {
      // Response body not parseable — use status-based message
    }

    const statusMessage = HTTP_ERROR_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status})`;

    // Combine status-specific message with server detail when available
    const fullMessage = serverMessage
      ? `${statusMessage}: ${serverMessage}`
      : statusMessage;

    throw new BrokerConfigError(response.status, fullMessage);
  }

  return response.json();
}

/**
 * GET /broker/servers
 *
 * Returns every enabled broker server known to the platform. Used by the
 * Brokers screen so users can search for a broker by name (e.g. "Flexy",
 * "MetaQuotes") and pick which server to log in / register against.
 */
export async function getBrokerServers(): Promise<BrokerServer[]> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROKER_SERVERS_TIMEOUT_MS);
  try {
    response = await timedFetch(`${PUBLIC_BROKER_DIRECTORY_BASE_URL}/broker/servers`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    }, {
      label: 'broker.servers',
      method: 'GET',
      endpoint: '/broker/servers',
      source: 'broker',
    });
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === 'AbortError') {
      throw new BrokerConfigError(
        0,
        'Broker list request timed out. Please check your connection and try again.',
      );
    }
    throw new BrokerConfigError(
      0,
      'Network error — unable to load broker list. Please check your connection.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let serverMessage = '';
    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch {
      // ignore non-JSON error bodies
    }
    const statusMessage = HTTP_ERROR_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status})`;
    const fullMessage = serverMessage ? `${statusMessage}: ${serverMessage}` : statusMessage;
    throw new BrokerConfigError(response.status, fullMessage);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data as BrokerServer[];
  }
  return Array.isArray(data?.value) ? (data.value as BrokerServer[]) : [];
}

export async function checkBrokerServerHealth(serverUrl: string): Promise<void> {
  const healthUrl = buildBrokerHealthUrl(serverUrl);
  if (!healthUrl) {
    throw new BrokerConfigError(0, 'Broker server URL is missing. Please select a broker from the list.');
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROKER_HEALTH_TIMEOUT_MS);
  try {
    response = await timedFetch(healthUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    }, {
      label: 'broker.health',
      method: 'GET',
      endpoint: '/health',
      source: 'broker',
    });
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === 'AbortError') {
      throw new BrokerConfigError(0, 'Broker health check timed out. Please try again in a moment.');
    }
    throw new BrokerConfigError(0, 'Broker temporarily unavailable. Please try again in a moment.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new BrokerConfigError(
      response.status,
      `Broker temporarily unavailable (${normalizeBrokerServerUrl(serverUrl)}). Please try again in a moment.`,
    );
  }
}

