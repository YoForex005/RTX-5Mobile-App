/**
 * Core module: deals.ts
 *
 * Contains:
 *  - useAccountDealsQuery  — fetches deal history via GET /api/v2/account/deals
 *                            (JWT-resolved account, supports from/to date range)
 *  - useDealsQuery         — fetches deal history via GET /api/v2/deals/{login}
 *                            (login-based, no date range — kept for other use cases)
 */

import { useQuery } from '@tanstack/react-query';
import { dealsApi } from '../api/deals';
import { useUserPreferences } from '../state/userPreferences';

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for account deal history (JWT-resolved, date-range aware).
// Used by the History screen's "Deals" tab — respects the date range the user
// selected in HistoryFilterScreen (stored as historyFromMs / historyToMs).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch deal history for the authenticated user's account.
 * Reads `historyFromMs` / `historyToMs` from user preferences and converts them
 * to Unix second timestamps for the `from` / `to` query parameters.
 *
 * Polls every 10 seconds (deals change less often than live positions).
 */
export function useAccountDealsQuery() {
  const historyFromMs = useUserPreferences((s) => s.historyFromMs);
  const historyToMs = useUserPreferences((s) => s.historyToMs);

  // Convert ms to Unix seconds for the API (null means omit the param)
  const from = historyFromMs != null ? Math.floor(historyFromMs / 1000) : undefined;
  const to = historyToMs != null ? Math.floor(historyToMs / 1000) : undefined;

  return useQuery({
    queryKey: ['accountDeals', from, to],
    queryFn: () => dealsApi.getAccountDeals(500, 0, from, to),
    refetchInterval: 10_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for login-based deal history.
// Kept for cases where the MT5 login is known but no JWT-based account is set
// (e.g. admin viewing another account's deals).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch deal history for a specific MT5 account login.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function useDealsQuery(login: number | undefined) {
  return useQuery({
    queryKey: ['deals', login],
    queryFn: () => dealsApi.getDeals(login!),
    enabled: !!login,
    refetchInterval: 5000,
  });
}
