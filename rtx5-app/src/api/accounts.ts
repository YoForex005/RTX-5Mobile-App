import { apiClient } from './apiClient';

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Accounts API — http://69.197.178.27/api/v2/accounts
//
// Endpoints integrated:
//   GET /accounts         — List all trading accounts for the authenticated user
//   GET /accounts/{login}  — Get details of a specific account by login number
//
// Authentication:
//   Requires Bearer token (JWT). Returns 401 if no token provided.
//   Token injection and 401 refresh are handled automatically by apiClient.
//
// Response format:
//   GET /accounts         → flat JSON array: [ { login, name, ... }, ... ]
//   GET /accounts/{login} → single JSON object: { login, name, ... }
//   Note: single-account response may omit open_positions field.
//
// Error responses handled:
//   200 — Success
//   401 — Unauthorized (handled by apiClient token refresh cycle)
//   403 — Forbidden (insufficient permissions)
//   404 — Account not found (GET /accounts/{login} only)
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

// ─── Response Types ─────────────────────────────────────────────────────────────

/**
 * Single trading account as returned by the API (snake_case).
 * Used by both GET /accounts (list) and GET /accounts/{login} (detail).
 *
 * Note: open_positions is present in the list response but may be
 * absent in the single-account detail response.
 *
 * Verified against live responses on 2026-03-18.
 */
export interface TradingAccountRaw {
  login: number;
  name: string;
  group: string;
  currency: string;
  leverage: number;
  balance: number;
  credit: number;
  equity: number;
  used_margin: number;
  free_margin: number;
  margin_level: number;
  floating_pnl: number;
  total_swap: number;
  open_positions?: number;         // Present in list, may be absent in detail
  status: string;                  // e.g. "active"
  created_at: number;              // Unix timestamp (seconds)
  updated_at: number;              // Unix timestamp (seconds)
}

/**
 * Normalized trading account for UI consumption (camelCase).
 * Maps from the raw API snake_case to idiomatic TypeScript.
 */
export interface TradingAccount {
  login: number;
  name: string;
  group: string;
  currency: string;
  leverage: number;
  balance: number;
  credit: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnl: number;
  totalSwap: number;
  openPositions: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Mapping ────────────────────────────────────────────────────────────────────

/**
 * Maps a single raw API account (snake_case) to the UI-friendly shape (camelCase).
 */
export function mapRawAccount(raw: TradingAccountRaw): TradingAccount {
  return {
    login: raw.login,
    name: raw.name || `Account ${raw.login}`,
    group: raw.group || 'standard',
    currency: raw.currency || 'USD',
    leverage: raw.leverage || 0,
    balance: raw.balance || 0,
    credit: raw.credit || 0,
    equity: raw.equity || 0,
    usedMargin: raw.used_margin || 0,
    freeMargin: raw.free_margin || 0,
    marginLevel: raw.margin_level || 0,
    floatingPnl: raw.floating_pnl || 0,
    totalSwap: raw.total_swap || 0,
    openPositions: raw.open_positions ?? 0,
    status: raw.status || 'active',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
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
    response = await apiClient('/accounts');
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
  return (data || []).map(mapRawAccount);
}

// ─── API Function: Single Account ───────────────────────────────────────────────

/**
 * GET /accounts/{login}
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
    response = await apiClient(`/accounts/${login}`);
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
