/**
 * Core module: market.ts
 */

import { useQuery } from '@tanstack/react-query';
import { apiJsonClient, commitApiJson } from '../api/apiClient';
import { primeInstrumentMetaCacheFromCatalogPayload } from '../api/instruments';
import { extractMarketSymbols } from '../domain/marketSymbols';
import {
  getSessionQueryCacheNamespace,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export function useMarketSymbols(enabled = true) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isEnabled = enabled && Boolean(session);

  return useQuery({
    queryKey: ['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'],
    queryFn: async () => {
      // Use the broker's full instrument catalog instead of the WS feed
      // status. The feed-status endpoint only reports currently subscribed
      // symbols (i.e. the user's existing watchlist), which made the Add
      // Asset picker show only symbols that were already added.
      const result = await apiJsonClient<unknown>('/instruments');
      if (!result.ok) throw new Error('Failed to fetch symbols');
      return commitApiJson(result, cacheNamespace, (data) => {
        primeInstrumentMetaCacheFromCatalogPayload(data, cacheNamespace);
        return extractMarketSymbols(data);
      });
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,
  });
}
