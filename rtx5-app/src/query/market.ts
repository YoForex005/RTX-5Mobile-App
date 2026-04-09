/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';

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
      const list: any[] = Array.isArray(data) ? data : (data?.instruments ?? []);
      const symbols = list
        .map((it) => (typeof it === 'string' ? it : it?.symbol))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
      return Array.from(new Set(symbols));
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
