import { useQuery } from '@tanstack/react-query';
import { fetchInstrumentMeta, getCachedInstrumentMeta, InstrumentMetaDTO } from '../api/instruments';
import { normalizeSymbol } from '../domain/symbols';
import { useUserPreferences } from '../state/userPreferences';

export const INSTRUMENT_META_QUERY_VERSION = 'instrument-meta-v2';

export function useInstrumentMeta(symbol: string, enabled = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const brokerId = useUserPreferences((state) => state.brokerId);
  const accountId = useUserPreferences((state) => state.accountDetails?.id ?? '');
  const normalizedSymbol = normalizeSymbol(symbol);
  const isEnabled = enabled && isLoggedIn && !!normalizedSymbol;
  const cacheScope = `${brokerId}:${accountId}`;

  return useQuery({
    queryKey: ['instrument', INSTRUMENT_META_QUERY_VERSION, normalizedSymbol, brokerId, accountId],
    queryFn: () => fetchInstrumentMeta(symbol, cacheScope),
    enabled: isEnabled,
    placeholderData: () => getCachedInstrumentMeta(normalizedSymbol || symbol, cacheScope),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour, specs rarely change
    retry: 1, // Don't retry aggressively if backend doesn't support the endpoint yet
  });
}
