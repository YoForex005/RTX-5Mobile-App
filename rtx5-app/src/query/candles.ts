/**
 * Core module: candles.ts
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCandleHistory } from '../api/candles';
import { Candle } from '../state/tradingState';
import { mergeHistoryIntoCandleCache } from '../state/candleCache';
import { generateMockCandles } from '../mock/candleGenerator';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeSymbol, normalizeTimeframe } from '../domain/candles';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const candleKeys = {
  all: ['candles'] as const,
  history: (symbol: string, timeframe: string) =>
    [...candleKeys.all, 'history', symbol, timeframe] as const,
};

// ─── Candle History Query Hook ──────────────────────────────────────────────

/**
 * Fetches initial candle history from the REST API and populates the
 * Zustand store. Live ticks are handled separately by the WebSocket layer.
 */
export function useCandleHistory(symbol: string, timeframe: string) {
  const queryClient = useQueryClient();
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);

  return useQuery({
    queryKey: candleKeys.history(normalizedSymbol, normalizedTimeframe),
    queryFn: async () => {
      try {
        const res = await getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT);
        // Keep the fallback cache healed without discarding the active live bar.
        mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, res.candles);
        return res.candles;
      } catch (err) {
        // Fallback for demo or offline API
        console.warn(`[API Fallback] Using mock candles for ${normalizedSymbol}`);
        const fallbackCandles = generateMockCandles(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT);
        mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, fallbackCandles);
        return fallbackCandles;
      }
    },
    enabled: !!normalizedSymbol && !!normalizedTimeframe,
    staleTime: 30_000,       // 30s — candles update via WS after initial fetch
    gcTime: 5 * 60_000,      // 5 min garbage collection
    retry: 2,
    retryDelay: 1000,
  });
}
