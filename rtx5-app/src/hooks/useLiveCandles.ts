/**
 * Live Market Candlestick Connector Hook
 *
 * Uses the proven live quote feed as the canonical real-time source and
 * seeds the candle array from authenticated history. This avoids depending
 * on backend-side candle update contracts for live chart generation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCandleHistory } from '../api/candles';
import {
  applyLivePriceToCandleSeries,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  hasExcessiveLivePriceGap,
  mergeRecentHistoryIntoCandles,
  normalizeCandle,
  normalizeSymbol,
  normalizeTimeframe,
} from '../domain/candles';
import { useMarketData } from '../query/websocket';

const RECENT_HISTORY_HEAL_LIMIT = 12;
const RECENT_HISTORY_HEAL_DELAY_MS = 900;
const GAP_RESYNC_THROTTLE_MS = 4000;
const MAX_AUTO_GAP_FILL_CANDLES = 5;
const MAX_PENDING_QUOTES = 128;

type PendingQuote = {
  price: number;
  timestamp: unknown;
};

export type CandleParams = {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid?: number;
  ask?: number;
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

const getQuoteTimestamp = (quote: Record<string, any> | undefined): unknown => {
  if (!quote) {
    return null;
  }

  return quote.time ?? quote.timestamp ?? quote.t ?? quote.lastTickAt ?? null;
};

const clampPendingQuotes = (quotes: PendingQuote[]) =>
  quotes.length > MAX_PENDING_QUOTES ? quotes.slice(-MAX_PENDING_QUOTES) : quotes;

/**
 * Provides live OHLC candles by combining history with the live quote feed.
 * Each hook instance is isolated, so one mounted screen cannot break another.
 */
