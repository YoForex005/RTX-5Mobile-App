"use strict";
/**
 * Core module: tradingState.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTradingState = void 0;
const zustand_1 = require("zustand");
const tradingData_1 = require("../mock/tradingData");
const symbolSpecs = new Map(tradingData_1.quotes.map((q) => [q.symbol, q]));
exports.useTradingState = (0, zustand_1.create)((set) => ({
    quotes: {},
    tickCount: 0,
    account: null,
    candles: {},
    setQuote: (symbol, data) => set((state) => {
        const existing = state.quotes[symbol];
        const spec = symbolSpecs.get(symbol);
        if (!existing) {
            // We only want to patch existing full quotes or require the caller to provide enough data
            // For our simplified WebSocket ticks, it usually just sends { symbol, bid, ask }
            // We will merge it. Note: the actual app structure might require `QuoteItem` to be fully formed.
            // If a new quote ticks we haven't seen, we'll cast it to `QuoteItem`.
            const digits = data.digits ?? spec?.digits ?? 5;
            const volume = data.volume ?? spec?.volume ?? 0;
            const lastTickAt = data.lastTickAt ??
                (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : undefined);
            const newQuote = { ...spec, ...data, symbol, digits, volume, lastTickAt };
            if (newQuote.ask && newQuote.bid) {
                newQuote.spread = (newQuote.ask - newQuote.bid) * Math.pow(10, digits);
            }
            return {
                quotes: {
                    ...state.quotes,
                    [symbol]: newQuote,
                },
            };
        }
        // Because they send identical bids/asks over WS often without changing ticks, compute delta:
        const incomingBid = data.bid;
        const incomingAsk = data.ask;
        const prevBidState = incomingBid && incomingBid !== existing.bid ? existing.bid : existing.prevBid;
        const prevAskState = incomingAsk && incomingAsk !== existing.ask ? existing.ask : existing.prevAsk;
        const digits = existing.digits ?? data.digits ?? spec?.digits ?? 5;
        const simulatedVolBump = data.volume === undefined ? Math.floor(Math.random() * 8) + 1 : 0;
        const volume = data.volume ?? (existing.volume ? existing.volume + simulatedVolBump : (spec?.volume ?? 0));
        const lastTickAt = data.lastTickAt ??
            (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : existing.lastTickAt);
        return {
            quotes: {
                ...state.quotes,
                [symbol]: {
                    ...spec,
                    ...existing,
                    ...data,
                    digits,
                    volume,
                    lastTickAt,
                    // Automatically calculate spread if bid/ask provided
                    spread: (data.ask && data.bid) ? (data.ask - data.bid) * Math.pow(10, digits) : existing.spread,
                    // Track previous prices
                    prevBid: prevBidState,
                    prevAsk: prevAskState,
                },
            },
        };
    }),
    setAccount: (data) => set((state) => ({
        account: state.account ? { ...state.account, ...data } : data,
    })),
    setCandleHistory: (symbol, timeframe, history) => set((state) => ({
        candles: {
            ...state.candles,
            [`${symbol}.${timeframe}`]: history,
        },
    })),
    updateCandle: (symbol, timeframe, newCandle) => set((state) => {
        const key = `${symbol}.${timeframe}`;
        const existing = state.candles[key] || [];
        if (existing.length === 0) {
            return { candles: { ...state.candles, [key]: [newCandle] } };
        }
        // If the incoming candle has the same timestamp as the last one, it's an update.
        // If it's newer, we append it.
        const last = existing[existing.length - 1];
        let nextList = [...existing];
        if (last.time === newCandle.time) {
            nextList[nextList.length - 1] = newCandle;
        }
        else if (newCandle.time > last.time) {
            nextList.push(newCandle);
            if (nextList.length > 1000)
                nextList.shift(); // Keep bounded
        }
        return {
            candles: { ...state.candles, [key]: nextList },
        };
    }),
}));
