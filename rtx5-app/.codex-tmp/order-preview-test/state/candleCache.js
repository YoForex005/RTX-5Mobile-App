"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeHistoryIntoCandleCache = exports.syncMergedCandleCache = void 0;
/**
 * Shared candle-cache guardrail.
 *
 * All raw history snapshots must flow through this module before they touch
 * `useTradingState().candles`. The visible candle cache is intentionally the
 * chart's canonical merged series, not a raw REST-only history buffer.
 *
 * That keeps chart remounts, screen transitions, and future non-chart changes
 * from silently reverting the cache back to split history/live arrays.
 */
const candles_1 = require("../domain/candles");
const tradingState_1 = require("./tradingState");
const areCandlesEqual = (left, right) => left.time === right.time &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume;
const areSeriesEqual = (left, right) => {
    if (left === right) {
        return true;
    }
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!areCandlesEqual(left[index], right[index])) {
            return false;
        }
    }
    return true;
};
const normalizeCandleKey = (symbol, timeframe) => {
    const normalizedSymbol = (0, candles_1.normalizeSymbol)(symbol);
    const normalizedTimeframe = (0, candles_1.normalizeTimeframe)(timeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
        return null;
    }
    return {
        key: `${normalizedSymbol}.${normalizedTimeframe}`,
        symbol: normalizedSymbol,
        timeframe: normalizedTimeframe,
    };
};
const syncMergedCandleCache = (symbol, timeframe, candles, options) => {
    const normalized = normalizeCandleKey(symbol, timeframe);
    if (!normalized) {
        return false;
    }
    const nextCandles = options?.canonical
        ? candles.slice(-candles_1.MAX_CANDLE_SERIES_LENGTH)
        : (0, candles_1.sortAndDedupeCandles)(candles).slice(-candles_1.MAX_CANDLE_SERIES_LENGTH);
    const currentCandles = tradingState_1.useTradingState.getState().candles[normalized.key] ?? [];
    if (areSeriesEqual(currentCandles, nextCandles)) {
        return false;
    }
    tradingState_1.useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
    return true;
};
exports.syncMergedCandleCache = syncMergedCandleCache;
const mergeHistoryIntoCandleCache = (symbol, timeframe, historyCandles) => {
    const normalized = normalizeCandleKey(symbol, timeframe);
    if (!normalized) {
        return [];
    }
    const nextHistory = (0, candles_1.sortAndDedupeCandles)(historyCandles).slice(-candles_1.DEFAULT_CANDLE_HISTORY_LIMIT);
    const currentCandles = tradingState_1.useTradingState.getState().candles[normalized.key] ?? [];
    const nextCandles = currentCandles.length > 0
        ? (0, candles_1.mergeRecentHistoryIntoCandles)(currentCandles, nextHistory, normalized.timeframe).slice(-candles_1.MAX_CANDLE_SERIES_LENGTH)
        : nextHistory;
    if (!areSeriesEqual(currentCandles, nextCandles)) {
        tradingState_1.useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
    }
    return nextCandles;
};
exports.mergeHistoryIntoCandleCache = mergeHistoryIntoCandleCache;
