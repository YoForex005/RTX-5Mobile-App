/**
 * TanStack Query hooks for the watchlist API.
 *
 * Design: local Zustand state (quoteSymbols) is the UI source of truth for
 * instant reactivity. Server calls are fire-and-forget mutations that run
 * alongside the local state update. On app start, the server watchlist is
 * fetched and used to hydrate local state if the server has data.
 *
 * Hooks:
 *  useWatchlistQuery          — GET  /api/v2/watchlist
 *  useAddToWatchlistMutation  — POST /api/v2/watchlist/{symbol}
 *  useRemoveWatchlistMutation — DELETE /api/v2/watchlist/{symbol}
 *  useReplaceWatchlistMutation — PUT  /api/v2/watchlist
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { watchlistApi } from '../api/watchlist';

const WATCHLIST_KEY = ['watchlist'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// GET — fetch server watchlist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the user's server-side watchlist.
 * Used on app start to hydrate local quoteSymbols state.
 * Stale after 60s; re-fetches on window focus.
 */
export function useWatchlistQuery() {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: () => watchlistApi.getWatchlist(),
    staleTime: 60_000,
    retry: 2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — add a symbol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a single symbol to the server-side watchlist.
 * Invalidates the watchlist cache on success so it stays consistent.
 * 400 responses (symbol already added) are silently ignored.
 */
export function useAddToWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => watchlistApi.addSymbol(symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — remove a symbol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove a single symbol from the server-side watchlist.
 * Invalidates the watchlist cache on success.
 */
export function useRemoveWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => watchlistApi.removeSymbol(symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — replace entire watchlist (reorder or bulk sync)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace the entire server watchlist.
 * Called after reordering symbols (drag-and-drop) or bulk operations.
 * The sort_order is derived from array index (0 = first).
 */
export function useReplaceWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbols: string[]) => watchlistApi.replaceWatchlist(symbols),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });
}
