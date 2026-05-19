/**
 * TanStack Query hook for the market status API.
 *
 * Hook:
 *  useMarketStatus(symbol) — GET /api/v2/market/status/{symbol}
 *                             Polls every 30s to track session changes.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketStatus } from '../api/marketStatus';
import { useUserPreferences } from '../state/userPreferences';

export function useMarketStatus(symbol: string, enabled = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const isEnabled = enabled && isLoggedIn && !!symbol;

  return useQuery({
    queryKey: ['market-status', symbol],
    queryFn: () => fetchMarketStatus(symbol),
    enabled: isEnabled,
    refetchInterval: isEnabled ? 30_000 : false,
    retry: 1,
  });
}
