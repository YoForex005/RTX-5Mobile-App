/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';

export function useMarketSymbols() {
  return useQuery({
    queryKey: ['market', 'symbols'],
    queryFn: async () => {
      const res = await fetch('http://69.197.178.27/ws/feed/status');
      if (!res.ok) throw new Error('Failed to fetch symbols');
      const data = await res.json();
      return data.available_symbols as string[];
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
