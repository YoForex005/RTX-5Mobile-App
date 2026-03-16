import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, PlaceOrderPayload } from '../api/orders';

export const usePlaceOrderMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlaceOrderPayload) => ordersApi.placeMarketOrder(payload),
    onSuccess: () => {
      // Invalidate queries that might be affected by a new trade
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
