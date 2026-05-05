/**
 * Core module: candles.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getCandleHistory } from '../api/candles';
import { mergeHistoryIntoCandleCache } from '../state/candleCache';
import {
  CANDLE_HISTORY_QUERY_GC_MS,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  LATEST_DAILY_CANDLE_HISTORY_LIMIT,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const candleKeys = {
  all: ['candles'] as const,
  history: (symbol: string, timeframe: string) =>
    [...candleKeys.all, 'history', symbol, timeframe] as const,
  latestDaily: (symbol: string) =>
    [...candleKeys.all, 'latestDaily', symbol] as const,
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
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
    retry: 2,
    retryDelay: 1000,
  });
}

export function useLatestDailyCandle(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  return useQuery({
    queryKey: candleKeys.latestDaily(normalizedSymbol),
    queryFn: async () => {
      const res = await getCandleHistory(
        normalizedSymbol,
        'D1',
        LATEST_DAILY_CANDLE_HISTORY_LIMIT,
      );
      return res.currentCandle ?? res.candles[res.candles.length - 1] ?? null;
    },
    enabled: !!normalizedSymbol,
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
    retry: 2,
    retryDelay: 1000,
  });
}
