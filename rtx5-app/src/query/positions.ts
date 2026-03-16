import { useMutation, useQueryClient } from '@tanstack/react-query';
import { positionsApi } from '../api/positions';

export function useClosePositionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => positionsApi.closePosition(id),
    onSuccess: () => {
      // Invalidate relevant queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      queryClient.invalidateQueries({ queryKey: ['exposure'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
