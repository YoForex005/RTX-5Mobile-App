import { useQuery } from '@tanstack/react-query';
import { getHealth, HealthResponse } from '../api/health';

export const HEALTH_KEY = 'health';

/**
 * TanStack Query hook for gateway health check.
 * Polls every 30 seconds to monitor connectivity.
 */
export function useHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: [HEALTH_KEY],
    queryFn: getHealth,
    staleTime: 15000,       // 15s before stale
    refetchInterval: 30000, // Poll every 30s
    retry: 1,               // Only 1 retry for health checks
  });
}
