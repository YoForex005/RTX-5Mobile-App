/**
 * Core module: mt5.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getMt5Status, getMt5Groups, MT5StatusResponse, MT5GroupsResponse } from '../api/mt5';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const MT5_STATUS_KEY = 'mt5Status';
export const MT5_GROUPS_KEY = 'mt5Groups';

export const getMt5StatusQueryKey = (cacheNamespace: string) =>
  [MT5_STATUS_KEY, cacheNamespace] as const;

export const getMt5GroupsQueryKey = (cacheNamespace: string) =>
  [MT5_GROUPS_KEY, cacheNamespace] as const;

/**
 * TanStack Query hook for checking MT5 backend connection status.
 * Polls periodically to monitor connectivity to the broker.
 */
export function useMt5Status(enabled = true) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isEnabled = enabled && Boolean(session);
  return useQuery<MT5StatusResponse, Error>({
    queryKey: getMt5StatusQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(cacheNamespace, getMt5Status),
    enabled: isEnabled,
    staleTime: 15000,       // 15s before stale
    refetchInterval: isEnabled ? 30000 : false, // Poll every 30s
    retry: 1,               // Only 1 retry for status checks
  });
}

/**
 * TanStack Query hook to fetch available MT5 account groups from the broker.
 * Used for the Account Creation flow where users select a group (e.g., demo\STD).
 */
export function useMt5Groups() {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  return useQuery<MT5GroupsResponse, Error>({
    queryKey: getMt5GroupsQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(cacheNamespace, getMt5Groups),
    enabled: Boolean(session),
    staleTime: 5 * 60 * 1000, // groups rarely change, cache for 5 minutes
  });
}
