"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildActiveQuoteSymbols = exports.applyQuoteSubscriptionDelta = void 0;
const applyQuoteSubscriptionDelta = (currentCounts, symbols, delta) => {
    const nextCounts = new Map(currentCounts);
    for (const symbol of symbols) {
        const current = nextCounts.get(symbol) ?? 0;
        const next = current + delta;
        if (next <= 0) {
            nextCounts.delete(symbol);
            continue;
        }
        nextCounts.set(symbol, next);
    }
    return nextCounts;
};
exports.applyQuoteSubscriptionDelta = applyQuoteSubscriptionDelta;
const buildActiveQuoteSymbols = (stickySymbols, consumerCounts) => {
    const merged = new Set();
    for (const symbol of stickySymbols) {
        if (symbol) {
            merged.add(symbol);
        }
    }
    consumerCounts.forEach((count, symbol) => {
        if (count > 0 && symbol) {
            merged.add(symbol);
        }
    });
    return Array.from(merged);
};
exports.buildActiveQuoteSymbols = buildActiveQuoteSymbols;
