"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveCandlesEngine = exports.EMPTY_CANDLES = void 0;
const candles_1 = require("../candles");
const quotesSocket_1 = require("./quotesSocket");
const candles_2 = require("../../domain/candles");
const tradingState_1 = require("../../state/tradingState");
const candleCache_1 = require("../../state/candleCache");
const liveCandlesEnginePolicy_1 = require("./liveCandlesEnginePolicy");
const QUOTE_BATCH_INTERVAL_MS = 16;
const MAX_PENDING_QUOTES = 256;
const GAP_RESYNC_THROTTLE_MS = 4_000;
const POST_ROLLOVER_HEAL_DELAY_MS = 350;
const BOOTSTRAP_RETRY_DELAY_MS = 1_250;
const RECENT_HISTORY_ANCHOR_SAFETY_BUCKETS = 2;
exports.EMPTY_CANDLES = Object.freeze([]);
const entryKey = (symbol, timeframe) => `${(0, candles_2.normalizeSymbol)(symbol)}::${(0, candles_2.normalizeTimeframe)(timeframe)}`;
const clampPendingQuotes = (quotes) => quotes.length > MAX_PENDING_QUOTES ? quotes.slice(-MAX_PENDING_QUOTES) : quotes;
const asCandleParams = (candles) => candles;
const getSeedHistoryCandles = (symbol, timeframe) => {
    const normalizedSymbol = (0, candles_2.normalizeSymbol)(symbol);
    const normalizedTimeframe = (0, candles_2.normalizeTimeframe)(timeframe);
    const cachedCandles = tradingState_1.useTradingState.getState().candles[`${normalizedSymbol}.${normalizedTimeframe}`] ?? [];
    if (cachedCandles.length === 0) {
        return [];
    }
    return asCandleParams((0, candles_2.sortAndDedupeCandles)(cachedCandles)).slice(-candles_2.DEFAULT_CANDLE_HISTORY_LIMIT);
};
const areCandlesEqual = (a, b) => a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume;
const areSeriesEqual = (a, b) => {
    if (a === b)
        return true;
    if (a.length !== b.length)
        return false;
    for (let index = 0; index < a.length; index += 1) {
        if (!areCandlesEqual(a[index], b[index])) {
            return false;
        }
    }
    return true;
};
const createLiveCandle = (time, open, close, volume) => ({
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: Math.max(volume, 1),
});
class LiveCandlesEngine {
    entries = new Map();
    symbolEntryCounts = new Map();
    quoteTickListenerAttached = false;
    subscribe(symbol, timeframe, listener) {
        const sym = (0, candles_2.normalizeSymbol)(symbol);
        const tf = (0, candles_2.normalizeTimeframe)(timeframe);
        if (!sym || !tf)
            return () => { };
        const entry = this.ensureEntry(sym, tf);
        if (entry.releaseTimer) {
            clearTimeout(entry.releaseTimer);
            entry.releaseTimer = null;
        }
        entry.listeners.add(listener);
        entry.consumers += 1;
        if (entry.status === 'idle') {
            this.bootstrapHistory(entry);
        }
        else if (this.isEntryStale(entry)) {
            this.requestHistoryRefresh(entry, 'subscribe_stale_history', this.estimateHistoryAnchor(entry));
        }
        else if (entry.candles.length > 0) {
            listener();
        }
        return () => this.releaseListener(entry.key, listener);
    }
    getCandles(symbol, timeframe) {
        return this.entries.get(entryKey(symbol, timeframe))?.candles ?? exports.EMPTY_CANDLES;
    }
    refresh(symbol, timeframe) {
        const sym = (0, candles_2.normalizeSymbol)(symbol);
        const tf = (0, candles_2.normalizeTimeframe)(timeframe);
        if (!sym || !tf)
            return;
        const entry = this.ensureEntry(sym, tf);
        if (entry.status === 'idle') {
            this.bootstrapHistory(entry);
            return;
        }
        this.requestHistoryRefresh(entry, 'manual_refresh', this.estimateHistoryAnchor(entry), 0);
    }
    hydrateFromCache(symbol, timeframe, candles) {
        const sym = (0, candles_2.normalizeSymbol)(symbol);
        const tf = (0, candles_2.normalizeTimeframe)(timeframe);
        if (!sym || !tf || candles.length === 0)
            return;
        const entry = this.entries.get(entryKey(sym, tf));
        if (!entry)
            return;
        const cachedSeries = asCandleParams((0, candles_2.sortAndDedupeCandles)(candles)).slice(-candles_2.MAX_CANDLE_SERIES_LENGTH);
        if (cachedSeries.length === 0 || areSeriesEqual(entry.candles, cachedSeries)) {
            return;
        }
        if (!(0, liveCandlesEnginePolicy_1.shouldAdoptCachedSeries)(entry.status, entry.historyCandles.length, entry.candles, cachedSeries)) {
            return;
        }
        entry.historyCandles = cachedSeries.slice(-candles_2.DEFAULT_CANDLE_HISTORY_LIMIT);
        entry.liveCandles = asCandleParams((0, candles_2.pruneLiveCandlesCoveredByHistory)(entry.historyCandles, entry.liveCandles));
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
                const outcome = this.applyQuoteBatch(entry, queuedQuotes);
                this.commitVisibleCandles(entry);
                if (outcome.detachedHistory) {
                    this.requestGapRefresh(entry, 'cache_seed_detached_live_stream', outcome.anchorTime);
                }
                else if (outcome.bucketRolledOver) {
                    this.schedulePostRolloverHeal(entry, outcome.anchorTime);
                }
                return;
            }
        }
        this.commitVisibleCandles(entry);
    }
    ensureEntry(symbol, timeframe) {
        const key = entryKey(symbol, timeframe);
        const existing = this.entries.get(key);
        if (existing)
            return existing;
        const entry = {
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
        quotesSocket_1.quotesWsService.connect();
        quotesSocket_1.quotesWsService.subscribe([symbol]);
        this.ensureQuoteTickListener();
        return entry;
    }
    releaseListener(key, listener) {
        const entry = this.entries.get(key);
        if (!entry)
            return;
        entry.listeners.delete(listener);
        entry.consumers = Math.max(0, entry.consumers - 1);
        if (entry.consumers === 0) {
            // Hidden chart routes should stop all live quote/candle work immediately.
            // Keeping engine entries alive after unmount leaves websocket-driven merge
            // work running in the background and eventually blocks taps/navigation.
            this.disposeEntry(key);
        }
    }
    disposeEntry(key) {
        const entry = this.entries.get(key);
        if (!entry)
            return;
        entry.fetchController?.abort();
        if (entry.flushTimeout)
            clearTimeout(entry.flushTimeout);
        if (entry.healTimer)
            clearTimeout(entry.healTimer);
        if (entry.gapRefreshTimer)
            clearTimeout(entry.gapRefreshTimer);
        if (entry.releaseTimer)
            clearTimeout(entry.releaseTimer);
        this.entries.delete(key);
        this.decrementSymbolRefCount(entry.symbol);
        if (this.entries.size === 0 && this.quoteTickListenerAttached) {
            quotesSocket_1.quotesWsService.removeTickListener(this.handleQuoteTick);
            this.quoteTickListenerAttached = false;
        }
    }
    incrementSymbolRefCount(symbol) {
        this.symbolEntryCounts.set(symbol, (this.symbolEntryCounts.get(symbol) ?? 0) + 1);
    }
    decrementSymbolRefCount(symbol) {
        const next = (this.symbolEntryCounts.get(symbol) ?? 0) - 1;
        if (next <= 0) {
            this.symbolEntryCounts.delete(symbol);
            quotesSocket_1.quotesWsService.unsubscribe([symbol]);
            return;
        }
        this.symbolEntryCounts.set(symbol, next);
    }
    ensureQuoteTickListener() {
        if (this.quoteTickListenerAttached)
            return;
        quotesSocket_1.quotesWsService.addTickListener(this.handleQuoteTick);
        this.quoteTickListenerAttached = true;
    }
    handleQuoteTick = (tick) => {
        const symbol = (0, candles_2.normalizeSymbol)(tick.symbol);
        if (!symbol || !Number.isFinite(tick.bid))
            return;
        for (const entry of this.entries.values()) {
            if (entry.symbol !== symbol)
                continue;
            const signature = `${tick.timestamp}:${tick.bid}`;
            if (signature === entry.lastQuoteSignature)
                continue;
            entry.lastQuoteSignature = signature;
            const pending = {
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
                    if ((0, liveCandlesEnginePolicy_1.shouldRenderBootstrapPreview)(entry.historyCandles.length, entry.candles.length)) {
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
    scheduleFlush(entry) {
        if (entry.flushTimeout)
            return;
        entry.flushTimeout = setTimeout(() => {
            entry.flushTimeout = null;
            if (!this.entries.has(entry.key))
                return;
            const batch = entry.pendingQuotes;
            entry.pendingQuotes = [];
            if (batch.length === 0)
                return;
            const outcome = this.applyQuoteBatch(entry, batch);
            if (outcome.changed) {
                this.commitVisibleCandles(entry);
            }
            if (entry.status !== 'ready') {
                return;
            }
            if (outcome.detachedHistory) {
                this.requestGapRefresh(entry, 'detached_live_stream', outcome.anchorTime);
            }
            else if (outcome.bucketRolledOver) {
                this.schedulePostRolloverHeal(entry, outcome.anchorTime);
            }
        }, QUOTE_BATCH_INTERVAL_MS);
    }
    drainBootstrapQuotes(entry) {
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
    applyQuoteBatch(entry, quotes) {
        let changed = false;
        let bucketRolledOver = false;
        let detachedHistory = false;
        let anchorTime = null;
        for (const quote of quotes) {
            const outcome = this.applyQuote(entry, quote);
            changed = changed || outcome.changed;
            bucketRolledOver = bucketRolledOver || outcome.bucketRolledOver;
            detachedHistory = detachedHistory || outcome.detachedHistory;
            anchorTime = outcome.anchorTime ?? anchorTime;
        }
        return { changed, bucketRolledOver, detachedHistory, anchorTime };
    }
    applyQuote(entry, quote) {
        const baseTail = this.getBaseTail(entry);
        const quoteTimeInSeconds = (0, candles_2.normalizeTimestampToSeconds)(quote.timestamp);
        if (quoteTimeInSeconds === null) {
            return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: null };
        }
        const bucketTime = baseTail
            ? (0, candles_2.alignTimeToBucketWithReference)(quoteTimeInSeconds, entry.timeframe, baseTail.time)
            : (0, candles_2.alignTimeToBucket)(quoteTimeInSeconds, entry.timeframe);
        const currentLiveTail = this.getLiveTail(entry);
        const liveByTime = entry.liveCandles.find((candle) => candle.time === bucketTime) ?? null;
        if (!baseTail) {
            entry.liveCandles = [createLiveCandle(bucketTime, quote.price, quote.price, 1)];
            return { changed: true, bucketRolledOver: true, detachedHistory: true, anchorTime: bucketTime };
        }
        if (liveByTime) {
            const merged = (0, candles_2.mergeCandleUpdate)(liveByTime, {
                time: bucketTime,
                open: liveByTime.open,
                high: Math.max(liveByTime.high, quote.price),
                low: Math.min(liveByTime.low, quote.price),
                close: quote.price,
                volume: Math.max(liveByTime.volume + 1, 1),
            });
            if (!merged || areCandlesEqual(merged, liveByTime)) {
                return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
            }
            this.upsertLiveCandle(entry, merged);
            return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
        }
        if (bucketTime < baseTail.time) {
            const matchingHistory = entry.historyCandles.find((candle) => candle.time === bucketTime);
            if (!matchingHistory) {
                this.requestGapRefresh(entry, 'late_tick_missing_history_bucket', baseTail.time);
                return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: baseTail.time };
            }
            const overlayBase = matchingHistory;
            const merged = (0, candles_2.mergeCandleUpdate)(overlayBase, {
                time: bucketTime,
                open: overlayBase.open,
                high: Math.max(overlayBase.high, quote.price),
                low: Math.min(overlayBase.low, quote.price),
                close: quote.price,
                volume: Math.max(overlayBase.volume + 1, 1),
            });
            if (!merged) {
                return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
            }
            this.upsertLiveCandle(entry, merged);
            return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
        }
        if (bucketTime === baseTail.time) {
            const overlayBase = currentLiveTail?.time === bucketTime ? currentLiveTail : baseTail;
            const merged = (0, candles_2.mergeCandleUpdate)(overlayBase, {
                time: bucketTime,
                open: overlayBase.open,
                high: Math.max(overlayBase.high, quote.price),
                low: Math.min(overlayBase.low, quote.price),
                close: quote.price,
                volume: Math.max(overlayBase.volume + 1, 1),
            });
            if (!merged || areCandlesEqual(merged, overlayBase)) {
                return { changed: false, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
            }
            this.upsertLiveCandle(entry, merged);
            return { changed: true, bucketRolledOver: false, detachedHistory: false, anchorTime: bucketTime };
        }
        const expectedNextTime = (0, candles_2.getExpectedNextCandleTime)(baseTail.time, entry.timeframe);
        if (bucketTime === expectedNextTime) {
            const nextCandle = createLiveCandle(bucketTime, baseTail.close, quote.price, 1);
            this.upsertLiveCandle(entry, nextCandle);
            return { changed: true, bucketRolledOver: true, detachedHistory: false, anchorTime: bucketTime };
        }
        entry.liveCandles = [createLiveCandle(bucketTime, quote.price, quote.price, 1)];
        return { changed: true, bucketRolledOver: true, detachedHistory: true, anchorTime: bucketTime };
    }
    upsertLiveCandle(entry, candle) {
        const next = entry.liveCandles.slice();
        const existingIndex = next.findIndex((item) => item.time === candle.time);
        if (existingIndex === -1) {
            next.push(candle);
        }
        else {
            next[existingIndex] = candle;
        }
        entry.liveCandles = asCandleParams((0, candles_2.sortAndDedupeCandles)(next)).slice(-candles_2.MAX_CANDLE_SERIES_LENGTH);
    }
    getBaseTail(entry) {
        return this.getLiveTail(entry) ?? this.getHistoryTail(entry);
    }
    getHistoryTail(entry) {
        return entry.historyCandles[entry.historyCandles.length - 1] ?? null;
    }
    getLiveTail(entry) {
        return entry.liveCandles[entry.liveCandles.length - 1] ?? null;
    }
    commitVisibleCandles(entry) {
        const visibleSeriesMode = (0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)(entry.historyCandles, entry.liveCandles, entry.candles, entry.timeframe);
        const nextVisible = visibleSeriesMode === 'merged'
            ? asCandleParams((0, candles_2.materializeCanonicalHistoryAndLiveCandles)(entry.historyCandles, entry.liveCandles, entry.timeframe))
            : visibleSeriesMode === 'history'
                ? entry.historyCandles.slice(-candles_2.MAX_CANDLE_SERIES_LENGTH)
                : visibleSeriesMode === 'current'
                    ? (0, liveCandlesEnginePolicy_1.resolveCurrentVisibleSeries)(entry.historyCandles, entry.liveCandles, entry.candles).slice(-candles_2.MAX_CANDLE_SERIES_LENGTH)
                    : [];
        const cacheChanged = (0, candleCache_1.syncMergedCandleCache)(entry.symbol, entry.timeframe, nextVisible, {
            canonical: true,
        });
        if (areSeriesEqual(entry.candles, nextVisible)) {
            if (cacheChanged) {
                entry.candles = nextVisible;
            }
            return;
        }
        entry.candles = nextVisible;
        this.notify(entry);
    }
    notify(entry) {
        entry.listeners.forEach((listener) => {
            try {
                listener();
            }
            catch (error) {
                console.warn('[liveCandlesEngine] listener threw', error);
            }
        });
    }
    isEntryStale(entry) {
        const last = entry.candles[entry.candles.length - 1];
        if (!last)
            return true;
        const now = Math.floor(Date.now() / 1000);
        let bucketCursor = last.time;
        for (let index = 0; index < RECENT_HISTORY_ANCHOR_SAFETY_BUCKETS; index += 1) {
            bucketCursor = (0, candles_2.getExpectedNextCandleTime)(bucketCursor, entry.timeframe);
        }
        return now > bucketCursor;
    }
    estimateHistoryAnchor(entry) {
        const now = Math.floor(Date.now() / 1000);
        const latestKnownTime = this.getLiveTail(entry)?.time ??
            this.getHistoryTail(entry)?.time ??
            now;
        return (0, candles_2.getExpectedNextCandleTime)(Math.max(latestKnownTime, now), entry.timeframe);
    }
    buildHistoryRequestOptions(entry, signal, anchorTo) {
        const now = Math.floor(Date.now() / 1000);
        const to = (0, candles_2.getExpectedNextCandleTime)(Math.max(anchorTo ?? 0, now), entry.timeframe);
        return { signal, to };
    }
    bootstrapHistory(entry) {
        if (!this.entries.has(entry.key))
            return;
        entry.status = 'bootstrapping';
        entry.queuedQuotes = [];
        entry.pendingQuotes = [];
        this.loadHistory(entry, { reason: 'bootstrap', bootstrap: true, anchorTo: this.estimateHistoryAnchor(entry) });
    }
    requestGapRefresh(entry, reason, anchorTime) {
        if (!this.entries.has(entry.key))
            return;
        if (entry.gapRefreshTimer)
            return;
        const delay = Math.max(0, GAP_RESYNC_THROTTLE_MS - (Date.now() - entry.lastGapRefreshAt));
        entry.gapRefreshTimer = setTimeout(() => {
            entry.gapRefreshTimer = null;
            if (!this.entries.has(entry.key))
                return;
            entry.lastGapRefreshAt = Date.now();
            this.loadHistory(entry, {
                reason,
                bootstrap: false,
                anchorTo: anchorTime ?? this.estimateHistoryAnchor(entry),
            });
        }, delay);
    }
    requestHistoryRefresh(entry, reason, anchorTo, delayMs = POST_ROLLOVER_HEAL_DELAY_MS) {
        if (!this.entries.has(entry.key))
            return;
        if (entry.healTimer) {
            clearTimeout(entry.healTimer);
        }
        entry.healTimer = setTimeout(() => {
            entry.healTimer = null;
            if (!this.entries.has(entry.key))
                return;
            this.loadHistory(entry, {
                reason,
                bootstrap: false,
                anchorTo,
            });
        }, delayMs);
    }
    schedulePostRolloverHeal(entry, anchorTime) {
        this.requestHistoryRefresh(entry, 'post_rollover_heal', anchorTime ?? this.estimateHistoryAnchor(entry));
    }
    scheduleBootstrapRetry(entry, delayMs = BOOTSTRAP_RETRY_DELAY_MS) {
        if (!this.entries.has(entry.key))
            return;
        if (entry.healTimer) {
            clearTimeout(entry.healTimer);
        }
        entry.healTimer = setTimeout(() => {
            entry.healTimer = null;
            if (!this.entries.has(entry.key))
                return;
            this.loadHistory(entry, {
                reason: 'bootstrap_retry',
                bootstrap: true,
                anchorTo: this.estimateHistoryAnchor(entry),
            });
        }, delayMs);
    }
    loadHistory(entry, options) {
        const tracked = this.entries.get(entry.key);
        if (!tracked)
            return;
        tracked.fetchEpoch += 1;
        const epoch = tracked.fetchEpoch;
        tracked.fetchController?.abort();
        const controller = new AbortController();
        tracked.fetchController = controller;
        const requestOptions = this.buildHistoryRequestOptions(tracked, controller.signal, options.anchorTo);
        void (0, candles_1.getCandleHistory)(tracked.symbol, tracked.timeframe, candles_2.DEFAULT_CANDLE_HISTORY_LIMIT, requestOptions)
            .then((history) => {
            const live = this.entries.get(tracked.key);
            if (!live || live.fetchEpoch !== epoch)
                return;
            live.historyCandles = asCandleParams((0, candles_2.sortAndDedupeCandles)(history.candles)).slice(-candles_2.DEFAULT_CANDLE_HISTORY_LIMIT);
            if (options.bootstrap) {
                const queued = this.drainBootstrapQuotes(live);
                live.status = 'ready';
                if (queued.length > 0) {
                    const outcome = this.applyQuoteBatch(live, queued);
                    this.commitVisibleCandles(live);
                    if (outcome.detachedHistory) {
                        this.requestGapRefresh(live, 'bootstrap_detached_live_stream', outcome.anchorTime);
                    }
                    else if (outcome.bucketRolledOver) {
                        this.schedulePostRolloverHeal(live, outcome.anchorTime);
                    }
                    return;
                }
                this.commitVisibleCandles(live);
                return;
            }
            live.liveCandles = asCandleParams((0, candles_2.pruneLiveCandlesCoveredByHistory)(live.historyCandles, live.liveCandles));
            live.status = 'ready';
            this.commitVisibleCandles(live);
        })
            .catch((error) => {
            const live = this.entries.get(tracked.key);
            if (!live || live.fetchEpoch !== epoch)
                return;
            if (error instanceof Error && error.name === 'AbortError')
                return;
            console.warn(`[liveCandlesEngine] history fetch failed for ${tracked.symbol} ${tracked.timeframe}:`, error instanceof Error ? error.message : String(error));
            if (options.bootstrap &&
                (0, liveCandlesEnginePolicy_1.shouldKeepBootstrappingOnHistoryFailure)(live.historyCandles.length, live.candles.length)) {
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
exports.liveCandlesEngine = new LiveCandlesEngine();
