import { normalizeLiveCandle } from '../../normalization/candleNormalizer';
import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from '../../series/liveCandleAggregator';
import {
  buildFreshHistoryLiveCandleSeries,
  materializeLiveCandleMap,
} from '../../series/freshHistoryLiveSeries';
import { hydratePersistedCandleCache } from '../../state/persistedCandleCache';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import {
  createCandleStreamKey,
  getTimeframeSeconds,
  normalizeSymbol,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from '../../core/timeframeUtils';
import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import type { CandleStreamState, Timeframe } from '../../core/candleTypes';
import { candleMemoryCache } from '../candleMemoryCache';
import {
  EMPTY_CANDLES,
  FLUSH_INTERVAL_MS,
  MAX_BUFFERED_LIVE_EVENTS,
  DEFAULT_HISTORY_LIMIT,
  MAX_RENDERED_HISTORY_CANDLES,
  PAGINATED_HISTORY_LIMIT,
  type BufferedLiveEvent,
  type CandleParams,
  type StreamEntry,
  type StreamListener,
  type UnorderedLiveEvent,
} from './types';
import {
  getEventTime,
  isSameSeries,
  logDebug,
  toCandleParams,
} from './helpers';
import {
  runLoadHistory,
  runPrefetchHistory,
  type HistoryFetchManagerBridge,
} from './historyFetching';
import { splitRestHistoryCandles, getConfiguredCandlePriceBasis } from '../../core/candleProvenance';

const getHistoryPageLookbackMultiplier = (timeframe: Timeframe): number => {
  if (timeframe === 'W1' || timeframe === 'MN') {
    return 1;
  }
  if (timeframe === 'D1') {
    return 3;
  }
  return 6;
};

/**
 * The central orchestrator for charting data in the RTX5 application.
 * 
 * Responsibilities:
 * - Manages concurrent streams of (symbol x timeframe) candle data.
 * - Handles the async fetching of REST historical data and coordinates it with real-time WS ticks.
 * - Buffers, sorts, and flushes high-frequency WebSocket ticks at a controlled mobile cadence to prevent React render-thrashing.
 * - Caches and deduplicates state to avoid memory leaks or redundant network requests.
 * 
 * Note: Implements `HistoryFetchManagerBridge` to allow history fetching logic to live in a separate, testable file.
 */
export class LiveCandleStreamManager implements HistoryFetchManagerBridge {
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly entries = new Map<string, StreamEntry>();
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly historyPrefetches = new Map<string, Promise<number>>();

  /**
   * Subscribes a UI component to a specific (symbol, timeframe) candle stream.
   * If the stream doesn't exist, it boots it up and initiates the initial REST fetch.
   * 
   * @param symbol The market symbol (e.g. 'EURUSD').
   * @param timeframe The requested bucket size (e.g. 'M1').
   * @param listener A callback fired whenever the canonical UI series changes.
   * @returns A cleanup function to unsubscribe and eventually GC the stream.
   */
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

    return () => this.unsubscribeListener(entry.key, listener);
  }

  /** Synchronously returns the currently materialized, UI-ready candle array. */
  public getCandles(symbol: string, timeframe: string): CandleParams[] {
    return this.entries.get(this.getKey(symbol, timeframe))?.candles ?? (EMPTY_CANDLES as CandleParams[]);
  }

  /** Returns metadata about the stream (loading status, error states, etc.) for UI overlays. */
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

  /** Forces a hard reset and re-fetch of the historical baseline for a given stream. */
  public refresh(symbol: string, timeframe: string): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry) {
      return;
    }

    entry.renderHistoryLimit = DEFAULT_HISTORY_LIMIT;
    entry.historyPaginationCursorTime = null;
    runLoadHistory(this, entry, DEFAULT_HISTORY_LIMIT);
  }

  /**
   * Fetches the next chunk of older historical data when the user scrolls
   * to the left edge of the chart.
   */
  public paginateHistory(symbol: string, timeframe: string): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry || entry.loading || entry.historyPageLoading || entry.historyCandles.length === 0) {
      return;
    }
    const activeRenderLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(DEFAULT_HISTORY_LIMIT, entry.renderHistoryLimit || DEFAULT_HISTORY_LIMIT),
    );
    if (activeRenderLimit >= MAX_RENDERED_HISTORY_CANDLES && entry.candles.length >= MAX_RENDERED_HISTORY_CANDLES) {
      return;
    }
    const pageToTime = entry.historyPaginationCursorTime ?? entry.historyCandles[0].time;
    if (!(pageToTime > 1)) {
      return;
    }
    const timeframeSeconds = getTimeframeSeconds(entry.timeframe);
    const lookbackSeconds =
      PAGINATED_HISTORY_LIMIT * timeframeSeconds * getHistoryPageLookbackMultiplier(entry.timeframe);
    const fromTime = Math.max(1, pageToTime - lookbackSeconds);
    if (fromTime >= pageToTime) {
      return;
    }
    runLoadHistory(this, entry, PAGINATED_HISTORY_LIMIT, { to: pageToTime, from: fromTime });
  }

  /** Proactively fetches and caches REST history in the background before a user explicitly opens the chart. */
  public async prefetchHistory(symbol: string, timeframe: string): Promise<number> {
    return runPrefetchHistory(this, symbol, timeframe, (s, t) => this.getKey(s, t));
  }

  /**
   * Restores a stream's initial state from local storage (SQLite/AsyncStorage)
   * to provide a zero-latency chart render while fresh REST history fetches in the background.
   */
  public hydrateFromCache(symbol: string, timeframe: string, candles: CandleParams[]): void {
    const entry = this.entries.get(this.getKey(symbol, timeframe));
    if (!entry || candles.length === 0 || entry.requestId > 0) {
      return;
    }

    const safeCandles = sanitizeCandlesForChart(candles, { timeframe: entry.timeframe }).slice(-MAX_CANDLE_SERIES_LENGTH);
    if (safeCandles.length === 0 || isSameSeries(entry.candles, safeCandles)) {
      return;
    }

    entry.historyCandles = safeCandles;
    entry.liveCandleMap = new Map();
    entry.renderHistoryLimit = DEFAULT_HISTORY_LIMIT;
    entry.historyPaginationCursorTime = null;

    const { closedHistory } = splitRestHistoryCandles(
      safeCandles,
      entry.timeframe,
      getConfiguredCandlePriceBasis(),
    );
    entry.historyLastTime = closedHistory[closedHistory.length - 1]?.time ?? null;
    this.commit(entry);
  }

  /**
   * Enqueues an authoritative live candle update from the WebSocket backend.
   * This is buffered and eventually flushed into the UI state.
   */
  public ingestLiveCandle(rawCandle: unknown, symbol?: string, timeframe?: string): void {
    const candle = normalizeLiveCandle(rawCandle);
    if (!candle) {
      return;
    }

    const normalizedSymbol = normalizeSymbol(candle.symbol ?? symbol ?? '');
    let normalizedTimeframe =
      normalizeTimeframeStrict(candle.timeframe) ??
      normalizeTimeframeStrict(timeframe);
    if (!normalizedSymbol) {
      return;
    }
    if (!normalizedTimeframe) {
      const candidates = Array.from(this.entries.values()).filter((entry) => entry.symbol === normalizedSymbol);
      if (candidates.length !== 1) {
        logDebug('live_candle_ignored', {
          symbol: normalizedSymbol,
          reason: 'missing_timeframe_context',
          activeTimeframes: candidates.map((entry) => entry.timeframe),
        });
        return;
      }
      normalizedTimeframe = candidates[0].timeframe;
    }

    const entry = this.entries.get(this.getKey(normalizedSymbol, normalizedTimeframe));
    if (!entry) {
      return;
    }

    this.enqueueLiveEvent(entry, this.makeLiveEvent(entry, { type: 'live_candle', candle }));
  }

  /**
   * Extend the active candle of every (symbol, *) subscription using a single
   * real-time price tick from the quote feed.
   *   - Updates an existing backend bucket when one is present.
   *   - Opens the current tick bucket when the candle backend is stale, while
   *     preserving any missing backend buckets as visible gaps.
   *   - Never modifies closed history (gated by `historyLastTime`).
   *   - Backend `live_candle` snapshots fully overwrite the bucket's OHLC, so
   *     backend remains authoritative on every snapshot.
   *
   * Why this exists: most broker WS candle channels emit on bar-close (or on
   * a slow cadence), but real-time price movement within the active bar
   * arrives only via the quote feed. This forwards tick data into a live
   * bucket so the forming candle visibly ticks in real time even when the
   * candle backend is late or only publishes history.
   */
  public extendActiveCandlesFromQuoteTick(
    symbol: string,
    options: { price: number; time: unknown },
  ): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      return;
    }
    if (!Number.isFinite(options.price) || options.price <= 0) {
      return;
    }
    const timeSeconds = normalizeTimestampToSeconds(options.time);
    if (timeSeconds === null) {
      return;
    }

    for (const entry of this.entries.values()) {
      if (entry.symbol !== normalizedSymbol) {
        continue;
      }
      this.enqueueLiveEvent(
        entry,
        this.makeLiveEvent(entry, {
          type: 'quote_tick_extension',
          price: options.price,
          time: timeSeconds,
        }),
      );
    }
  }

  public dispose(): void {
    for (const key of Array.from(this.entries.keys())) {
      this.disposeEntry(key);
    }
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public notify(entry: StreamEntry): void {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.warn('[CANDLE-STREAM] listener failed', error);
      }
    });
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean {
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
      } else if (event.type === 'quote_tick_extension') {
        if (this.applyQuoteTickExtension(entry, event)) {
          changed = true;
        }
      }
    }

    return changed;
  }

  /** @internal Used by historyFetching helpers; not part of the public API. */
  public commit(entry: StreamEntry): void {
    const liveCandles = materializeLiveCandleMap(entry.liveCandleMap, entry.historyLastTime, {
      preserveProvenance: true,
    });
    // History is fetched ONLY on a fresh load (app open / symbol / timeframe
    // change) and on user-driven pagination. We deliberately do NOT auto-refresh
    // here: live ticks update the forming candle in place, and a closed candle is
    // never re-pulled or replaced, so a finalized candle stays exactly as it
    // looked while forming (no reload/flicker, no live→history shape change).
    const renderHistoryLimit = Math.min(
      MAX_RENDERED_HISTORY_CANDLES,
      Math.max(DEFAULT_HISTORY_LIMIT, entry.renderHistoryLimit || DEFAULT_HISTORY_LIMIT),
    );
    const nextCandles = buildFreshHistoryLiveCandleSeries(
      entry.historyCandles,
      liveCandles,
      entry.timeframe,
      renderHistoryLimit,
      { closedHistoryLastTime: entry.historyLastTime, preserveProvenance: true },
    );
    const safeNextCandles = sanitizeCandlesForChart(nextCandles, { timeframe: entry.timeframe });
    const nextParams = toCandleParams(safeNextCandles);
    entry.loading = entry.historyLoading || entry.historyPageLoading;
    entry.isLiveConnected = true;
    entry.lastUpdateTime = Date.now();

    candleMemoryCache.set(entry.symbol, entry.timeframe, safeNextCandles);

    if (isSameSeries(entry.candles, nextParams)) {
      return;
    }

    entry.candles = Object.freeze(
      nextParams.map((candle) => Object.freeze({ ...candle })),
    ) as unknown as CandleParams[];
    this.notify(entry);
  }

  private ensureEntry(symbol: string, timeframe: Timeframe): StreamEntry {
    const key = this.getKey(symbol, timeframe);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }

    const entry: StreamEntry = {
      key,
      symbol,
      timeframe,
      requestId: 0,
      streamKey: createCandleStreamKey(symbol, timeframe),
      historyCandles: [],
      liveCandleMap: new Map(),
      historyLastTime: null,
      lastLiveEdgeGapRefreshBoundary: null,
      historyPaginationCursorTime: null,
      renderHistoryLimit: DEFAULT_HISTORY_LIMIT,
      candles: EMPTY_CANDLES as CandleParams[],
      listeners: new Set(),
      consumers: 0,
      loading: true,
      historyLoading: false,
      historyPageLoading: false,
      error: null,
      isLiveConnected: false,
      lastUpdateTime: null,
      abortController: null,
      bufferedEvents: [],
      pendingEvents: [],
      flushTimer: null,
      eventOrder: 0,
    };

    this.entries.set(key, entry);

    const memoryCachedCandles = candleMemoryCache.get(symbol, timeframe);
    if (memoryCachedCandles.length > 0) {
      // Startup prefetch stores fresh history in memory before the Chart tab is
      // opened.  Seed the new stream from it synchronously so first tab entry
      // can paint immediately while REST refreshes in the background.
      this.hydrateFromCache(symbol, timeframe, memoryCachedCandles as CandleParams[]);
    } else {
      void hydratePersistedCandleCache(symbol, timeframe).then((persisted) => {
        const live = this.entries.get(key);
        if (!live || live.requestId > 0 || persisted.length === 0) {
          return;
        }
        this.hydrateFromCache(symbol, timeframe, persisted as CandleParams[]);
      });
    }

    runLoadHistory(this, entry, DEFAULT_HISTORY_LIMIT);
    return entry;
  }

  private unsubscribeListener(key: string, listener: StreamListener): void {
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
      // Burst of live events: keep only the most recent ones and flush them. We
      // intentionally do NOT re-pull history here — history loads only on a fresh
      // open / symbol / timeframe change, never as an automatic resync.
      entry.pendingEvents = entry.pendingEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
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

  private applyQuoteTickExtension(
    entry: StreamEntry,
    event: { price: number; time: number },
  ): boolean {
    const restTail = entry.historyCandles[entry.historyCandles.length - 1] ?? null;
    const result = applyQuoteTickExtensionToCandleMap(
      entry.liveCandleMap,
      { price: event.price, time: event.time },
      entry.timeframe,
      {
        historyCutoffTime: entry.historyLastTime,
        latestHistoryCandle: restTail,
      },
    );
    return result.changed;
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
