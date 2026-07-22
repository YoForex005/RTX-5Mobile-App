/**
 * Core module: orders.ts
 *
 * Contains:
 *  - useOrdersByLoginQuery  — fetches order history via GET /api/v2/orders/{login}
 *                             (login-based, verified real field names)
 *  - useAccountOrdersQuery  — fetches order history via GET /api/v2/account/orders
 *                             (JWT-resolved, no login param)
 *  - usePlaceOrderMutation  — submits new market orders via POST /api/v2/orders
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ordersApi, type PlaceOrderPayload, type PlaceOrderResponse } from '../api/orders';
import { resolveBrokerExecutionEvidence } from '../api/orders/executionEvidence';
import { StaleBrokerSessionError } from '../api/brokerApi';
import { redactDiagnosticValue } from '../utils/securityRedaction';
import {
  getSessionQueryCacheNamespace,
  invalidateSessionQueryRoots,
  isSessionQueryCacheNamespaceCurrent,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const ORDERS_BY_LOGIN_KEY = 'ordersByLogin';
export const ACCOUNT_ORDERS_KEY = 'accountOrders';

export const getOrdersByLoginQueryKey = (
  cacheNamespace: string,
  login?: number,
) => [ORDERS_BY_LOGIN_KEY, cacheNamespace, login] as const;

export const getAccountOrdersQueryKey = (cacheNamespace: string) =>
  [ACCOUNT_ORDERS_KEY, cacheNamespace] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
};

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for login-based order history.
// Uses GET /api/v2/orders/{login} — returns orders for a specific MT5 account.
// Real response uses price_open / time_setup / time_done (not the swagger names).
// Primary hook used by the History screen's "Orders" tab.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch order history for a specific MT5 account login.
 * Returns 404 from the server if the account is not owned by the session user.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function useOrdersByLoginQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: getOrdersByLoginQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => ordersApi.getOrdersByLogin(login!),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for JWT-resolved order history (fallback / alternative).
// Uses GET /api/v2/account/orders — no login param needed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch order history for the authenticated user's trading account.
 * Account is resolved server-side from the Bearer token — no login param needed.
 *
 * Polls every 10 seconds (orders change less frequently than positions/deals).
 */
export function useAccountOrdersQuery(options: PollingQueryOptions = {}) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && (options.enabled ?? true);
  return useQuery({
    queryKey: getAccountOrdersQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => ordersApi.getAccountOrders(),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
  });
}
import { usePositionsState } from '../state/positionsState';
import { hasPositionPresenceConverged } from '../state/positionsState.helpers';
import { resolveTradingLoginString } from '../state/tradingLogin';

const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
const TRADE_POST_SUCCESS_REFRESH_DELAY_MS = 250;

const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const scheduleTradePostSuccessRefresh = (work: () => void) => {
  setTimeout(work, TRADE_POST_SUCCESS_REFRESH_DELAY_MS);
};

const firstPositiveFiniteNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const getConfirmedMarketOrderValues = (data: PlaceOrderResponse) => {
  const evidence = resolveBrokerExecutionEvidence(data);
  const ticket = evidence.ticket ?? null;
  const executionPrice = evidence.executionPrice ?? null;
  const currentPrice = firstPositiveFiniteNumber(data.price_current) ?? executionPrice;
  return { ticket, executionPrice, currentPrice } as const;
};

const normalizeMarketOrderAction = (data: PlaceOrderResponse): string =>
  typeof data.action === 'string' ? data.action.trim().toLowerCase() : '';

const canOptimisticallyInsertPosition = (data: PlaceOrderResponse): boolean => {
  const action = normalizeMarketOrderAction(data);
  // Netting buy/sell can increase, decrease, close, or reverse an existing
  // position — those must not be modeled as a brand-new row. Explicit opens,
  // legacy empty action, and unknown actions (or side-like "buy"/"sell") with
  // full execution evidence are injected so Trade/Chart show the fill before
  // REST catches up.
  return !['closed', 'increased', 'decreased', 'reversed'].includes(action);
};

const positionPresenceExpectedAfterAction = (action: string): boolean | null => {
  if (action === 'closed') return false;
  if (['', 'opened', 'open', 'increased', 'decreased', 'reversed'].includes(action)) return true;
  // Unknown action with a ticket still expects the position to appear after sync.
  return true;
};

const logPlaceOrderPayload = (payload: PlaceOrderPayload) => {
  logOrderDiagnostic('[TRADE-PAYLOAD]', {
    symbol: payload.symbol,
    side: payload.side,
    action: payload.side,
    orderType: 'market',
    command: payload.side,
    tradeType: 'market',
    volume: payload.volume,
    priceSource: payload.side === 'buy' ? 'ask' : 'bid',
    rawPayload: payload,
  });
};

