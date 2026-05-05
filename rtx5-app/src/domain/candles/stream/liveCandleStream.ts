import { getCandleHistory } from '../api/candles';
import { syncMergedCandleCache } from '../state/candleCache';
import { useTradingState } from '../../../state/tradingState';
import { hydratePersistedCandleCache } from '../state/persistedCandleCache';
import { applyLiveCandleToCandleMap } from '../series/liveCandleAggregator';
import { normalizeLiveCandle } from '../normalization/candleNormalizer';
import {
  buildFreshHistoryLiveCandleSeries,
  materializeLiveCandleMap,
  pruneLiveCandleMapCoveredByHistory,
} from '../series/freshHistoryLiveSeries';
import { candleMemoryCache } from './candleMemoryCache';
import type { Candle, CandleStreamState, LiveCandle, MutableCandle, Timeframe } from '../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../core/candles';
import {
  createCandleStreamKey,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/timeframeUtils';
import { sanitizeCandlesForChart } from '../normalization/chartAdapter';
import { buildRestHistorySeedCandles } from '../core/candleProvenance';

export type CandleParams = Candle & {
  bid?: number;
  ask?: number;
  source?: 'history' | 'live_candle' | 'rest' | 'live';
  closed?: boolean;
  priceBasis?: string;
  serverTimeframe?: string;
};

type StreamListener = () => void;

type BufferedLiveEvent = 
  | { type: 'live_candle'; candle: LiveCandle; order: number };

type UnorderedLiveEvent = 
  | { type: 'live_candle'; candle: LiveCandle };

type StreamEntry = {
  key: string;
  symbol: string;
  timeframe: Timeframe;
  requestId: number;
  streamKey: ReturnType<typeof createCandleStreamKey>;
  historyCandles: Candle[];
  liveCandleMap: Map<number, MutableCandle>;
  historyLastTime: number | null;
  candles: CandleParams[];
  listeners: Set<StreamListener>;
  consumers: number;
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  isLiveConnected: boolean;
  lastUpdateTime: number | null;
  abortController: AbortController | null;
  bufferedEvents: BufferedLiveEvent[];
  pendingEvents: BufferedLiveEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  eventOrder: number;
};

type CandleHistorySnapshot = Awaited<ReturnType<typeof getCandleHistory>>;
type HistorySeedSnapshot = {
  candles: Candle[];
  closedHistoryLastTime: number | null;
  currentCandleTime: number | null;
};

const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
const MAX_BUFFERED_LIVE_EVENTS = 4096;
const FLUSH_INTERVAL_MS = 16;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

const shouldLog = () => typeof __DEV__ !== 'undefined' && __DEV__;

const logDebug = (event: string, details?: Record<string, unknown>) => {
  if (shouldLog()) {
    console.log(`[CANDLE-STREAM] ${event}`, details ?? {});
  }
};

const toCandleParams = (candles: Candle[]): CandleParams[] => candles as CandleParams[];

const getHistorySeedSnapshot = (history: CandleHistorySnapshot): HistorySeedSnapshot => {
  const seed = buildRestHistorySeedCandles(history.closedCandles, history.currentCandle);
  return {
    candles: sanitizeCandlesForChart(seed.candles).slice(-MAX_CANDLE_SERIES_LENGTH),
    closedHistoryLastTime: seed.closedHistoryLastTime,
    currentCandleTime: seed.currentCandleTime,
  };
};

const getStoreCache = (symbol: string, timeframe: string): Candle[] => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return [];
  }
  const cached = useTradingState.getState().candles[`${normalizedSymbol}.${normalizedTimeframe}`] ?? [];
  return sanitizeCandlesForChart(cached).slice(-MAX_CANDLE_SERIES_LENGTH);
};

const getEventTime = (event: BufferedLiveEvent): number => 
  event.candle.time;

const isSameSeries = (left: readonly Candle[], right: readonly Candle[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.time !== b.time ||
      a.open !== b.open ||
      a.high !== b.high ||
      a.low !== b.low ||
      a.close !== b.close ||
      (a.volume ?? 0) !== (b.volume ?? 0)
    ) {
      return false;
    }
  }
  return true;
};

export class LiveCandleStreamManager {
  private entries = new Map<string, StreamEntry>();
  private historyPrefetches = new Map<string, Promise<number>>();

