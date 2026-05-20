import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { useTradingState } from '../../state/tradingState';
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
const WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 100;

const uniqueQuoteSymbolKeys = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.map((symbol) => normalizeQuoteSymbolKey(symbol)).filter(Boolean)));

const getTickSymbolKey = (tick: QuoteTickEvent): string =>
  normalizeQuoteSymbolKey(tick.rawSymbol ?? tick.symbol);

const getSnapshotKeys = (symbol: string): string[] => {
  const rawKey = normalizeQuoteSymbolKey(symbol);
  const baseKey = normalizeSymbol(symbol);
  return Array.from(new Set([rawKey, baseKey].filter(Boolean)));
};

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

export function useWatchlistLiveQuotes(symbols: string[], active: boolean): string[] {
  const symbolsKey = JSON.stringify(symbols);
  
  const rawUniqueSymbols = useMemo(
    () => Array.from(new Set(symbols.filter(Boolean))),
    [symbolsKey],
  );

  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  useEffect(() => {
    if (!active || rawUniqueSymbols.length === 0) {
      return;
    }

    normalizedSymbols.forEach(ensureSnapshot);

    // Send the broker's raw feed symbols (for example BTCUSDm or GBPUSD.c)
    // through the per-symbol listener path. Quotes rows then receive live
    // snapshots without also forcing the global Zustand quote store to update
    // underneath every tap target on this screen.
    const unsubscribers = rawUniqueSymbols.map((symbol) =>
      quotesWsService.subscribeToSymbol(symbol, ingestLiveQuoteTick),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [active, symbolsKey, normalizedSymbolsKey]);

  return normalizedSymbols;
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
