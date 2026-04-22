"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldAcceptBootstrapHistory = exports.mergeFetchedHistoryIntoWindow = exports.buildQuoteRolloverCandle = void 0;
const candles_1 = require("../../domain/candles");
/**
 * When the engine has not observed any live bucket yet and the first quote
 * lands in the immediate bucket after REST history, using the previous close
 * as the new bucket open can fabricate a huge body on cold start. In that
 * case we prefer the first observed quote as the provisional open until a
 * recent history heal can restore the authoritative bucket open.
 */
const buildQuoteRolloverCandle = (bucketTime, previousClose, observedPrice, hasActiveLiveOverlay, volume = 1) => {
    const open = hasActiveLiveOverlay ? previousClose : observedPrice;
    return {
        time: bucketTime,
        open,
        high: Math.max(open, observedPrice),
        low: Math.min(open, observedPrice),
        close: observedPrice,
        volume: Math.max(volume, 1),
    };
};
exports.buildQuoteRolloverCandle = buildQuoteRolloverCandle;
/**
 * History refreshes must not collapse an already healthy chart window down to
 * a shorter partial snapshot. We merge fetched history forward into the
 * existing trusted window so transient backend truncation cannot reduce the
 * visible context to a handful of bars.
 */
const mergeFetchedHistoryIntoWindow = (currentHistory, fetchedHistory, timeframe) => {
    const normalizedFetched = (0, candles_1.sortAndDedupeCandles)(fetchedHistory).slice(-candles_1.DEFAULT_CANDLE_HISTORY_LIMIT);
    if (currentHistory.length === 0) {
        return normalizedFetched;
    }
    const mergedExistingWindow = (0, candles_1.mergeRecentHistoryIntoCandles)(currentHistory, normalizedFetched, timeframe);
    const currentLastTime = currentHistory[currentHistory.length - 1]?.time ?? 0;
    const appendedNewerHistory = normalizedFetched.filter((candle) => candle.time > currentLastTime);
    return (0, candles_1.sortAndDedupeCandles)([...mergedExistingWindow, ...appendedNewerHistory]).slice(-candles_1.DEFAULT_CANDLE_HISTORY_LIMIT);
};
exports.mergeFetchedHistoryIntoWindow = mergeFetchedHistoryIntoWindow;
const shouldAcceptBootstrapHistory = (fetchedHistory, timeframe) => (0, candles_1.isTrustworthyCandleBootstrapSeed)(fetchedHistory, timeframe);
exports.shouldAcceptBootstrapHistory = shouldAcceptBootstrapHistory;
