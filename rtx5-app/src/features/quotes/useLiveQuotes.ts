import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { normalizeSymbol } from '../../domain/symbols';
import { useTradingState } from '../../state/tradingState';
import {
  applyLiveQuoteTickToSnapshot,
  buildInitialLiveQuoteSnapshot,
  type LiveQuoteSnapshot,
} from './liveQuoteSnapshot';

type SnapshotListener = () => void;

const snapshotsBySymbol = new Map<string, LiveQuoteSnapshot | undefined>();
const listenersBySymbol = new Map<string, Set<SnapshotListener>>();
const pendingNotifySymbols = new Set<string>();
let updateSeq = 0;
let notifyAnimationFrame: number | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 50;

const uniqueNormalizedSymbols = (symbols: string[]): string[] =>
  Array.from(new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean)));

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
  return buildInitialLiveQuoteSnapshot(symbol, state.quotes[symbol]);
};

const ensureSnapshot = (symbol: string): LiveQuoteSnapshot | undefined => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return undefined;

  if (!snapshotsBySymbol.has(normalizedSymbol)) {
    snapshotsBySymbol.set(normalizedSymbol, getStateQuote(normalizedSymbol));
  }

  return snapshotsBySymbol.get(normalizedSymbol);
};

const subscribeSnapshot = (symbol: string, listener: SnapshotListener): (() => void) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return () => {};

  let listeners = listenersBySymbol.get(normalizedSymbol);
  if (!listeners) {
    listeners = new Set();
    listenersBySymbol.set(normalizedSymbol, listeners);
  }

  listeners.add(listener);
  return () => {
    const current = listenersBySymbol.get(normalizedSymbol);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersBySymbol.delete(normalizedSymbol);
    }
  };
};

export const ingestLiveQuoteTick = (tick: QuoteTickEvent): void => {
  const symbol = normalizeSymbol(tick.symbol);
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
    () => uniqueNormalizedSymbols(symbols),
    [symbolsKey],
  );
  
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  useEffect(() => {
    if (!active || rawUniqueSymbols.length === 0) {
      return;
    }

    const symbolSet = new Set(normalizedSymbols);
    normalizedSymbols.forEach(ensureSnapshot);

    const listener = (tick: QuoteTickEvent) => {
      if (!symbolSet.has(normalizeSymbol(tick.symbol))) {
        return;
      }
      ingestLiveQuoteTick(tick);
    };

    quotesWsService.addTickListener(listener);
    // Send the broker's raw feed symbols (for example BTCUSDm or GBPUSD.c).
    // Incoming ticks are normalized only after they arrive so UI rows can
    // match suffix variants without changing the backend subscription key.
    quotesWsService.subscribe(rawUniqueSymbols);
    quotesWsService.connect();

    return () => {
      quotesWsService.removeTickListener(listener);
      quotesWsService.unsubscribe(rawUniqueSymbols);
    };
  }, [active, symbolsKey, normalizedSymbolsKey]);

  return normalizedSymbols;
}

export function useLiveQuoteSnapshot(symbol: string): LiveQuoteSnapshot | undefined {
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);

  const subscribe = useCallback(
    (listener: SnapshotListener) => subscribeSnapshot(normalizedSymbol, listener),
    [normalizedSymbol],
  );

  const getSnapshot = useCallback(
    () => (normalizedSymbol ? ensureSnapshot(normalizedSymbol) : undefined),
    [normalizedSymbol],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
