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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, type PlaceOrderPayload } from '../api/orders';

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
  const enabled = !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: ['ordersByLogin', login],
    queryFn: () => ordersApi.getOrdersByLogin(login!),
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
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: ['accountOrders'],
    queryFn: () => ordersApi.getAccountOrders(),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
  });
}
import { usePositionsState } from '../state/positionsState';
import { resolveTradingLoginString } from '../state/tradingLogin';

const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';

const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args);
  }
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

  return useMutation({
    mutationFn: (payload: PlaceOrderPayload) => {
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
      return ordersApi.placeMarketOrder(payload);
    },
    onSuccess: (data, variables) => {
      logOrderDiagnostic('[TRADE-RESPONSE]', {
        requestSide: variables.side,
        result: data?.status ?? 'success',
        backendSide: data?.side ?? null,
        rawResponse: data,
      });
      // ── Optimistic UI Update ───────────────────────────
      // Instantly inject the trade into the Zustand store so the Chart Screen
      // renders the new position line without waiting for the next data poll.
      const positionTicket = data.position_ticket ?? data.order_ticket;
      if (positionTicket) {
        const state = usePositionsState.getState();
        const newPos = {
          id: String(positionTicket),
          symbol: variables.symbol,
          side: variables.side,
          volume: variables.volume,
          openPrice: data.price || 0,
          currentPrice: data.price || 0,
          pnl: 0,
          swap: 0,
          openTime: new Date().toISOString(),
          sl: 0,
          tp: 0,
          clientCreatedAt: Date.now(),
        };
        state.upsertPosition(newPos);

        // Fire a background sync loop to eventually replace the optimistic record
        // with the fully-hydrated backend record.
        const mt5Login = resolveTradingLoginString();
        if (mt5Login) {
          const syncLoop = async () => {
            for (let i = 0; i < 5; i++) {
              await state.refreshPositions(mt5Login);
              const exists = usePositionsState.getState().positions.some(p => String(p.id) === String(positionTicket));
              if (exists) break;
              await new Promise(r => setTimeout(r, 1000));
            }
          };
          syncLoop().catch(() => {});
        }
      }

      // Invalidate queries that should update after a new trade
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
