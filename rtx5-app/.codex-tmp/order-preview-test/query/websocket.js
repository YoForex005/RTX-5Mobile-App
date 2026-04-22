"use strict";
/**
 * Core module: websocket.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWebSocketConnection = useWebSocketConnection;
exports.useMarketData = useMarketData;
exports.useLiveSymbolQuote = useLiveSymbolQuote;
exports.useLiveAccount = useLiveAccount;
exports.useCandleStream = useCandleStream;
const react_1 = __importStar(require("react"));
const shallow_1 = require("zustand/shallow");
const socket_1 = require("../api/ws/socket");
const quotesSocket_1 = require("../api/ws/quotesSocket");
const tradingState_1 = require("../state/tradingState");
const candleCache_1 = require("../state/candleCache");
const tradingData_1 = require("../mock/tradingData");
const symbols_1 = require("../domain/symbols");
// ─── WebSocket Global Connection Hook ───────────────────────────────────────
/**
 * Initializes and manages the global WebSocket connection.
 * Mount this in a top-level provider (e.g., _layout.tsx) so the WS connection
 * persists across screens.
 */
function useWebSocketConnection() {
    (0, react_1.useEffect)(() => {
        // Attempt connection on mount
        socket_1.wsService.connect();
        // Clean up on unmount
        return () => {
            socket_1.wsService.disconnect();
        };
    }, []);
    return { connected: socket_1.wsService.getConnectionStatus() };
}
// ─── Component Data Hooks (TanStack Query + Zustand) ────────────────────────
/**
 * Hook to subscribe to live price ticks for a specific array of symbols.
 *
 * NOTE ON ARCHITECTURE:
 * We use `useEffect` to tell the WebSocketService to subscribe.
 * The WebSocketService independently dispatches ticks directly to `useTradingState`.
 * We return the `useTradingState` selector so the component only re-renders
 * when the specific symbols it cares about update.
 */
