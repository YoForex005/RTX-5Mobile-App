import { useQuery } from '@tanstack/react-query';
import { fetchInstrumentMeta, InstrumentMetaDTO } from '../api/instruments';
import { useUserPreferences } from '../state/userPreferences';

export function useInstrumentMeta(symbol: string, enabled = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const isEnabled = enabled && isLoggedIn && !!symbol;

  return useQuery({
    queryKey: ['instrument', symbol],
    queryFn: () => fetchInstrumentMeta(symbol),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour, specs rarely change
    retry: 1, // Don't retry aggressively if backend doesn't support the endpoint yet
  });
}
