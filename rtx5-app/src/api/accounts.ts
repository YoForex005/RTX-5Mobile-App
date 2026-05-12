/**
 * Trading Accounts Management API (V2)
 * 
 * Fetches and models the list of trading accounts mapped to a single authenticated User.
 * Provides normalization mappers converting backend snake_case to UI camelCase formats.
 */

import { apiClient } from './apiClient';
import { mapRawAccount, type TradingAccount, type TradingAccountRaw } from './accountsMapper';
import { ACCOUNTS_LIST_PATH, buildAccountDetailPath } from './accountsRoutes';

export { mapRawAccount };
export type { TradingAccount, TradingAccountRaw };

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Accounts API — https://backend.orrnn.com/api/v2/accounts
//
// Endpoints integrated:
//   GET /accounts        — List all trading accounts for the authenticated user
//   GET /account/{login} — Get details of a specific account by login number
//
// Authentication:
//   Requires Bearer token (JWT). Returns 401 if no token provided.
//   Token injection and 401 refresh are handled automatically by apiClient.
//
// Response format:
//   GET /accounts        → flat JSON array: [ { login, name, ... }, ... ]
//   GET /account/{login} → single JSON object: { login, name, ... }
//   Note: single-account response may omit open_positions field.
//
// Error responses handled:
//   200 — Success
//   401 — Unauthorized (handled by apiClient token refresh cycle)
//   403 — Forbidden (insufficient permissions)
//   404 — Account not found (GET /account/{login} only)
//   422 — Validation error
//   500 — Internal server error
//   503 — Service unavailable (backend down or maintenance)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Error Class ────────────────────────────────────────────────────────────────

/**
 * Structured error for accounts API failures.
 * Consumers can check `statusCode` to differentiate error types
 * (e.g., show a re-login prompt for 401 vs. a "server down" banner for 503).
 */
export class AccountsApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AccountsApiError';
    this.statusCode = statusCode;
  }
}

// ─── Status-specific error messages ─────────────────────────────────────────────

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: 'Authentication required — please log in again',
  403: 'Access denied — insufficient permissions',
  404: 'Account not found — the specified login does not exist',
  422: 'Validation error — unable to process request',
  429: 'Too many requests — please wait a moment and retry',
  500: 'Server error — the trading platform encountered an issue',
  502: 'Bad gateway — unable to reach the trading backend',
  503: 'Service unavailable — the trading platform is under maintenance',
  504: 'Gateway timeout — the trading backend took too long to respond',
};

// ─── API Function ───────────────────────────────────────────────────────────────

/**
 * GET /accounts
 *
 * Lists all trading accounts for the authenticated user.
 * Uses apiClient for automatic Bearer token injection and 401 refresh handling.
 *
 * Response is a flat JSON array (not wrapped in an object).
 *
 * @returns Array of TradingAccount objects (normalized to camelCase)
 * @throws AccountsApiError with status-specific message on failure:
 *         - 401: Unauthorized (token expired/missing)
 *         - 422: Validation error
 *         - 500: Internal server error
 *         - 503: Service unavailable / maintenance mode
 *         - Network: Connection failure
 */
export async function getAccounts(): Promise<TradingAccount[]> {
  let response: Response;

  try {
    response = await apiClient(ACCOUNTS_LIST_PATH);
  } catch (networkError) {
    // Network-level failures (DNS, timeout, connection refused)
    throw new AccountsApiError(
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

    const fullMessage = serverMessage
      ? `${statusMessage}: ${serverMessage}`
      : statusMessage;

    throw new AccountsApiError(response.status, fullMessage);
  }

  // API returns a flat array, not { accounts: [...] }
  const data: TradingAccountRaw[] = await response.json();
  console.log('[Accounts API] Raw backend response:', JSON.stringify(data, null, 2));
  const mapped = (data || []).map(mapRawAccount);
  console.log('[Accounts API] Mapped accounts:', JSON.stringify(mapped, null, 2));
  return mapped;
}

// ─── API Function: Single Account ───────────────────────────────────────────────

/**
 * GET /account/{login}
 *
 * Fetches details for a specific trading account by login number.
 * Uses apiClient for automatic Bearer token injection and 401 refresh handling.
 *
 * Response is a single JSON object (same shape as list items, but may
 * omit open_positions).
 *
 * @param login - The MT5 account login number (e.g. 200052)
 * @returns Single TradingAccount object (normalized to camelCase)
 * @throws AccountsApiError with status-specific message on failure:
 *         - 401: Unauthorized (token expired/missing)
 *         - 404: Account not found
 *         - 500: Internal server error
 *         - 503: Service unavailable / maintenance mode
 *         - Network: Connection failure
 */
export async function getAccountById(login: number): Promise<TradingAccount> {
  let response: Response;

  try {
    response = await apiClient(buildAccountDetailPath(login));
  } catch (networkError) {
    // Network-level failures (DNS, timeout, connection refused)
    throw new AccountsApiError(
      0,
      'Network error — unable to connect to the trading server. Please check your connection.'
    );
  }

  // ─── Handle non-200 HTTP responses with status-specific messages ────────
  if (!response.ok) {
    let serverMessage = '';
    try {
      const errorData = await response.json();
      // 404 error response uses nested { error: { code, message } } shape
      serverMessage = errorData.error?.message || errorData.detail || errorData.message || errorData.error || '';
    } catch (_e) {
      // Response body not parseable — use status-based message
    }

    const statusMessage = HTTP_ERROR_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status})`;

    const fullMessage = serverMessage
      ? `${statusMessage}: ${serverMessage}`
      : statusMessage;

    throw new AccountsApiError(response.status, fullMessage);
  }

  // API returns a single account object
  const raw: TradingAccountRaw = await response.json();
  return mapRawAccount(raw);
}
