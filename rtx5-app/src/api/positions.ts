/**
 * Trading Positions & History API (V2)
 * 
 * Handles reading the active open positions and the closed position history
 * for the authenticated account. Used by the Trade and History tabs.
 */

import { API_BASE_URL, apiClient } from './apiClient';
import { useUserPreferences } from '../state/userPreferences';

// ─────────────────────────────────────────────────────────────────────────────
// Trading API — Positions
// Endpoints: GET /positions/{login}, GET /positions/{login}/history,
//            POST /positions/{id}/close, PUT /positions/{id}
// All calls routed through `apiClient` which auto-injects Bearer token and
// handles 401 refresh loops. See apiClient.ts for lifecycle details.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw position object returned by GET /api/v2/positions/{login}.
 * Represents a single open position on the trading account.
 */
export interface Position {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_current: number;
  price_sl?: number;
  price_tp?: number;
  profit: number;
  swap: number;
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Raw closed-position object returned by GET /api/v2/positions/{login}/history.
 * Contains the same fields as an open position plus close-specific metadata.
 */
export interface ClosedPosition {
  ticket: number;
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  price_open: number;
  price_close?: number;
  price_current?: number;
  price_sl?: number;
  price_tp?: number;
  profit: number;
  swap: number;
  commission?: number;
  comment?: string;
  time_create: number;
  time_update: number;
  time_close?: number;
  trailing_stop?: number;
  trailing_step?: number;
  magic?: number;
}

/**
 * Response payload from POST /api/v2/positions/{id}/close.
 * The server returns the resulting deal record for the closed position.
 * The position is closed using its **ticket ID** (not account login).
 */
export interface ClosePositionResponse {
  partial?: boolean;
  price_close?: number;
  price_open?: number;
  profit?: number;
  side?: string;
  status?: string;
  swap?: number;
  symbol?: string;
  ticket?: number;
  time?: number;
  volume_closed?: number;
  volume_total?: number;
  
  // Alternate documented properties
  order_ticket?: number;
  position_ticket?: number;
  account_login?: number;
  action?: string;
  entry?: string;
  volume?: number;
  price?: number;
  commission?: number;
  fee?: number;
  magic?: number;
  comment?: string;
}

/**
 * Payload for PUT /api/v2/positions/{id} to modify SL/TP on an open position.
 */
export interface ModifyPositionPayload {
  price_sl: number;
  price_tp: number;
  trailing_stop?: number;
  trailing_step?: number;
}

async function rawPositionsFetch(endpoint: string): Promise<Response> {
  const token = useUserPreferences.getState().accountDetails?.credentials?.accessToken;
  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-API-Key'] = token;
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers,
  });
}

export const positionsApi = {
  /**
   * Fetch all open positions for a trading account.
   *
   * GET /api/v2/positions/{login}?limit={limit}&offset={offset}
   *
   * @param login   - The MT5 account login number (e.g. 200074)
   * @param limit   - Maximum number of positions to return (default: 50)
   * @param offset  - Pagination offset (default: 0)
   * @returns Array of open Position objects from the live trading server
   */
  getPositions: async (login: number, limit = 50, offset = 0): Promise<Position[]> => {
    // INTEGRATED: GET /api/v2/positions/{login} - Get open positions for an account
    const url = `/positions/${login}?limit=${limit}&offset=${offset}`;
    console.log('[PositionsAPI] GET', url);
    
    let response: Response;
    try {
      response = await apiClient(url);
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (message === 'Failed to fetch') {
        console.warn('[PositionsAPI] apiClient fetch failed, retrying raw fetch');
        response = await rawPositionsFetch(url);
      } else {
        throw error;
      }
    }
    console.log('[PositionsAPI] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn('[PositionsAPI] Error response:', JSON.stringify(errorData));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw { response: { data: errorData, status: response.status, headers } };
    }

    const json = await response.json();
    console.log('[PositionsAPI] Response type:', typeof json, Array.isArray(json) ? `array[${json.length}]` : 'not-array');
    
    // Handle both array and wrapped responses
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const arr = json.data || json.positions || json.items || json.result;
      if (Array.isArray(arr)) {
        console.log('[PositionsAPI] Unwrapped from object, found', arr.length, 'positions');
        return arr;
      }
    }
    console.warn('[PositionsAPI] Unexpected response shape:', JSON.stringify(json).slice(0, 200));
    return [];
  },

  /**
   * Fetch closed position history for a trading account.
   *
   * GET /api/v2/positions/{login}/history?limit={limit}&offset={offset}
   *
   * @param login   - The MT5 account login number
   * @param limit   - Maximum number of history records to return (default: 50)
   * @param offset  - Pagination offset (default: 0)
   * @returns Array of ClosedPosition objects representing the account's trade history
   */
  getPositionHistory: async (login: number, limit = 1000, offset = 0): Promise<ClosedPosition[]> => {
    // INTEGRATED: GET /api/v2/positions/{login}/history - (Fallback history integration)
    const response = await apiClient(
      `/positions/${login}/history?limit=${limit}&offset=${offset}`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw { response: { data: errorData, status: response.status, headers } };
    }

    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const arr = json.data || json.positions || json.items || json.result || json.history;
      if (Array.isArray(arr)) return arr;
    }
    return [];
  },

  /**
   * Close an open position by its ticket ID.
   *
   * POST /api/v2/positions/{ticketId}/close
   *
   * The position must belong to an account owned by the authenticated user.
   * Uses a DB transaction for atomicity. Rejected if market data returns
   * zero or negative prices.
   *
   * @param ticketId - The position ticket number to close (NOT the account login)
   * @returns ClosePositionResponse containing the resulting deal record
   *
   * Error responses:
   * - 404: Position not found
   * - 429: Rate limited — check Retry-After header
   */
  closePosition: async (ticketId: string | number, ticketBy?: string | number): Promise<ClosePositionResponse> => {
    // INTEGRATED: POST /api/v2/positions/{id}/close - Close a specific position by ticket
    const body = ticketBy ? JSON.stringify({ ticket_by: Number(ticketBy) }) : undefined;
    const response = await apiClient(`/positions/${ticketId}/close`, {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw { response: { data: errorData, status: response.status, headers } };
    }

    return response.json().catch(() => ({} as ClosePositionResponse));
  },

  /**
   * Modify an open position's SL/TP values.
   *
   * PUT /api/v2/positions/{ticketId}
   *
   * SL/TP values are validated against the current market price on the server.
   *
   * @param ticketId - The position ticket number to modify
   * @param payload  - New SL/TP and trailing stop values
   * @returns Updated position object
   */
  modifyPosition: async (ticketId: string | number, payload: ModifyPositionPayload): Promise<Position> => {
    // INTEGRATED: PUT /api/v2/positions/{id} - Modify SL/TP of an open position
    const response = await apiClient(`/positions/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw { response: { data: errorData, status: response.status, headers } };
    }

    return response.json();
  },
};
