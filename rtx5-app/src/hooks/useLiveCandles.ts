/**
 * Authoritative live candle hook.
 *
 * Candle formation now lives in one shared engine instead of being rebuilt
 * inside every mounted chart screen. That makes the chart resilient to
 * refreshes, remounts, and screen transitions while keeping one canonical
 * candle stream per symbol/timeframe.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { liveCandlesEngine, CandleParams, EMPTY_CANDLES } from '../api/ws/liveCandlesEngine';
import { normalizeCandle, normalizeSymbol, normalizeTimeframe } from '../domain/candles';
import { useMarketData } from '../query/websocket';

// Cache the empty-snapshot reference for useSyncExternalStore. Returning a new
// `[]` each call would trip React's "cache the snapshot" guard and infinite-loop.
const emptyCandles = EMPTY_CANDLES as CandleParams[];
const getEmptySnapshot = () => emptyCandles;

const getQuotePrice = (quote: Record<string, any> | undefined): number | null => {
  if (quote && typeof quote.bid === 'number' && Number.isFinite(quote.bid)) {
    return quote.bid;
  }

  if (quote && typeof quote.ask === 'number' && Number.isFinite(quote.ask)) {
    return quote.ask;
  }

  return null;
};

const getQuoteTimestamp = (quote: Record<string, any> | undefined): number | null => {
  if (!quote) {
    return null;
  }

  const candidates = [quote.time, quote.timestamp, quote.t];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  if (typeof quote.lastTickAt === 'number' && quote.lastTickAt > 0) {
    return quote.lastTickAt;
  }

  return Date.now();
};

export type { CandleParams } from '../api/ws/liveCandlesEngine';

export function useLiveCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const normalizedTimeframe = useMemo(() => normalizeTimeframe(timeframe), [timeframe]);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!normalizedSymbol || !normalizedTimeframe) {
        return () => {};
      }

      return liveCandlesEngine.subscribe(normalizedSymbol, normalizedTimeframe, listener);
    },
    [normalizedSymbol, normalizedTimeframe],
  );

  const getSnapshot = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return emptyCandles;
    }

    return liveCandlesEngine.getCandles(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  const candles = useSyncExternalStore(subscribe, getSnapshot, getEmptySnapshot);

  const refresh = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    liveCandlesEngine.refresh(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  return { candles, refresh };
}

/**
 * Lightweight live price hook for UI elements that only need the latest price.
 * Reads from the quote feed directly so it stays aligned with the rest of the app.
 */
export function useLiveTick(symbol: string, timeframe?: string) {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const normalizedTimeframe = useMemo(() => normalizeTimeframe(timeframe ?? 'M1'), [timeframe]);
  const liveQuotes = useMarketData(symbol ? [symbol] : []);
  const liveQuote = liveQuotes[symbol] || liveQuotes[normalizedSymbol];

  return useMemo(() => {
    const price = getQuotePrice(liveQuote);
    const timestamp = getQuoteTimestamp(liveQuote);
    if (price === null || timestamp === null) {
      return null;
    }

    const normalizedTick = normalizeCandle(
      {
        bid: liveQuote?.bid ?? price,
        ask: liveQuote?.ask,
        timestamp,
      },
      normalizedTimeframe,
    );

    if (!normalizedTick) {
      return null;
    }

    return {
      ...normalizedTick,
      bid: typeof liveQuote?.bid === 'number' ? liveQuote.bid : price,
      ask: typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined,
    } as CandleParams;
  }, [liveQuote, normalizedTimeframe, normalizedSymbol, symbol]);
}
