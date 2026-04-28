/**
 * Authoritative live candle hook.
 *
 * Candle formation now lives in one shared engine instead of being rebuilt
 * inside every mounted chart screen. That makes the chart resilient to
 * refreshes, remounts, and screen transitions while keeping one canonical
 * candle stream per symbol/timeframe.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { liveCandlesEngine, CandleParams, EMPTY_CANDLES } from '../api/ws/liveCandlesEngine';
import { candlesWsService } from '../api/ws/candlesSocket';
import {
  isTrustworthyCandleBootstrapSeed,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
} from '../domain/candles';
import { normalizeLiveTick } from '../candles/candleNormalizer';
import { getBucketStart } from '../candles/timeframeUtils';
import { useMarketData } from '../query/websocket';
import { hydratePersistedCandleCache } from '../state/persistedCandleCache';
import { useTradingState } from '../state/tradingState';

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

  return null;
};

export type { CandleParams } from '../api/ws/liveCandlesEngine';

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

    const normalizedTick = normalizeLiveTick(
      {
        symbol: normalizedSymbol,
        bid: liveQuote?.bid ?? price,
        ask: liveQuote?.ask,
        timestamp,
      },
      normalizedSymbol,
    );

    if (!normalizedTick) {
      return null;
    }

    const bucketTime = getBucketStart(normalizedTick.timestamp, normalizedTimeframe);
    if (bucketTime === null) {
      return null;
    }

    return {
      time: bucketTime,
      open: normalizedTick.price,
      high: normalizedTick.price,
      low: normalizedTick.price,
      close: normalizedTick.price,
      volume: normalizedTick.volume ?? 0,
      bid: typeof liveQuote?.bid === 'number' ? liveQuote.bid : price,
      ask: typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined,
    } as CandleParams;
  }, [liveQuote, normalizedTimeframe, normalizedSymbol, symbol]);
}
