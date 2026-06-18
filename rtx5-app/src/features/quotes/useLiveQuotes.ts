import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { apiClient } from '../../api/apiClient';
import { normalizeQuoteTickPayload } from '../../api/ws/quoteTickNormalizer';
import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import {
  applyLiveQuoteTickToSnapshot,
  buildInitialLiveQuoteSnapshot,
  getQuoteFreshnessAnchor,
  type LiveQuoteSnapshot,
} from './liveQuoteSnapshot';

type SnapshotListener = () => void;

const snapshotsBySymbol = new Map<string, LiveQuoteSnapshot | undefined>();
const listenersBySymbol = new Map<string, Set<SnapshotListener>>();
const pendingNotifySymbols = new Set<string>();
let updateSeq = 0;
let notifyAnimationFrame: number | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 16;
const QUOTE_REST_SNAPSHOT_POLL_MS = 500;
const QUOTE_REST_SNAPSHOT_STALE_MS = 2_000;

const getTickSymbolKey = (tick: QuoteTickEvent): string =>
  normalizeQuoteSymbolKey(tick.rawSymbol ?? tick.symbol);

const getSnapshotKeys = (symbol: string): string[] => {
  const rawKey = normalizeQuoteSymbolKey(symbol);
  const baseKey = normalizeSymbol(symbol);
  return Array.from(new Set([rawKey, baseKey].filter(Boolean)));
};

const uniqueQuoteSymbolKeys = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.flatMap(getSnapshotKeys)));

const notifySymbol = (symbol: string): void => {
  const listeners = listenersBySymbol.get(symbol);
  if (!listeners) return;
  listeners.forEach((listener) => listener());
};

const flushPendingNotifications = (): void => {
  if (notifyAnimationFrame !== null) {
    cancelAnimationFrame(notifyAnimationFrame);
    notifyAnimationFrame = null;
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }

  if (pendingNotifySymbols.size === 0) {
    return;
  }

  const symbols = Array.from(pendingNotifySymbols);
  pendingNotifySymbols.clear();
  symbols.forEach(notifySymbol);
};

const scheduleSymbolNotification = (symbol: string): void => {
  pendingNotifySymbols.add(symbol);

  if (notifyAnimationFrame !== null || notifyTimer) {
    return;
  }

  // Market feeds can deliver many ticks in one frame. Notify quote rows on a
  // short timer so touch handling and navigation keep priority while the
  // latest bid/ask still paints promptly.
  notifyTimer = setTimeout(flushPendingNotifications, WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS);
};

const getStateQuote = (symbol: string): LiveQuoteSnapshot | undefined => {
  const state = useTradingState.getState();
  const symbolKey = normalizeQuoteSymbolKey(symbol);
  const baseSymbol = normalizeSymbol(symbol);
  return buildInitialLiveQuoteSnapshot(
    symbol,
    state.quotes[symbolKey] ?? state.quotes[baseSymbol],
  );
};

const ensureSnapshot = (symbol: string): LiveQuoteSnapshot | undefined => {
  const normalizedSymbol = normalizeQuoteSymbolKey(symbol);
  if (!normalizedSymbol) return undefined;

  if (!snapshotsBySymbol.has(normalizedSymbol)) {
    snapshotsBySymbol.set(normalizedSymbol, getStateQuote(normalizedSymbol));
  }

  return snapshotsBySymbol.get(normalizedSymbol);
};

const subscribeSnapshot = (symbol: string, listener: SnapshotListener): (() => void) => {
  const keys = getSnapshotKeys(symbol);
  if (keys.length === 0) return () => {};

  for (const key of keys) {
    let listeners = listenersBySymbol.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersBySymbol.set(key, listeners);
    }
    listeners.add(listener);
  }

  return () => {
    for (const key of keys) {
      const current = listenersBySymbol.get(key);
      if (!current) continue;
      current.delete(listener);
      if (current.size === 0) {
        listenersBySymbol.delete(key);
      }
    }
  };
};

const resolveSnapshot = (symbol: string): LiveQuoteSnapshot | undefined => {
  const keys = getSnapshotKeys(symbol);
  const snapshots = keys
    .map((key) => ensureSnapshot(key))
    .filter((snapshot): snapshot is LiveQuoteSnapshot => snapshot !== undefined);

  return snapshots.find((snapshot) => getQuoteFreshnessAnchor(snapshot) !== undefined) ?? snapshots[0];
};

export const ingestLiveQuoteTick = (tick: QuoteTickEvent): void => {
  const symbol = getTickSymbolKey(tick);
  if (!symbol) return;

  const previous = ensureSnapshot(symbol);
  const next = applyLiveQuoteTickToSnapshot(symbol, previous, tick, ++updateSeq);
  snapshotsBySymbol.set(symbol, next);
  scheduleSymbolNotification(symbol);
};

