import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiClient } from '../../api/apiClient';
import { isBrokerServiceBaseUrl } from '../../api/brokerRouting';
import { normalizeQuoteTickPayload } from '../../api/ws/quoteTickNormalizer';
import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { normalizeQuoteVolume } from '../../utils/quoteVolume';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import {
  applyLiveQuoteTickToSnapshot,
  buildInitialLiveQuoteSnapshot,
  getQuoteFreshnessAnchor,
  hasDisplayableLiveQuotePrice,
  type LiveQuoteSnapshot,
} from './liveQuoteSnapshot';

type SnapshotListener = () => void;

const snapshotsBySymbol = new Map<string, LiveQuoteSnapshot | undefined>();
const listenersBySymbol = new Map<string, Set<SnapshotListener>>();
const pendingNotifySymbols = new Set<string>();
// Symbols we've already received at least one REST /quotes response for. Lets a
// missing volume force the initial fetch on app open without polling forever for
// symbols the backend simply never reports volume on.
const restPrimedSymbols = new Set<string>();
let updateSeq = 0;
let notifyAnimationFrame: number | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotNotificationPauseDepth = 0;
const WATCHLIST_QUOTE_NOTIFY_INTERVAL_MS = 16;
const QUOTE_REST_SNAPSHOT_POLL_MS = 500;
const QUOTE_REST_SNAPSHOT_STALE_MS = 2_000;
const QUOTE_SNAPSHOT_NOTIFICATION_PAUSE_MS = 2_500;

// Volume is REST-only (WS ticks omit it) and the quotes store has no `persist`,
// so on cold open "Vol: --" lingered for ~1s+ until the slow /quotes response.
// We remember the last backend volume per symbol on disk and seed it as a
// display-only fallback (snapshot.cachedVolume) so a value paints instantly; the
// live REST volume overwrites it within the first poll. Kept out of
// volume/volumeSource so it never suppresses the volume refetch.
const QUOTE_VOLUME_CACHE_STORAGE_KEY = 'rtx5-quote-volume-cache-v1';
const QUOTE_VOLUME_CACHE_PERSIST_DEBOUNCE_MS = 1_500;
const cachedVolumeBySymbol = new Map<string, number>();
let volumeCachePersistTimer: ReturnType<typeof setTimeout> | null = null;
let volumeCacheDirty = false;

const schedulePersistVolumeCache = (): void => {
  if (volumeCachePersistTimer) {
    return;
  }
  volumeCachePersistTimer = setTimeout(() => {
    volumeCachePersistTimer = null;
    if (!volumeCacheDirty) {
      return;
    }
    volumeCacheDirty = false;
    const serialized = JSON.stringify(Object.fromEntries(cachedVolumeBySymbol));
    void AsyncStorage.setItem(QUOTE_VOLUME_CACHE_STORAGE_KEY, serialized).catch(() => {});
  }, QUOTE_VOLUME_CACHE_PERSIST_DEBOUNCE_MS);
};

const rememberBackendVolume = (symbolKey: string, volume: number | undefined): void => {
  if (!symbolKey || volume === undefined || !Number.isFinite(volume)) {
    return;
  }
  if (cachedVolumeBySymbol.get(symbolKey) === volume) {
    return;
  }
  cachedVolumeBySymbol.set(symbolKey, volume);
  volumeCacheDirty = true;
  schedulePersistVolumeCache();
};

const seedSnapshotCachedVolume = (
  snapshot: LiveQuoteSnapshot | undefined,
  symbolKey: string,
): LiveQuoteSnapshot | undefined => {
  if (!snapshot || snapshot.cachedVolume !== undefined) {
    return snapshot;
  }
  const cached = cachedVolumeBySymbol.get(symbolKey);
  return cached === undefined ? snapshot : { ...snapshot, cachedVolume: cached };
};

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

  if (snapshotNotificationPauseDepth > 0) {
    return;
  }

  const symbols = Array.from(pendingNotifySymbols);
  pendingNotifySymbols.clear();
  symbols.forEach(notifySymbol);
};

export const areLiveQuoteSnapshotNotificationsPaused = (): boolean =>
  snapshotNotificationPauseDepth > 0;

export const pauseLiveQuoteSnapshotNotifications = (
  durationMs = QUOTE_SNAPSHOT_NOTIFICATION_PAUSE_MS,
): (() => void) => {
  snapshotNotificationPauseDepth += 1;
  let released = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    snapshotNotificationPauseDepth = Math.max(0, snapshotNotificationPauseDepth - 1);
    if (snapshotNotificationPauseDepth === 0) {
      flushPendingNotifications();
    }
  };

  timeoutId = setTimeout(release, Math.max(0, durationMs));
  return release;
};

const notifySymbolImmediately = (symbol: string): void => {
  pendingNotifySymbols.delete(symbol);
  notifySymbol(symbol);
};

