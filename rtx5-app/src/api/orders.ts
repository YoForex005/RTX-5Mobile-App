/**
 * Market Order Execution API (V2)
 *
 * Covers:
 *  GET  /api/v2/orders/{login}       — order history by MT5 login
 *  GET  /api/v2/account/orders       — order history via JWT (no login param)
 *  POST /api/v2/orders               — place a new market order
 */

import { getSecureItemAsync } from '../utils/secureStorage';
import { apiClient, decodeBrokerIdFromToken, API_BASE_URL } from './apiClient';
import { normalizeSymbol } from '../domain/symbols';
import { createTradingApiError } from './tradingErrors';
import { useUserPreferences } from '../state/userPreferences';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single historical order record returned by GET /api/v2/account/orders.
 *
 * `type`   — execution type: "market" | "limit" | "stop" | etc.
 * `side`   — direction: "buy" | "sell"
 * `status` — lifecycle state: "filled" | "canceled" | "rejected" | "partial" | etc.
 * `magic`  — EA identifier (0 for manual orders)
 */
export interface AccountOrder {
  ticket: number;
  account_login: number;
  symbol: string;
  type: string;
  side: 'buy' | 'sell';
  volume: number;
  price: number;
  status: string;
  comment: string;
  /** Unix timestamp (seconds) of order creation */
  time_create: number;
  magic: number;
}

/**
 * A single order record returned by GET /api/v2/orders/{login}.
 *
 * Field names reflect the actual server response (verified against live data),
 * which differs from the Swagger schema in several places:
 *   price_open  (not "price")
 *   time_setup  — order creation time (not "time_create")
 *   time_done   — order completion time (fill, cancel, close)
 *
 * `status` — "filled" (open) | "closed" | "canceled" | "rejected"
 * `type`   — "market" | "limit" | "stop" | etc.
 * `side`   — "buy" | "sell"
 */
export interface LoginOrder {
  ticket: number;
  account_login: number;
  symbol: string;
  type: string;
  side: 'buy' | 'sell';
  volume: number;
  /** Execution price — sent as `price_open` in the real response (not `price`) */
  price_open: number;
  status: string;
  comment: string;
  /** Unix timestamp (seconds) when the order was submitted */
  time_setup: number;
  /** Unix timestamp (seconds) when the order was filled, closed, or canceled */
  time_done: number;
  /** Optional stop-loss price (0 or absent means no SL) */
  price_sl?: number;
  /** Optional take-profit price (0 or absent means no TP) */
  price_tp?: number;
}

/**
 * Payload for POST /api/v2/orders — place a market order.
 *
 * The `account_login` field is the MT5 account login (integer), NOT a string ID.
 * The `volume` field is in standard lots (e.g. 0.01 = micro lot).
 */