const handlePlaceOrderSuccess = (
  queryClient: QueryClient,
  data: PlaceOrderResponse,
  variables: PlaceOrderPayload,
  cacheNamespace: string,
) => {
  if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) {
    throw new StaleBrokerSessionError();
  }
  logOrderDiagnostic('[TRADE-RESPONSE]', {
    requestSide: variables.side,
    result: data?.status ?? 'success',
    backendSide: data?.side ?? null,
    rawResponse: data,
  });
  // â”€â”€ Optimistic UI Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Instantly inject the trade into the Zustand store so the Chart Screen
  // renders the new position line without waiting for the next data poll.
  const {
    ticket: positionTicket,
    executionPrice,
    currentPrice,
  } = getConfirmedMarketOrderValues(data);
  if (
    canOptimisticallyInsertPosition(data)
    && positionTicket !== null
    && executionPrice !== null
    && currentPrice !== null
  ) {
    const state = usePositionsState.getState();
    const responseVolume = Number(data.volume);
    const responseSl = Number(data.price_sl);
    const responseTp = Number(data.price_tp);
    const newPos = {
      id: String(positionTicket),
      symbol: (typeof data.symbol === 'string' && data.symbol.trim())
        ? data.symbol
        : variables.symbol,
      side: data.side === 'buy' || data.side === 'sell' ? data.side : variables.side,
      volume: Number.isFinite(responseVolume) && responseVolume > 0
        ? responseVolume
        : variables.volume,
      openPrice: executionPrice,
      currentPrice,
      pnl: 0,
      swap: 0,
      openTime: new Date().toISOString(),
      sl: Number.isFinite(responseSl) && responseSl > 0 ? responseSl : 0,
      tp: Number.isFinite(responseTp) && responseTp > 0 ? responseTp : 0,
      clientCreatedAt: Date.now(),
    };
    state.upsertPosition(newPos);
  }

  // Kick REST reconciliation immediately so the Trade tab is not empty while
  // waiting for the 250ms paint-friendly delay. The delayed pass still runs
  // invalidation + multi-attempt sync for broker commit lag.
  const mt5LoginImmediate = resolveTradingLoginString();
  if (mt5LoginImmediate && isSessionQueryCacheNamespaceCurrent(cacheNamespace)) {
    void usePositionsState.getState().refreshPositions(mt5LoginImmediate);
  }

  scheduleTradePostSuccessRefresh(() => {
    if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;

    // Fire a background sync loop to eventually replace the optimistic record
    // with the fully-hydrated backend record after the chart has painted.
    const mt5Login = resolveTradingLoginString();
    if (mt5Login) {
      const action = normalizeMarketOrderAction(data);
      const expectedPresence = positionPresenceExpectedAfterAction(action);
      const requiresContentReconciliation = ['increased', 'decreased', 'reversed'].includes(action);
      const syncLoop = async () => {
        for (let i = 0; i < 8; i++) {
          if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;
          await usePositionsState.getState().refreshPositions(mt5Login);
          if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;
          // Refresh is unconditional. When the canonical position ticket and
          // action let us prove convergence, stop early; otherwise perform a
          // second REST backstop because the first read may race broker commit.
          if (positionTicket !== null && expectedPresence !== null) {
            const presenceConverged = hasPositionPresenceConverged(
              usePositionsState.getState().positions,
              positionTicket,
              expectedPresence,
            );
            // Presence alone cannot prove that an existing netting position's
            // volume or side changed. Require the one-second REST backstop for
            // increase/decrease/reverse even when the ticket already exists.
            if (presenceConverged && (!requiresContentReconciliation || i >= 1)) break;
          } else if (i >= 1) {
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      syncLoop().catch(() => {});
    }

    // Invalidate queries that should update after a new trade.
    void invalidateSessionQueryRoots(queryClient, cacheNamespace, [
      'positions',
      'accountSummary',
      'transactions',
    ]);
  });
};

type PlaceOrderExecutorOptions = {
  onSuccess?: (data: PlaceOrderResponse) => void;
  onError?: (error: unknown) => void;
};

const submitPlaceOrderWithCacheUpdate = async (
  queryClient: QueryClient,
  payload: PlaceOrderPayload,
  cacheNamespace: string,
) => {
  logPlaceOrderPayload(payload);
  const data = await runSessionBoundQuery(
    cacheNamespace,
    () => ordersApi.placeMarketOrder(payload),
  );
  handlePlaceOrderSuccess(queryClient, data, payload, cacheNamespace);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query mutation hook for placing market orders.
// On success, invalidates positions and account caches so the UI reflects
// the newly opened position immediately.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mutation to place a market order via POST /api/v2/orders.
 * Invalidates positions and account summary caches on success so the
 * Trade screen updates without a manual refresh.
 */
export const usePlaceOrderMutation = () => {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);

  return useMutation({
    mutationFn: (payload: PlaceOrderPayload) => {
      logPlaceOrderPayload(payload);
      return runSessionBoundQuery(
        cacheNamespace,
        () => ordersApi.placeMarketOrder(payload),
      );
    },
    onSuccess: (data, variables) => {
      // Shared success path owns optimistic insert + post-trade refresh so the
      // Trade screen stays in lockstep with chart / executor placements.
      try {
        handlePlaceOrderSuccess(queryClient, data, variables, cacheNamespace);
      } catch {
        // Stale session is ignored here; the mutation already completed on the broker.
      }
    },
  });
};

export const usePlaceOrderExecutor = () => {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);

  return useCallback((payload: PlaceOrderPayload, options: PlaceOrderExecutorOptions = {}) => {
    void submitPlaceOrderWithCacheUpdate(queryClient, payload, cacheNamespace)
      .then((data) => {
        if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;
        options.onSuccess?.(data);
      })
      .catch((error) => {
        if (!isSessionQueryCacheNamespaceCurrent(cacheNamespace)) return;
        options.onError?.(error);
      });
  }, [cacheNamespace, queryClient]);
};
