/**
 * Core module: orders.ts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, PlaceOrderPayload } from '../api/orders';
import { usePositionsState } from '../state/positionsState';
import { resolveTradingLoginString } from '../state/tradingLogin';

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
    mutationFn: (payload: PlaceOrderPayload) => ordersApi.placeMarketOrder(payload),
    onSuccess: (data, variables) => {
      // ── Optimistic UI Update ───────────────────────────
      // Instantly inject the trade into the Zustand store so the Chart Screen
      // renders the new position line without waiting for the next data poll.
      const positionTicket = data.position_ticket ?? data.order_ticket;
      if (positionTicket) {
        const state = usePositionsState.getState();
        const newPos = {
          id: String(positionTicket),
          symbol: variables.symbol,
          side: variables.side as 'buy' | 'sell',
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
        state.setPositions([newPos, ...state.positions]);

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
