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
import { dealsApi, type Deal } from '../api/deals';
import { resolveEffectiveHistoryDateRange } from '../features/history/historyDateRange';
import { useResolvedTradingLogin } from '../state/tradingLogin';
import { useUserPreferences } from '../state/userPreferences';
import { buildAccountDealsQueryKey, filterDealsByTimeRange, mergeDealHistorySources } from './dealsHistory';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const DEALS_KEY = 'deals';
export const ACCOUNT_DEALS_KEY = 'accountDeals';

export const getDealsQueryKey = (cacheNamespace: string, login?: number) =>
  [DEALS_KEY, cacheNamespace, login] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
  login?: number;
};

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

const settleDeals = async (promise: Promise<Deal[]>) => {
  try {
    return { ok: true as const, data: await promise };
  } catch (error) {
    return { ok: false as const, error };
  }
};

const getLoginDealsWithRangeFallback = async (
  login: number,
  from?: number,
  to?: number,
) => {
  try {
    return await dealsApi.getDeals(login, 1000, 0, from, to);
  } catch (error) {
    if (from == null && to == null) throw error;
    return dealsApi.getDeals(login, 1000, 0);
  }
};

const fetchAccountDealsWithLoginFallback = async (
  login: number | undefined,
  from?: number,
  to?: number,
) => {
  const [accountResult, loginResult] = await Promise.all([
    settleDeals(dealsApi.getAccountDeals(500, 0, from, to)),
    login != null
      ? settleDeals(getLoginDealsWithRangeFallback(login, from, to))
      : settleDeals(Promise.resolve([])),
  ]);

  if (!accountResult.ok && !loginResult.ok) {
    throw accountResult.error;
  }

  return filterDealsByTimeRange(
    mergeDealHistorySources(
      accountResult.ok ? accountResult.data : [],
      loginResult.ok ? loginResult.data : [],
    ),
    from,
    to,
  );
};

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
export function useAccountDealsQuery(options: PollingQueryOptions = {}) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const resolvedLogin = useResolvedTradingLogin();
  const login = options.login ?? resolvedLogin;
  const historyRange = useUserPreferences((s) => s.historyRange);
  const historyFromMs = useUserPreferences((s) => s.historyFromMs);
  const historyToMs = useUserPreferences((s) => s.historyToMs);
  const { fromMs, toMs } = resolveEffectiveHistoryDateRange(historyRange, historyFromMs, historyToMs);

  // Convert ms to Unix seconds for the API (null means omit the param)
  const from = fromMs != null ? Math.floor(fromMs / 1000) : undefined;
  const to = toMs != null ? Math.floor(toMs / 1000) : undefined;

  const enabled = Boolean(session) && (options.enabled ?? true);

  return useQuery({
    queryKey: buildAccountDealsQueryKey(cacheNamespace, login, from, to),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchAccountDealsWithLoginFallback(login, from, to),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
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
export function useDealsQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: getDealsQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => dealsApi.getDeals(login!),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5000, options.refetchInterval),
  });
}
