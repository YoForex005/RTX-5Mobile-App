/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { primeInstrumentMetaCacheFromCatalogPayload } from '../api/instruments';
import { extractMarketSymbols } from '../domain/marketSymbols';
import { useUserPreferences } from '../state/userPreferences';

export function useMarketSymbols(enabled = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const brokerId = useUserPreferences((state) => state.brokerId);
  const accountId = useUserPreferences((state) => state.accountDetails?.id ?? '');
  const isEnabled = enabled && isLoggedIn;
  const cacheScope = `${brokerId}:${accountId}`;

  return useQuery({
    queryKey: ['market', 'symbols', 'instrument-catalog-v2', brokerId, accountId],
    queryFn: async () => {
      // Use the broker's full instrument catalog instead of the WS feed
      // status. The feed-status endpoint only reports currently subscribed
      // symbols (i.e. the user's existing watchlist), which made the Add
      // Asset picker show only symbols that were already added.
      const res = await apiClient('/instruments');
      if (!res.ok) throw new Error('Failed to fetch symbols');
      const data = await res.json();
      primeInstrumentMetaCacheFromCatalogPayload(data, cacheScope);
      return extractMarketSymbols(data);
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,
  });
}
