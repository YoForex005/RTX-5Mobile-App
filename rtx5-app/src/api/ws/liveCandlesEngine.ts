/**
 * Canonical live candle engine.
 *
 * Strategy:
 *   - REST history provides the recent authoritative candle window.
 *   - WebSocket quotes build only a live overlay segment.
 *   - The chart consumes a materialized series derived from:
 *       recent history + live overlay when contiguous
 *       recent trusted history only while detached live heals in the background
 *
 * This avoids exposing half-merged arrays to the chart and prevents the
 * detached old-history + fresh-live cluster artifacts seen on mobile.
 */

import { CandleHistoryRequestOptions, getCandleHistory } from '../candles';
import { quotesWsService } from './quotesSocket';
import type { QuoteTickEvent } from './quotesSocket';
import {
  FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT,
  buildQuoteRolloverCandle,
  mergeFetchedHistoryIntoWindow,
  shouldBackfillBootstrapHistory,
  shouldAcceptBootstrapHistory,
} from './liveCandlesEngine.helpers';
import {
  DEFAULT_CANDLE_HISTORY_LIMIT,
  MAX_CANDLE_SERIES_LENGTH,
  alignTimeToBucket,
  alignTimeToBucketWithReference,
  getExpectedNextCandleTime,
  isRenderableCandleBootstrapSeed,
  materializeCanonicalHistoryAndLiveCandles,
  mergeCandleUpdate,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimestampToSeconds,
  pruneLiveCandlesCoveredByHistory,
  sortAndDedupeCandles,
} from '../../domain/candles';
import { useTradingState, type Candle } from '../../state/tradingState';
import { syncMergedCandleCache } from '../../state/candleCache';
import {
  resolveCurrentVisibleSeries,
  resolveVisibleSeriesMode,
  shouldAdoptCachedSeries,
  shouldKeepBootstrappingOnHistoryFailure,
  shouldRenderBootstrapPreview,
  shouldSyncVisibleSeriesCache,
} from './liveCandlesEnginePolicy';

export type CandleParams = Candle & {
  bid?: number;
  ask?: number;
};

type PendingQuote = {
  price: number;
  timestamp: unknown;
};

type EngineListener = () => void;
type EntryStatus = 'idle' | 'bootstrapping' | 'ready';

type EngineEntry = {
  key: string;
  symbol: string;
  timeframe: string;
  status: EntryStatus;
  candles: CandleParams[];
  historyCandles: CandleParams[];
  liveCandles: CandleParams[];
  listeners: Set<EngineListener>;
  consumers: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  fetchEpoch: number;
  fetchController: AbortController | null;
  queuedQuotes: PendingQuote[];
  pendingQuotes: PendingQuote[];
  flushTimeout: ReturnType<typeof setTimeout> | null;
  healTimer: ReturnType<typeof setTimeout> | null;
  gapRefreshTimer: ReturnType<typeof setTimeout> | null;
  lastGapRefreshAt: number;
  lastQuoteSignature: string | null;
};

const QUOTE_BATCH_INTERVAL_MS = 16;
const MAX_PENDING_QUOTES = 256;
const GAP_RESYNC_THROTTLE_MS = 4_000;
const POST_ROLLOVER_HEAL_DELAY_MS = 350;
const BOOTSTRAP_RETRY_DELAY_MS = 1_250;
const BOOTSTRAP_FULL_BACKFILL_DELAY_MS = 750;
const RECENT_HISTORY_ANCHOR_SAFETY_BUCKETS = 2;

export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

const entryKey = (symbol: string, timeframe: string) =>
  `${normalizeSymbol(symbol)}::${normalizeTimeframe(timeframe)}`;

const clampPendingQuotes = (quotes: PendingQuote[]): PendingQuote[] =>
  quotes.length > MAX_PENDING_QUOTES ? quotes.slice(-MAX_PENDING_QUOTES) : quotes;

const asCandleParams = (candles: Candle[]): CandleParams[] => candles as CandleParams[];

const getSeedHistoryCandles = (symbol: string, timeframe: string): CandleParams[] => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const cachedCandles =
    useTradingState.getState().candles[`${normalizedSymbol}.${normalizedTimeframe}`] ?? [];

  if (cachedCandles.length === 0) {
    return [];
  }

  const normalizedCandles = asCandleParams(sortAndDedupeCandles(cachedCandles));
  if (!isRenderableCandleBootstrapSeed(normalizedCandles, normalizedTimeframe)) {
    return [];
  }

  return normalizedCandles.slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
};

