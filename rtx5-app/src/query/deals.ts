import { useQuery } from '@tanstack/react-query';
import { dealsApi } from '../api/deals';

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for deal history.
// Deals are atomic execution records (entries and exits) that compose
// positions and orders. Used by the History screen's "Deals" tab.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch deal history for a trading account.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function useDealsQuery(login: number | undefined) {
  return useQuery({
    queryKey: ['deals', login],
    queryFn: () => dealsApi.getDeals(login!),
    enabled: !!login,
  });
}
