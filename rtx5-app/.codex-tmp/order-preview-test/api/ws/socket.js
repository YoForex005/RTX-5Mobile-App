"use strict";
/**
 * Core module: socket.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsService = exports.WebSocketService = void 0;
const tradingState_1 = require("../../state/tradingState");
const candleCache_1 = require("../../state/candleCache");
const netinfo_1 = __importDefault(require("@react-native-community/netinfo"));
/**
 * (Legacy) General purpose WebSocket service that manages multi-channel subscriptions.
 * Modern implementations have split into dedicated high-throughput services
 * (QuotesWebSocketService, CandlesWebSocketService, etc.).
 */
class WebSocketService {
    static instance;
    ws = null;
    url = process.env.EXPO_PUBLIC_WS_URL || 'wss://backend.orrnn.com/ws';
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    reconnectDelay = 2000;
    isConnected = false;
    netInfoUnsubscribe = null;
    // Track active subscriptions so we can resubscribe on reconnect
    activeSubscriptions = new Set();
    constructor() { }
    static getInstance() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }
    getConnectionStatus() {
        return this.isConnected;
    }
    /**
     * Dispatches the initial connection sequence and restores active channels if reconnecting.
     */
    connect() {
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
            return; // Already connecting or connected
        }
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => {
                console.log('[WebSocket] Connected to', this.url);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                // Re-establish active subscriptions if this is a reconnect
                this.activeSubscriptions.forEach(channel => {
                    this.send({ type: 'subscribe', channel });
                });
            };
            this.ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    this.handleMessage(payload);
                }
                catch (e) {
                    console.warn('[WebSocket] Error parsing message', e);
                }
            };
            this.ws.onclose = () => {
                console.log('[WebSocket] Connection closed');
                this.isConnected = false;
                this.ws = null;
                this.attemptReconnect();
            };
            this.ws.onerror = (error) => {
                console.error('[WebSocket] Error', error);
            };
        }
        catch (e) {
            console.error('[WebSocket] Connection failed', e);
            this.attemptReconnect();
        }
    }
    /**
     * Gracefully tears down the connection and clears all active subscription state locally.
     */
    disconnect() {
        if (this.ws) {
            this.activeSubscriptions.clear();
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }
    subscribe(channel) {
        if (!this.activeSubscriptions.has(channel)) {
            this.activeSubscriptions.add(channel);
            if (this.isConnected) {
                this.send({ type: 'subscribe', channel });
            }
        }
    }
    unsubscribe(channel) {
        if (this.activeSubscriptions.has(channel)) {
            this.activeSubscriptions.delete(channel);
            if (this.isConnected) {
                this.send({ type: 'unsubscribe', channel });
            }
        }
    }
    /**
     * Request historical candle data via WebSocket.
     * The server responds asynchronously with a `candle_history` message routed to the store.
     *
     * @param symbol - The symbol (e.g. 'EURUSD')
     * @param timeframe - The timeframe period (e.g. 'H1')
     * @param count - The number of historical bars to request (default: 200)
     */
    requestCandleHistory(symbol, timeframe, count = 200) {
        this.send({
            type: 'get_candle_history',
            symbol,
            timeframe,
            count,
        });
    }
    send(msg) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocket] Max reconnect attempts reached.');
            return;
        }
        netinfo_1.default.fetch().then((state) => {
            if (state.isConnected === false) {
                console.log('[WebSocket] Network offline. Pausing reconnect attempts.');
                if (!this.netInfoUnsubscribe) {
                    this.netInfoUnsubscribe = netinfo_1.default.addEventListener(newState => {
                        if (newState.isConnected) {
                            console.log('[WebSocket] Network restored. Resuming connection...');
                            if (this.netInfoUnsubscribe) {
                                this.netInfoUnsubscribe();
                                this.netInfoUnsubscribe = null;
                            }
                            this.connect();
                        }
                    });
                }
                return;
            }
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
            console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => this.connect(), delay);
        });
    }
    // ─── Message Routing ────────────────────────────────────────────────────────
    handleMessage(payload) {
        const { type, channel, data } = payload;
        const store = tradingState_1.useTradingState.getState();
        if (type === 'channel_message') {
            // 1. Live Prices
            if (channel === 'prices' || channel.startsWith('quotes.')) {
                if (data.symbol && data.bid && data.ask) {
                    store.setQuote(data.symbol, {
                        bid: data.bid,
                        ask: data.ask
                    });
                }
            }
            // 2. Account Updates
            if (channel.startsWith('account.')) {
                store.setAccount(data);
            }
            // 3. Live Candle Tick
            if (channel.startsWith('candles.')) {
                if (data.symbol && data.timeframe && data.candle) {
                    store.updateCandle(data.symbol, data.timeframe, data.candle);
                }
            }
        }
        // 4. Candle History (bulk response)
        if (type === 'candle_history') {
            if (data.symbol && data.timeframe && data.candles) {
                (0, candleCache_1.mergeHistoryIntoCandleCache)(data.symbol, data.timeframe, data.candles);
            }
        }
    }
}
exports.WebSocketService = WebSocketService;
// Export a singleton instance
exports.wsService = WebSocketService.getInstance();
