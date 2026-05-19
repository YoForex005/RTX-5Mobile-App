/**
 * Core module: accounts.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getAccounts, getAccountById, TradingAccount, AccountsApiError } from '../api/accounts';

// ═══════════════════════════════════════════════════════════════════════════════
// TanStack Query hooks for Accounts API
//
//   useAccounts()              — GET /accounts (list all trading accounts)
//   useAccountDetails(login)   — GET /accounts/{login} (single account details)
//
// Caching strategy:
//   List:   staleTime 30s, polls every 60s — accounts change as trades execute
//   Detail: staleTime 15s, polls every 30s — more granular, used for active view
//   retry:  smart — retries transient errors (500/503/network), skips client
//           errors (401/403/404/422) since those won't resolve on retry
// ═══════════════════════════════════════════════════════════════════════════════

export const ACCOUNTS_LIST_KEY = 'accountsList';
export const ACCOUNT_DETAIL_KEY = 'accountDetail';

/**
 * Determines whether a failed accounts request should be retried.
 *
 * Retries on:
 *   - Network errors (statusCode === 0)
 *   - Server errors (500, 502, 503, 504)
 *   - Rate limiting (429) — may succeed after backoff
 *
 * Does NOT retry on:
 *   - Client errors (401, 403, 404, 422) — won't resolve without user action
 */
function shouldRetryAccounts(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false; // Max 2 retries

  if (error instanceof AccountsApiError) {
    const { statusCode } = error;
    // Don't retry client errors — they won't resolve on retry
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422) {
      return false;
    }
    return true;
  }

  return true;
}

/**
 * TanStack Query hook for listing all trading accounts.
 *
 * GET /accounts — returns the full list of trading accounts for
 * the authenticated user. Requires Bearer token.
 *
 * @param enabled - Optional override to control when the query fires.
 *                  Defaults to true (assumes caller checks auth state).
 */
export function useAccounts(enabled?: boolean) {
  const isEnabled = enabled ?? true;
  return useQuery<TradingAccount[], Error>({
    queryKey: [ACCOUNTS_LIST_KEY],
    queryFn: getAccounts,
    enabled: isEnabled,
    staleTime: 5 * 1000,          // 5 seconds — keep data fresh for account screens
    refetchInterval: isEnabled ? 10 * 1000 : false,  // Refresh every 10 seconds for near-real-time data
    retry: shouldRetryAccounts,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/**
 * TanStack Query hook for a single account's details.
 *
 * GET /accounts/{login} — returns detailed account information for a
 * specific MT5 login number. Requires Bearer token.
 *
 * @param login   - The MT5 account login number (e.g. 200052).
 *                  Query is disabled if login is undefined or 0.
 * @param enabled - Optional override to control when the query fires.
 */
export function useAccountDetails(login?: number, enabled?: boolean) {
  const isEnabled = (enabled ?? true) && !!login;
  return useQuery<TradingAccount, Error>({
    queryKey: [ACCOUNT_DETAIL_KEY, login],
    queryFn: () => getAccountById(login!),
    enabled: isEnabled,
    staleTime: 15 * 1000,        // 15 seconds — tighter for active account view
    refetchInterval: isEnabled ? 30 * 1000 : false,  // Poll every 30 seconds for near-real-time data
    retry: shouldRetryAccounts,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

