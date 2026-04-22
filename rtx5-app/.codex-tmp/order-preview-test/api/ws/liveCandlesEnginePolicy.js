"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldKeepBootstrappingOnHistoryFailure = exports.resolveCurrentVisibleSeries = exports.resolveVisibleSeriesMode = exports.shouldAdoptCachedSeries = exports.shouldRenderBootstrapPreview = void 0;
const candles_1 = require("../../domain/candles");
const areSeriesStructurallyEqual = (currentCandles, cachedCandles) => {
    if (currentCandles === cachedCandles) {
        return true;
    }
    if (currentCandles.length !== cachedCandles.length) {
        return false;
    }
    for (let index = 0; index < currentCandles.length; index += 1) {
        if (currentCandles[index].time !== cachedCandles[index].time) {
            return false;
        }
    }
    return true;
};
const shouldRenderBootstrapPreview = (historyCandlesLength, visibleCandlesLength) => historyCandlesLength > 0 || visibleCandlesLength > 0;
exports.shouldRenderBootstrapPreview = shouldRenderBootstrapPreview;
const shouldAdoptCachedSeries = (status, historyCandlesLength, currentCandles, cachedCandles) => {
    if (cachedCandles.length === 0 || areSeriesStructurallyEqual(currentCandles, cachedCandles)) {
        return false;
    }
    const cachedLastTime = cachedCandles[cachedCandles.length - 1]?.time ?? 0;
    const liveLastTime = currentCandles[currentCandles.length - 1]?.time ?? 0;
    return (currentCandles.length === 0 ||
        status !== 'ready' ||
        historyCandlesLength === 0 ||
        cachedCandles.length > currentCandles.length ||
        cachedLastTime > liveLastTime);
};
exports.shouldAdoptCachedSeries = shouldAdoptCachedSeries;
const resolveVisibleSeriesMode = (historyCandles, liveCandles, currentCandles, timeframe) => {
    if (historyCandles.length === 0) {
        return liveCandles.length > 0 || currentCandles.length > 0 ? 'current' : 'empty';
    }
    if (liveCandles.length === 0) {
        return 'history';
    }
    const historyLastTime = historyCandles[historyCandles.length - 1]?.time ?? 0;
    const firstLiveTime = liveCandles[0]?.time ?? 0;
    if ((0, candles_1.getBucketGapCount)(historyLastTime, firstLiveTime, timeframe) > 1) {
        return 'current';
    }
    return 'merged';
};
exports.resolveVisibleSeriesMode = resolveVisibleSeriesMode;
const resolveCurrentVisibleSeries = (historyCandles, liveCandles, currentCandles) => {
    if (liveCandles.length > 0) {
        return liveCandles;
    }
    if (currentCandles.length > 0) {
        return currentCandles;
    }
    if (historyCandles.length > 0) {
        return historyCandles;
    }
    return [];
};
exports.resolveCurrentVisibleSeries = resolveCurrentVisibleSeries;
const shouldKeepBootstrappingOnHistoryFailure = (historyCandlesLength, visibleCandlesLength) => historyCandlesLength === 0 && visibleCandlesLength === 0;
exports.shouldKeepBootstrappingOnHistoryFailure = shouldKeepBootstrappingOnHistoryFailure;