function useMarketData(symbols = []) {
    const symbolsKey = JSON.stringify(symbols);
    const normalizedSymbols = react_1.default.useMemo(() => Array.from(new Set(symbols.map((symbol) => (0, symbols_1.normalizeSymbol)(symbol)).filter(Boolean))), [symbolsKey]);
    // Selector that picks ONLY the quotes this component cares about.
    // Zustand + shallow comparison ensures we only re-render when one of
    // OUR symbols changes — not when an unrelated symbol ticks.
    // This is the key optimization: a QuoteDetails page watching EURUSD
    // no longer re-renders when BTCUSD ticks.
    const stableKey = JSON.stringify(normalizedSymbols);
    const selector = (0, react_1.useCallback)((state) => {
        if (normalizedSymbols.length === 0)
            return state.quotes;
        const result = {};
        for (const sym of normalizedSymbols) {
            if (state.quotes[sym])
                result[sym] = state.quotes[sym];
        }
        return result;
    }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey]);
    const liveQuotes = (0, tradingState_1.useTradingState)((0, shallow_1.useShallow)(selector));
    (0, react_1.useEffect)(() => {
        if (normalizedSymbols.length === 0)
            return;
        quotesSocket_1.quotesWsService.connect();
        quotesSocket_1.quotesWsService.subscribe(normalizedSymbols);
        return () => {
            quotesSocket_1.quotesWsService.unsubscribe(normalizedSymbols);
        };
    }, [stableKey]);
    if (symbols.length === 0)
        return liveQuotes;
    return symbols.reduce((acc, sym) => {
        const normalizedSymbol = (0, symbols_1.normalizeSymbol)(sym);
        const mock = tradingData_1.quotes.find((m) => (0, symbols_1.normalizeSymbol)(m.symbol) === normalizedSymbol);
        const live = liveQuotes[sym] || liveQuotes[normalizedSymbol];
        if (live || mock) {
            acc[sym] = { ...(mock || {}), ...(live || {}), symbol: normalizedSymbol };
        }
        return acc;
    }, {});
}
function resolveMergedQuoteSnapshot(requestedSymbol, liveQuote) {
    const normalizedSymbol = (0, symbols_1.normalizeSymbol)(requestedSymbol);
    if (!normalizedSymbol) {
        return undefined;
    }
    const mock = tradingData_1.quotes.find((entry) => (0, symbols_1.normalizeSymbol)(entry.symbol) === normalizedSymbol);
    if (!mock && !liveQuote) {
        return undefined;
    }
    return {
        ...(mock || {}),
        ...(liveQuote || {}),
        symbol: normalizedSymbol,
    };
}
const areQuoteSnapshotsEqual = (left, right) => {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return !left && !right;
    }
    return (left.symbol === right.symbol &&
        left.bid === right.bid &&
        left.ask === right.ask &&
        left.digits === right.digits &&
        left.lastTickAt === right.lastTickAt &&
        left.spread === right.spread &&
        left.volume === right.volume &&
        left.changePct === right.changePct);
};
const mergeQuoteTickIntoSnapshot = (requestedSymbol, currentSnapshot, tick) => {
    const normalizedSymbol = (0, symbols_1.normalizeSymbol)(requestedSymbol);
    if (!normalizedSymbol) {
        return undefined;
    }
    const digits = typeof currentSnapshot?.digits === 'number' && Number.isFinite(currentSnapshot.digits)
        ? currentSnapshot.digits
        : undefined;
    return resolveMergedQuoteSnapshot(requestedSymbol, {
        ...(currentSnapshot || {}),
        symbol: normalizedSymbol,
        bid: tick.bid,
        ask: tick.ask,
        lastTickAt: tick.timestamp,
        spread: digits !== undefined
            ? (tick.ask - tick.bid) * Math.pow(10, digits)
            : currentSnapshot?.spread,
    });
};
function useLiveSymbolQuote(symbol) {
    const normalizedSymbol = react_1.default.useMemo(() => (0, symbols_1.normalizeSymbol)(symbol), [symbol]);
    const seedQuote = react_1.default.useMemo(() => resolveMergedQuoteSnapshot(symbol, normalizedSymbol ? tradingState_1.useTradingState.getState().quotes[normalizedSymbol] : undefined), [normalizedSymbol, symbol]);
    const [liveQuote, setLiveQuote] = react_1.default.useState(seedQuote);
    const liveQuoteRef = react_1.default.useRef(seedQuote);
    const quoteCommitAnimationFrameRef = react_1.default.useRef(null);
    const quoteCommitTimerRef = react_1.default.useRef(null);
    const cancelScheduledCommit = react_1.default.useCallback(() => {
        if (quoteCommitAnimationFrameRef.current !== null) {
            cancelAnimationFrame(quoteCommitAnimationFrameRef.current);
            quoteCommitAnimationFrameRef.current = null;
        }
        if (quoteCommitTimerRef.current) {
            clearTimeout(quoteCommitTimerRef.current);
            quoteCommitTimerRef.current = null;
        }
    }, []);
    const scheduleQuoteCommit = react_1.default.useCallback(() => {
        if (quoteCommitAnimationFrameRef.current !== null || quoteCommitTimerRef.current) {
            return;
        }
        const commit = () => {
            quoteCommitAnimationFrameRef.current = null;
            if (quoteCommitTimerRef.current) {
                clearTimeout(quoteCommitTimerRef.current);
                quoteCommitTimerRef.current = null;
            }
            const nextSnapshot = liveQuoteRef.current;
            react_1.default.startTransition(() => {
                setLiveQuote((current) => (areQuoteSnapshotsEqual(current, nextSnapshot) ? current : nextSnapshot));
            });
        };
        if (typeof requestAnimationFrame === 'function') {
            quoteCommitAnimationFrameRef.current = requestAnimationFrame(() => {
                commit();
            });
            return;
        }
        quoteCommitTimerRef.current = setTimeout(() => {
            commit();
        }, 16);
    }, []);
    (0, react_1.useEffect)(() => {
        liveQuoteRef.current = seedQuote;
        setLiveQuote((current) => (areQuoteSnapshotsEqual(current, seedQuote) ? current : seedQuote));
    }, [seedQuote]);
    (0, react_1.useEffect)(() => {
        if (!normalizedSymbol) {
            cancelScheduledCommit();
            liveQuoteRef.current = undefined;
            setLiveQuote(undefined);
            return;
        }
        quotesSocket_1.quotesWsService.connect();
        quotesSocket_1.quotesWsService.subscribe([normalizedSymbol]);
        const listener = (tick) => {
            if ((0, symbols_1.normalizeSymbol)(tick.symbol) !== normalizedSymbol) {
                return;
            }
            liveQuoteRef.current = mergeQuoteTickIntoSnapshot(symbol, liveQuoteRef.current, tick);
            scheduleQuoteCommit();
        };
        quotesSocket_1.quotesWsService.addTickListener(listener);
        return () => {
            quotesSocket_1.quotesWsService.removeTickListener(listener);
            quotesSocket_1.quotesWsService.unsubscribe([normalizedSymbol]);
            cancelScheduledCommit();
        };
    }, [cancelScheduledCommit, normalizedSymbol, scheduleQuoteCommit, symbol]);
    return liveQuote;
}
/**
 * Hook to subscribe to live account metrics (equity, balance, etc).
 */