export function useLiveCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const normalizedTimeframe = useMemo(() => normalizeTimeframe(timeframe), [timeframe]);
  const liveQuotes = useMarketData(symbol ? [symbol] : []);
  const liveQuote = liveQuotes[symbol] || liveQuotes[normalizedSymbol];
  const [candles, setCandles] = useState<CandleParams[]>([]);

  const candlesRef = useRef<CandleParams[]>([]);
  const fetchEpochRef = useRef(0);
  const historyReadyRef = useRef(false);
  const queuedQuotesRef = useRef<PendingQuote[]>([]);
  const pendingQuotesRef = useRef<PendingQuote[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recentHistoryHealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recentHistoryHealInFlightRef = useRef(false);
  const lastGapResyncAtRef = useRef(0);

  const replaceCandles = useCallback((nextCandles: CandleParams[]) => {
    candlesRef.current = nextCandles;
    setCandles(nextCandles);
  }, []);

  const clearRecentHistoryHealTimer = useCallback(() => {
    if (recentHistoryHealTimerRef.current) {
      clearTimeout(recentHistoryHealTimerRef.current);
      recentHistoryHealTimerRef.current = null;
    }
  }, []);

  const scheduleRecentHistoryHeal = useCallback(() => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    clearRecentHistoryHealTimer();
    const healEpoch = fetchEpochRef.current;
    recentHistoryHealTimerRef.current = setTimeout(() => {
      recentHistoryHealTimerRef.current = null;

      if (recentHistoryHealInFlightRef.current) {
        return;
      }

      recentHistoryHealInFlightRef.current = true;

      void getCandleHistory(normalizedSymbol, normalizedTimeframe, RECENT_HISTORY_HEAL_LIMIT)
        .then((history) => {
          if (healEpoch !== fetchEpochRef.current) {
            return;
          }

          const healedCandles = mergeRecentHistoryIntoCandles(
            candlesRef.current,
            history.candles,
            normalizedTimeframe,
          ) as CandleParams[];

          if (healedCandles !== candlesRef.current) {
            replaceCandles(healedCandles);
          }
        })
        .catch((error) => {
          console.warn('[Live Candles] Recent history heal failed:', error);
        })
        .finally(() => {
          recentHistoryHealInFlightRef.current = false;
        });
    }, RECENT_HISTORY_HEAL_DELAY_MS);
  }, [clearRecentHistoryHealTimer, normalizedSymbol, normalizedTimeframe, replaceCandles]);

  const applyPendingQuotes = useCallback(
    (baseCandles: CandleParams[], quotes: PendingQuote[]) => {
      let nextCandles = baseCandles as CandleParams[];
      let appendedNewBucket = false;
      let requiresHistoryReload = false;

      for (const pendingQuote of quotes) {
        if (
          hasExcessiveLivePriceGap(
            nextCandles,
            pendingQuote.price,
            pendingQuote.timestamp,
            normalizedTimeframe,
            MAX_AUTO_GAP_FILL_CANDLES,
          )
        ) {
          requiresHistoryReload = true;
          break;
        }

        const previousLastTime = nextCandles[nextCandles.length - 1]?.time ?? null;
        const updatedCandles = applyLivePriceToCandleSeries(
          nextCandles,
          pendingQuote.price,
          pendingQuote.timestamp,
          normalizedTimeframe,
          MAX_AUTO_GAP_FILL_CANDLES,
        ) as CandleParams[];

        if (updatedCandles !== nextCandles) {
          const nextLastTime = updatedCandles[updatedCandles.length - 1]?.time ?? null;
          if (previousLastTime !== null && nextLastTime !== previousLastTime) {
            appendedNewBucket = true;
          }
          nextCandles = updatedCandles;
        }
      }

      return { nextCandles, appendedNewBucket, requiresHistoryReload };
    },
    [normalizedTimeframe],
  );

  const loadHistory = useCallback(async (options?: { preserveVisibleCandles?: boolean }) => {
    if (!normalizedSymbol || !normalizedTimeframe) {
      replaceCandles([]);
      historyReadyRef.current = false;
      queuedQuotesRef.current = [];
      pendingQuotesRef.current = [];
      return;
    }

    const preserveVisibleCandles = options?.preserveVisibleCandles === true;
    const fetchEpoch = ++fetchEpochRef.current;
    historyReadyRef.current = false;
    queuedQuotesRef.current = [];
    pendingQuotesRef.current = [];
    if (!preserveVisibleCandles) {
      replaceCandles([]);
    }

    try {
      const history = await getCandleHistory(
        normalizedSymbol,
        normalizedTimeframe,
        DEFAULT_CANDLE_HISTORY_LIMIT,
      );

      if (fetchEpoch !== fetchEpochRef.current) {
        return;
      }

      const queuedQuotes = queuedQuotesRef.current;
      queuedQuotesRef.current = [];
      const { nextCandles, appendedNewBucket } = applyPendingQuotes(history.candles, queuedQuotes);
      historyReadyRef.current = true;
      replaceCandles([...nextCandles]);
      lastGapResyncAtRef.current = 0;

      if (appendedNewBucket) {
        scheduleRecentHistoryHeal();
      }
    } catch (error) {
      if (fetchEpoch !== fetchEpochRef.current) {
        return;
      }

      console.warn('[Live Candles] History fetch failed, continuing with quote-driven live candles:', error);
      historyReadyRef.current = true;
      const queuedQuotes = queuedQuotesRef.current;
      queuedQuotesRef.current = [];
      const fallbackBaseCandles = preserveVisibleCandles ? candlesRef.current : [];
      const { nextCandles, appendedNewBucket } = applyPendingQuotes(fallbackBaseCandles, queuedQuotes);

      if (nextCandles !== fallbackBaseCandles || !preserveVisibleCandles) {
        replaceCandles([...nextCandles]);
      }

      if (appendedNewBucket) {
        scheduleRecentHistoryHeal();
      }
    }
  }, [applyPendingQuotes, normalizedSymbol, normalizedTimeframe, replaceCandles, scheduleRecentHistoryHeal]);

  useEffect(() => {
    void loadHistory();

    return () => {
      fetchEpochRef.current += 1;
      candlesRef.current = [];
      historyReadyRef.current = false;
      queuedQuotesRef.current = [];
      pendingQuotesRef.current = [];
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      clearRecentHistoryHealTimer();
      recentHistoryHealInFlightRef.current = false;
      lastGapResyncAtRef.current = 0;
    };
  }, [clearRecentHistoryHealTimer, loadHistory]);

  const price = getQuotePrice(liveQuote);
  const timestamp = getQuoteTimestamp(liveQuote);

  useEffect(() => {
    if (!normalizedSymbol || !normalizedTimeframe || price === null || timestamp === null) {
      return;
    }

    const nextQuote = { price, timestamp };

    if (!historyReadyRef.current) {
      queuedQuotesRef.current = clampPendingQuotes([...queuedQuotesRef.current, nextQuote]);
      return;
    }

    pendingQuotesRef.current = clampPendingQuotes([...pendingQuotesRef.current, nextQuote]);

    if (flushTimeoutRef.current) {
      return;
    }

    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      const quotesToApply = pendingQuotesRef.current;
      pendingQuotesRef.current = [];

      if (quotesToApply.length === 0) {
        return;
      }

      const { nextCandles, appendedNewBucket, requiresHistoryReload } = applyPendingQuotes(
        candlesRef.current,
        quotesToApply,
      );

      if (requiresHistoryReload) {
        const now = Date.now();
        if (now - lastGapResyncAtRef.current >= GAP_RESYNC_THROTTLE_MS) {
          lastGapResyncAtRef.current = now;
          void loadHistory({ preserveVisibleCandles: true });
        }
        return;
      }

      if (nextCandles !== candlesRef.current) {
        replaceCandles(nextCandles);
      }

      if (appendedNewBucket) {
        scheduleRecentHistoryHeal();
      }
    }, 16);
  }, [
    applyPendingQuotes,
    loadHistory,
    normalizedSymbol,
    normalizedTimeframe,
    price,
    replaceCandles,
    scheduleRecentHistoryHeal,
    timestamp,
  ]);

  const refresh = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    clearRecentHistoryHealTimer();
    recentHistoryHealInFlightRef.current = false;
    lastGapResyncAtRef.current = 0;
    pendingQuotesRef.current = [];
    queuedQuotesRef.current = [];
    void loadHistory();
  }, [clearRecentHistoryHealTimer, loadHistory]);

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
