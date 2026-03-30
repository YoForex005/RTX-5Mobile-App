/**
 * Core module: transactions.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getTransactions, TransactionsResponse } from '../api/transactions';

export const TRANSACTIONS_KEY = 'transactions';

/**
 * TanStack Query hook for fetching account transactions.
 *
 * @param type  - Optional filter: 'deposit' | 'withdrawal' | 'trade' | 'fee'
 * @param limit - Max results (default 50)
 */
export function useTransactions(type?: string, limit: number = 50) {
  return useQuery<TransactionsResponse, Error>({
    queryKey: [TRANSACTIONS_KEY, type, limit],
    queryFn: () => getTransactions(type, limit),
    staleTime: 10000,     // 10 seconds before stale
    refetchInterval: 30000, // Re-poll every 30s for live updates
  });
}
