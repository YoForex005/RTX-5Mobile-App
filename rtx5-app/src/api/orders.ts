/**
 * Market Order Execution API (V2)
 * 
 * Issues POST requests to open new market orders. Note that it includes robust
 * error handling specific to trading (e.g., catching rejected trades mapping to 200 OK).
 */

import { apiClient, resolveBrokerId } from './apiClient';
import { normalizeSymbol } from '../domain/symbols';
import { createTradingApiError } from './tradingErrors';

// ─────────────────────────────────────────────────────────────────────────────
// Trading API — Orders
// Endpoint: POST /api/v2/orders
// Places a market order. Rate limited: 60 requests/min per account.
// Uses a DB transaction for atomicity. Rejected if market data returns
// zero or negative prices. SL/TP values (if provided) are validated against
// the current market price.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload for POST /api/v2/orders — place a market order.
 *
 * The `account_login` field is the MT5 account login (integer), NOT a string ID.
 * The `volume` field is in standard lots (e.g. 0.01 = micro lot).
 */
export interface PlaceOrderPayload {
  account_login: number | string;
  // Multi-tenant broker routing — required by the V2 backend so the order
  // can be dispatched to the correct MT5 manager. Sent in both the request
  // header (via apiClient) AND the request body for maximum compatibility.
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
 * Returns the resulting position record.
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

/**
 * Standard error response from the orders endpoint.
 */
export interface OrderErrorResponse {
  error: string;
  message: string;
}

export const ordersApi = {
  /**
   * Place a market order on the trading server.
   *
   * POST /api/v2/orders
   *
   * Rate limited: 60 requests per minute per account.
   * Uses a DB transaction for atomicity. Rejected if market data returns
   * zero or negative prices. SL/TP values are validated against the current
   * market price on the server side.
   *
   * @param payload - Order parameters (account_login, symbol, side, volume, etc.)
   * @returns PlaceOrderResponse containing the new position details
   *
   * Error responses:
   * - 400: Invalid SL/TP, zero/negative market price, or invalid parameters
   * - 404: Account not found
   * - 429: Rate limited — check Retry-After header
   */
  placeMarketOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
    // ── BROKER CONTEXT (V2 API contract) ─────────────────────────────────
    // The V2 backend resolves the broker for every request in this order:
    //   1. `broker_id` query parameter (most explicit, takes precedence)
    //   2. Bearer JWT token claims
    //   3. Platform defaults (which return 403 "no broker context found")
    //
    // The orders endpoint specifically requires explicit broker context;
    // otherwise it returns 403 "Trading is disabled. No broker context found".
    // We forward the broker_id from Zustand state — persisted at login —
    // as a URL query parameter, matching the pattern used by /broker/config.
    //
    // Sent in THREE places for maximum compatibility with any backend
    // routing layer (query > header > body):
    //   • URL query param      `?broker_id=xxx`
    //   • Header               `X-Broker-Id: xxx`  (added in apiClient)
    //   • Body field           `broker_id: "xxx"`
    const brokerId = resolveBrokerId();
    const normalizedSymbol = normalizeSymbol(payload.symbol);
    // ── FIELD NAME FIX ────────────────────────────────────────────────────
    // The V2 swagger contract for POST /api/v2/orders requires the field
    // `login` (integer) — NOT `account_login`. When we sent `account_login`
    // the backend couldn't resolve the account, which cascaded into the
    // 403 "No broker context found" error. Map account_login → login here
    // so callers can keep using the clearer name internally.
    const { account_login, ...rest } = payload;
    const loginInt =
      typeof account_login === 'string' ? parseInt(account_login, 10) : account_login;
    const basePayload = { ...rest, login: loginInt, symbol: normalizedSymbol };
    const enrichedPayload = brokerId
      ? { ...basePayload, broker_id: brokerId }
      : basePayload;
    const endpoint = brokerId
      ? `/orders?broker_id=${encodeURIComponent(brokerId)}`
      : `/orders`;

    const response = await apiClient(endpoint, {
      method: 'POST',
      body: JSON.stringify(enrichedPayload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) {
        headers['retry-after'] = response.headers.get('retry-after') || '';
      }
      throw createTradingApiError(response.status, errorData, headers);
    }
    const json = await response.json();
    let finalData = json;
    
    // Safely unwrap data objects if the backend nests the response
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
    
    // Safety check: The server sometimes returns 200 OK for gracefully rejected trades
    if (finalData && typeof finalData.status === 'string' && ['rejected', 'failed', 'error'].includes(finalData.status.toLowerCase())) {
      throw createTradingApiError(400, {
        message: finalData.comment || finalData.message || `Order ${finalData.status}`,
      });
    }
    
    return finalData;
  },
};
