/**
 * Authoritative live candle hook.
 *
 * Candle formation now lives in one shared engine instead of being rebuilt
 * inside every mounted chart screen. That makes the chart resilient to
 * refreshes, remounts, and screen transitions while keeping one canonical
 * candle stream per symbol/timeframe.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  EMPTY_CANDLES,
  liveCandleStream as liveCandlesEngine,
  type CandleParams,
} from '../stream/liveCandleStream';
import { candlesWsService } from '../ws/candlesSocket';
import {
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import { normalizeTimestampToMs } from '../core/timeframeUtils';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import { hydratePersistedCandleCache } from '../state/persistedCandleCache';
import { useTradingState } from '../../../state/tradingState';

// Cache the empty-snapshot reference for useSyncExternalStore. Returning a new
// `[]` each call would trip React's "cache the snapshot" guard and infinite-loop.
const emptyCandles = EMPTY_CANDLES as CandleParams[];
const getEmptySnapshot = () => emptyCandles;
const LIVE_TICK_STALE_MS = 45_000;

const getQuotePrice = (quote: Record<string, any> | undefined): number | null => {
  if (quote && typeof quote.bid === 'number' && Number.isFinite(quote.bid)) {
    return quote.bid;
  }

  if (quote && typeof quote.ask === 'number' && Number.isFinite(quote.ask)) {
    return quote.ask;
  }

  return null;
};

export type LivePriceTick = {
  time: number;
  timestamp: number;
  close: number;
  bid?: number;
  ask?: number;
};

const getQuoteTimestampMs = (quote: Record<string, any> | undefined): number | null => {
  if (!quote) {
    return null;
  }

  const lastReceivedAt = normalizeTimestampToMs(quote.lastReceivedAt);
  const lastTickAt = normalizeTimestampToMs(quote.lastTickAt);
  const freshnessAnchor = lastReceivedAt ?? lastTickAt;
  if (freshnessAnchor !== null && Date.now() - freshnessAnchor > LIVE_TICK_STALE_MS) {
    return null;
  }

  if (lastReceivedAt !== null) {
    return lastReceivedAt;
  }

  const candidates = [quote.time, quote.timestamp, quote.t];
  for (const candidate of candidates) {
    const normalized = normalizeTimestampToMs(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
};

export type { CandleParams } from '../stream/liveCandleStream';

/**
 * React hook that binds a specific market symbol and timeframe to the `LiveCandleStreamManager`.
 * 
 * - Triggers WebSocket subscription logic for the requested stream.
 * - Utilizes `useSyncExternalStore` for optimized, tearing-free React renders.
 * - Manages the lifecycle of cache hydration and prefetching when the component mounts.
 * 
 * @param symbol The requested market symbol (e.g. 'EURUSD').
 * @param timeframe The requested bucket size (e.g. 'M1').
 * @returns An object containing the active candle series and pagination/refresh controllers.
 */
export function useLiveCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const normalizedTimeframe = useMemo(() => normalizeTimeframeStrict(timeframe), [timeframe]);
  const candleKey = useMemo(
    () => (normalizedSymbol && normalizedTimeframe ? `${normalizedSymbol}.${normalizedTimeframe}` : ''),
    [normalizedSymbol, normalizedTimeframe],
  );
  const cachedCandles = useTradingState(
    useCallback(
      (state) =>
        candleKey
          ? (state.candles[candleKey] as CandleParams[] | undefined) ?? emptyCandles
          : emptyCandles,
      [candleKey],
    ),
  );
  const safeCachedCandles = useMemo(
    () =>
      normalizedTimeframe && isTrustworthyCandleBootstrapSeed(cachedCandles, normalizedTimeframe)
        ? cachedCandles
        : emptyCandles,
    [cachedCandles, normalizedTimeframe],
  );

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!normalizedSymbol || !normalizedTimeframe) {
        return () => {};
      }

      candlesWsService.subscribe(normalizedSymbol, normalizedTimeframe);
      const unsubscribeEngine = liveCandlesEngine.subscribe(normalizedSymbol, normalizedTimeframe, listener);
      return () => {
        unsubscribeEngine();
        candlesWsService.unsubscribe(normalizedSymbol, normalizedTimeframe);
      };
    },
    [normalizedSymbol, normalizedTimeframe],
  );

  const getSnapshot = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return emptyCandles;
    }

    return liveCandlesEngine.getCandles(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  const engineCandles = useSyncExternalStore(subscribe, getSnapshot, getEmptySnapshot);

  // Eagerly prefetch history on symbol/timeframe change so the engine
  // starts fetching before the full subscribe lifecycle completes.
  useEffect(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    void liveCandlesEngine.prefetchHistory(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  useEffect(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    let cancelled = false;
    void hydratePersistedCandleCache(normalizedSymbol, normalizedTimeframe).then((hydratedCandles) => {
      if (!cancelled && hydratedCandles.length > 0) {
        liveCandlesEngine.hydrateFromCache(
          normalizedSymbol,
          normalizedTimeframe,
          hydratedCandles as CandleParams[],
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedSymbol, normalizedTimeframe]);

  useEffect(() => {
    if (!normalizedSymbol || !normalizedTimeframe || safeCachedCandles.length === 0) {
      return;
    }

    liveCandlesEngine.hydrateFromCache(normalizedSymbol, normalizedTimeframe, safeCachedCandles);
  }, [normalizedSymbol, normalizedTimeframe, safeCachedCandles]);

  const candles = useMemo(
    () => (engineCandles.length > 0 ? engineCandles : safeCachedCandles),
    [engineCandles, safeCachedCandles],
  );

  const refresh = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    liveCandlesEngine.refresh(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  const paginate = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    liveCandlesEngine.paginateHistory(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe]);

  return { candles, refresh, paginate };
}

/**
 * A lightweight hook that provides just the most recent real-time quote tick
 * for a given symbol, completely bypassing the heavy candle aggregation pipeline.
 * Useful for simple UI overlays that just need to display the current bid/ask.
 * 
 * Includes staleness checks to discard quotes older than `LIVE_TICK_STALE_MS`.
 */
export function useLiveTick(symbol: string, _timeframe?: string): LivePriceTick | null {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const liveQuotes = useMarketData(symbol ? [symbol] : []);
  const liveQuote = liveQuotes[symbol] || liveQuotes[normalizedSymbol];

  return useMemo(() => {
    if (!hasLiveQuoteFeedData(liveQuote)) {
      return null;
    }

    const price = getQuotePrice(liveQuote);
    const timestampMs = getQuoteTimestampMs(liveQuote);
    if (price === null || timestampMs === null) {
      return null;
    }

    return {
      time: timestampMs,
      timestamp: timestampMs,
      close: price,
      bid: typeof liveQuote?.bid === 'number' ? liveQuote.bid : price,
      ask: typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined,
    };
  }, [liveQuote]);
}
