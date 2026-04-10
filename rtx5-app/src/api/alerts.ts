/**
 * Price Alerts API (V2)
 *
 * Manage server-side price alerts. All endpoints are JWT-resolved (no login param).
 *
 * Endpoints:
 *  POST   /api/v2/alerts       — create a price alert
 *  GET    /api/v2/alerts       — list all active alerts
 *  DELETE /api/v2/alerts/{id}  — delete a specific alert
 *
 * NOTE on real vs. Swagger response:
 *  - POST returns 201 (not 200 as documented)
 *  - POST response omits `message` and `created_at`
 *  - GET response includes `triggered: boolean` (not in Swagger schema)
 */

import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Condition direction for a price alert */
export type AlertCondition = 'above' | 'below';

/**
 * A price alert returned by GET /api/v2/alerts.
 * `triggered` is true once the server has fired the alert.
 */
export interface PriceAlert {
  id: number;
  symbol: string;
  condition: AlertCondition;
  price: number;
  message: string;
  /** Whether the alert has already been triggered */
  triggered: boolean;
  /** Unix timestamp (seconds) when the alert was created */
  created_at: number;
}

/** Payload for POST /api/v2/alerts */
export interface CreateAlertPayload {
  symbol: string;
  condition: AlertCondition;
  price: number;
  /** Optional human-readable note shown when alert fires */
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const alertsApi = {
  /**
   * Fetch all price alerts for the authenticated user.
   *
   * GET /api/v2/alerts
   *
   * @returns Array of PriceAlert objects (includes triggered=false active alerts)
   */
  getAlerts: async (): Promise<PriceAlert[]> => {
    const response = await apiClient('/alerts');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  },

  /**
   * Create a new price alert.
   *
   * POST /api/v2/alerts
   * Returns 201 on success (Swagger says 200 — the real server returns 201).
   *
   * @param payload - Alert definition: symbol, condition, price, optional message
   * @returns Partial alert record from server (id, symbol, condition, price)
   */
  createAlert: async (payload: CreateAlertPayload): Promise<Partial<PriceAlert>> => {
    const response = await apiClient('/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Server returns 201 Created — treat both 200 and 201 as success
    if (!response.ok && response.status !== 201) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    return response.json().catch(() => ({}));
  },

  /**
   * Delete a price alert by ID.
   *
   * DELETE /api/v2/alerts/{id}
   *
   * @param id - Alert ID returned by getAlerts or createAlert
   */
  deleteAlert: async (id: number): Promise<void> => {
    const response = await apiClient(`/alerts/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
  },
};
