import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Trading API — Deals
// Endpoint: GET /api/v2/deals/{login}
// Retrieves deal history for a trading account. Deals are individual
// executions (entries and exits) that make up positions and orders.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw deal object returned by GET /api/v2/deals/{login}.
 * Each deal represents a single execution event (market entry or exit).
 */
export interface Deal {
  ticket: number;
  order_ticket: number;
  position_ticket: number;
  account_login: number;
  symbol: string;
  /** Deal action type — "deal_buy" or "deal_sell" */
  action: string;
  /** Deal entry direction — "entry_in" (open) or "entry_out" (close) */
  entry: string;
  volume: number;
  price: number;
  profit: number;
  swap: number;
  commission: number;
  fee: number;
  magic: number;
  comment: string;
  /** Unix timestamp of deal execution */
  time: number;
}

export const dealsApi = {
  /**
   * Fetch deal history for a trading account.
   *
   * GET /api/v2/deals/{login}?limit={limit}&offset={offset}
   *
   * Deals are the atomic execution records that compose positions.
   * Each deal has an `entry` field indicating whether it opened ("entry_in")
   * or closed ("entry_out") exposure, and an `action` field for direction.
   *
   * @param login   - The MT5 account login number (e.g. 200074)
   * @param limit   - Maximum number of deals to return (default: 50)
   * @param offset  - Pagination offset (default: 0)
   * @returns Array of Deal objects from the account's history
   */
  getDeals: async (login: number, limit = 50, offset = 0): Promise<Deal[]> => {
    const response = await apiClient(
      `/deals/${login}?limit=${limit}&offset=${offset}`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }

    return response.json();
  },
};
