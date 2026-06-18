/**
 * Core module: websocket.ts
 */

import React, { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import { apiClient } from '../api/apiClient';
import { wsService } from '../api/ws/socket';
import { quotesWsService } from '../api/ws/quotesSocket';
import type { QuoteTickEvent } from '../api/ws/quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import { quotes as mockQuotes, type QuoteItem } from '../dev/mock/tradingData';
import { normalizeSymbol } from '../domain/symbols';
import { liveCandleStream } from '../domain/candles/stream/liveCandleStream';
import { hasQuotePriceChange } from '../utils/quotePriceChange';
import { calculateQuoteSpreadPoints } from '../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../utils/quoteVolume';
import { buildRestQuoteTickEvent } from './restQuoteTick';

const LIVE_QUOTE_STALE_MS = 45_000;
const LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS = 16;
const LIVE_SYMBOL_REST_SNAPSHOT_POLL_MS = 1_000;
const EMPTY_LIVE_QUOTES: Record<string, any> = Object.freeze({});

type LiveSymbolQuoteListener = (tick: QuoteTickEvent) => void;

type RestQuoteFallbackEntry = {
  symbol: string;
  listeners: Set<LiveSymbolQuoteListener>;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
};

const restQuoteFallbackEntries = new Map<string, RestQuoteFallbackEntry>();

function getQuoteFreshnessAnchorMs(liveQuote?: Partial<QuoteItem>): number | null {
  return (
    normalizeQuoteTickTimestampToMs(liveQuote?.lastReceivedAt) ??
    normalizeQuoteTickTimestampToMs(liveQuote?.lastTickAt)
  );
}

function isFreshLiveQuote(liveQuote?: Partial<QuoteItem>): boolean {
  const liveQuoteTickAt = getQuoteFreshnessAnchorMs(liveQuote);
  return !!liveQuote && (liveQuoteTickAt === null || Date.now() - liveQuoteTickAt <= LIVE_QUOTE_STALE_MS);
}

export function hasLiveQuoteFeedData(liveQuote?: Partial<QuoteItem>): boolean {
  const liveQuoteTickAt = getQuoteFreshnessAnchorMs(liveQuote);
  return !!liveQuote && liveQuoteTickAt !== null && Date.now() - liveQuoteTickAt <= LIVE_QUOTE_STALE_MS;
}

const asQuoteSnapshotArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data;
    }
    if (Array.isArray(record.items)) {
      return record.items;
    }
    if (Array.isArray(record.quotes)) {
      return record.quotes;
    }
    return [record];
  }

  return [];
};

const publishQuoteTickToSharedStores = (tick: QuoteTickEvent): void => {
  useTradingState.getState().setQuote(tick.rawSymbol || tick.symbol, {
    bid: tick.bid,
    ask: tick.ask,
    lastTickAt: tick.timestamp,
    lastReceivedAt: tick.receivedAt,
    feedTickAt: tick.feedTickAt ?? tick.timestamp,
    ...(tick.last !== undefined ? { close: tick.last } : {}),
    ...(tick.high !== undefined ? { high: tick.high } : {}),
    ...(tick.low !== undefined ? { low: tick.low } : {}),
    ...(tick.open !== undefined ? { open: tick.open } : {}),
    ...(tick.spread !== undefined ? { spread: tick.spread } : {}),
    ...(tick.volume !== undefined ? { volume: tick.volume, volumeSource: 'backend' as const } : {}),
    ...(tick.digits !== undefined ? { digits: tick.digits } : {}),
    ...(tick.digits !== undefined ? { digitsSource: 'backend' as const } : {}),
    ...(tick.point !== undefined ? { point: tick.point } : {}),
    ...(tick.tickSize !== undefined ? { tickSize: tick.tickSize } : {}),
  });

  const price = Number.isFinite(tick.bid) && tick.bid > 0
    ? tick.bid
    : Number.isFinite(tick.ask) && tick.ask > 0
      ? tick.ask
      : null;
  if (price !== null) {
    liveCandleStream.extendActiveCandlesFromQuoteTick(tick.symbol, {
      price,
      time: tick.timestamp,
    });
  }
};

const fetchRestQuoteSnapshotForEntry = async (entry: RestQuoteFallbackEntry): Promise<void> => {
  if (entry.inFlight || entry.listeners.size === 0) {
    return;
  }

  const liveQuote = useTradingState.getState().quotes[entry.symbol];
  if (isFreshLiveQuote(liveQuote)) {
    return;
  }

  entry.inFlight = true;
  const receivedAt = Date.now();
  try {
    const isLoggedIn = useUserPreferences.getState().isLoggedIn;
    const response = await apiClient(
      `/quotes?symbols=${encodeURIComponent(entry.symbol)}`,
      isLoggedIn ? {} : { skipAuth: true, skipRefresh: true },
    );
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const requestedSymbol = normalizeSymbol(entry.symbol);
    let selectedTick: QuoteTickEvent | null = null;
    for (const snapshot of asQuoteSnapshotArray(payload)) {
      const tick = buildRestQuoteTickEvent(entry.symbol, snapshot, receivedAt);
      if (!tick) {
        continue;
      }
      if (!requestedSymbol || normalizeSymbol(tick.symbol) === requestedSymbol) {
        selectedTick = tick;
        break;
      }
    }

    if (!selectedTick) {
      return;
    }

    publishQuoteTickToSharedStores(selectedTick);
    entry.listeners.forEach((listener) => {
      try {
        listener(selectedTick);
      } catch (error) {
        console.warn('[Quotes REST] Symbol listener error', error);
      }
    });
  } catch (error) {
    console.warn('[Quotes REST] Symbol snapshot poll failed', error);
  } finally {
    entry.inFlight = false;
  }
};

