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
  type BufferedLiveEvent,
  type CandleParams,
  type StreamEntry,
  type StreamListener,
  type UnorderedLiveEvent,
} from './types';
import {
  getEventTime,
  getStoreCache,
  isSameSeries,
  logDebug,
  toCandleParams,
} from './helpers';
import {
  runLoadHistory,
  runPrefetchHistory,
  type HistoryFetchManagerBridge,
} from './historyFetching';

export class LiveCandleStreamManager implements HistoryFetchManagerBridge {
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly entries = new Map<string, StreamEntry>();
  /** @internal Exposed only for sibling modules in this folder. */
  public readonly historyPrefetches = new Map<string, Promise<number>>();

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

    runLoadHistory(this, entry, DEFAULT_HISTORY_LIMIT);
  }

  public async prefetchHistory(symbol: string, timeframe: string): Promise<number> {
    return runPrefetchHistory(this, symbol, timeframe, (s, t) => this.getKey(s, t));
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

  /**
   * Extend the active candle of every (symbol, *) subscription using a single
   * real-time price tick from the quote feed. STRICT extension contract:
   *   - Only updates an existing bucket created by backend, never invents one.
   *   - Never modifies closed history (gated by `historyLastTime`).
   *   - Backend `live_candle` snapshots fully overwrite the bucket's OHLC, so
   *     backend remains authoritative on every snapshot.
   *
   * Why this exists: most broker WS candle channels emit on bar-close (or on
   * a slow cadence), but real-time price movement within the active bar
   * arrives only via the quote feed. This forwards tick data into a backend-
   * created bucket so the forming candle visibly ticks in real time.
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
      entry.pendingEvents = entry.pendingEvents.slice(-MAX_BUFFERED_LIVE_EVENTS);
      runLoadHistory(this, entry, DEFAULT_HISTORY_LIMIT);
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
