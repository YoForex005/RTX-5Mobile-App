/**
 * Core module: health.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getHealth, HealthResponse } from '../api/health';

export const HEALTH_KEY = 'health';

/**
 * TanStack Query hook for gateway health check.
 * Polls every 30 seconds to monitor connectivity.
 */
export function useHealth(enabled = true) {
  return useQuery<HealthResponse, Error>({
    queryKey: [HEALTH_KEY],
    queryFn: getHealth,
    enabled,
    staleTime: 15000,       // 15s before stale
    refetchInterval: enabled ? 30000 : false, // Poll every 30s
    retry: 1,               // Only 1 retry for health checks
  });
}
