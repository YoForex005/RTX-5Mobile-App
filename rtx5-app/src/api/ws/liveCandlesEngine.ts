/**
 * Canonical live candle engine.
 *
 * Strategy:
 *   - REST history provides the recent authoritative candle window.
 *   - WebSocket quotes build only a live overlay segment.
 *   - The chart consumes a materialized series derived from:
 *       recent history + live overlay when contiguous
 *       live overlay only when history is detached/stale
 *
 * This avoids exposing half-merged arrays to the chart and prevents the
 * detached old-history + fresh-live cluster artifacts seen on mobile.
 */

import { CandleHistoryRequestOptions, getCandleHistory } from '../candles';
import { quotesWsService } from './quotesSocket';
import type { QuoteTickEvent } from './quotesSocket';
import {
  DEFAULT_CANDLE_HISTORY_LIMIT,
  MAX_CANDLE_SERIES_LENGTH,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  materializeHistoryAndLiveCandles,
  mergeCandleUpdate,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimestampToBucket,
  pruneLiveCandlesCoveredByHistory,
  sortAndDedupeCandles,
} from '../../domain/candles';
import { useTradingState, type Candle } from '../../state/tradingState';

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
const ENTRY_RETENTION_MS = 60_000;
const GAP_RESYNC_THROTTLE_MS = 4_000;
const POST_ROLLOVER_HEAL_DELAY_MS = 350;
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

  return asCandleParams(sortAndDedupeCandles(cachedCandles)).slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
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

    if (entry.consumers === 0 && !entry.releaseTimer) {
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = null;
        if ((entry.consumers ?? 0) === 0) {
          this.disposeEntry(key);
        }
      }, ENTRY_RETENTION_MS);
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

      if (outcome.detachedHistory) {
        this.requestGapRefresh(entry, 'detached_live_stream', outcome.anchorTime);
      } else if (outcome.bucketRolledOver) {
        this.schedulePostRolloverHeal(entry, outcome.anchorTime);
      }
    }, QUOTE_BATCH_INTERVAL_MS);
  }

  private applyQuoteBatch(
    entry: EngineEntry,
    quotes: PendingQuote[],
  ): { changed: boolean; bucketRolledOver: boolean; detachedHistory: boolean; anchorTime: number | null } {
    let changed = false;
    let bucketRolledOver = false;
    let detachedHistory = false;
    let anchorTime: number | null = null;

    for (const quote of quotes) {
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
    const bucketTime = normalizeTimestampToBucket(quote.timestamp, entry.timeframe);
    if (bucketTime === null) {
      return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: null };
    }

    const baseTail = this.getBaseTail(entry);
    const currentLiveTail = this.getLiveTail(entry);
    const liveByTime = entry.liveCandles.find((candle) => candle.time === bucketTime) ?? null;

    if (!baseTail) {
      entry.liveCandles = [createLiveCandle(bucketTime, quote.price, quote.price, 1)];
      return { changed: true, bucketRolledOver: true, detachedHistory: true, anchorTime: bucketTime };
    }

    if (liveByTime) {
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
      const matchingHistory = entry.historyCandles.find((candle) => candle.time === bucketTime);
      if (!matchingHistory) {
        this.requestGapRefresh(entry, 'late_tick_missing_history_bucket', baseTail.time);
        return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: baseTail.time };
      }

      const overlayBase = matchingHistory;
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

      if (!merged) {
        return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
      }

      this.upsertLiveCandle(entry, merged as CandleParams);
      return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
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
      const nextCandle = createLiveCandle(bucketTime, baseTail.close, quote.price, 1);
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
    const nextVisible = asCandleParams(
      materializeHistoryAndLiveCandles(entry.historyCandles, entry.liveCandles, entry.timeframe),
    );

    if (areSeriesEqual(entry.candles, nextVisible)) {
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

    const interval = getTimeframeSeconds(entry.timeframe);
    const now = Math.floor(Date.now() / 1000);
    return now - last.time > interval * RECENT_HISTORY_ANCHOR_SAFETY_BUCKETS;
  }

  private estimateHistoryAnchor(entry: EngineEntry): number {
    const interval = getTimeframeSeconds(entry.timeframe);
    const now = Math.floor(Date.now() / 1000);
    const latestKnownTime =
      this.getLiveTail(entry)?.time ??
      this.getHistoryTail(entry)?.time ??
      now;

    return Math.max(latestKnownTime, now) + interval;
  }

  private buildHistoryRequestOptions(entry: EngineEntry, signal: AbortSignal, anchorTo?: number): CandleHistoryRequestOptions {
    const interval = getTimeframeSeconds(entry.timeframe);
    const now = Math.floor(Date.now() / 1000);
    const to = Math.max(anchorTo ?? 0, now) + interval;
    return { signal, to };
  }

  private bootstrapHistory(entry: EngineEntry): void {
    if (!this.entries.has(entry.key)) return;
    entry.status = 'bootstrapping';
    entry.queuedQuotes = [];
    this.loadHistory(entry, { reason: 'bootstrap', bootstrap: true, anchorTo: this.estimateHistoryAnchor(entry) });
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

  private loadHistory(
    entry: EngineEntry,
    options: { reason: string; bootstrap: boolean; anchorTo?: number },
  ): void {
    const tracked = this.entries.get(entry.key);
    if (!tracked) return;

    tracked.fetchEpoch += 1;
    const epoch = tracked.fetchEpoch;
    tracked.fetchController?.abort();
    const controller = new AbortController();
    tracked.fetchController = controller;

    const requestOptions = this.buildHistoryRequestOptions(tracked, controller.signal, options.anchorTo);

    void getCandleHistory(
      tracked.symbol,
      tracked.timeframe,
      DEFAULT_CANDLE_HISTORY_LIMIT,
      requestOptions,
    )
      .then((history) => {
        const live = this.entries.get(tracked.key);
        if (!live || live.fetchEpoch !== epoch) return;

        live.historyCandles = asCandleParams(sortAndDedupeCandles(history.candles)).slice(-DEFAULT_CANDLE_HISTORY_LIMIT);
        live.liveCandles = asCandleParams(
          pruneLiveCandlesCoveredByHistory(live.historyCandles, live.liveCandles),
        );

        if (options.bootstrap) {
          live.status = 'ready';
          const queued = live.queuedQuotes;
          live.queuedQuotes = [];
          if (queued.length > 0) {
            const outcome = this.applyQuoteBatch(live, queued);
            if (outcome.changed) {
              this.commitVisibleCandles(live);
            } else {
              this.commitVisibleCandles(live);
            }

            if (outcome.detachedHistory) {
              this.requestGapRefresh(live, 'bootstrap_detached_live_stream', outcome.anchorTime);
            } else if (outcome.bucketRolledOver) {
              this.schedulePostRolloverHeal(live, outcome.anchorTime);
            }
            return;
          }
        }

        live.status = 'ready';
        this.commitVisibleCandles(live);
      })
      .catch((error) => {
        const live = this.entries.get(tracked.key);
        if (!live || live.fetchEpoch !== epoch) return;
        if (error instanceof Error && error.name === 'AbortError') return;

        console.warn(
          `[liveCandlesEngine] history fetch failed for ${tracked.symbol} ${tracked.timeframe}:`,
          error instanceof Error ? error.message : String(error),
        );

        if (options.bootstrap) {
          live.status = 'ready';
          const queued = live.queuedQuotes;
          live.queuedQuotes = [];
          if (queued.length > 0) {
            const outcome = this.applyQuoteBatch(live, queued);
            if (outcome.changed) {
              this.commitVisibleCandles(live);
            }
            if (outcome.detachedHistory) {
              this.requestGapRefresh(live, 'bootstrap_fetch_failed_detached_live_stream', outcome.anchorTime);
            }
          }
        } else {
          live.status = 'ready';
        }
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
