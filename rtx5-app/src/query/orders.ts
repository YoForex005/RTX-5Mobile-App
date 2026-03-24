import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, PlaceOrderPayload } from '../api/orders';

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
    onSuccess: () => {
      // Invalidate queries that should update after a new trade
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