const subscribeLiveSymbolRestQuoteFallback = (
  symbol: string,
  listener: LiveSymbolQuoteListener,
): (() => void) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    return () => {};
  }

  let entry = restQuoteFallbackEntries.get(normalizedSymbol);
  if (!entry) {
    entry = {
      symbol: normalizedSymbol,
      listeners: new Set(),
      timer: null,
      inFlight: false,
    };
    restQuoteFallbackEntries.set(normalizedSymbol, entry);
  }

  entry.listeners.add(listener);
  void fetchRestQuoteSnapshotForEntry(entry);
  if (!entry.timer) {
    entry.timer = setInterval(() => {
      const activeEntry = restQuoteFallbackEntries.get(normalizedSymbol);
      if (activeEntry) {
        void fetchRestQuoteSnapshotForEntry(activeEntry);
      }
    }, LIVE_SYMBOL_REST_SNAPSHOT_POLL_MS);
  }

  return () => {
    const activeEntry = restQuoteFallbackEntries.get(normalizedSymbol);
    if (!activeEntry) {
      return;
    }
    activeEntry.listeners.delete(listener);
    if (activeEntry.listeners.size > 0) {
      return;
    }
    if (activeEntry.timer) {
      clearInterval(activeEntry.timer);
    }
    restQuoteFallbackEntries.delete(normalizedSymbol);
  };
};

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
export function useMarketData(symbols: string[] = [], active = true) {
  const isActive = active;
  const symbolsKey = JSON.stringify(symbols);
  const transportSymbols = React.useMemo(
    () => Array.from(new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))),
    [symbolsKey],
  );
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
      if (!isActive || normalizedSymbols.length === 0) return EMPTY_LIVE_QUOTES;
      const result: Record<string, any> = {};
      for (const sym of normalizedSymbols) {
        if (state.quotes[sym]) result[sym] = state.quotes[sym];
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, stableKey],
  );
  const liveQuotes = useTradingState(useShallow(selector));

  useEffect(() => {
    if (!isActive || transportSymbols.length === 0) return;
    quotesWsService.connect();
    quotesWsService.subscribe(transportSymbols);

    return () => {
      quotesWsService.unsubscribe(transportSymbols);
    };
  }, [isActive, transportSymbols]);

  if (!isActive || symbols.length === 0) return liveQuotes;
  return symbols.reduce((acc, sym) => {
    const normalizedSymbol = normalizeSymbol(sym);
    const mock = mockQuotes.find((m) => normalizeSymbol(m.symbol) === normalizedSymbol);
    const live = liveQuotes[sym] || liveQuotes[normalizedSymbol];
    if (live && !isFreshLiveQuote(live)) {
      return acc;
    }
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
  const freshLiveQuote = isFreshLiveQuote(liveQuote) ? liveQuote : undefined;

  if (liveQuote && !freshLiveQuote) {
    return undefined;
  }

  if (!mock && !freshLiveQuote) {
    return undefined;
  }

  return {
    ...(mock || {}),
    ...(freshLiveQuote || {}),
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
    left.digitsSource === right.digitsSource &&
    left.point === right.point &&
    left.tickSize === right.tickSize &&
    left.feedTickAt === right.feedTickAt &&
    left.lastTickAt === right.lastTickAt &&
    left.lastReceivedAt === right.lastReceivedAt &&
    left.lastPriceChangedAt === right.lastPriceChangedAt &&
    left.spread === right.spread &&
    left.volume === right.volume &&
    left.volumeSource === right.volumeSource &&
    left.changePct === right.changePct
  );
};

const mergeQuoteTickIntoSnapshot = (
  requestedSymbol: string,
  currentSnapshot: Partial<QuoteItem> | undefined,
  tick: {
    bid: number;
    ask: number;
    timestamp: number;
    feedTickAt?: number;
    receivedAt?: number;
    digits?: number;
    point?: number;
    tickSize?: number;
    volume?: number;
  },
): Partial<QuoteItem> | undefined => {
  const normalizedSymbol = normalizeSymbol(requestedSymbol);
  if (!normalizedSymbol) {
    return undefined;
  }

  const lastReceivedAt = normalizeQuoteTickTimestampToMs(tick.receivedAt) ?? Date.now();
  if (Date.now() - lastReceivedAt > LIVE_QUOTE_STALE_MS) {
    return undefined;
  }
  const feedTickAt = normalizeQuoteTickTimestampToMs(tick.feedTickAt ?? tick.timestamp);
  const lastTickAt = feedTickAt ?? lastReceivedAt;
  const priceChanged = hasQuotePriceChange(currentSnapshot, tick);
  const lastPriceChangedAt = priceChanged
    ? lastReceivedAt
    : currentSnapshot?.lastPriceChangedAt;
  const volume = resolveBackendQuoteVolume({ incoming: tick.volume, previous: currentSnapshot });

  const backendDigits =
    typeof tick.digits === 'number' && Number.isFinite(tick.digits)
      ? tick.digits
      : undefined;
  const digits =
    backendDigits ??
    (typeof currentSnapshot?.digits === 'number' && Number.isFinite(currentSnapshot.digits)
      ? currentSnapshot.digits
      : undefined);

  return resolveMergedQuoteSnapshot(requestedSymbol, {
    ...(currentSnapshot || {}),
    symbol: normalizedSymbol,
    bid: tick.bid,
    ask: tick.ask,
    ...(backendDigits !== undefined ? { digits: backendDigits, digitsSource: 'backend' as const } : {}),
    ...(tick.point !== undefined ? { point: tick.point } : {}),
    ...(tick.tickSize !== undefined ? { tickSize: tick.tickSize } : {}),
    feedTickAt: feedTickAt ?? undefined,
    lastTickAt,
    lastReceivedAt,
    lastPriceChangedAt,
    volume,
    volumeSource: volume === undefined ? undefined : 'backend',
    spread:
      digits !== undefined
        ? calculateQuoteSpreadPoints(tick.bid, tick.ask, digits)
        : currentSnapshot?.spread,
  });
};

export function useLiveSymbolQuote(
  symbol: string,
  active = true,
  commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS,
): Partial<QuoteItem> | undefined {
  const isActive = active;
  const safeCommitIntervalMs = Math.max(0, Math.floor(commitIntervalMs));
  const normalizedSymbol = React.useMemo(() => normalizeSymbol(symbol), [symbol]);
  const seedQuote = React.useMemo(
    () =>
      isActive
        ? resolveMergedQuoteSnapshot(
            symbol,
            normalizedSymbol ? useTradingState.getState().quotes[normalizedSymbol] : undefined,
          )
        : undefined,
    [isActive, normalizedSymbol, symbol],
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
      if (quoteCommitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(quoteCommitAnimationFrameRef.current);
        quoteCommitAnimationFrameRef.current = null;
      }
      if (quoteCommitTimerRef.current) {
        clearTimeout(quoteCommitTimerRef.current);
        quoteCommitTimerRef.current = null;
      }

      const updateLiveQuote = () => {
        const nextSnapshot = liveQuoteRef.current;
        setLiveQuote((current) => (areQuoteSnapshotsEqual(current, nextSnapshot) ? current : nextSnapshot));
      };

      if (safeCommitIntervalMs <= 16) {
        updateLiveQuote();
      } else {
        React.startTransition(updateLiveQuote);
      }
    };

    if (safeCommitIntervalMs <= 16 && typeof globalThis.requestAnimationFrame === 'function') {
      quoteCommitAnimationFrameRef.current = globalThis.requestAnimationFrame(commit);
      return;
    }

    quoteCommitTimerRef.current = setTimeout(commit, safeCommitIntervalMs);
  }, [safeCommitIntervalMs]);

  useEffect(() => {
    liveQuoteRef.current = seedQuote;
    setLiveQuote((current) => (areQuoteSnapshotsEqual(current, seedQuote) ? current : seedQuote));
  }, [seedQuote]);

  useEffect(() => {
    if (!isActive || !normalizedSymbol) {
      cancelScheduledCommit();
      liveQuoteRef.current = undefined;
      setLiveQuote(undefined);
      return;
    }

    const listener = (tick: {
      symbol: string;
      bid: number;
      ask: number;
      timestamp: number;
      feedTickAt?: number;
      receivedAt?: number;
      digits?: number;
      point?: number;
      tickSize?: number;
    }) => {
      if (normalizeSymbol(tick.symbol) !== normalizedSymbol) {
        return;
      }

      liveQuoteRef.current = mergeQuoteTickIntoSnapshot(symbol, liveQuoteRef.current, tick);
      scheduleQuoteCommit();
    };

    const unsubscribe = quotesWsService.subscribeToSymbol(symbol, listener);
    const unsubscribeRestFallback = subscribeLiveSymbolRestQuoteFallback(symbol, listener);

    return () => {
      unsubscribe();
      unsubscribeRestFallback();
      cancelScheduledCommit();
    };
  }, [cancelScheduledCommit, isActive, normalizedSymbol, scheduleQuoteCommit, symbol]);

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

