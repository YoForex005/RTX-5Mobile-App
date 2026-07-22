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
import { quotesWsService } from '../../../api/ws/quotesSocket';
import { candlesWsService } from '../ws/candlesSocket';
import {
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import { normalizeTimestampToMs } from '../core/timeframeUtils';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import { hydratePersistedCandleCache } from '../state/persistedCandleCache';
import { shouldUseServerCandleStream } from '../ws/liveCandlesEnginePolicy';
import { useUserPreferences } from '../../../state/userPreferences';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../../market/quotePolicy';

// Cache the empty-snapshot reference for useSyncExternalStore. Returning a new
// `[]` each call would trip React's "cache the snapshot" guard and infinite-loop.
const emptyCandles = EMPTY_CANDLES as CandleParams[];
const EMPTY_STREAM_SNAPSHOT_KEY = 'empty';
const getEmptyStreamSnapshotKey = () => EMPTY_STREAM_SNAPSHOT_KEY;
const LIVE_TICK_STALE_MS = MARKET_QUOTE_STALE_AFTER_MS;

const getCandleStreamSnapshotKey = (symbol: string, timeframe: string): string => {
  const state = liveCandlesEngine.getState(symbol, timeframe);
  if (!state) {
    return EMPTY_STREAM_SNAPSHOT_KEY;
  }

  const last = state.candles[state.candles.length - 1];
  return [
    state.requestId,
    state.loading ? 1 : 0,
    state.error ?? '',
    state.isLiveConnected ? 1 : 0,
    state.lastUpdateTime ?? 0,
    state.candles.length,
    last?.time ?? '',
    last?.open ?? '',
    last?.high ?? '',
    last?.low ?? '',
    last?.close ?? '',
  ].join('|');
};

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

const hasCommittedHistoryCandles = (candles: readonly CandleParams[]): boolean =>
  candles.some((candle) => candle.source === 'history' || candle.source === 'rest' || candle.closed === true);

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
export function useLiveCandles(
  symbol: string,
  timeframe: string,
  active = true,
  commitIntervalMs = 0,
) {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const normalizedTimeframe = useMemo(() => normalizeTimeframeStrict(timeframe), [timeframe]);
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const isLiveActive = active && isLoggedIn;
  const useServerCandleStream = shouldUseServerCandleStream();
  const safeCommitIntervalMs = Math.max(0, Math.floor(commitIntervalMs));

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!isLiveActive || !normalizedSymbol || !normalizedTimeframe) {
        return () => {};
      }

      const unsubscribeCandleDemand = useServerCandleStream
        ? (() => {
            candlesWsService.subscribe(normalizedSymbol, normalizedTimeframe);
            return () => candlesWsService.unsubscribe(normalizedSymbol, normalizedTimeframe);
          })()
        : null;
      // Keep the quote socket on for this chart. In the default mode, quote
      // ticks are the only active-candle body source; server candles are opt-in
      // only after runtime compatibility has been proven.
      const unsubscribeQuoteDemand = quotesWsService.subscribeToSymbol(symbol, () => {});
      let lastNotificationAt = 0;
      let notificationTimer: ReturnType<typeof setTimeout> | null = null;
      const notifyReact = () => {
        notificationTimer = null;
        lastNotificationAt = Date.now();
        listener();
      };
      const scheduleReactNotification = () => {
        if (safeCommitIntervalMs === 0) {
          notifyReact();
          return;
        }
        if (notificationTimer !== null) {
          return;
        }

        const elapsedMs = Date.now() - lastNotificationAt;
        const delayMs = Math.max(0, safeCommitIntervalMs - elapsedMs);
        if (delayMs === 0) {
          notifyReact();
          return;
        }
        notificationTimer = setTimeout(notifyReact, delayMs);
      };
      const unsubscribeEngine = liveCandlesEngine.subscribe(
        normalizedSymbol,
        normalizedTimeframe,
        scheduleReactNotification,
      );
      return () => {
        if (notificationTimer !== null) {
          clearTimeout(notificationTimer);
          notificationTimer = null;
        }
        unsubscribeQuoteDemand();
        unsubscribeEngine();
        unsubscribeCandleDemand?.();
      };
    },
    [
      isLiveActive,
      normalizedSymbol,
      normalizedTimeframe,
      safeCommitIntervalMs,
      symbol,
      useServerCandleStream,
    ],
  );

  const getSnapshot = useCallback(() => {
    // Must mirror the subscribe gate. An inactive instance never subscribes,
    // so its snapshot must stay frozen too — if it kept returning the live
    // stream key, every candle tick would fail React's store-consistency check
    // and force synchronous re-renders of hidden retained screens (warmed
    // routes, chart previews) that share the focused chart's symbol/timeframe.
    if (!isLiveActive || !normalizedSymbol || !normalizedTimeframe) {
      return EMPTY_STREAM_SNAPSHOT_KEY;
    }

    return getCandleStreamSnapshotKey(normalizedSymbol, normalizedTimeframe);
  }, [isLiveActive, normalizedSymbol, normalizedTimeframe]);

  const streamSnapshotKey = useSyncExternalStore(subscribe, getSnapshot, getEmptyStreamSnapshotKey);

  const engineCandles = useMemo(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return emptyCandles;
    }

    return liveCandlesEngine.getCandles(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe, streamSnapshotKey]);

  const streamState = useMemo(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return null;
    }

    return liveCandlesEngine.getState(normalizedSymbol, normalizedTimeframe);
  }, [normalizedSymbol, normalizedTimeframe, streamSnapshotKey]);

  // Eagerly prefetch history on symbol/timeframe change so the engine
  // starts fetching before the full subscribe lifecycle completes.
  useEffect(() => {
    if (!isLiveActive || !normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    void liveCandlesEngine.prefetchHistory(normalizedSymbol, normalizedTimeframe);
  }, [isLiveActive, normalizedSymbol, normalizedTimeframe]);

  useEffect(() => {
    if (!isLiveActive || !normalizedSymbol || !normalizedTimeframe) {
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
  }, [isLiveActive, normalizedSymbol, normalizedTimeframe]);

  const candles = useMemo(() => engineCandles, [engineCandles]);
  const hasHistoryCandles = useMemo(() => hasCommittedHistoryCandles(engineCandles), [engineCandles]);

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

  return {
    candles,
    hasHistoryCandles,
    loading: streamState?.loading ?? false,
    error: streamState?.error ?? null,
    refresh,
    paginate,
  };
}

/**
 * A lightweight hook that provides just the most recent real-time quote tick
 * for a given symbol, completely bypassing the heavy candle aggregation pipeline.
 * Useful for simple UI overlays that just need to display the current bid/ask.
 * 
 * Includes staleness checks to discard quotes older than `LIVE_TICK_STALE_MS`.
 */
export function useLiveTick(symbol: string, _timeframe?: string, active = true): LivePriceTick | null {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const liveQuotes = useMarketData(symbol ? [symbol] : [], active);
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