  public subscribe(symbol: string, timeframe: string, listener: StreamListener): () => void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return () => {};
    }

    const entry = this.ensureEntry(normalizedSymbol, normalizedTimeframe);
    entry.listeners.add(listener);
    entry.consumers += 1;

    if (entry.candles.length > 0 || entry.error) {
      listener();
    }

    return () => this.unsubscribe(entry.key, listener);
  }

  public getCandles(symbol: string, timeframe: string): CandleParams[] {
    return this.entries.get(this.getKey(symbol, timeframe))?.candles ?? (EMPTY_CANDLES as CandleParams[]);
  }

  public getState(symbol: string, timeframe: string): CandleStreamState | null {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry) {
      return null;
    }

    return {
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      streamKey: entry.streamKey,
      requestId: entry.requestId,
      candles: entry.candles,
      loading: entry.loading,
      error: entry.error,
      isLiveConnected: entry.isLiveConnected,
      lastUpdateTime: entry.lastUpdateTime,
    };
  }

  public refresh(symbol: string, timeframe: string): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry) {
      return;
    }

    this.loadHistory(entry, DEFAULT_HISTORY_LIMIT);
  }

  public async prefetchHistory(symbol: string, timeframe: string): Promise<number> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return 0;
    }

    const key = this.getKey(normalizedSymbol, normalizedTimeframe);
    const activeEntry = this.entries.get(key);
    if (activeEntry?.historyLoading) {
      return activeEntry.candles.length;
    }
    if (activeEntry && activeEntry.candles.length > 0 && !activeEntry.loading) {
      return activeEntry.candles.length;
    }

    const existing = this.historyPrefetches.get(key);
    if (existing) {
      return existing;
    }

    const prefetch = getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_HISTORY_LIMIT)
      .then((history) => {
        const seed = getHistorySeedSnapshot(history);
        const candles = seed.candles;
        candleMemoryCache.set(normalizedSymbol, normalizedTimeframe, candles);
        syncMergedCandleCache(normalizedSymbol, normalizedTimeframe, candles, { canonical: true });

        const liveEntry = this.entries.get(key);
        if (liveEntry && candles.length > 0) {
          liveEntry.historyCandles = candles;
          liveEntry.historyLastTime = seed.closedHistoryLastTime;
          liveEntry.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
            liveEntry.liveCandleMap,
            seed.closedHistoryLastTime,
          );
          this.commit(liveEntry);
        }

        return candles.length;
      })
      .catch((error) => {
        logDebug('prefetch_failed', {
          symbol: normalizedSymbol,
          timeframe: normalizedTimeframe,
          message: error instanceof Error ? error.message : String(error),
        });
        return 0;
      })
      .finally(() => {
        this.historyPrefetches.delete(key);
      });

    this.historyPrefetches.set(key, prefetch);
    return prefetch;
  }

  public hydrateFromCache(symbol: string, timeframe: string, candles: CandleParams[]): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry || candles.length === 0 || entry.requestId > 0) {
      return;
    }

    const safeCandles = sanitizeCandlesForChart(candles).slice(-MAX_CANDLE_SERIES_LENGTH);
    if (safeCandles.length === 0 || isSameSeries(entry.candles, safeCandles)) {
      return;
    }

    entry.historyCandles = safeCandles;
    entry.liveCandleMap = new Map();
    entry.historyLastTime = safeCandles[safeCandles.length - 1]?.time ?? null;
    this.commit(entry);
  }

  public ingestLiveCandle(rawCandle: unknown, symbol?: string, timeframe?: string): void {
    const candle = normalizeLiveCandle(rawCandle);
    if (!candle) {
      return;
    }

    const normalizedSymbol = normalizeSymbol(candle.symbol ?? symbol ?? '');
    const normalizedTimeframe =
      normalizeTimeframeStrict(candle.timeframe) ??
      normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const entry = this.entries.get(this.getKey(normalizedSymbol, normalizedTimeframe));
    if (!entry) {
      return;
    }

    this.enqueueLiveEvent(entry, this.makeLiveEvent(entry, { type: 'live_candle', candle }));
  }

  public dispose(): void {
    for (const key of Array.from(this.entries.keys())) {
      this.disposeEntry(key);
    }
  }

  private ensureEntry(symbol: string, timeframe: Timeframe): StreamEntry {
    const key = this.getKey(symbol, timeframe);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }

    const cache = candleMemoryCache.get(symbol, timeframe);
    const storeCache = cache.length > 0 ? cache : getStoreCache(symbol, timeframe);
    const safeCache = sanitizeCandlesForChart(storeCache).slice(-MAX_CANDLE_SERIES_LENGTH);
    const entry: StreamEntry = {
      key,
      symbol,
      timeframe,
      requestId: 0,
      streamKey: createCandleStreamKey(symbol, timeframe),
      historyCandles: safeCache,
      liveCandleMap: new Map(),
      historyLastTime: safeCache[safeCache.length - 1]?.time ?? null,
      candles: toCandleParams(safeCache),
      listeners: new Set(),
      consumers: 0,
      loading: true,
      historyLoading: false,
      error: null,
      isLiveConnected: false,
      lastUpdateTime: safeCache.length > 0 ? Date.now() : null,
      abortController: null,
      bufferedEvents: [],
      pendingEvents: [],
      flushTimer: null,
      eventOrder: 0,
    };

    this.entries.set(key, entry);

    void hydratePersistedCandleCache(symbol, timeframe).then((persisted) => {
      const live = this.entries.get(key);
      if (!live || live.requestId > 0 || persisted.length === 0) {
        return;
      }
      this.hydrateFromCache(symbol, timeframe, persisted as CandleParams[]);
    });

    this.loadHistory(entry, DEFAULT_HISTORY_LIMIT);
    return entry;
  }

  private unsubscribe(key: string, listener: StreamListener): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    entry.listeners.delete(listener);
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0) {
      this.disposeEntry(key);
    }
  }

  private disposeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    entry.abortController?.abort();
    if (entry.flushTimer) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    entry.bufferedEvents = [];
    entry.pendingEvents = [];
    entry.listeners.clear();
    this.entries.delete(key);
  }

  private loadHistory(entry: StreamEntry, limit: number): void {
    if (!this.entries.has(entry.key)) {
      return;
    }

    entry.requestId += 1;
    const requestId = entry.requestId;
    entry.abortController?.abort();
    const controller = new AbortController();
    entry.abortController = controller;
    entry.loading = true;
    entry.historyLoading = true;
    entry.error = null;
    entry.bufferedEvents = [];
    this.notify(entry);

    const symbol = entry.symbol;
    const timeframe = entry.timeframe;
    logDebug('history_request', { symbol, timeframe, requestId });

    void getCandleHistory(symbol, timeframe, limit, { signal: controller.signal })
      .then((history) => {
        const live = this.entries.get(entry.key);
        if (!live || live.requestId !== requestId || controller.signal.aborted) {
          return;
        }

        const historySeed = getHistorySeedSnapshot(history);
        const historyCandles = historySeed.candles;

        // Keep REST history and backend live candles separate. The visible
        // chart series is rebuilt fresh from these two sources in commit().
        live.historyCandles = historyCandles;
        live.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
          live.liveCandleMap,
          historySeed.closedHistoryLastTime,
        );
        live.historyLastTime = historySeed.closedHistoryLastTime;
        live.loading = false;
        live.historyLoading = false;
        live.error = null;

        const replayEvents = live.bufferedEvents
          .splice(0)
          .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
        this.applyLiveEvents(live, replayEvents);
        this.commit(live);
        logDebug('history_success', {
          symbol,
          timeframe,
          requestId,
          historyCandles: historyCandles.length,
          currentCandleTime: history.currentCandle?.time ?? null,
          seededCurrentCandleTime: historySeed.currentCandleTime,
          trustedHistoryLastTime: live.historyLastTime,
          replayedLiveEvents: replayEvents.length,
        });
      })
      .catch((error) => {
        const live = this.entries.get(entry.key);
        if (!live || live.requestId !== requestId || controller.signal.aborted) {
          return;
        }

        live.loading = false;
        live.historyLoading = false;
        live.error = error instanceof Error ? error.message : String(error);
        const replayEvents = live.bufferedEvents
          .splice(0)
          .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
        this.applyLiveEvents(live, replayEvents);
        this.commit(live);
        logDebug('history_failure', {
          symbol,
          timeframe,
          requestId,
          message: live.error,
          replayedLiveEvents: replayEvents.length,
        });
      })
      .finally(() => {
        const live = this.entries.get(entry.key);
        if (live && live.requestId === requestId) {
          live.abortController = null;
        }
      });
  }

  private enqueueLiveEvent(entry: StreamEntry, event: BufferedLiveEvent): void {
    if (!this.entries.has(entry.key)) {
      return;
    }

    if (entry.historyLoading) {
      entry.bufferedEvents.push(event);
      if (entry.bufferedEvents.length > MAX_BUFFERED_LIVE_EVENTS) {
        entry.bufferedEvents = entry.bufferedEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
      }
      return;
    }

    entry.pendingEvents.push(event);
    if (entry.pendingEvents.length > MAX_BUFFERED_LIVE_EVENTS) {
      entry.pendingEvents = entry.pendingEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
      this.loadHistory(entry, DEFAULT_HISTORY_LIMIT);
      return;
    }

    this.scheduleFlush(entry);
  }

  private scheduleFlush(entry: StreamEntry): void {
    if (entry.flushTimer) {
      return;
    }

    entry.flushTimer = setTimeout(() => {
      entry.flushTimer = null;
      const live = this.entries.get(entry.key);
      if (!live || live.pendingEvents.length === 0) {
        return;
      }

      const events = live.pendingEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      const changed = this.applyLiveEvents(live, events);
      if (changed) {
        this.commit(live);
      }
    }, FLUSH_INTERVAL_MS);
  }

  private applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean {
    let changed = false;
    for (const event of events) {
      if (event.type === 'live_candle') {
        if (event.candle.symbol && normalizeSymbol(event.candle.symbol) !== entry.symbol) {
          continue;
        }
        if (event.candle.timeframe !== undefined) {
          const candleTimeframe = normalizeTimeframeStrict(event.candle.timeframe);
          if (!candleTimeframe || candleTimeframe !== entry.timeframe) {
            continue;
          }
        }
        const result = applyLiveCandleToCandleMap(entry.liveCandleMap, event.candle, entry.timeframe, {
          historyCutoffTime: entry.historyLastTime,
        });
        if (result.ignored) {
          logDebug('live_candle_ignored', {
            symbol: entry.symbol,
            timeframe: entry.timeframe,
            reason: result.reason,
            candleTime: event.candle.time,
            historyLastTime: entry.historyLastTime,
          });
        }
        changed = changed || result.changed;
      }
    }

    return changed;
  }

  private commit(entry: StreamEntry): void {
    const liveCandles = materializeLiveCandleMap(entry.liveCandleMap, entry.historyLastTime);
    const nextCandles = buildFreshHistoryLiveCandleSeries(
      entry.historyCandles,
      liveCandles,
      MAX_CANDLE_SERIES_LENGTH,
    );
    const nextParams = toCandleParams(nextCandles);
    entry.loading = entry.historyLoading;
    entry.isLiveConnected = true;
    entry.lastUpdateTime = Date.now();

    candleMemoryCache.set(entry.symbol, entry.timeframe, nextCandles);
    syncMergedCandleCache(entry.symbol, entry.timeframe, nextCandles, { canonical: true });

    if (isSameSeries(entry.candles, nextParams)) {
      return;
    }

    entry.candles = Object.freeze(nextParams.map((candle) => Object.freeze({ ...candle }))) as unknown as CandleParams[];
    this.notify(entry);
  }

  private notify(entry: StreamEntry): void {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.warn('[CANDLE-STREAM] listener failed', error);
      }
    });
  }

  private makeLiveEvent(
    entry: StreamEntry,
    event: UnorderedLiveEvent,
  ): BufferedLiveEvent {
    entry.eventOrder += 1;
    return { ...event, order: entry.eventOrder } as BufferedLiveEvent;
  }

  private getKey(symbol: string, timeframe: string): string {
    return createCandleStreamKey(symbol, timeframe);
  }
}

type GlobalLiveCandleStreamRegistry = typeof globalThis & {
  __RTX5_LIVE_CANDLE_STREAM__?: LiveCandleStreamManager;
};

const liveCandleStreamRegistry = globalThis as GlobalLiveCandleStreamRegistry;

export const liveCandleStream =
  liveCandleStreamRegistry.__RTX5_LIVE_CANDLE_STREAM__ ??
  (liveCandleStreamRegistry.__RTX5_LIVE_CANDLE_STREAM__ = new LiveCandleStreamManager());
