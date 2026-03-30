/**
 * Core module: mt5.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getMt5Status, getMt5Groups, MT5StatusResponse, MT5GroupsResponse } from '../api/mt5';

export const MT5_STATUS_KEY = 'mt5Status';
export const MT5_GROUPS_KEY = 'mt5Groups';

/**
 * TanStack Query hook for checking MT5 backend connection status.
 * Polls periodically to monitor connectivity to the broker.
 */
export function useMt5Status() {
  return useQuery<MT5StatusResponse, Error>({
    queryKey: [MT5_STATUS_KEY],
    queryFn: getMt5Status,
    staleTime: 15000,       // 15s before stale
    refetchInterval: 30000, // Poll every 30s
    retry: 1,               // Only 1 retry for status checks
  });
}

/**
 * TanStack Query hook to fetch available MT5 account groups from the broker.
 * Used for the Account Creation flow where users select a group (e.g., demo\STD).
 */
export function useMt5Groups() {
  return useQuery<MT5GroupsResponse, Error>({
    queryKey: [MT5_GROUPS_KEY],
    queryFn: getMt5Groups,
    staleTime: 5 * 60 * 1000, // groups rarely change, cache for 5 minutes
  });
}
