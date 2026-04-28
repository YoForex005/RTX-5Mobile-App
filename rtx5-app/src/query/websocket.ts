/**
 * Core module: websocket.ts
 */

import React, { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import { wsService } from '../api/ws/socket';
import { quotesWsService } from '../api/ws/quotesSocket';
import { useTradingState } from '../state/tradingState';
import { quotes as mockQuotes, type QuoteItem } from '../mock/tradingData';
import { normalizeSymbol } from '../domain/symbols';
import { normalizeTimeframeStrict } from '../domain/candles';

// ─── WebSocket Global Connection Hook ───────────────────────────────────────

/**
 * Initializes and manages the global WebSocket connection.
 * Mount this in a top-level provider (e.g., _layout.tsx) so the WS connection
 * persists across screens.
 */
export function useWebSocketConnection() {
  useEffect(() => {
    // Attempt connection on mount
    wsService.connect();

    // Clean up on unmount
    return () => {
      wsService.disconnect();
    };
  }, []);

  return { connected: wsService.getConnectionStatus() };
}

// ─── Component Data Hooks (TanStack Query + Zustand) ────────────────────────

/**
 * Hook to subscribe to live price ticks for a specific array of symbols.
 * 
 * NOTE ON ARCHITECTURE:
 * We use `useEffect` to tell the WebSocketService to subscribe.
 * The WebSocketService independently dispatches ticks directly to `useTradingState`.
 * We return the `useTradingState` selector so the component only re-renders
 * when the specific symbols it cares about update.
 */
export function useMarketData(symbols: string[] = []) {
  const symbolsKey = JSON.stringify(symbols);
  const normalizedSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))),
    [symbolsKey],
  );

  // Selector that picks ONLY the quotes this component cares about.
  // Zustand + shallow comparison ensures we only re-render when one of
  // OUR symbols changes — not when an unrelated symbol ticks.
  // This is the key optimization: a QuoteDetails page watching EURUSD
  // no longer re-renders when BTCUSD ticks.
  const stableKey = JSON.stringify(normalizedSymbols);
  const selector = useCallback(
    (state: any) => {
      if (normalizedSymbols.length === 0) return state.quotes;
      const result: Record<string, any> = {};
      for (const sym of normalizedSymbols) {
        if (state.quotes[sym]) result[sym] = state.quotes[sym];
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey],
  );
  const liveQuotes = useTradingState(useShallow(selector));

  useEffect(() => {
    if (normalizedSymbols.length === 0) return;
    quotesWsService.connect();
    quotesWsService.subscribe(normalizedSymbols);

    return () => {
      quotesWsService.unsubscribe(normalizedSymbols);
    };
  }, [stableKey]);

  if (symbols.length === 0) return liveQuotes;
  return symbols.reduce((acc, sym) => {
    const normalizedSymbol = normalizeSymbol(sym);
    const mock = mockQuotes.find((m) => normalizeSymbol(m.symbol) === normalizedSymbol);
    const live = liveQuotes[sym] || liveQuotes[normalizedSymbol];
    if (live || mock) {
      acc[sym] = { ...(mock || {}), ...(live || {}), symbol: normalizedSymbol };
    }
    return acc;
  }, {} as Record<string, any>);
}

function resolveMergedQuoteSnapshot(
  requestedSymbol: string,
  liveQuote?: Partial<QuoteItem>,
): Partial<QuoteItem> | undefined {
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  if (!normalizedSymbol) {
    return undefined;
  }

  const mock = mockQuotes.find((entry) => normalizeSymbol(entry.symbol) === normalizedSymbol);
  if (!mock && !liveQuote) {
    return undefined;
  }

  return {
    ...(mock || {}),
    ...(liveQuote || {}),
    symbol: normalizedSymbol,
  };
}

const areQuoteSnapshotsEqual = (
  left: Partial<QuoteItem> | undefined,
  right: Partial<QuoteItem> | undefined,
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.symbol === right.symbol &&
    left.bid === right.bid &&
    left.ask === right.ask &&
    left.digits === right.digits &&
    left.lastTickAt === right.lastTickAt &&
    left.spread === right.spread &&
    left.volume === right.volume &&
    left.changePct === right.changePct
  );
};

const mergeQuoteTickIntoSnapshot = (
  requestedSymbol: string,
  currentSnapshot: Partial<QuoteItem> | undefined,
  tick: { bid: number; ask: number; timestamp: number },
): Partial<QuoteItem> | undefined => {
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  if (!normalizedSymbol) {
    return undefined;
  }

  const digits =
    typeof currentSnapshot?.digits === 'number' && Number.isFinite(currentSnapshot.digits)
      ? currentSnapshot.digits
      : undefined;

  return resolveMergedQuoteSnapshot(requestedSymbol, {
    ...(currentSnapshot || {}),
    symbol: normalizedSymbol,
    bid: tick.bid,
    ask: tick.ask,
    lastTickAt: tick.timestamp,
    spread:
      digits !== undefined
        ? (tick.ask - tick.bid) * Math.pow(10, digits)
        : currentSnapshot?.spread,
  });
};

