/**
 * Core module: exposure.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getExposure, type ExposureResponse } from '../api/exposure';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const EXPOSURE_KEY = 'exposure';

export const getExposureQueryKey = (cacheNamespace: string) =>
  [EXPOSURE_KEY, cacheNamespace] as const;

/**
 * TanStack Query hook for fetching real-time currency exposure data.
 * Polls every 10 seconds for live risk monitoring.
 */
export function useExposure() {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session);
  return useQuery<ExposureResponse, Error>({
    queryKey: getExposureQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(cacheNamespace, getExposure),
    enabled,
    staleTime: 5000,        // 5 seconds before stale
    refetchInterval: enabled ? 10000 : false, // Poll every 10s for live risk data
  });
}
