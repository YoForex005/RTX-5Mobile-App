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
  /** MT5 account login number (e.g. 200074) */
  login: number;
  /** Trading symbol (e.g. "EURUSD", "USDJPY", "BTCUSDm") */
  symbol: string;
  /** Order direction */
  side: 'buy' | 'sell';
  /** Volume in lots (e.g. 0.01) */
  volume: number;
  /** Stop Loss price — 0 to skip */
  price_sl?: number;
  /** Take Profit price — 0 to skip */
  price_tp?: number;
  /** Free-text comment attached to the order */
  comment?: string;
  /** Trailing stop distance in points — 0 to disable */
  trailing_stop?: number;
  /** Trailing step in points — 0 to disable */
  trailing_step?: number;
  /** Expert Advisor magic number — 0 for manual orders */
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
   * @param payload - Order parameters (login, symbol, side, volume, etc.)
   * @returns PlaceOrderResponse containing the new position details
   *
   * Error responses:
   * - 400: Invalid SL/TP, zero/negative market price, or invalid parameters
   * - 429: Rate limited — check Retry-After header
   */
  placeMarketOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
    const response = await apiClient('/orders', {
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

    return response.json();
  },
};