const ingestRestQuoteSnapshot = (requestedSymbol: string, payload: unknown): boolean => {
  const now = Date.now();
  const normalized = normalizeQuoteTickPayload(
    {
      symbol: requestedSymbol,
      ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    },
    now,
  );

  if (!normalized.ok) {
    return false;
  }

  const { update } = normalized;
  const timestamp = update.timestamp ?? now;
  ingestLiveQuoteTick({
    symbol: update.symbol,
    rawSymbol: update.rawSymbol,
    bid: update.bid,
    ask: update.ask,
    last: update.last,
    high: update.high,
    low: update.low,
    open: update.open,
    dailyOpen: update.dailyOpen,
    previousClose: update.previousClose,
    changePct: update.changePct,
    spread: update.spread,
    volume: update.volume,
    digits: update.digits,
    feedTickAt: timestamp,
    receivedAt: now,
    timestamp,
  });
  useTradingState.getState().setQuote(update.rawSymbol || update.symbol, {
    bid: update.bid,
    ask: update.ask,
    lastTickAt: timestamp,
    lastReceivedAt: now,
    feedTickAt: timestamp,
    ...(update.last !== undefined ? { close: update.last } : {}),
    ...(update.high !== undefined ? { high: update.high } : {}),
    ...(update.low !== undefined ? { low: update.low } : {}),
    ...(update.open !== undefined ? { open: update.open } : {}),
    ...(update.spread !== undefined ? { spread: update.spread } : {}),
    ...(update.volume !== undefined ? { volume: update.volume, volumeSource: 'backend' as const } : {}),
    ...(update.digits !== undefined ? { digits: update.digits } : {}),
  });
  return true;
};

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

const needsRestQuoteSnapshot = (symbol: string, now = Date.now()): boolean => {
  const snapshot = resolveSnapshot(symbol);
  const freshnessAnchor = getQuoteFreshnessAnchor(snapshot);
  return freshnessAnchor === undefined || now - freshnessAnchor > QUOTE_REST_SNAPSHOT_STALE_MS;
};

const fetchRestQuoteSnapshots = async (symbols: string[]): Promise<void> => {
  if (symbols.length === 0) {
    return;
  }

  const requestedKeys = new Set(symbols.flatMap(getSnapshotKeys));
  const symbolsQuery = symbols.map(encodeURIComponent).join(',');
  const isLoggedIn = useUserPreferences.getState().isLoggedIn;
  const response = await apiClient(
    `/quotes?symbols=${symbolsQuery}`,
    isLoggedIn ? {} : { skipAuth: true, skipRefresh: true },
  );
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  asQuoteSnapshotArray(payload).forEach((snapshot) => {
    const record = snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>)
      : null;
    const symbol = String(record?.symbol ?? record?.Symbol ?? record?.s ?? '');
    if (symbol) {
      const matchesRequestedSymbol = getSnapshotKeys(symbol).some((key) => requestedKeys.has(key));
      if (!matchesRequestedSymbol || !needsRestQuoteSnapshot(symbol)) {
        return;
      }
      ingestRestQuoteSnapshot(symbol, snapshot);
    }
  });
};

const useRestQuoteSnapshotFallback = (symbols: string[], active: boolean): void => {
  const symbolsKey = JSON.stringify(symbols);

  useEffect(() => {
    if (!active || symbols.length === 0) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const refreshSnapshots = async () => {
      if (cancelled || inFlight) {
        return;
      }

      const symbolsNeedingFallback = symbols.filter((symbol) => needsRestQuoteSnapshot(symbol));
      if (symbolsNeedingFallback.length === 0) {
        return;
      }

      inFlight = true;
      try {
        await fetchRestQuoteSnapshots(symbolsNeedingFallback);
      } catch (error) {
        if (!cancelled) {
          console.warn('[Quotes REST] Snapshot poll failed', error);
        }
      } finally {
        inFlight = false;
      }
    };

    void refreshSnapshots();
    const interval = setInterval(() => {
      void refreshSnapshots();
    }, QUOTE_REST_SNAPSHOT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, symbolsKey]);
};

export function useLiveQuoteSubscription(symbol: string, active: boolean): void {
  const symbolKeys = useMemo(
    () => getSnapshotKeys(symbol),
    [symbol],
  );
  const symbolKeysKey = symbolKeys.join('|');

  useEffect(() => {
    if (!active || !symbol || symbolKeys.length === 0) {
      return;
    }

    symbolKeys.forEach(ensureSnapshot);
    return quotesWsService.subscribeToSymbol(symbol, ingestLiveQuoteTick);
  }, [active, symbol, symbolKeysKey]);
}

export function useWatchlistLiveQuotes(symbols: string[], active: boolean): string[] {
  const symbolsKey = JSON.stringify(symbols);

  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  useEffect(() => {
    if (!active || normalizedSymbols.length === 0) {
      return;
    }

    normalizedSymbols.forEach(ensureSnapshot);
    const symbolSet = new Set(normalizedSymbols);
    const listener = (tick: QuoteTickEvent) => {
      const tickKeys = getSnapshotKeys(tick.rawSymbol ?? tick.symbol);
      if (!tickKeys.some((key) => symbolSet.has(key))) {
        return;
      }

      ingestLiveQuoteTick(tick);
    };

    quotesWsService.addTickListener(listener);
    return () => {
      quotesWsService.removeTickListener(listener);
    };
  }, [active, normalizedSymbolsKey]);

  useRestQuoteSnapshotFallback(normalizedSymbols, active);

  return active ? normalizedSymbols : [];
}

export function useLiveQuoteSnapshot(symbol: string): LiveQuoteSnapshot | undefined {
  const normalizedSymbol = useMemo(() => normalizeQuoteSymbolKey(symbol), [symbol]);

  const subscribe = useCallback(
    (listener: SnapshotListener) => subscribeSnapshot(normalizedSymbol, listener),
    [normalizedSymbol],
  );

  const getSnapshot = useCallback(
    () => (normalizedSymbol ? resolveSnapshot(normalizedSymbol) : undefined),
    [normalizedSymbol],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
