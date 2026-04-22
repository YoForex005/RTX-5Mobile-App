"use strict";
/**
 * Core module: quotesSocket.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotesWsService = exports.QuotesWebSocketService = void 0;
const tradingState_1 = require("../../state/tradingState");
const react_native_1 = require("react-native");
const netinfo_1 = __importDefault(require("@react-native-community/netinfo"));
const tradingData_1 = require("../../mock/tradingData");
const uiInteractionDiagnostics_1 = require("../../dev/uiInteractionDiagnostics");
const quoteSubscriptionState_1 = require("./quoteSubscriptionState");
const quoteTimestamp_1 = require("./quoteTimestamp");
const symbolSpecs = new Map(tradingData_1.quotes.map((q) => [q.symbol, q]));
/**
 * High-frequency WebSocket service delivering minimal-latency Bid/Ask quote ticks.
 * Syncs directly into a Zustand store, aggregating batches via requestAnimationFrame for performance.
 */
class QuotesWebSocketService {
    static instance;
    ws = null;
    url = process.env.EXPO_PUBLIC_QUOTES_WS_URL || 'wss://backend.orrnn.com/ws/feed';
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    reconnectDelay = 2000;
    reconnectCooldownMs = 60000;
    isConnected = false;
    shouldReconnect = false;
    activeSymbols = new Set();
    stickySymbols = new Set();
    symbolConsumerCounts = new Map();
    pendingUpdates = new Map();
    flushScheduled = false;
    flushAnimationFrame = null;
    flushTimer = null;
    heartbeatInterval = null;
    appStateSubscription = null;
    reconnectTimer = null;
    netInfoUnsubscribe = null;
    lastMessageAt = Date.now();
    lastRecordedFeedGapAt = 0;
    watchdogInterval = null;
    tickListeners = new Set();
    constructor() {
        this.appStateSubscription = react_native_1.AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active' && this.shouldReconnect && this.hasActiveDemand()) {
                console.log('[Quotes WS] App wake up detected. Reconnecting feed...');
                this.triggerInvisibleReconnect();
            }
        });
    }
    triggerInvisibleReconnect() {
        if (!this.shouldReconnect || !this.hasActiveDemand()) {
            return;
        }
        this.clearReconnectTimer();
        this.clearNetInfoListener();
        this.reconnectAttempts = 0;
        this.teardownSocket();
        this.scheduleReconnect(500);
    }
    static getInstance() {
        if (!QuotesWebSocketService.instance) {
            QuotesWebSocketService.instance = new QuotesWebSocketService();
        }
        return QuotesWebSocketService.instance;
    }
    getConnectionStatus() {
        return this.isConnected;
    }
    addTickListener(listener) {
        this.tickListeners.add(listener);
    }
    removeTickListener(listener) {
        this.tickListeners.delete(listener);
    }
    /**
     * Dispatches the initial connection sequence and applies auto-reconnect logic.
     */
    connect() {
        if (!this.hasActiveDemand()) {
            this.shouldReconnect = false;
            return;
        }
        this.shouldReconnect = true;
        this.clearReconnectTimer();
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
            return;
        }
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => {
                console.log('[Quotes WS] Connected to', this.url);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.lastMessageAt = Date.now();
                this.clearNetInfoListener();
                this.startHeartbeat();
                this.startWatchdog();
                if (this.activeSymbols.size > 0) {
                    this.sendSubscription();
                }
            };
            this.ws.onmessage = (event) => {
                try {
                    const now = Date.now();
                    const feedGapMs = now - this.lastMessageAt;
                    this.lastMessageAt = now;
                    this.recordFeedGapIfNeeded(feedGapMs);
                    const payload = JSON.parse(event.data);
                    this.applyPayload(payload);
                }
                catch (e) {
                    console.warn('[Quotes WS] Parse error', e);
                }
            };
            this.ws.onclose = () => {
                console.log('[Quotes WS] Closed');
                this.teardownSocket(false);
                this.attemptReconnect();
            };
            this.ws.onerror = (error) => {
                console.warn('[Quotes WS] Connection error (will auto-reconnect)');
            };
        }
        catch (e) {
            console.warn('[Quotes WS] Connection failed during initialization. Will retry.', e);
            this.teardownSocket();
            this.attemptReconnect();
        }
    }
    disconnect() {
        this.shouldReconnect = false;
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.clearNetInfoListener();
        this.activeSymbols.clear();
        this.stickySymbols.clear();
        this.symbolConsumerCounts.clear();
        this.teardownSocket();
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 15000);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    startWatchdog() {
        this.stopWatchdog();
        this.watchdogInterval = setInterval(() => {
            if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN)
                return;
            if (this.activeSymbols.size === 0)
                return;
            const staleFor = Date.now() - this.lastMessageAt;
            if (staleFor > 35000) {
                console.warn(`[Quotes WS] Silent TCP drop detected (${Math.round(staleFor / 1000)}s). Healing invisibly...`);
                this.triggerInvisibleReconnect();
            }
        }, 10000);
    }
    stopWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }
    recordFeedGapIfNeeded(feedGapMs) {
        if (this.activeSymbols.size === 0) {
            return;
        }
        if (feedGapMs < 1_200) {
            return;
        }
        const now = Date.now();
        if (now - this.lastRecordedFeedGapAt < 5_000) {
            return;
        }
        this.lastRecordedFeedGapAt = now;
        (0, uiInteractionDiagnostics_1.recordUiFeedGap)('quotes.ws.gap', feedGapMs, `${this.activeSymbols.size} active symbol(s)`);
    }
    /**
     * Subscribes to tick updates for a batch of symbols.
     * Does not overwrite existing active symbols.
     * @param symbols - Array of strings (e.g., ['EURUSD', 'BTCUSD'])
     */
    subscribe(symbols) {
        this.symbolConsumerCounts = (0, quoteSubscriptionState_1.applyQuoteSubscriptionDelta)(this.symbolConsumerCounts, symbols, 1);
        this.syncActiveSymbols();
    }
    unsubscribe(symbols) {
        this.symbolConsumerCounts = (0, quoteSubscriptionState_1.applyQuoteSubscriptionDelta)(this.symbolConsumerCounts, symbols, -1);
        this.syncActiveSymbols();
    }
    /**
     * Exact override for the active symbol subscription list.
     * Triggers an immediate diff sync over the active socket.
     */
    setSubscriptions(symbols) {
        this.stickySymbols = new Set(symbols);
        this.syncActiveSymbols();
    }
    sendSubscription() {
        const syms = Array.from(this.activeSymbols);
        if (syms.length > 0)
            this.send({ type: 'subscribe', symbols: syms });
    }
    syncActiveSymbols() {
        const nextActiveSymbols = new Set((0, quoteSubscriptionState_1.buildActiveQuoteSymbols)(this.stickySymbols, this.symbolConsumerCounts));
        const changed = nextActiveSymbols.size !== this.activeSymbols.size ||
            Array.from(nextActiveSymbols).some((symbol) => !this.activeSymbols.has(symbol));
        if (!changed) {
            return;
        }
        this.activeSymbols = nextActiveSymbols;
        if (this.activeSymbols.size === 0) {
            this.shouldReconnect = false;
            this.reconnectAttempts = 0;
            this.clearReconnectTimer();
            this.clearNetInfoListener();
            this.teardownSocket();
            return;
        }
        if (this.isConnected) {
            this.sendSubscription();
            return;
        }
        this.connect();
    }
    send(msg) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    attemptReconnect() {
        if (!this.shouldReconnect || !this.hasActiveDemand() || this.reconnectTimer) {
            return;
        }
        netinfo_1.default.fetch()
            .then((state) => {
            if (!this.shouldReconnect || !this.hasActiveDemand()) {
                return;
            }
            if (state.isConnected === false) {
                console.log('[Quotes WS] Network offline. Pausing reconnect attempts.');
                if (!this.netInfoUnsubscribe) {
                    this.netInfoUnsubscribe = netinfo_1.default.addEventListener((nextState) => {
                        if (nextState.isConnected && this.shouldReconnect && this.hasActiveDemand()) {
                            console.log('[Quotes WS] Network restored. Resuming connection...');
                            this.clearNetInfoListener();
                            this.reconnectAttempts = 0;
                            this.connect();
                        }
                    });
                }
                return;
            }
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.warn(`[Quotes WS] Reconnect budget exhausted. Cooling down for ${Math.round(this.reconnectCooldownMs / 1000)}s before retrying.`);
                this.reconnectAttempts = 0;
                this.scheduleReconnect(this.reconnectCooldownMs);
                return;
            }
            this.reconnectAttempts += 1;
            const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 45000);
            console.log(`[Quotes WS] Reconnecting in ${Math.round(delay)}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.scheduleReconnect(delay);
        })
            .catch(() => {
            if (!this.shouldReconnect || !this.hasActiveDemand()) {
                return;
            }
            const fallbackDelay = Math.min(this.reconnectDelay * Math.pow(1.5, Math.max(this.reconnectAttempts, 1) - 1), 15000);
            console.warn(`[Quotes WS] Network status check failed. Retrying in ${Math.round(fallbackDelay)}ms.`);
            this.scheduleReconnect(fallbackDelay);
        });
    }
    hasActiveDemand() {
        return this.activeSymbols.size > 0;
    }
    scheduleReconnect(delayMs) {
        if (!this.shouldReconnect || !this.hasActiveDemand() || this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delayMs);
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    clearNetInfoListener() {
        if (this.netInfoUnsubscribe) {
            this.netInfoUnsubscribe();
            this.netInfoUnsubscribe = null;
        }
    }
    teardownSocket(resetDemand = false) {
        const currentSocket = this.ws;
        this.stopHeartbeat();
        this.stopWatchdog();
        this.cancelFlush();
        this.isConnected = false;
        this.ws = null;
        if (currentSocket) {
            currentSocket.onopen = null;
            currentSocket.onmessage = null;
            currentSocket.onerror = null;
            currentSocket.onclose = null;
            try {
                currentSocket.close();
            }
            catch (error) {
                console.warn('[Quotes WS] Socket close failed', error);
            }
        }
        if (resetDemand) {
            this.activeSymbols.clear();
            this.stickySymbols.clear();
            this.symbolConsumerCounts.clear();
        }
    }
    // ─── Tick Processing ─────────────────────────────────────────────────────────
    applyPayload(payload) {
        let hasUpdates = false;
        if (Array.isArray(payload)) {
            payload.forEach((d) => {
                if (this.applyTick(d))
                    hasUpdates = true;
            });
        }
        else if (payload.symbol && payload.bid != null && payload.ask != null) {
            if (this.applyTick(payload))
                hasUpdates = true;
        }
        else if (payload.data && Array.isArray(payload.data)) {
            payload.data.forEach((d) => {
                if (this.applyTick(d))
                    hasUpdates = true;
            });
        }
        if (hasUpdates) {
            this.scheduleFlush();
        }
    }
    applyTick(data) {
        if (!data.symbol || data.bid == null || data.ask == null)
            return false;
        const normalizedTimestamp = (0, quoteTimestamp_1.resolveQuoteTickTimestamp)(data);
        data = {
            ...data,
            time: normalizedTimestamp,
            timestamp: normalizedTimestamp,
            t: normalizedTimestamp,
        };
        this.emitTick({
            symbol: String(data.symbol),
            bid: data.bid,
            ask: data.ask,
            timestamp: normalizedTimestamp,
        });
        // Preserve intra-flush wick extremes. When several ticks arrive within
        // the same event-loop turn, naively overwriting the pending entry would
        // discard any spike high or dip low, leaving the candle wick incomplete.
        // We carry forward bidHigh / bidLow so the candle engine can replay the
        // extremes and grow the wick on both sides before settling on the close.
        const existing = this.pendingUpdates.get(data.symbol);
        if (existing) {
            const prevHigh = typeof existing.bidHigh === 'number' ? existing.bidHigh : existing.bid;
            const prevLow = typeof existing.bidLow === 'number' ? existing.bidLow : existing.bid;
            data = {
                ...data,
                bidHigh: Math.max(prevHigh, data.bid),
                bidLow: Math.min(prevLow, data.bid),
            };
        }
        else {
            data = { ...data, bidHigh: data.bid, bidLow: data.bid };
        }
        this.pendingUpdates.set(data.symbol, data);
        return true;
    }
    emitTick(tick) {
        this.tickListeners.forEach((listener) => {
            try {
                listener(tick);
            }
            catch (error) {
                console.warn('[Quotes WS] Tick listener error', error);
            }
        });
    }
    scheduleFlush() {
        if (this.flushScheduled) {
            return;
        }
        // UI consumers do not need every inbound socket message to force a React
        // render immediately. The canonical candle engine already receives ticks
        // synchronously via `emitTick()`, so the store/UI path can safely coalesce
        // to the next visual frame and avoid saturating the JS thread.
        this.flushScheduled = true;
        const commitFlush = () => {
            this.flushAnimationFrame = null;
            if (this.flushTimer) {
                clearTimeout(this.flushTimer);
                this.flushTimer = null;
            }
            this.flushScheduled = false;
            this.flushUpdates();
        };
        if (typeof requestAnimationFrame === 'function') {
            this.flushAnimationFrame = requestAnimationFrame(() => {
                commitFlush();
            });
            return;
        }
        this.flushTimer = setTimeout(() => {
            commitFlush();
        }, 16);
    }
    cancelFlush() {
        if (this.flushAnimationFrame !== null) {
            cancelAnimationFrame(this.flushAnimationFrame);
            this.flushAnimationFrame = null;
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.flushScheduled = false;
        this.pendingUpdates.clear();
    }
    flushUpdates() {
        if (this.pendingUpdates.size === 0)
            return;
        const updates = this.pendingUpdates;
        this.pendingUpdates = new Map();
        const now = Date.now();
        tradingState_1.useTradingState.setState((state) => {
            const newQuotes = { ...state.quotes };
            updates.forEach((data, symbol) => {
                const bid = data.bid;
                const ask = data.ask;
                const existing = newQuotes[symbol];
                const spec = symbolSpecs.get(symbol);
                if (!existing) {
                    const digits = data.digits ?? spec?.digits ?? 5;
                    const volume = data.volume ?? spec?.volume ?? 0;
                    const entry = { symbol, digits, volume, lastTickAt: now, bid, ask };
                    // Copy spec defaults then server data in one pass
                    if (spec) {
                        const s = spec;
                        for (const k in s) {
                            if (entry[k] === undefined)
                                entry[k] = s[k];
                        }
                    }
                    for (const k in data) {
                        if (k !== 'symbol')
                            entry[k] = data[k];
                    }
                    entry.lastTickAt = now;
                    entry.spread = (ask - bid) * Math.pow(10, digits);
                    newQuotes[symbol] = entry;
                }
                else {
                    const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
                    const volume = data.volume ?? (existing.volume ? existing.volume + (Math.floor(Math.random() * 8) + 1) : (spec?.volume ?? 0));
                    // Single object creation — merge existing + server data in one allocation
                    const updated = {};
                    // Copy existing (cheapest — already has spec baked in from first tick)
                    for (const k in existing) {
                        updated[k] = existing[k];
                    }
                    // Overlay server-sent fields
                    for (const k in data) {
                        updated[k] = data[k];
                    }
                    // Override computed fields
                    updated.symbol = symbol;
                    updated.bid = bid;
                    updated.ask = ask;
                    updated.digits = digits;
                    updated.volume = volume;
                    updated.lastTickAt = now;
                    updated.spread = (ask - bid) * Math.pow(10, digits);
                    updated.prevBid = bid !== existing.bid ? existing.bid : existing.prevBid;
                    updated.prevAsk = ask !== existing.ask ? existing.ask : existing.prevAsk;
                    newQuotes[symbol] = updated;
                }
            });
            return { quotes: newQuotes, tickCount: state.tickCount + 1 };
        });
    }
}
exports.QuotesWebSocketService = QuotesWebSocketService;
exports.quotesWsService = QuotesWebSocketService.getInstance();
