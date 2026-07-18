/**
 * Core module: transactions.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getTransactions, type TransactionsResponse } from '../api/transactions';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const TRANSACTIONS_KEY = 'transactions';

export const getTransactionsQueryKey = (
  cacheNamespace: string,
  type: string | undefined,
  limit: number,
) => [TRANSACTIONS_KEY, cacheNamespace, type, limit] as const;

/**
 * TanStack Query hook for fetching account transactions.
 *
 * @param type  - Optional filter: 'deposit' | 'withdrawal' | 'trade' | 'fee'
 * @param limit - Max results (default 50)
 */
export function useTransactions(type?: string, limit: number = 50) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session);
  return useQuery<TransactionsResponse, Error>({
    queryKey: getTransactionsQueryKey(cacheNamespace, type, limit),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getTransactions(type, limit),
    ),
    enabled,
    staleTime: 10000,     // 10 seconds before stale
    refetchInterval: enabled ? 30000 : false, // Re-poll every 30s for live updates
  });
}