const scheduleSymbolNotification = (symbol: string, immediate = false): void => {
  if (snapshotNotificationPauseDepth > 0) {
    pendingNotifySymbols.add(symbol);
    return;
  }

  if (immediate) {
    notifySymbolImmediately(symbol);
    return;
  }

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
    snapshotsBySymbol.set(
      normalizedSymbol,
      seedSnapshotCachedVolume(getStateQuote(normalizedSymbol), normalizedSymbol),
    );
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

export const subscribeLiveQuoteSnapshots = (
  symbols: string[],
  listener: SnapshotListener,
): (() => void) => {
  const normalizedSymbols = uniqueQuoteSymbolKeys(symbols);
  if (normalizedSymbols.length === 0) {
    return () => {};
  }

  const unsubscribers = normalizedSymbols.map((symbol) =>
    subscribeSnapshot(symbol, listener),
  );
  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

export const getLiveQuoteFreshnessAnchorForSymbols = (symbols: string[]): number => {
  const normalizedSymbols = uniqueQuoteSymbolKeys(symbols);
  return normalizedSymbols.reduce((latest, symbol) => {
    const snapshot = resolveSnapshot(symbol);
    if (!hasDisplayableLiveQuotePrice(snapshot)) {
      return latest;
    }

    const freshnessAnchor = getQuoteFreshnessAnchor(snapshot);
    return freshnessAnchor === undefined ? latest : Math.max(latest, freshnessAnchor);
  }, 0);
};

export const ingestLiveQuoteTick = (tick: QuoteTickEvent, notifyImmediately = true): void => {
  const symbol = getTickSymbolKey(tick);
  if (!symbol) return;

  const previous = ensureSnapshot(symbol);
  const next = applyLiveQuoteTickToSnapshot(symbol, previous, tick, ++updateSeq);
  snapshotsBySymbol.set(symbol, next);
  scheduleSymbolNotification(symbol, notifyImmediately);
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
  ingestLiveQuoteTick(
    {
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
    },
    false,
  );
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
  rememberBackendVolume(
    normalizeQuoteSymbolKey(update.rawSymbol ?? update.symbol),
    normalizeQuoteVolume(update.volume),
  );
  return true;
};

// Backfill ONLY backend volume onto an already-fresh live snapshot. Live WS
// ticks usually omit volume, so when fresh bid/ask keep the snapshot "fresh"
// the REST /quotes payload (the lone volume source) would otherwise be dropped
// by the freshness guard — leaving "Vol: --" for seconds after the app opens.
// This applies the volume without disturbing the live price.
const ingestRestQuoteVolumeOnly = (requestedSymbol: string, payload: unknown): void => {
  const now = Date.now();
  const normalized = normalizeQuoteTickPayload(
    {
      symbol: requestedSymbol,
      ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    },
    now,
  );
  if (!normalized.ok) {
    return;
  }

  const { update } = normalized;
  const volume = normalizeQuoteVolume(update.volume);
  if (volume === undefined) {
    return;
  }

  const symbolKey = normalizeQuoteSymbolKey(update.rawSymbol ?? update.symbol);
  const previous = ensureSnapshot(symbolKey);
  if (!previous) {
    return;
  }
  if (previous.volumeSource === 'backend' && normalizeQuoteVolume(previous.volume) === volume) {
    return;
  }

  snapshotsBySymbol.set(symbolKey, {
    ...previous,
    volume,
    volumeSource: 'backend',
    updateSeq: ++updateSeq,
  });
  rememberBackendVolume(symbolKey, volume);
  scheduleSymbolNotification(symbolKey);

  // Mirror onto an existing tradingState quote so other consumers see volume,
  // but never create a price-less quote from a volume-only update.
  const stateSymbol = update.rawSymbol || update.symbol;
  if (useTradingState.getState().quotes[normalizeSymbol(stateSymbol)]) {
    useTradingState.getState().setQuote(stateSymbol, { volume });
  }
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

const isRestQuotePriceStale = (symbol: string, now = Date.now()): boolean => {
  const snapshot = resolveSnapshot(symbol);
  const freshnessAnchor = getQuoteFreshnessAnchor(snapshot);
  return freshnessAnchor === undefined || now - freshnessAnchor > QUOTE_REST_SNAPSHOT_STALE_MS;
};

const hasBackendQuoteVolume = (snapshot: LiveQuoteSnapshot | undefined): boolean =>
  snapshot?.volumeSource === 'backend' && normalizeQuoteVolume(snapshot?.volume) !== undefined;

const needsRestQuoteSnapshot = (symbol: string, now = Date.now()): boolean => {
  if (isRestQuotePriceStale(symbol, now)) {
    return true;
  }
  // Live ticks keep bid/ask fresh but usually carry no volume, and volume comes
  // only from the REST /quotes snapshot. Keep pulling it until we've seen one
  // response for this symbol so "Vol: --" fills in promptly on app open instead
  // of waiting for a live-tick gap to mark the price stale.
  const key = normalizeQuoteSymbolKey(symbol);
  return !restPrimedSymbols.has(key) && !hasBackendQuoteVolume(resolveSnapshot(symbol));
};

const fetchRestQuoteSnapshots = async (symbols: string[]): Promise<void> => {
  if (symbols.length === 0) {
    return;
  }

  const requestedKeys = new Set(symbols.flatMap(getSnapshotKeys));
  const symbolsQuery = symbols.map(encodeURIComponent).join(',');
  const state = useUserPreferences.getState();
  const isLoggedIn = state.isLoggedIn;
  if (isLoggedIn && !isBrokerServiceBaseUrl(state.brokerServerUrl)) {
    return;
  }

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
    if (!symbol) {
      return;
    }
    const matchesRequestedSymbol = getSnapshotKeys(symbol).some((key) => requestedKeys.has(key));
    if (!matchesRequestedSymbol) {
      return;
    }
    if (isRestQuotePriceStale(symbol)) {
      // Price stale/absent — safe to adopt the whole REST snapshot.
      ingestRestQuoteSnapshot(symbol, snapshot);
    } else {
      // Live ticks already own a fresh price; keep it and only backfill volume.
      ingestRestQuoteVolumeOnly(symbol, snapshot);
    }
  });

  // One /quotes response received for the batch — stop letting missing volume
  // force further fetches (price staleness still triggers normal refreshes).
  for (const key of requestedKeys) {
    restPrimedSymbols.add(key);
  }
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
      if (cancelled || inFlight || areLiveQuoteSnapshotNotificationsPaused()) {
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

export function useWatchlistLiveQuotes(
  symbols: string[],
  active: boolean,
  options?: { restFallbackActive?: boolean },
): string[] {
  const symbolsKey = JSON.stringify(symbols);

  const subscriptionSymbols = useMemo(
    () => Array.from(new Set(symbols.map((symbol) => normalizeQuoteSymbolKey(symbol)).filter(Boolean))),
    [symbolsKey],
  );
  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  const subscriptionSymbolsKey = subscriptionSymbols.join('|');
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  useEffect(() => {
    if (!active || subscriptionSymbols.length === 0) {
      return;
    }

    normalizedSymbols.forEach(ensureSnapshot);
    const symbolSet = new Set(normalizedSymbols);
    const listener = (tick: QuoteTickEvent) => {
      const tickKeys = getSnapshotKeys(tick.rawSymbol ?? tick.symbol);
      if (!tickKeys.some((key) => symbolSet.has(key))) {
        return;
      }

      ingestLiveQuoteTick(tick, true);
    };

    const unsubscribers = subscriptionSymbols.map((symbol) =>
      quotesWsService.subscribeToSymbol(symbol, listener),
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [active, normalizedSymbolsKey, subscriptionSymbolsKey]);

  useRestQuoteSnapshotFallback(normalizedSymbols, options?.restFallbackActive ?? active);

  return active ? subscriptionSymbols : [];
}

export function useLiveQuoteSnapshot(symbol: string, active = true): LiveQuoteSnapshot | undefined {
  const normalizedSymbol = useMemo(() => normalizeQuoteSymbolKey(symbol), [symbol]);

  const subscribe = useCallback(
    (listener: SnapshotListener) => {
      if (!active) {
        return () => {};
      }

      return subscribeSnapshot(normalizedSymbol, listener);
    },
    [active, normalizedSymbol],
  );

  const getSnapshot = useCallback(
    () => (normalizedSymbol ? resolveSnapshot(normalizedSymbol) : undefined),
    [normalizedSymbol],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLiveQuoteFreshnessAnchor(symbols: string[], active: boolean): number {
  const symbolsKey = JSON.stringify(symbols);
  const normalizedSymbols = useMemo(
    () => uniqueQuoteSymbolKeys(symbols),
    [symbolsKey],
  );
  const normalizedSymbolsKey = normalizedSymbols.join('|');

  const subscribe = useCallback(
    (listener: SnapshotListener) => {
      if (!active || normalizedSymbols.length === 0) {
        return () => {};
      }

      return subscribeLiveQuoteSnapshots(normalizedSymbols, listener);
    },
    [active, normalizedSymbolsKey],
  );

  const getSnapshot = useCallback(() => {
    if (!active || normalizedSymbols.length === 0) {
      return 0;
    }

    return getLiveQuoteFreshnessAnchorForSymbols(normalizedSymbols);
  }, [active, normalizedSymbolsKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Restore persisted volumes once at module load, then backfill onto any
// snapshots already created so their rows paint the fallback volume without
// waiting for a tick or the slow REST response.
const loadVolumeCache = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(QUOTE_VOLUME_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      const volume = normalizeQuoteVolume(value);
      if (!key || volume === undefined || cachedVolumeBySymbol.has(key)) {
        continue;
      }
      cachedVolumeBySymbol.set(key, volume);
    }
    for (const [key, snapshot] of snapshotsBySymbol) {
      if (!snapshot || snapshot.cachedVolume !== undefined) {
        continue;
      }
      const cached = cachedVolumeBySymbol.get(key);
      if (cached === undefined) {
        continue;
      }
      snapshotsBySymbol.set(key, { ...snapshot, cachedVolume: cached, updateSeq: ++updateSeq });
      scheduleSymbolNotification(key);
    }
  } catch {
    // Ignore a missing/corrupt cache — volume simply falls back to the REST fetch.
  }
};

void loadVolumeCache();
