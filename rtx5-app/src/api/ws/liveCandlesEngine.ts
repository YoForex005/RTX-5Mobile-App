/**
 * Live candle engine — single canonical OHLC stream per (symbol, timeframe).
 *
 * Architecture:
 *   Quote feed (Zustand) ──▶ tick dedupe ──▶ micro-batch (≤16ms)
 *                                              │
 *                                              ▼
 *                                       classify + apply
 *                                              │
 *              ┌───────────────┬───────────────┼──────────────────┐
 *              ▼               ▼               ▼                  ▼
 *       update active     rollover new    late-bucket      gap > horizon
 *         bucket           bucket (open    merge            → resync history
 *                          = prior close)
 *
 * Guarantees:
 *   - One engine entry per (symbol, tf), reference-counted by React consumers.
 *   - Live ticks arriving during history fetch are queued and replayed on the
 *     fresh history snapshot — zero ticks are lost across the boundary.
 *   - Bucket rollover triggers a fast (≤250 ms) REST heal that reconciles the
 *     bar's true open against the live aggregation.
 *   - Excessive gaps force a throttled history resync rather than corrupting
 *     the tape with speculative fill.
 *   - Volume on live bars is real tick count (MT5/TradingView convention when
 *     exchange volume is unavailable). Historical bars keep their REST volume.
 */

import { getCandleHistory } from '../candles';
import { quotesWsService } from './quotesSocket';
import type { QuoteTickEvent } from './quotesSocket';
import {
  applyLivePriceToCandleSeries,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  getTimeframeSeconds,
  hasExcessiveLivePriceGap,
  mergeRecentHistoryIntoCandles,
  normalizeSymbol,
  normalizeTimeframe,
  overlayLiveCandlesOnHistory,
  trimCandlesBeforeDetachedLiveTail,
} from '../../domain/candles';

// ─── Public types ───────────────────────────────────────────────────────────

export type CandleParams = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid?: number;
  ask?: number;
};

type PendingQuote = {
  price: number;
  timestamp: unknown;
};

type BucketTickCounter = {
  bucketTime: number;
  tickCount: number;
};

type EngineListener = () => void;

type EntryStatus = 'idle' | 'loading' | 'ready';

type EngineEntry = {
  key: string;
  symbol: string;
  timeframe: string;
  status: EntryStatus;
  candles: CandleParams[];
  listeners: Set<EngineListener>;
  consumers: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  fetchEpoch: number;
  fetchController: AbortController | null;
  queuedQuotes: PendingQuote[];
  pendingQuotes: PendingQuote[];
  flushTimeout: ReturnType<typeof setTimeout> | null;
  healTimer: ReturnType<typeof setTimeout> | null;
  gapResyncTimer: ReturnType<typeof setTimeout> | null;
  healInFlight: boolean;
  lastResyncAt: number;
  tickCounter: BucketTickCounter | null;
  lastQuoteSignature: string | null;
};

// ─── Tunables ───────────────────────────────────────────────────────────────

const QUOTE_BATCH_INTERVAL_MS = 16;          // ~1 frame — smooth without starving CPU
const BUCKET_HEAL_DELAY_MS = 250;            // fast reconciliation after rollover
const HEAL_CANDLE_LIMIT = 12;                // how many recent bars the REST heal pulls
const GAP_RESYNC_THROTTLE_MS = 4000;         // min spacing between gap-triggered refetches
const MAX_AUTO_GAP_FILL_CANDLES = 5;         // ≥ this many empty buckets → resync instead of fill
const MAX_PENDING_QUOTES = 128;              // hard cap on in-flight quote backlog
const ENTRY_RETENTION_MS = 60_000;           // keep a disposed entry warm briefly for remounts

// ─── Helpers ────────────────────────────────────────────────────────────────

// Stable empty snapshot — must be the SAME reference across calls so that
// useSyncExternalStore's Object.is comparison doesn't trigger an infinite loop
// when an entry has not yet produced any candles.
export const EMPTY_CANDLES: readonly CandleParams[] = Object.freeze([]) as readonly CandleParams[];

const entryKey = (symbol: string, timeframe: string) =>
  `${normalizeSymbol(symbol)}::${normalizeTimeframe(timeframe)}`;

const clampQuoteBacklog = (quotes: PendingQuote[]): PendingQuote[] =>
  quotes.length > MAX_PENDING_QUOTES ? quotes.slice(-MAX_PENDING_QUOTES) : quotes;


// ─── Engine ─────────────────────────────────────────────────────────────────

