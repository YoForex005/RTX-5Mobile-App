/**
 * Market Order Execution API (V2)
 * 
 * Issues POST requests to open new market orders. Note that it includes robust
 * error handling specific to trading (e.g., catching rejected trades mapping to 200 OK).
 */

import { apiClient } from './apiClient';

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
 * The `login` field is the MT5 account login (integer), NOT a string ID.
 * The `volume` field is in standard lots (e.g. 0.01 = micro lot).
 */
export interface PlaceOrderPayload {
  account_login: number | string;
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
   * @param payload - Order parameters (login, symbol, orderType, volume, etc.)
   * @returns PlaceOrderResponse containing the new position details
   *
   * Error responses:
   * - 400: Invalid SL/TP, zero/negative market price, or invalid parameters
   * - 404: Account not found
   * - 429: Rate limited — check Retry-After header
   */
  placeMarketOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
    const response = await apiClient(`/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) {
        headers['retry-after'] = response.headers.get('retry-after') || '';
      }
      throw { response: { data: errorData, status: response.status, headers } };
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
      throw { 
        response: { 
          status: 400, 
          data: { message: finalData.comment || finalData.message || `Order ${finalData.status}` } 
        } 
      };
    }
    
    return finalData;
  },
};
