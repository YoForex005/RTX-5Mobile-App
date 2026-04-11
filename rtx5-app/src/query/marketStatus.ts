/**
 * TanStack Query hook for the market status API.
 *
 * Hook:
 *  useMarketStatus(symbol) — GET /api/v2/market/status/{symbol}
 *                             Polls every 30s to track session changes.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketStatus } from '../api/marketStatus';

export function useMarketStatus(symbol: string) {
  return useQuery({
    queryKey: ['market-status', symbol],
    queryFn: () => fetchMarketStatus(symbol),
    refetchInterval: 30_000,
    retry: 1,
  });
}
