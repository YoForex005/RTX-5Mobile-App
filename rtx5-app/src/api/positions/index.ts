/**
 * Trading Positions & History API (V2).
 *
 * Endpoints:
 *  GET  /api/v2/positions/{login}             — open positions for an account
 *  GET  /api/v2/positions/{login}/history     — closed-trade history (paginated)
 *  POST /api/v2/positions/{ticket}/close      — close a single position
 *  POST /api/v2/positions/{ticket}/modify     — modify SL/TP on an open position
 *
 * All calls routed through `apiClient` which auto-injects Bearer token and
 * handles 401 refresh loops. Originally a single 514-line file; split for the
 * 500-line ceiling into:
 *   - `types.ts`           — request/response shapes
 *   - `payloadHelpers.ts`  — wire-shape coercion helpers
 *   - `closedHistory.ts`   — paginated history loader
 */
import { apiClient } from '../apiClient';
import { createTradingApiError } from '../tradingErrors';
import {
  recordClosePositionJournalFailure,
  recordClosePositionJournalRequest,
  recordClosePositionJournalSuccess,
  recordModifyPositionJournalFailure,
  recordModifyPositionJournalRequest,
  recordModifyPositionJournalSuccess,
} from '../../state/terminalJournalState';
import { rawPositionsFetch } from './payloadHelpers';
import { getPositionHistory } from './closedHistory';
import type {
  ClosePositionResponse,
  ModifyPositionPayload,
  Position,
} from './types';

const DEBUG_POSITIONS_API =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true';

const logPositionsApiDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_API) {
    console.log(...args);
  }
};

const warnPositionsApiDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (DEBUG_POSITIONS_API) {
    console.warn(...args);
  }
};

export type {
  Position,
  ClosedPosition,
  ClosePositionResponse,
  ModifyPositionPayload,
} from './types';

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
    const url = `/positions/${login}?limit=${limit}&offset=${offset}`;
    logPositionsApiDiagnostic('[PositionsAPI] GET', url);

    let response: Response;
    try {
      response = await apiClient(url);
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (message === 'Failed to fetch') {
        warnPositionsApiDiagnostic('[PositionsAPI] apiClient fetch failed, retrying raw fetch');
        response = await rawPositionsFetch(url);
      } else {
        throw error;
      }
    }
    logPositionsApiDiagnostic('[PositionsAPI] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      warnPositionsApiDiagnostic('[PositionsAPI] Error response:', JSON.stringify(errorData));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw createTradingApiError(response.status, errorData, headers);
    }

    const json = await response.json();
    logPositionsApiDiagnostic('[PositionsAPI] Response type:', typeof json, Array.isArray(json) ? `array[${json.length}]` : 'not-array');

    // Handle both array and wrapped responses
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const arr = json.data || json.positions || json.items || json.result;
      if (Array.isArray(arr)) {
        logPositionsApiDiagnostic('[PositionsAPI] Unwrapped from object, found', arr.length, 'positions');
        return arr;
      }
    }
    warnPositionsApiDiagnostic('[PositionsAPI] Unexpected response shape:', JSON.stringify(json).slice(0, 200));
    return [];
  },

  /**
   * Fetch closed position history for a trading account.
   *
   * GET /api/v2/positions/{login}/history?limit={limit}&offset={offset}
   *
   * @param login   - The MT5 account login number
   * @param limit   - Page size used while loading closed history records (default: 1000)
   * @param offset  - Initial pagination offset (default: 0)
   * @returns Array of ClosedPosition objects representing the account's trade history
   */
  getPositionHistory,

  /**
   * Close an open position by its ticket ID.
   *
   * POST /api/v2/positions/{ticketId}/close
   *
   * The position must belong to an account owned by the authenticated user.
   * Uses a DB transaction for atomicity. Rejected if market data returns
   * zero or negative prices.
   *
   * Error responses:
   * - 404: Position not found
   * - 429: Rate limited — check Retry-After header
   */
  closePosition: async (
    ticketId: string | number,
    ticketBy?: string | number | { ticketBy?: string | number; volume?: number },
  ): Promise<ClosePositionResponse> => {
    const closePayload =
      ticketBy && typeof ticketBy === 'object'
        ? {
            ...(ticketBy.ticketBy !== undefined ? { ticket_by: Number(ticketBy.ticketBy) } : {}),
            ...(typeof ticketBy.volume === 'number' && ticketBy.volume > 0 ? { volume: ticketBy.volume } : {}),
          }
        : ticketBy
          ? { ticket_by: Number(ticketBy) }
          : undefined;
    const body = closePayload && Object.keys(closePayload).length > 0
      ? JSON.stringify(closePayload)
      : undefined;
    recordClosePositionJournalRequest(ticketId, closePayload
      ? { ticketBy: closePayload.ticket_by, volume: closePayload.volume }
      : undefined);
    let failureRecorded = false;
    try {
      const response = await apiClient(`/positions/${ticketId}/close`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
        const error = createTradingApiError(response.status, errorData, headers);
        failureRecorded = true;
        recordClosePositionJournalFailure(ticketId, error);
        throw error;
      }

      const data = await response.json().catch(() => ({} as ClosePositionResponse));
      recordClosePositionJournalSuccess(ticketId, data);
      return data;
    } catch (error) {
      if (!failureRecorded) {
        recordClosePositionJournalFailure(ticketId, error);
      }
      throw error;
    }
  },

  /**
   * Modify an open position's SL/TP values.
   *
   * POST /api/v2/positions/{ticketId}/modify
   *
   * SL/TP values are validated against the current market price on the server.
   *
   * @param ticketId - The position ticket number to modify
   * @param payload  - New SL/TP and trailing stop values
   * @returns Updated position object
   */
  modifyPosition: async (
    ticketId: string | number,
    payload: ModifyPositionPayload,
  ): Promise<Position> => {
    recordModifyPositionJournalRequest(ticketId, payload);
    let failureRecorded = false;
    try {
      const response = await apiClient(`/positions/${ticketId}/modify`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
        const error = createTradingApiError(response.status, errorData, headers);
        failureRecorded = true;
        recordModifyPositionJournalFailure(ticketId, payload, error);
        throw error;
      }

      const data = await response.json();
      recordModifyPositionJournalSuccess(ticketId, payload, data);
      return data;
    } catch (error) {
      if (!failureRecorded) {
        recordModifyPositionJournalFailure(ticketId, payload, error);
      }
      throw error;
    }
  },
};