class LiveCandlesEngine {
  private entries = new Map<string, EngineEntry>();
  private symbolEntryCounts = new Map<string, number>();
  private quoteTickListenerAttached = false;

  // ── Public API ────────────────────────────────────────────────────────────

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

    // Staleness check. If the entry is IDLE we always load history. If it's
    // READY we reload ONLY when the last in-memory bar is older than one
    // bucket — i.e. the chart has been detached long enough that real time
    // has walked past the cached data, which is exactly the case that
    // produces the "island of stale candles + giant empty gap + fresh live
    // cluster" artifact. For a normal remount within a few seconds, the
    // existing candles are still current and we skip the network call.
    if (entry.status === 'idle') {
      this.loadHistory(entry);
    } else if (this.isEntryStale(entry)) {
      console.log(
        '[liveCandlesEngine] entry stale on subscribe — forcing fresh history',
        { symbol: entry.symbol, tf: entry.timeframe, lastBarAgo: this.lastBarAgeSeconds(entry) },
      );
      this.loadHistory(entry);
    } else if (entry.candles.length > 0) {
      listener();
    }

    return () => this.releaseListener(entry.key, listener);
  }

  private lastBarAgeSeconds(entry: EngineEntry): number {
    const last = entry.candles[entry.candles.length - 1];
    if (!last) return Number.POSITIVE_INFINITY;
    return Math.floor(Date.now() / 1000) - last.time;
  }

  private isEntryStale(entry: EngineEntry): boolean {
    if (entry.candles.length === 0) return true;
    const intervalSec = getTimeframeSeconds(entry.timeframe);
    // Allow up to 2 buckets of age before we consider the tape stale — one
    // bucket is the active bar's natural horizon, a second accounts for
    // small delays between bar-close and the next tick arriving.
    return this.lastBarAgeSeconds(entry) > intervalSec * 2;
  }

  public getCandles(symbol: string, timeframe: string): CandleParams[] {
    return this.entries.get(entryKey(symbol, timeframe))?.candles ?? (EMPTY_CANDLES as CandleParams[]);
  }

  public refresh(symbol: string, timeframe: string): void {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe);
    if (!sym || !tf) return;

    const entry = this.ensureEntry(sym, tf);
    this.loadHistory(entry);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

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
      listeners: new Set(),
      consumers: 0,
      releaseTimer: null,
      fetchEpoch: 0,
      fetchController: null,
      queuedQuotes: [],
      pendingQuotes: [],
      flushTimeout: null,
      healTimer: null,
      gapResyncTimer: null,
      healInFlight: false,
      lastResyncAt: 0,
      tickCounter: null,
      lastQuoteSignature: null,
    };

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
        if ((entry.consumers ?? 0) === 0) this.disposeEntry(key);
      }, ENTRY_RETENTION_MS);
    }
  }

  private disposeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    entry.fetchController?.abort();
    if (entry.flushTimeout) clearTimeout(entry.flushTimeout);
    if (entry.healTimer) clearTimeout(entry.healTimer);
    if (entry.gapResyncTimer) clearTimeout(entry.gapResyncTimer);
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

  // ── Zustand tick subscription ─────────────────────────────────────────────

  private ensureQuoteTickListener(): void {
    if (this.quoteTickListenerAttached) return;
    quotesWsService.addTickListener(this.handleQuoteTick);
    this.quoteTickListenerAttached = true;
  }

  private handleQuoteTick = (tick: QuoteTickEvent): void => {
    const symbol = normalizeSymbol(tick.symbol);
    if (!symbol) return;
    if (!Number.isFinite(tick.bid)) return;

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
        entry.queuedQuotes = clampQuoteBacklog([...entry.queuedQuotes, pending]);
        continue;
      }

      entry.pendingQuotes = clampQuoteBacklog([...entry.pendingQuotes, pending]);
      this.scheduleFlush(entry);
    }
  };

  // ── Tick batch flush ──────────────────────────────────────────────────────

  private scheduleFlush(entry: EngineEntry): void {
    if (entry.flushTimeout) return;

    entry.flushTimeout = setTimeout(() => {
      entry.flushTimeout = null;
      if (!this.entries.has(entry.key)) return;

      const batch = entry.pendingQuotes;
      entry.pendingQuotes = [];
      if (batch.length === 0) return;

      const result = this.applyQuoteBatch(entry, entry.candles, batch);
      const anchorTime = entry.candles[entry.candles.length - 1]?.time ?? null;
      const visibleCandles = trimCandlesBeforeDetachedLiveTail(
        result.nextCandles,
        anchorTime,
        entry.timeframe,
        MAX_AUTO_GAP_FILL_CANDLES,
      ) as CandleParams[];
      const detachedHistoryDropped = visibleCandles !== result.nextCandles;

      if (visibleCandles !== entry.candles) {
        entry.candles = visibleCandles;
        this.notify(entry);
      }

      if (result.bucketRolledOver) {
        this.scheduleBucketHeal(entry);
      }

      if (result.gapResyncRequired || detachedHistoryDropped) {
        if (detachedHistoryDropped) {
          console.log('[liveCandlesEngine] live flush trimmed detached stale tail', {
            symbol: entry.symbol,
            tf: entry.timeframe,
            anchorTime,
            visibleStartTime: visibleCandles[0]?.time ?? null,
            visibleEndTime: visibleCandles[visibleCandles.length - 1]?.time ?? null,
          });
        }
        this.scheduleGapResync(
          entry,
          detachedHistoryDropped ? 'ready_state_detached_live_tail' : 'ready_state_quote_gap',
        );
      }
    }, QUOTE_BATCH_INTERVAL_MS);
  }

  private applyQuoteBatch(
    entry: EngineEntry,
    baseCandles: CandleParams[],
    quotes: PendingQuote[],
  ): { nextCandles: CandleParams[]; bucketRolledOver: boolean; gapResyncRequired: boolean } {
    let nextCandles = baseCandles;
    let bucketRolledOver = false;
    let gapResyncRequired = false;

    for (const pending of quotes) {
      const hugeGap = hasExcessiveLivePriceGap(
        nextCandles,
        pending.price,
        pending.timestamp,
        entry.timeframe,
        MAX_AUTO_GAP_FILL_CANDLES,
      );
      if (hugeGap) gapResyncRequired = true;

      const prevLastTime = nextCandles[nextCandles.length - 1]?.time ?? null;

      // Always keep the live tape alive. When a tick is separated from the
      // active bar by more than MAX_AUTO_GAP_FILL_CANDLES buckets we append
      // the live bar sparsely (the intermediate buckets stay genuinely
      // missing — no fabricated flat bars) and concurrently fire a REST
      // resync below to backfill those buckets when the backend has them.
      // This guarantees the chart never freezes on device sleep/wake or
      // transient backend lag, while still merging history + live cleanly
      // the moment the missing data arrives.
      const applied = applyLivePriceToCandleSeries(
        nextCandles,
        pending.price,
        pending.timestamp,
        entry.timeframe,
        {
          maxAutoGapFillCandles: MAX_AUTO_GAP_FILL_CANDLES,
          allowSparseAppendOnGap: true,
        },
      ) as CandleParams[];

      if (applied === nextCandles) continue;

      const nextLastTime = applied[applied.length - 1]?.time ?? null;
      const rolledOver = prevLastTime !== null && nextLastTime !== prevLastTime;

      // Maintain real tick-count volume for the active bucket (MT5/TV convention).
      const withTickVolume = this.stampTickVolume(entry, applied, rolledOver);

      nextCandles = withTickVolume;
      if (rolledOver) bucketRolledOver = true;
    }

    return { nextCandles, bucketRolledOver, gapResyncRequired };
  }

  /**
   * Stamp the active bucket with tick-count volume. Historical bars are left
   * untouched — only the rightmost bar (the current bucket) is mutated.
   */
  private stampTickVolume(
    entry: EngineEntry,
    source: CandleParams[],
    rolledOver: boolean,
  ): CandleParams[] {
    if (source.length === 0) {
      entry.tickCounter = null;
      return source;
    }

    const lastCandle = source[source.length - 1];
    const bucket = lastCandle.time;

    if (rolledOver || !entry.tickCounter || entry.tickCounter.bucketTime !== bucket) {
      entry.tickCounter = { bucketTime: bucket, tickCount: 1 };
    } else {
      entry.tickCounter.tickCount += 1;
    }

    const tickCount = entry.tickCounter.tickCount;
    // Prefer upstream volume if the server ever reports it, else tick count.
    const volume = Math.max(lastCandle.volume ?? 0, tickCount);
    if (volume === lastCandle.volume) return source;

    const next = source.slice();
    next[next.length - 1] = { ...lastCandle, volume };
    return next;
  }

  private notify(entry: EngineEntry): void {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        // A bad listener must not poison the rest of the subscribers.
        console.warn('[liveCandlesEngine] listener threw', err);
      }
    });
  }

  private scheduleGapResync(entry: EngineEntry, reason: string): void {
    const tracked = this.entries.get(entry.key);
    if (!tracked || tracked.gapResyncTimer) {
      return;
    }

    const now = Date.now();
    const delay = Math.max(0, GAP_RESYNC_THROTTLE_MS - (now - tracked.lastResyncAt));

    tracked.gapResyncTimer = setTimeout(() => {
      tracked.gapResyncTimer = null;

      const live = this.entries.get(entry.key);
      if (!live || live.fetchController || live.status === 'loading') {
        return;
      }

      live.lastResyncAt = Date.now();
      console.log('[liveCandlesEngine] gap resync scheduled', {
        symbol: live.symbol,
        tf: live.timeframe,
        reason,
      });
      this.loadHistory(live, { preserveVisibleCandles: false });
    }, delay);
  }

  // ── History fetch ─────────────────────────────────────────────────────────

  private loadHistory(entry: EngineEntry, options?: { preserveVisibleCandles?: boolean }): void {
    const preserveVisibleCandles = options?.preserveVisibleCandles === true;
    const current = this.entries.get(entry.key);
    if (!current) return;

    current.fetchEpoch += 1;
    const epoch = current.fetchEpoch;
    current.fetchController?.abort();
    current.fetchController = new AbortController();
    current.status = 'loading';
    current.queuedQuotes = [];
    current.pendingQuotes = [];
    current.tickCounter = null;
    current.healInFlight = false;

    if (current.healTimer) {
      clearTimeout(current.healTimer);
      current.healTimer = null;
    }

    if (current.gapResyncTimer) {
      clearTimeout(current.gapResyncTimer);
      current.gapResyncTimer = null;
    }

    void getCandleHistory(
      current.symbol,
      current.timeframe,
      DEFAULT_CANDLE_HISTORY_LIMIT,
      current.fetchController.signal,
    )
      .then((history) => {
        if (!history.candles || history.candles.length === 0) {
          console.warn(
            `[liveCandlesEngine] REST history empty for ${current.symbol} ${current.timeframe} — chart will show live ticks only until backend catches up`,
          );
        } else {
          console.log(
            `[liveCandlesEngine] Loaded ${history.candles.length} history bars for ${current.symbol} ${current.timeframe}`,
          );
        }
        this.onHistoryLoaded(current.key, epoch, history.candles, preserveVisibleCandles);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn(
          `[liveCandlesEngine] REST history fetch failed for ${current.symbol} ${current.timeframe}:`,
          err instanceof Error ? err.message : String(err),
        );
        this.onHistoryFailed(current.key, epoch, preserveVisibleCandles);
      })
      .finally(() => {
        const tracked = this.entries.get(current.key);
        if (tracked && tracked.fetchEpoch === epoch) {
          tracked.fetchController = null;
        }
      });
  }

  private onHistoryLoaded(
    key: string,
    epoch: number,
    historyCandles: CandleParams[],
    preserveVisibleCandles: boolean,
  ): void {
    const tracked = this.entries.get(key);
    if (!tracked || tracked.fetchEpoch !== epoch) return;

    const queued = tracked.queuedQuotes;
    tracked.queuedQuotes = [];

    // Choose the base for the new tape.
    //
    // Invariant we enforce:
    //   The final tape is CONTIGUOUS — no bars older than the first bar REST
    //   returned. Keeping older cached bars would place them at their real
    //   timestamps far to the left of the fresh history, and lightweight-
    //   charts renders the gap between them and the fresh bars as empty
    //   space. That's the "left cluster + big gap + right cluster" artifact
    //   we're fixing.
    //
    //   • REST returned bars → they define the authoritative window. Any
    //     cached bar older than their first timestamp is discarded. Cached
    //     bars WITHIN the window are overlaid (wick-merge preserved).
    //   • REST returned empty → keep the existing tape (don't strand the
    //     user on live-only bars just because of a slow round-trip).
    let baseCandles: CandleParams[];
    if (historyCandles.length === 0) {
      baseCandles = tracked.candles;
    } else {
      const firstRestTime = historyCandles[0].time;
      const trimmedCache = tracked.candles.filter((c) => c.time >= firstRestTime);
      if (preserveVisibleCandles && trimmedCache.length > 0) {
        baseCandles = overlayLiveCandlesOnHistory(historyCandles, trimmedCache) as CandleParams[];
      } else {
        // Full refresh. Merge REST with any in-window cached bars (keeps
        // live-only bars that are NEWER than REST's last bar, which is the
        // common case when the user has been watching for a while).
        const inWindow = trimmedCache;
        if (inWindow.length > 0) {
          baseCandles = overlayLiveCandlesOnHistory(historyCandles, inWindow) as CandleParams[];
        } else {
          baseCandles = historyCandles;
        }
      }
    }

    tracked.tickCounter = null;
    tracked.status = 'ready';

    const { nextCandles, bucketRolledOver, gapResyncRequired } = this.applyQuoteBatch(tracked, baseCandles, queued);
    const historyTailTime = historyCandles[historyCandles.length - 1]?.time ?? null;
    const visibleCandles = trimCandlesBeforeDetachedLiveTail(
      nextCandles,
      historyTailTime,
      tracked.timeframe,
      MAX_AUTO_GAP_FILL_CANDLES,
    ) as CandleParams[];
    const detachedHistoryDropped = visibleCandles !== nextCandles;

    tracked.candles = [...visibleCandles];
    this.notify(tracked);

    if (bucketRolledOver) this.scheduleBucketHeal(tracked);

    if (gapResyncRequired || detachedHistoryDropped) {
      console.log('[liveCandlesEngine] detached history handoff trimmed', {
        symbol: tracked.symbol,
        tf: tracked.timeframe,
        historyTailTime,
        visibleStartTime: tracked.candles[0]?.time ?? null,
        visibleEndTime: tracked.candles[tracked.candles.length - 1]?.time ?? null,
        gapResyncRequired,
      });
      this.scheduleGapResync(
        tracked,
        detachedHistoryDropped ? 'detached_history_handoff' : 'queued_quote_gap',
      );
    }
  }

  private onHistoryFailed(key: string, epoch: number, _preserveVisibleCandles: boolean): void {
    const tracked = this.entries.get(key);
    if (!tracked || tracked.fetchEpoch !== epoch) return;

    const queued = tracked.queuedQuotes;
    tracked.queuedQuotes = [];
    // On REST failure we ALWAYS keep whatever candles were in memory — even
    // if this load was a "force-fresh" attempt. Wiping on failure would
    // strand the user with only live ticks (no history context), which is
    // strictly worse than showing stale history with a warning. A successful
    // load still replaces (see onHistoryLoaded).
    const baseCandles = tracked.candles;
    tracked.tickCounter = null;
    tracked.status = 'ready';

    const { nextCandles, bucketRolledOver, gapResyncRequired } = this.applyQuoteBatch(tracked, baseCandles, queued);
    const anchorTime = baseCandles[baseCandles.length - 1]?.time ?? null;
    const visibleCandles = trimCandlesBeforeDetachedLiveTail(
      nextCandles,
      anchorTime,
      tracked.timeframe,
      MAX_AUTO_GAP_FILL_CANDLES,
    ) as CandleParams[];
    const detachedHistoryDropped = visibleCandles !== nextCandles;

    if (visibleCandles !== tracked.candles) {
      tracked.candles = [...visibleCandles];
      this.notify(tracked);
    }

    if (bucketRolledOver) this.scheduleBucketHeal(tracked);

    if (gapResyncRequired || detachedHistoryDropped) {
      this.scheduleGapResync(
        tracked,
        detachedHistoryDropped ? 'history_failed_detached_live_tail' : 'history_failed_quote_gap',
      );
    }
  }

  // ── Post-rollover heal ────────────────────────────────────────────────────

  private scheduleBucketHeal(entry: EngineEntry): void {
    const tracked = this.entries.get(entry.key);
    if (!tracked) return;

    if (tracked.healTimer) clearTimeout(tracked.healTimer);

    tracked.healTimer = setTimeout(() => {
      tracked.healTimer = null;

      const active = this.entries.get(entry.key);
      if (!active || active.fetchController || active.healInFlight) return;

      active.healInFlight = true;

      void getCandleHistory(active.symbol, active.timeframe, HEAL_CANDLE_LIMIT)
        .then((history) => {
          const live = this.entries.get(entry.key);
          if (!live) return;

          const healed = mergeRecentHistoryIntoCandles(
            live.candles,
            history.candles,
            live.timeframe,
          ) as CandleParams[];

          if (healed !== live.candles) {
            live.candles = healed;
            this.notify(live);
          }
        })
        .catch(() => {
          // Healing is best-effort; a failure leaves the live tape intact.
        })
        .finally(() => {
          const live = this.entries.get(entry.key);
          if (live) live.healInFlight = false;
        });
    }, BUCKET_HEAL_DELAY_MS);
  }
}

export const liveCandlesEngine = new LiveCandlesEngine();