function useLiveAccount(accountId) {
    const account = (0, tradingState_1.useTradingState)(state => state.account);
    (0, react_1.useEffect)(() => {
        if (!accountId)
            return;
        const channel = `account.${accountId}`;
        socket_1.wsService.subscribe(channel);
        return () => {
            socket_1.wsService.unsubscribe(channel);
        };
    }, [accountId]);
    return account;
}
/**
 * Hook to stream candlestick data for a chart.
 *
 * 1. Subscribes to WebSocket for live candle tick updates
 * 2. Requests candle history via WS
 * 3. If no data arrives within a timeout, generates demo candles as fallback
 *
 * Returns { candles, isLoading, isError } for the chart to render states.
 */
function useCandleStream(symbol, timeframe) {
    const key = `${symbol}.${timeframe}`;
    const candles = (0, tradingState_1.useTradingState)(state => state.candles[key]);
    const [hasFallback, setHasFallback] = react_1.default.useState(false);
    // Subscribe to live candle ticks via WebSocket + request history
    (0, react_1.useEffect)(() => {
        if (!symbol || !timeframe)
            return;
        setHasFallback(false);
        const channel = `candles.${symbol}.${timeframe}`;
        socket_1.wsService.subscribe(channel);
        // Request history via WS
        socket_1.wsService.requestCandleHistory(symbol, timeframe, 200);
        // Fallback: if no data arrives in 3s, generate demo candles
        const fallbackTimer = setTimeout(() => {
            const store = tradingState_1.useTradingState.getState();
            const existing = store.candles[`${symbol}.${timeframe}`];
            if (!existing || existing.length === 0) {
                const demoCandles = generateDemoCandles(symbol, 200);
                (0, candleCache_1.mergeHistoryIntoCandleCache)(symbol, timeframe, demoCandles);
                setHasFallback(true);
            }
        }, 3000);
        return () => {
            clearTimeout(fallbackTimer);
            socket_1.wsService.unsubscribe(channel);
        };
    }, [symbol, timeframe]);
    return {
        candles: candles || [],
        isLoading: !candles || candles.length === 0,
        isError: false,
        isFallback: hasFallback,
    };
}
// ─── Demo Candle Generator (fallback when API is unavailable) ────────────────
const DEMO_PRICES = {
    EURUSD: 1.0850, GBPUSD: 1.2740, AUDUSD: 0.6480, NZDUSD: 0.5920,
    USDJPY: 149.50, USDCAD: 1.3550, EURGBP: 0.8510, AUDCAD: 0.8790,
    AUDCHF: 0.5840, AUDJPY: 96.80, XAUUSD: 2950.00, BTCUSD: 85000.00,
};
function generateDemoCandles(symbol, count) {
    let price = DEMO_PRICES[symbol] ?? 1.0500;
    const now = Math.floor(Date.now() / 1000);
    const interval = 60; // 1 minute between candles for demo  
    const candles = [];
    for (let i = 0; i < count; i++) {
        const isUp = Math.random() > 0.49;
        const range = price * 0.001;
        const open = price;
        let close = price + (isUp ? 1 : -1) * (Math.random() * range);
        if (Math.random() > 0.8) {
            close += (isUp ? 1 : -1) * range * 1.5;
        }
        const high = Math.max(open, close) + Math.random() * (range * 0.4);
        const low = Math.min(open, close) - Math.random() * (range * 0.4);
        price = close;
        candles.push({
            time: now - (count - i) * interval,
            open,
            high,
            low,
            close,
            volume: Math.floor(Math.random() * 1000) + 100,
        });
    }
    return candles;
}
