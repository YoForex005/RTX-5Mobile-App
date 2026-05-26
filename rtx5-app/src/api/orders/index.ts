/**
 * Market Order Execution API (V2).
 *
 * Covers:
 *  GET  /api/v2/orders/{login}       — order history by MT5 login
 *  GET  /api/v2/account/orders       — order history via JWT (no login param)
 *  POST /api/v2/orders               — place a new market order
 *
 * Originally a single 547-line file; split for the 500-line ceiling into:
 *   - `types.ts`            — request/response shapes
 *   - `symbolResolver.ts`   — instrument-catalog symbol matching
 *   - `placeMarketOrder.ts` — POST /orders body
 *   - `placePendingOrder.ts` — POST /orders/pending body
 */
import { apiClient } from '../apiClient';
import { placeMarketOrder } from './placeMarketOrder';
import { placePendingOrder } from './placePendingOrder';
import type { AccountOrder, LoginOrder } from './types';

export type {
  AccountOrder,
  LoginOrder,
  OrderErrorResponse,
  PendingOrderType,
  PlacePendingOrderPayload,
  PlacePendingOrderResponse,
  PlaceOrderPayload,
  PlaceOrderResponse,
} from './types';

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

  placeMarketOrder,
  placePendingOrder,
};
