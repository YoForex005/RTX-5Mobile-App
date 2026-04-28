/**
 * Core module: candles.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getCandleHistory } from '../api/candles';
import { mergeHistoryIntoCandleCache } from '../state/candleCache';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeSymbol, normalizeTimeframeStrict } from '../domain/candles';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const candleKeys = {
  all: ['candles'] as const,
  history: (symbol: string, timeframe: string) =>
    [...candleKeys.all, 'history', symbol, timeframe] as const,
};

// ─── Candle History Query Hook ──────────────────────────────────────────────

/**
 * Fetches initial candle history from the REST API and populates the
 * Zustand store. Live candle snapshots are handled separately by the
 * dedicated candle WebSocket layer.
 */
export function useCandleHistory(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);

  return useQuery({
    queryKey: candleKeys.history(normalizedSymbol, normalizedTimeframe ?? ''),
    queryFn: async () => {
      if (!normalizedTimeframe) {
        return [];
      }
      const res = await getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT);
      mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, res.candles);
      return res.candles;
    },
    enabled: !!normalizedSymbol && !!normalizedTimeframe,
    staleTime: 30_000,       // 30s — candles update via WS after initial fetch
    gcTime: 5 * 60_000,      // 5 min garbage collection
    retry: 2,
    retryDelay: 1000,
  });
}