export function useLiveSymbolQuote(symbol: string): Partial<QuoteItem> | undefined {
  const normalizedSymbol = React.useMemo(() => normalizeSymbol(symbol), [symbol]);
  const seedQuote = React.useMemo(
    () =>
      resolveMergedQuoteSnapshot(
        symbol,
        normalizedSymbol ? useTradingState.getState().quotes[normalizedSymbol] : undefined,
      ),
    [normalizedSymbol, symbol],
  );
  const [liveQuote, setLiveQuote] = React.useState<Partial<QuoteItem> | undefined>(seedQuote);
  const liveQuoteRef = React.useRef<Partial<QuoteItem> | undefined>(seedQuote);
  const quoteCommitAnimationFrameRef = React.useRef<number | null>(null);
  const quoteCommitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledCommit = React.useCallback(() => {
    if (quoteCommitAnimationFrameRef.current !== null) {
      cancelAnimationFrame(quoteCommitAnimationFrameRef.current);
      quoteCommitAnimationFrameRef.current = null;
    }
    if (quoteCommitTimerRef.current) {
      clearTimeout(quoteCommitTimerRef.current);
      quoteCommitTimerRef.current = null;
    }
  }, []);

  const scheduleQuoteCommit = React.useCallback(() => {
    if (quoteCommitAnimationFrameRef.current !== null || quoteCommitTimerRef.current) {
      return;
    }

    const commit = () => {
      quoteCommitAnimationFrameRef.current = null;
      if (quoteCommitTimerRef.current) {
        clearTimeout(quoteCommitTimerRef.current);
        quoteCommitTimerRef.current = null;
      }

      const nextSnapshot = liveQuoteRef.current;
      React.startTransition(() => {
        setLiveQuote((current) => (areQuoteSnapshotsEqual(current, nextSnapshot) ? current : nextSnapshot));
      });
    };

    if (typeof requestAnimationFrame === 'function') {
      quoteCommitAnimationFrameRef.current = requestAnimationFrame(() => {
        commit();
      });
      return;
    }

    quoteCommitTimerRef.current = setTimeout(() => {
      commit();
    }, 16);
  }, []);

  useEffect(() => {
    liveQuoteRef.current = seedQuote;
    setLiveQuote((current) => (areQuoteSnapshotsEqual(current, seedQuote) ? current : seedQuote));
  }, [seedQuote]);

  useEffect(() => {
    if (!normalizedSymbol) {
      cancelScheduledCommit();
      liveQuoteRef.current = undefined;
      setLiveQuote(undefined);
      return;
    }

    quotesWsService.connect();
    quotesWsService.subscribe([normalizedSymbol]);

    const listener = (tick: { symbol: string; bid: number; ask: number; timestamp: number }) => {
      if (normalizeSymbol(tick.symbol) !== normalizedSymbol) {
        return;
      }

      liveQuoteRef.current = mergeQuoteTickIntoSnapshot(symbol, liveQuoteRef.current, tick);
      scheduleQuoteCommit();
    };

    quotesWsService.addTickListener(listener);

    return () => {
      quotesWsService.removeTickListener(listener);
      quotesWsService.unsubscribe([normalizedSymbol]);
      cancelScheduledCommit();
    };
  }, [cancelScheduledCommit, normalizedSymbol, scheduleQuoteCommit, symbol]);

  return liveQuote;
}

/**
 * Hook to subscribe to live account metrics (equity, balance, etc).
 */
export function useLiveAccount(accountId: string) {
  const account = useTradingState(state => state.account);

  useEffect(() => {
    if (!accountId) return;

    const channel = `account.${accountId}`;
    wsService.subscribe(channel);

    return () => {
      wsService.unsubscribe(channel);
    };
  }, [accountId]);

  return account;
}

/**
 * Deprecated compatibility hook.
 *
 * Chart screens must use `useLiveCandles`, which loads REST history and
 * subscribes to the dedicated backend candle WebSocket. This wrapper only
 * reads the canonical cache populated by that path; it does not request
 * legacy WS history or subscribe to quote-derived candle channels.
 */
export function useCandleStream(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  const key = normalizedSymbol && normalizedTimeframe ? `${normalizedSymbol}.${normalizedTimeframe}` : '';
  const candles = useTradingState(state => state.candles[key]);

  return {
    candles: candles || [],
    isLoading: !candles || candles.length === 0,
    isError: false,
    isFallback: false,
  };
}

