/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { extractMarketSymbols } from '../domain/marketSymbols';

export function useMarketSymbols() {
  return useQuery({
    queryKey: ['market', 'symbols'],
    queryFn: async () => {
      // Use the broker's full instrument catalog instead of the WS feed
      // status. The feed-status endpoint only reports currently subscribed
      // symbols (i.e. the user's existing watchlist), which made the Add
      // Asset picker show only symbols that were already added.
      const res = await apiClient('/instruments');
      if (!res.ok) throw new Error('Failed to fetch symbols');
      const data = await res.json();
      return extractMarketSymbols(data);
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