export interface PlaceOrderPayload {
  account_login: number | string;
  broker_id?: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_sl?: number;
  price_tp?: number;
  comment?: string;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Response from POST /api/v2/orders on successful execution.
 */
export interface PlaceOrderResponse {
  order_ticket: number;
  position_ticket: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price: number;
  commission: number;
  status: string;
  time: number;
  action: string;
  comment?: string;
  message?: string;
}

/** Standard error response from the orders endpoint. */
export interface OrderErrorResponse {
  error: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const ordersApi = {
  /**
   * Fetch order history for a specific MT5 account login.
   *
   * GET /api/v2/orders/{login}?limit={limit}
   *
   * Only returns orders for accounts owned by the authenticated user —
   * the server returns 404 if the login belongs to another user.
   *
   * NOTE: Real field names differ from Swagger — use `LoginOrder` (not `AccountOrder`).
   */
  getOrdersByLogin: async (login: number, limit = 500): Promise<LoginOrder[]> => {
    const response = await apiClient(`/orders/${login}?limit=${limit}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }
    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  },

  /**
   * Fetch order history for the authenticated user's trading account.
   *
   * GET /api/v2/account/orders?limit={limit}&offset={offset}
   *
   * The account is resolved from the session JWT — no `login` parameter needed.
   */
  getAccountOrders: async (limit = 500, offset = 0): Promise<AccountOrder[]> => {
    const response = await apiClient(
      `/account/orders?limit=${limit}&offset=${offset}`,
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }
    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  },

  /**
   * Place a market order on the trading server.
   *
   * POST /api/v2/orders
   *
   * Rate limited: 60 requests per minute per account.
   * Uses a DB transaction for atomicity. Rejected if market data returns
   * zero or negative prices. SL/TP values are validated server-side.
   *
   * Error responses:
   * - 400: Invalid SL/TP, zero/negative market price, or invalid parameters
   * - 404: Account not found
   * - 429: Rate limited — check Retry-After header
   */
  placeMarketOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
    // V2 server resolves broker context EXCLUSIVELY from the JWT `broker_id` claim.
    // Query params, headers, and body fields are all ignored by the server (confirmed
    // via Swagger). The three-layer recovery in this function + apiClient ensures the
    // JWT always has a valid broker_id claim before and after the order is sent.
    // V2 contract requires `login` (integer) — NOT `account_login`.
    const { account_login, ...rest } = payload;
    const loginInt =
      typeof account_login === 'string' ? parseInt(account_login, 10) : account_login;

    const normalizedSymbol = normalizeSymbol(payload.symbol);
    // Remove broker_id from the body — the server resolves it from the JWT
    // claim only (confirmed via Swagger: no query param or body field needed).
    // Sending it in those places doesn't help and can cause unexpected failures.
    const { broker_id: _ignored, ...restWithoutBroker } = rest;
    const orderBody = { ...restWithoutBroker, login: loginInt, symbol: normalizedSymbol };

    // Verify the JWT has broker_id claim. Log so we can diagnose issues.
    const state = useUserPreferences.getState();
    const currentToken = state.accountDetails?.credentials?.accessToken;
    const jwtBrokerId = decodeBrokerIdFromToken(currentToken);
    console.log('[RTX5 Order] JWT broker_id:', jwtBrokerId, '| stored brokerId:', state.brokerId);
    console.log('[RTX5 Order] body:', JSON.stringify(orderBody));

    // ── Silent re-login if JWT has lost its broker_id claim ───────────────
    // The V2 refresh endpoint strips broker_id from the new JWT. When this
    // happens all trades fail with 403 "No broker context found" because the
    // server resolves broker context exclusively from the JWT claim. We recover
    // by silently re-logging in with saved credentials to get a fresh JWT.
    if (!jwtBrokerId) {
      console.warn('[RTX5 Order] JWT missing broker_id — attempting silent re-login');
      try {
        const saved = await getSecureItemAsync('rtx5_saved_login');
        if (saved) {
          const { broker, login: savedLogin, pass } = JSON.parse(saved);
          if (broker && savedLogin && pass) {
            const loginData = await fetch(`${API_BASE_URL}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ username: savedLogin, password: pass, broker_id: broker }),
            });
            if (loginData.ok) {
              const freshAuth = await loginData.json();
              const freshToken = freshAuth.access_token;
              const freshRefresh = freshAuth.refresh_token;
              const freshExpiry = new Date(Date.now() + (freshAuth.expires_in ?? 86400) * 1000).toISOString();
              state.updateTokens(freshToken, freshRefresh, freshExpiry);
              if (freshAuth.broker_id) state.setBrokerId(freshAuth.broker_id);
              console.log('[RTX5 Order] Silent re-login OK. New JWT broker_id:', decodeBrokerIdFromToken(freshToken));
            }
          }
        }
      } catch (reLoginErr) {
        console.warn('[RTX5 Order] Silent re-login failed:', reLoginErr);
      }
    }

    const response = await apiClient('/orders', {
      method: 'POST',
      body: JSON.stringify(orderBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('[RTX5 Order] ERROR status:', response.status, 'body:', JSON.stringify(errorData));
      const headers: Record<string, string> = {};
      if (response.status === 429) {
        headers['retry-after'] = response.headers.get('retry-after') || '';
      }
      throw createTradingApiError(response.status, errorData, headers);
    }

    const json = await response.json();
    let finalData = json;

    // Unwrap nested response shapes
    if (json && typeof json === 'object') {
      if (json.data && !Array.isArray(json.data)) {
        finalData = json.data;
      } else if (json.result && !Array.isArray(json.result)) {
        finalData = json.result;
      } else if (Array.isArray(json) && json.length > 0) {
        finalData = json[0];
      } else if (Array.isArray(json.data) && json.data.length > 0) {
        finalData = json.data[0];
      }
    }

    // Server sometimes returns 200 OK for gracefully rejected trades
    if (
      finalData &&
      typeof finalData.status === 'string' &&
      ['rejected', 'failed', 'error'].includes(finalData.status.toLowerCase())
    ) {
      throw createTradingApiError(400, {
        message: finalData.comment || finalData.message || `Order ${finalData.status}`,
      });
    }

    return finalData;
  },
};

