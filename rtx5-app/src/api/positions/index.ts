/**
 * Trading Positions & History API (V2).
 *
 * Endpoints:
 *  GET  /api/v2/positions/{login}             — open positions for an account
 *  GET  /api/v2/positions/{login}/history     — closed-trade history (paginated)
 *  POST /api/v2/positions/{ticket}/close      — close a single position
 *  PUT  /api/v2/positions/{ticket}            — modify SL/TP on an open position
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
import { getPositionHistory } from './closedHistory';
import {
  buildFullClosePositionRequestPayload,
  buildPartialClosePositionRequestPayload,
  buildClosePositionRequestDescriptor,
  type ClosePositionVolume,
  type PreparedClosePositionRequest,
} from './closePayload';
import type {
  ClosePositionResponse,
  ModifyPositionPayload,
  Position,
} from './types';
import {
  AmbiguousModifyPositionOutcomeError,
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  parseModifyPositionAck,
  type ModifyPositionAckWire,
} from './modifyPositionWire';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { assertActiveExistingPositionSltpAllowed } from '../sltpCapabilityGuard';

const DEBUG_POSITIONS_API =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true';

const logPositionsApiDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_API) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnPositionsApiDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (DEBUG_POSITIONS_API) {
    console.warn(...args.map(redactDiagnosticValue));
  }
};

const submitClosePositionRequest = async (
  ticketId: string | number,
  request: PreparedClosePositionRequest,
): Promise<ClosePositionResponse> => {
  const descriptor = buildClosePositionRequestDescriptor(ticketId, request);
  recordClosePositionJournalRequest(descriptor.ticket, descriptor.journalPayload);
  let failureRecorded = false;
  try {
    const response = await apiClient(descriptor.endpoint, {
      method: descriptor.method,
      body: descriptor.body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      const error = createTradingApiError(response.status, errorData, headers);
      failureRecorded = true;
      recordClosePositionJournalFailure(descriptor.ticket, error);
      throw error;
    }

    const data = await response.json().catch(() => ({} as ClosePositionResponse));
    recordClosePositionJournalSuccess(descriptor.ticket, data);
    return data;
  } catch (error) {
    if (!failureRecorded) {
      recordClosePositionJournalFailure(descriptor.ticket, error);
    }
    throw error;
  }
};

export type {
  Position,
  ClosedPosition,
  ClosePositionResponse,
  ModifyPositionPayload,
} from './types';
export type {
  KnownModifyPositionErrorCode,
  ModifyPositionAckWire,
  ModifyPositionErrorWire,
  ModifyPositionRequest,
  ReconciliablePosition,
} from './modifyPositionWire';
export {
  AmbiguousModifyPositionOutcomeError,
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  normalizeReconciledProtectionValue,
  parseModifyPositionAck,
  parseModifyPositionError,
} from './modifyPositionWire';

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

    const response = await apiClient(url);
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

    // The authenticated gateway source contract is an authoritative unwrapped
    // array. Do not reinterpret an unknown object as an empty ledger because
    // that could erase valid positions and their chart lines.
    if (Array.isArray(json)) return json;
    warnPositionsApiDiagnostic('[PositionsAPI] Unexpected response shape:', JSON.stringify(json).slice(0, 200));
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Positions endpoint returned an unexpected non-array response.',
    });
  },

  /**
   * Strict authoritative read used after every existing-position SL/TP PUT.
   *
   * The current gateway contract is an unwrapped array. Unlike the general
   * polling compatibility method above, an ambiguous wrapper or invalid JSON
   * must fail closed because treating it as an empty ledger could delete a
   * still-open position.
   */
  getPositionsForReconciliation: async (
    login: string | number,
    requestOptions: Readonly<{ signal?: AbortSignal; timeoutMs?: number }> = {},
  ): Promise<Position[]> => {
    const normalizedLogin = normalizePositiveSafeIntegerPathSegment(login, 'Account login');
    const response = await apiClient(`/positions/${normalizedLogin.path}`, {
      method: 'GET',
      signal: requestOptions.signal,
      timeoutMs: requestOptions.timeoutMs,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw createTradingApiError(response.status, errorData, headers);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AmbiguousModifyPositionOutcomeError(
        'Positions reconciliation returned an unreadable JSON body.',
        response.status,
      );
    }
    if (!Array.isArray(data)) {
      throw new AmbiguousModifyPositionOutcomeError(
        'Positions reconciliation returned an unexpected wrapped response.',
        response.status,
      );
    }
    return data as Position[];
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
  closePosition: async (ticketId: string | number): Promise<ClosePositionResponse> =>
    submitClosePositionRequest(ticketId, buildFullClosePositionRequestPayload()),

  /**
   * Partial close is intentionally a separate method so the wire body contains
   * volume only and can never be combined with the full-close mode.
   */
  closePositionPartial: async (
    ticketId: string | number,
    volume: ClosePositionVolume,
  ): Promise<ClosePositionResponse> =>
    submitClosePositionRequest(ticketId, buildPartialClosePositionRequestPayload(volume)),

  /**
   * Modify an open position's SL/TP values.
   *
   * PUT /api/v2/positions/{ticketId}
   *
   * SL/TP values are validated against the current market price on the server.
   *
   * @param ticketId - The position ticket number to modify
   * @param payload  - New SL/TP values
   * @returns Strict partial database acknowledgement; authoritative state comes
   *          only from the mandatory positions-list reconciliation.
   */
  modifyPosition: async (
    ticketId: string | number,
    payload: ModifyPositionPayload,
    requestOptions: Readonly<{
      expectedSymbol: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      onResponseMetadata?: (metadata: Readonly<{
        status: number;
        requestId?: string;
        serverTiming?: string;
      }>) => void;
    }>,
  ): Promise<ModifyPositionAckWire> => {
    // Defense in depth: direct/programmatic callers must not bypass the UI
    // capability gate. This throws before journaling or any network request.
    assertActiveExistingPositionSltpAllowed();
    const normalizedTicket = normalizePositiveSafeIntegerPathSegment(ticketId, 'Position ticket');
    const normalizedPayload = normalizeModifyPositionRequest(payload);
    recordModifyPositionJournalRequest(normalizedTicket.path, normalizedPayload);
    let failureRecorded = false;
    try {
      const response = await apiClient(`/positions/${normalizedTicket.path}`, {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedPayload),
        signal: requestOptions.signal,
        timeoutMs: requestOptions.timeoutMs,
        replayAfterAuthRefresh: false,
      });
      try {
        const requestId = response.headers.get('x-request-id')?.trim();
        const serverTiming = response.headers.get('server-timing')?.trim();
        requestOptions.onResponseMetadata?.(Object.freeze({
          status: response.status,
          ...(requestId ? { requestId } : {}),
          ...(serverTiming ? { serverTiming } : {}),
        }));
      } catch {
        // Observability is best-effort and must never alter mutation handling.
      }

      if (response.status !== 200) {
        if (response.status >= 200 && response.status < 300) {
          const error = new AmbiguousModifyPositionOutcomeError(
            `Modify Position returned ambiguous HTTP ${response.status}.`,
            response.status,
          );
          failureRecorded = true;
          recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
          throw error;
        }
        const errorData = await response.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
        const error = createTradingApiError(response.status, errorData, headers);
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        const error = new AmbiguousModifyPositionOutcomeError(
          'Modify Position returned an unreadable HTTP 200 body.',
          response.status,
        );
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }
      let acknowledgement: ModifyPositionAckWire;
      try {
        acknowledgement = parseModifyPositionAck(data, {
          ticket: normalizedTicket.path,
          symbol: requestOptions.expectedSymbol,
          request: normalizedPayload,
        });
      } catch (error) {
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }
      recordModifyPositionJournalSuccess(normalizedTicket.path, normalizedPayload, acknowledgement);
      return acknowledgement;
    } catch (error) {
      if (!failureRecorded) {
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
      }
      throw error;
    }
  },
};
