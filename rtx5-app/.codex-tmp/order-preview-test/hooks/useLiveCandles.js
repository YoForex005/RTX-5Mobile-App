"use strict";
/**
 * Authoritative live candle hook.
 *
 * Candle formation now lives in one shared engine instead of being rebuilt
 * inside every mounted chart screen. That makes the chart resilient to
 * refreshes, remounts, and screen transitions while keeping one canonical
 * candle stream per symbol/timeframe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLiveCandles = useLiveCandles;
exports.useLiveTick = useLiveTick;
const react_1 = require("react");
const liveCandlesEngine_1 = require("../api/ws/liveCandlesEngine");
const candles_1 = require("../domain/candles");
const websocket_1 = require("../query/websocket");
const tradingState_1 = require("../state/tradingState");
// Cache the empty-snapshot reference for useSyncExternalStore. Returning a new
// `[]` each call would trip React's "cache the snapshot" guard and infinite-loop.
const emptyCandles = liveCandlesEngine_1.EMPTY_CANDLES;
const getEmptySnapshot = () => emptyCandles;
const getQuotePrice = (quote) => {
    if (quote && typeof quote.bid === 'number' && Number.isFinite(quote.bid)) {
        return quote.bid;
    }
    if (quote && typeof quote.ask === 'number' && Number.isFinite(quote.ask)) {
        return quote.ask;
    }
    return null;
};
const getQuoteTimestamp = (quote) => {
    if (!quote) {
        return null;
    }
    const candidates = [quote.time, quote.timestamp, quote.t];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
            return candidate;
        }
    }
    if (typeof quote.lastTickAt === 'number' && quote.lastTickAt > 0) {
        return quote.lastTickAt;
    }
    return Date.now();
};
function useLiveCandles(symbol, timeframe) {
    const normalizedSymbol = (0, react_1.useMemo)(() => (0, candles_1.normalizeSymbol)(symbol), [symbol]);
    const normalizedTimeframe = (0, react_1.useMemo)(() => (0, candles_1.normalizeTimeframe)(timeframe), [timeframe]);
    const candleKey = (0, react_1.useMemo)(() => (normalizedSymbol && normalizedTimeframe ? `${normalizedSymbol}.${normalizedTimeframe}` : ''), [normalizedSymbol, normalizedTimeframe]);
    const cachedCandles = (0, tradingState_1.useTradingState)((0, react_1.useCallback)((state) => candleKey
        ? state.candles[candleKey] ?? emptyCandles
        : emptyCandles, [candleKey]));
    const subscribe = (0, react_1.useCallback)((listener) => {
        if (!normalizedSymbol || !normalizedTimeframe) {
            return () => { };
        }
        return liveCandlesEngine_1.liveCandlesEngine.subscribe(normalizedSymbol, normalizedTimeframe, listener);
    }, [normalizedSymbol, normalizedTimeframe]);
    const getSnapshot = (0, react_1.useCallback)(() => {
        if (!normalizedSymbol || !normalizedTimeframe) {
            return emptyCandles;
        }
        return liveCandlesEngine_1.liveCandlesEngine.getCandles(normalizedSymbol, normalizedTimeframe);
    }, [normalizedSymbol, normalizedTimeframe]);
    const engineCandles = (0, react_1.useSyncExternalStore)(subscribe, getSnapshot, getEmptySnapshot);
    (0, react_1.useEffect)(() => {
        if (!normalizedSymbol || !normalizedTimeframe || cachedCandles.length === 0) {
            return;
        }
        liveCandlesEngine_1.liveCandlesEngine.hydrateFromCache(normalizedSymbol, normalizedTimeframe, cachedCandles);
    }, [cachedCandles, normalizedSymbol, normalizedTimeframe]);
    const candles = (0, react_1.useMemo)(() => (engineCandles.length > 0 ? engineCandles : cachedCandles), [engineCandles, cachedCandles]);
    const refresh = (0, react_1.useCallback)(() => {
        if (!normalizedSymbol || !normalizedTimeframe) {
            return;
        }
        liveCandlesEngine_1.liveCandlesEngine.refresh(normalizedSymbol, normalizedTimeframe);
    }, [normalizedSymbol, normalizedTimeframe]);
    return { candles, refresh };
}
/**
 * Lightweight live price hook for UI elements that only need the latest price.
 * Reads from the quote feed directly so it stays aligned with the rest of the app.
 */
function useLiveTick(symbol, timeframe) {
    const normalizedSymbol = (0, react_1.useMemo)(() => (0, candles_1.normalizeSymbol)(symbol), [symbol]);
    const normalizedTimeframe = (0, react_1.useMemo)(() => (0, candles_1.normalizeTimeframe)(timeframe ?? 'M1'), [timeframe]);
    const liveQuotes = (0, websocket_1.useMarketData)(symbol ? [symbol] : []);
    const liveQuote = liveQuotes[symbol] || liveQuotes[normalizedSymbol];
    return (0, react_1.useMemo)(() => {
        const price = getQuotePrice(liveQuote);
        const timestamp = getQuoteTimestamp(liveQuote);
        if (price === null || timestamp === null) {
            return null;
        }
        const normalizedTick = (0, candles_1.normalizeCandle)({
            bid: liveQuote?.bid ?? price,
            ask: liveQuote?.ask,
            timestamp,
        }, normalizedTimeframe);
        if (!normalizedTick) {
            return null;
        }
        return {
            ...normalizedTick,
            bid: typeof liveQuote?.bid === 'number' ? liveQuote.bid : price,
            ask: typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined,
        };
    }, [liveQuote, normalizedTimeframe, normalizedSymbol, symbol]);
}
