/**
 * Core module: exposure.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getExposure, ExposureResponse } from '../api/exposure';

export const EXPOSURE_KEY = 'exposure';

/**
 * TanStack Query hook for fetching real-time currency exposure data.
 * Polls every 10 seconds for live risk monitoring.
 */
export function useExposure() {
  return useQuery<ExposureResponse, Error>({
    queryKey: [EXPOSURE_KEY],
    queryFn: getExposure,
    staleTime: 5000,        // 5 seconds before stale
    refetchInterval: 10000, // Poll every 10s for live risk data
  });
}
