import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCandleHistory } from '../api/candles';
import { useTradingState, Candle } from '../state/tradingState';

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

  return useQuery({
    queryKey: candleKeys.history(symbol, timeframe),
    queryFn: async () => {
      const res = await getCandleHistory(symbol, timeframe, 200);
      // Populate the Zustand store so the chart renders immediately
      const store = useTradingState.getState();
      store.setCandleHistory(symbol, timeframe, res.candles);
      return res.candles;
    },
    enabled: !!symbol && !!timeframe,
    staleTime: 30_000,       // 30s — candles update via WS after initial fetch
    gcTime: 5 * 60_000,      // 5 min garbage collection
    retry: 2,
    retryDelay: 1000,
  });
}