const areCandlesEqual = (a: CandleParams, b: CandleParams): boolean =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;

const areSeriesEqual = (a: CandleParams[], b: CandleParams[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (!areCandlesEqual(a[index], b[index])) {
      return false;
    }
  }

  return true;
};

const createLiveCandle = (
  time: number,
  open: number,
  close: number,
  volume: number,
): CandleParams => ({
  time,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
  volume: Math.max(volume, 1),
});

class LiveCandlesEngine {
  private entries = new Map<string, EngineEntry>();
  private symbolEntryCounts = new Map<string, number>();
  private quoteTickListenerAttached = false;

  public subscribe(symbol: string, timeframe: string, listener: EngineListener): () => void {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe);
    if (!sym || !tf) return () => {};

    const entry = this.ensureEntry(sym, tf);

    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }

    entry.listeners.add(listener);
    entry.consumers += 1;

    if (entry.status === 'idle') {
      this.bootstrapHistory(entry);
    } else if (this.isEntryStale(entry)) {
      this.requestHistoryRefresh(entry, 'subscribe_stale_history', this.estimateHistoryAnchor(entry));
    } else if (entry.candles.length > 0) {
      listener();
    }

    return () => this.releaseListener(entry.key, listener);
  }

  public getCandles(symbol: string, timeframe: string): CandleParams[] {
    return this.entries.get(entryKey(symbol, timeframe))?.candles ?? (EMPTY_CANDLES as CandleParams[]);
  }

  public refresh(symbol: string, timeframe: string): void {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe);
    if (!sym || !tf) return;

    const entry = this.ensureEntry(sym, tf);
    if (entry.status === 'idle') {
      this.bootstrapHistory(entry);
      return;
    }

    this.requestHistoryRefresh(entry, 'manual_refresh', this.estimateHistoryAnchor(entry), 0);
  }

  public hydrateFromCache(symbol: string, timeframe: string, candles: CandleParams[]): void {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe);
    if (!sym || !tf || candles.length === 0) return;

    const entry = this.entries.get(entryKey(sym, tf));
    if (!entry) return;

    const cachedSeries = asCandleParams(sortAndDedupeCandles(candles)).slice(-MAX_CANDLE_SERIES_LENGTH);
    if (
      cachedSeries.length === 0 ||
      !isRenderableCandleBootstrapSeed(cachedSeries, tf) ||
      areSeriesEqual(entry.candles, cachedSeries)
    ) {
      return;
    }

    if (!shouldAdoptCachedSeries(entry.status, entry.historyCandles.length, entry.candles, cachedSeries)) {
      return;
    }

    entry.historyCandles = cachedSeries.slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
    entry.liveCandles = asCandleParams(
      pruneLiveCandlesCoveredByHistory(entry.historyCandles, entry.liveCandles),
    );

    if (entry.status !== 'ready') {
      if (entry.flushTimeout) {
        clearTimeout(entry.flushTimeout);
        entry.flushTimeout = null;
      }

      const queuedQuotes = clampPendingQuotes([...entry.queuedQuotes, ...entry.pendingQuotes]);
      entry.queuedQuotes = [];
      entry.pendingQuotes = [];
      entry.status = 'ready';

      if (queuedQuotes.length > 0) {
        const hadVisibleSeries = entry.candles.length > 0;
        const outcome = this.applyQuoteBatch(entry, queuedQuotes);
        this.commitVisibleCandles(entry);

        if (outcome.detachedHistory) {
          if (!hadVisibleSeries && entry.candles.length === 0) {
            this.requestHistoryRefresh(
              entry,
              'cache_seed_detached_live_stream',
              outcome.anchorTime ?? this.estimateHistoryAnchor(entry),
              0,
            );
          } else {
            this.requestGapRefresh(entry, 'cache_seed_detached_live_stream', outcome.anchorTime);
          }
        } else if (outcome.bucketRolledOver) {
          this.schedulePostRolloverHeal(entry, outcome.anchorTime);
        }
        return;
      }
    }

    this.commitVisibleCandles(entry);
  }

  private ensureEntry(symbol: string, timeframe: string): EngineEntry {
    const key = entryKey(symbol, timeframe);
    const existing = this.entries.get(key);
    if (existing) return existing;

    const entry: EngineEntry = {
      key,
      symbol,
      timeframe,
      status: 'idle',
      candles: [],
      historyCandles: [],
      liveCandles: [],
      listeners: new Set(),
      consumers: 0,
      releaseTimer: null,
      fetchEpoch: 0,
      fetchController: null,
      queuedQuotes: [],
      pendingQuotes: [],
      flushTimeout: null,
      healTimer: null,
      gapRefreshTimer: null,
      lastGapRefreshAt: 0,
      lastQuoteSignature: null,
    };

    const seededHistory = getSeedHistoryCandles(symbol, timeframe);
    if (seededHistory.length > 0) {
      entry.status = 'ready';
      entry.historyCandles = seededHistory;
      this.commitVisibleCandles(entry);
    }

    this.entries.set(key, entry);
    this.incrementSymbolRefCount(symbol);
    quotesWsService.connect();
    quotesWsService.subscribe([symbol]);
    this.ensureQuoteTickListener();
    return entry;
  }

  private releaseListener(key: string, listener: EngineListener): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    entry.listeners.delete(listener);
    entry.consumers = Math.max(0, entry.consumers - 1);

    if (entry.consumers === 0) {
      // Hidden chart routes should stop all live quote/candle work immediately.
      // Keeping engine entries alive after unmount leaves websocket-driven merge
      // work running in the background and eventually blocks taps/navigation.
      this.disposeEntry(key);
    }
  }

  private disposeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    entry.fetchController?.abort();
    if (entry.flushTimeout) clearTimeout(entry.flushTimeout);
    if (entry.healTimer) clearTimeout(entry.healTimer);
    if (entry.gapRefreshTimer) clearTimeout(entry.gapRefreshTimer);
    if (entry.releaseTimer) clearTimeout(entry.releaseTimer);

    this.entries.delete(key);
    this.decrementSymbolRefCount(entry.symbol);

    if (this.entries.size === 0 && this.quoteTickListenerAttached) {
      quotesWsService.removeTickListener(this.handleQuoteTick);
      this.quoteTickListenerAttached = false;
    }
  }

  private incrementSymbolRefCount(symbol: string): void {
    this.symbolEntryCounts.set(symbol, (this.symbolEntryCounts.get(symbol) ?? 0) + 1);
  }

  private decrementSymbolRefCount(symbol: string): void {
    const next = (this.symbolEntryCounts.get(symbol) ?? 0) - 1;
    if (next <= 0) {
      this.symbolEntryCounts.delete(symbol);
      quotesWsService.unsubscribe([symbol]);
      return;
    }

    this.symbolEntryCounts.set(symbol, next);
  }

  private ensureQuoteTickListener(): void {
    if (this.quoteTickListenerAttached) return;
    quotesWsService.addTickListener(this.handleQuoteTick);
    this.quoteTickListenerAttached = true;
  }

  private handleQuoteTick = (tick: QuoteTickEvent): void => {
    const symbol = normalizeSymbol(tick.symbol);
    if (!symbol || !Number.isFinite(tick.bid)) return;

    for (const entry of this.entries.values()) {
      if (entry.symbol !== symbol) continue;

      const signature = `${tick.timestamp}:${tick.bid}`;
      if (signature === entry.lastQuoteSignature) continue;
      entry.lastQuoteSignature = signature;

      const pending: PendingQuote = {
        price: tick.bid,
        timestamp: tick.timestamp,
      };

      if (entry.status !== 'ready') {
        if (entry.status === 'bootstrapping') {
          // Keep every bootstrap quote for later replay once REST history
          // arrives. Only render during bootstrap if we already have seeded
          // history; otherwise exposing a provisional live-only segment causes
          // the detached history/live split the chart is trying to avoid.
          entry.queuedQuotes = clampPendingQuotes([...entry.queuedQuotes, pending]);
          if (shouldRenderBootstrapPreview(entry.historyCandles.length, entry.candles.length)) {
            entry.pendingQuotes = clampPendingQuotes([...entry.pendingQuotes, pending]);
            this.scheduleFlush(entry);
          }
          continue;
        }

        entry.queuedQuotes = clampPendingQuotes([...entry.queuedQuotes, pending]);
        continue;
      }

      entry.pendingQuotes = clampPendingQuotes([...entry.pendingQuotes, pending]);
      this.scheduleFlush(entry);
    }
  };

  private scheduleFlush(entry: EngineEntry): void {
    if (entry.flushTimeout) return;

    entry.flushTimeout = setTimeout(() => {
      entry.flushTimeout = null;
      if (!this.entries.has(entry.key)) return;

      const batch = entry.pendingQuotes;
      entry.pendingQuotes = [];
      if (batch.length === 0) return;

      const outcome = this.applyQuoteBatch(entry, batch);
      if (outcome.changed) {
        this.commitVisibleCandles(entry);
      }

      if (entry.status !== 'ready') {
        return;
      }

      if (outcome.detachedHistory) {
        this.requestGapRefresh(entry, 'detached_live_stream', outcome.anchorTime);
      } else if (outcome.bucketRolledOver) {
        this.schedulePostRolloverHeal(entry, outcome.anchorTime);
      }
    }, QUOTE_BATCH_INTERVAL_MS);
  }

  private drainBootstrapQuotes(entry: EngineEntry): PendingQuote[] {
    if (entry.flushTimeout) {
      clearTimeout(entry.flushTimeout);
      entry.flushTimeout = null;
    }

    const queuedQuotes = entry.queuedQuotes;
    entry.queuedQuotes = [];
    entry.pendingQuotes = [];
    entry.liveCandles = [];
    return queuedQuotes;
  }

  private applyQuoteBatch(
    entry: EngineEntry,
    quotes: PendingQuote[],
  ): { changed: boolean; bucketRolledOver: boolean; detachedHistory: boolean; anchorTime: number | null } {
    let changed = false;
    let bucketRolledOver = false;
    let detachedHistory = false;
    let anchorTime: number | null = null;

    const orderedQuotes = quotes
      .map((quote, index) => ({
        quote,
        index,
        normalizedTimestamp: normalizeTimestampToSeconds(quote.timestamp),
      }))
      .sort((left, right) => {
        if (left.normalizedTimestamp === null && right.normalizedTimestamp === null) {
          return left.index - right.index;
        }
        if (left.normalizedTimestamp === null) {
          return 1;
        }
        if (right.normalizedTimestamp === null) {
          return -1;
        }
        return left.normalizedTimestamp === right.normalizedTimestamp
          ? left.index - right.index
          : left.normalizedTimestamp - right.normalizedTimestamp;
      });

    for (const { quote } of orderedQuotes) {
      const outcome = this.applyQuote(entry, quote);
      changed = changed || outcome.changed;
      bucketRolledOver = bucketRolledOver || outcome.bucketRolledOver;
      detachedHistory = detachedHistory || outcome.detachedHistory;
      anchorTime = outcome.anchorTime ?? anchorTime;
    }

    return { changed, bucketRolledOver, detachedHistory, anchorTime };
  }

  private applyQuote(
    entry: EngineEntry,
    quote: PendingQuote,
  ): { changed: boolean; bucketRolledOver: boolean; detachedHistory: boolean; anchorTime: number | null } {
    const baseTail = this.getBaseTail(entry);
    const quoteTimeInSeconds = normalizeTimestampToSeconds(quote.timestamp);
    if (quoteTimeInSeconds === null) {
      return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: null };
    }

    const bucketTime = baseTail
      ? alignTimeToBucketWithReference(quoteTimeInSeconds, entry.timeframe, baseTail.time)
      : alignTimeToBucket(quoteTimeInSeconds, entry.timeframe);
    const currentLiveTail = this.getLiveTail(entry);
    const liveByTime = entry.liveCandles.find((candle) => candle.time === bucketTime) ?? null;

    if (!baseTail) {
      entry.liveCandles = [createLiveCandle(bucketTime, quote.price, quote.price, 1)];
      return { changed: true, bucketRolledOver: true, detachedHistory: true, anchorTime: bucketTime };
    }

    if (liveByTime && currentLiveTail?.time === bucketTime) {
      const merged = mergeCandleUpdate(
        liveByTime,
        {
          time: bucketTime,
          open: liveByTime.open,
          high: Math.max(liveByTime.high, quote.price),
          low: Math.min(liveByTime.low, quote.price),
          close: quote.price,
          volume: Math.max(liveByTime.volume + 1, 1),
        },
      );

      if (!merged || areCandlesEqual(merged as CandleParams, liveByTime)) {
        return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
      }

      this.upsertLiveCandle(entry, merged as CandleParams);
      return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
    }

    if (bucketTime < baseTail.time) {
      // Professional live charts do not let raw quote ticks rewrite already
      // closed buckets. Older-bar corrections must come from authoritative
      // history reloads, not from delayed/out-of-order socket prices.
      return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: baseTail.time };
    }

    if (bucketTime === baseTail.time) {
      const overlayBase = currentLiveTail?.time === bucketTime ? currentLiveTail : baseTail;
      const merged = mergeCandleUpdate(
        overlayBase,
        {
          time: bucketTime,
          open: overlayBase.open,
          high: Math.max(overlayBase.high, quote.price),
          low: Math.min(overlayBase.low, quote.price),
          close: quote.price,
          volume: Math.max(overlayBase.volume + 1, 1),
        },
      );

      if (!merged || areCandlesEqual(merged as CandleParams, overlayBase as CandleParams)) {
        return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
      }

      this.upsertLiveCandle(entry, merged as CandleParams);
      return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
    }

    const expectedNextTime = getExpectedNextCandleTime(baseTail.time, entry.timeframe);
    if (bucketTime === expectedNextTime) {
      // If we are still stepping out of a pure-history view, we have not
      // actually observed this new bucket open yet. Starting it from the
      // first seen quote avoids a fabricated giant body on cold start.
      const nextCandle = buildQuoteRolloverCandle(
        bucketTime,
        baseTail.close,
        quote.price,
        entry.liveCandles.length > 0,
      ) as CandleParams;
      this.upsertLiveCandle(entry, nextCandle);
      return { changed: true, bucketRolledOver: true, detachedHistory: false, anchorTime: bucketTime };
    }

    entry.liveCandles = [createLiveCandle(bucketTime, quote.price, quote.price, 1)];
    return { changed: true, bucketRolledOver: true, detachedHistory: true, anchorTime: bucketTime };
  }

  private upsertLiveCandle(entry: EngineEntry, candle: CandleParams): void {
    const next = entry.liveCandles.slice();
    const existingIndex = next.findIndex((item) => item.time === candle.time);

    if (existingIndex === -1) {
      next.push(candle);
    } else {
      next[existingIndex] = candle;
    }

    entry.liveCandles = asCandleParams(sortAndDedupeCandles(next)).slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  private getBaseTail(entry: EngineEntry): CandleParams | null {
    return this.getLiveTail(entry) ?? this.getHistoryTail(entry);
  }

  private getHistoryTail(entry: EngineEntry): CandleParams | null {
    return entry.historyCandles[entry.historyCandles.length - 1] ?? null;
  }

  private getLiveTail(entry: EngineEntry): CandleParams | null {
    return entry.liveCandles[entry.liveCandles.length - 1] ?? null;
  }

  private commitVisibleCandles(entry: EngineEntry): void {
    const visibleSeriesMode = resolveVisibleSeriesMode(
      entry.historyCandles,
      entry.liveCandles,
      entry.candles,
      entry.timeframe,
    );
    const nextVisible =
      visibleSeriesMode === 'merged'
        ? asCandleParams(
            materializeCanonicalHistoryAndLiveCandles(entry.historyCandles, entry.liveCandles, entry.timeframe),
          )
        : visibleSeriesMode === 'history'
          ? entry.historyCandles.slice(-MAX_CANDLE_SERIES_LENGTH)
          : visibleSeriesMode === 'current'
            ? resolveCurrentVisibleSeries(entry.historyCandles, entry.liveCandles, entry.candles).slice(
                -MAX_CANDLE_SERIES_LENGTH,
              )
            : [];
    const cacheChanged = shouldSyncVisibleSeriesCache(visibleSeriesMode, nextVisible, entry.timeframe)
      ? syncMergedCandleCache(entry.symbol, entry.timeframe, nextVisible, {
          canonical: true,
        })
      : visibleSeriesMode === 'current'
        ? syncMergedCandleCache(entry.symbol, entry.timeframe, [], {
            canonical: true,
          })
      : false;

    if (areSeriesEqual(entry.candles, nextVisible)) {
      if (cacheChanged) {
        entry.candles = nextVisible;
      }
      return;
    }

    entry.candles = nextVisible;
    this.notify(entry);
  }

  private notify(entry: EngineEntry): void {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.warn('[liveCandlesEngine] listener threw', error);
      }
    });
  }

  private isEntryStale(entry: EngineEntry): boolean {
    const last = entry.candles[entry.candles.length - 1];
    if (!last) return true;

    const now = Math.floor(Date.now() / 1000);
    let bucketCursor = last.time;
    for (let index = 0; index < RECENT_HISTORY_ANCHOR_SAFETY_BUCKETS; index += 1) {
      bucketCursor = getExpectedNextCandleTime(bucketCursor, entry.timeframe);
    }

    return now > bucketCursor;
  }

  private estimateHistoryAnchor(entry: EngineEntry): number {
    const now = Math.floor(Date.now() / 1000);
    const latestKnownTime =
      this.getLiveTail(entry)?.time ??
      this.getHistoryTail(entry)?.time ??
      now;

    return getExpectedNextCandleTime(Math.max(latestKnownTime, now), entry.timeframe);
  }

  private buildHistoryRequestOptions(entry: EngineEntry, signal: AbortSignal, anchorTo?: number): CandleHistoryRequestOptions {
    const now = Math.floor(Date.now() / 1000);
    const to = getExpectedNextCandleTime(Math.max(anchorTo ?? 0, now), entry.timeframe);
    return { signal, to };
  }

  private bootstrapHistory(entry: EngineEntry): void {
    if (!this.entries.has(entry.key)) return;
    entry.status = 'bootstrapping';
    entry.queuedQuotes = [];
    entry.pendingQuotes = [];
    this.loadHistory(entry, {
      reason: 'bootstrap',
      bootstrap: true,
      anchorTo: this.estimateHistoryAnchor(entry),
      limit: FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT,
      backfillAfterBootstrap: true,
    });
  }

  private requestGapRefresh(entry: EngineEntry, reason: string, anchorTime: number | null | undefined): void {
    if (!this.entries.has(entry.key)) return;
    if (entry.gapRefreshTimer) return;

    const delay = Math.max(0, GAP_RESYNC_THROTTLE_MS - (Date.now() - entry.lastGapRefreshAt));
    entry.gapRefreshTimer = setTimeout(() => {
      entry.gapRefreshTimer = null;
      if (!this.entries.has(entry.key)) return;

      entry.lastGapRefreshAt = Date.now();
      this.loadHistory(entry, {
        reason,
        bootstrap: false,
        anchorTo: anchorTime ?? this.estimateHistoryAnchor(entry),
      });
    }, delay);
  }

  private requestHistoryRefresh(entry: EngineEntry, reason: string, anchorTo: number, delayMs: number = POST_ROLLOVER_HEAL_DELAY_MS): void {
    if (!this.entries.has(entry.key)) return;
    if (entry.healTimer) {
      clearTimeout(entry.healTimer);
    }

    entry.healTimer = setTimeout(() => {
      entry.healTimer = null;
      if (!this.entries.has(entry.key)) return;

      this.loadHistory(entry, {
        reason,
        bootstrap: false,
        anchorTo,
      });
    }, delayMs);
  }

  private schedulePostRolloverHeal(entry: EngineEntry, anchorTime: number | null | undefined): void {
    this.requestHistoryRefresh(
      entry,
      'post_rollover_heal',
      anchorTime ?? this.estimateHistoryAnchor(entry),
    );
  }

  private scheduleBootstrapBackfill(
    entry: EngineEntry,
    options: { backfillAfterBootstrap?: boolean },
    requestedLimit: number,
  ): void {
    if (
      !options.backfillAfterBootstrap ||
      !this.entries.has(entry.key) ||
      entry.healTimer ||
      entry.gapRefreshTimer ||
      !shouldBackfillBootstrapHistory(entry.historyCandles.length, requestedLimit)
    ) {
      return;
    }

    this.requestHistoryRefresh(
      entry,
      'bootstrap_full_history_backfill',
      this.estimateHistoryAnchor(entry),
      BOOTSTRAP_FULL_BACKFILL_DELAY_MS,
    );
  }

  private scheduleBootstrapRetry(entry: EngineEntry, delayMs: number = BOOTSTRAP_RETRY_DELAY_MS): void {
    if (!this.entries.has(entry.key)) return;
    if (entry.healTimer) {
      clearTimeout(entry.healTimer);
    }

    entry.healTimer = setTimeout(() => {
      entry.healTimer = null;
      if (!this.entries.has(entry.key)) return;

      this.loadHistory(entry, {
        reason: 'bootstrap_retry',
        bootstrap: true,
        anchorTo: this.estimateHistoryAnchor(entry),
        limit: FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT,
        backfillAfterBootstrap: true,
      });
    }, delayMs);
  }

  private loadHistory(
    entry: EngineEntry,
    options: {
      reason: string;
      bootstrap: boolean;
      anchorTo?: number;
      limit?: number;
      backfillAfterBootstrap?: boolean;
    },
  ): void {
    const tracked = this.entries.get(entry.key);
    if (!tracked) return;

    tracked.fetchEpoch += 1;
    const epoch = tracked.fetchEpoch;
    tracked.fetchController?.abort();
    const controller = new AbortController();
    tracked.fetchController = controller;

    const requestOptions = this.buildHistoryRequestOptions(tracked, controller.signal, options.anchorTo);
    const historyLimit = options.limit ?? DEFAULT_CANDLE_HISTORY_LIMIT;

    void getCandleHistory(
      tracked.symbol,
      tracked.timeframe,
      historyLimit,
      requestOptions,
    )
      .then((history) => {
        const live = this.entries.get(tracked.key);
        if (!live || live.fetchEpoch !== epoch) return;

        const fetchedHistory = asCandleParams(sortAndDedupeCandles(history.candles)).slice(
          -historyLimit,
        );

        if (options.bootstrap) {
          if (!shouldAcceptBootstrapHistory(fetchedHistory, live.timeframe)) {
            live.status = 'bootstrapping';
            this.scheduleBootstrapRetry(live);
            return;
          }

          live.historyCandles = fetchedHistory;
          const queued = this.drainBootstrapQuotes(live);
          live.status = 'ready';
          if (queued.length > 0) {
            const hadVisibleSeries = live.candles.length > 0;
            const outcome = this.applyQuoteBatch(live, queued);
            this.commitVisibleCandles(live);

            if (outcome.detachedHistory) {
              if (!hadVisibleSeries && live.candles.length === 0) {
                this.requestHistoryRefresh(
                  live,
                  'bootstrap_detached_live_stream',
                  outcome.anchorTime ?? this.estimateHistoryAnchor(live),
                  0,
                );
              } else {
                this.requestGapRefresh(live, 'bootstrap_detached_live_stream', outcome.anchorTime);
              }
            } else if (outcome.bucketRolledOver) {
              this.schedulePostRolloverHeal(live, outcome.anchorTime);
            }
            this.scheduleBootstrapBackfill(live, options, historyLimit);
            return;
          }

          this.commitVisibleCandles(live);
          this.scheduleBootstrapBackfill(live, options, historyLimit);
          return;
        }

        live.historyCandles = asCandleParams(
          mergeFetchedHistoryIntoWindow(live.historyCandles, fetchedHistory, live.timeframe),
        );
        live.liveCandles = asCandleParams(
          pruneLiveCandlesCoveredByHistory(live.historyCandles, live.liveCandles),
        );
        live.status = 'ready';
        this.commitVisibleCandles(live);

        if (live.liveCandles.length > 0) {
          const visibleMode = resolveVisibleSeriesMode(
            live.historyCandles,
            live.liveCandles,
            live.candles,
            live.timeframe,
          );

          if (visibleMode !== 'merged') {
            const anchorTime = this.getLiveTail(live)?.time ?? this.estimateHistoryAnchor(live);
            if (live.candles.length === 0) {
              this.requestHistoryRefresh(live, 'history_refresh_still_detached', anchorTime, 0);
            } else {
              this.requestGapRefresh(live, 'history_refresh_still_detached', anchorTime);
            }
          }
        }
      })
      .catch((error) => {
        const live = this.entries.get(tracked.key);
        if (!live || live.fetchEpoch !== epoch) return;
        if (error instanceof Error && error.name === 'AbortError') return;

        console.warn(
          `[liveCandlesEngine] history fetch failed for ${tracked.symbol} ${tracked.timeframe}:`,
          error instanceof Error ? error.message : String(error),
        );

        if (
          options.bootstrap &&
          shouldKeepBootstrappingOnHistoryFailure(live.historyCandles.length, live.candles.length)
        ) {
          live.status = 'bootstrapping';
          this.scheduleBootstrapRetry(live);
          return;
        }

        live.status = 'ready';
      })
      .finally(() => {
        const live = this.entries.get(tracked.key);
        if (live && live.fetchEpoch === epoch) {
          live.fetchController = null;
        }
      });
  }
}

export const liveCandlesEngine = new LiveCandlesEngine();
