"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderTicketPreviewSeries = exports.roundOrderTicketPrice = exports.resolveOrderTicketPriceDecimals = void 0;
const DEFAULT_SAMPLE_SIZE = 36;
const resolveOrderTicketPriceDecimals = (tickSize, bid, ask) => {
    const liveSpread = Number.isFinite(ask) && Number.isFinite(bid) ? Math.abs(ask - bid) : 0;
    const fallbackStep = Math.max(Math.abs(bid), Math.abs(ask)) >= 100 ? 0.01 : 0.0001;
    const candidateStep = typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0
        ? tickSize
        : liveSpread > 0
            ? liveSpread / 10
            : fallbackStep;
    const normalized = candidateStep.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    const dotIndex = normalized.indexOf('.');
    return dotIndex === -1 ? 0 : normalized.length - dotIndex - 1;
};
exports.resolveOrderTicketPriceDecimals = resolveOrderTicketPriceDecimals;
const roundOrderTicketPrice = (value, tickSize, decimals) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0) {
        return Number((Math.round(value / tickSize) * tickSize).toFixed(decimals));
    }
    return Number(value.toFixed(decimals));
};
exports.roundOrderTicketPrice = roundOrderTicketPrice;
const buildOrderTicketPreviewSeries = ({ candles, bid, ask, sampleSize = DEFAULT_SAMPLE_SIZE, }) => {
    const safeBid = Number.isFinite(bid) && bid > 0 ? bid : Number.isFinite(ask) && ask > 0 ? ask : 0;
    const safeAsk = Number.isFinite(ask) && ask > 0 ? ask : safeBid;
    const spread = safeAsk > 0 && safeBid > 0 ? Math.max(safeAsk - safeBid, 0) : 0;
    const halfSpread = spread / 2;
    const seedSeries = candles
        .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
        .slice(-sampleSize)
        .map((candle) => ({
        bid: Math.max(0, candle.close - halfSpread),
        ask: candle.close + halfSpread,
    }));
    const filledSeries = seedSeries.length > 0
        ? [...seedSeries]
        : Array.from({ length: sampleSize }, () => ({ bid: safeBid, ask: safeAsk }));
    const firstPoint = filledSeries[0] ?? { bid: safeBid, ask: safeAsk };
    while (filledSeries.length < sampleSize) {
        filledSeries.unshift(firstPoint);
    }
    if (filledSeries.length > 0) {
        filledSeries[filledSeries.length - 1] = { bid: safeBid, ask: safeAsk };
    }
    return filledSeries;
};
exports.buildOrderTicketPreviewSeries = buildOrderTicketPreviewSeries;
