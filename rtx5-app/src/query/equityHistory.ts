/**
 * Core module: equityHistory.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getEquityHistory, type EquityHistoryResponse } from '../api/equityHistory';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const EQUITY_HISTORY_KEY = 'equityHistory';

export const getEquityHistoryQueryKey = (
  cacheNamespace: string,
  period: string,
  interval: string,
) => [EQUITY_HISTORY_KEY, cacheNamespace, period, interval] as const;

/**
 * TanStack Query hook for fetching equity curve data.
 *
 * @param period   - Time period: '7d' | '30d' | '90d' | '1y'
 * @param interval - Data interval: '1h' | '4h' | '1d'
 */
export function useEquityHistory(period: string = '30d', interval: string = '1d') {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session);
  return useQuery<EquityHistoryResponse, Error>({
    queryKey: getEquityHistoryQueryKey(cacheNamespace, period, interval),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getEquityHistory(period, interval),
    ),
    enabled,
    staleTime: 60000,       // 1 minute before stale
    refetchInterval: enabled ? 60000 : false, // Re-poll every 60s
  });
}
