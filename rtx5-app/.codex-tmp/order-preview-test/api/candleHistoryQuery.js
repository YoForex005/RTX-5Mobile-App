"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandleHistoryRequestTimeframes = exports.buildCandleHistorySearchParams = exports.extractCandleHistoryPayload = void 0;
const candles_1 = require("../domain/candles");
const asObjectRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
};
const pickFirstArray = (...candidates) => {
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }
    return [];
};
const extractCandleHistoryPayload = (payload) => {
    if (Array.isArray(payload)) {
        return { candles: payload };
    }
    const record = asObjectRecord(payload);
    if (!record) {
        return { candles: [] };
    }
    const nestedData = asObjectRecord(record.data);
    const nestedResult = asObjectRecord(record.result);
    const nestedPayload = asObjectRecord(record.payload);
    return {
        candles: pickFirstArray(record.candles, record.data, record.items, record.results, record.result, record.payload, record.bars, nestedData?.candles, nestedData?.items, nestedData?.results, nestedData?.bars, nestedResult?.candles, nestedResult?.items, nestedPayload?.candles, nestedPayload?.items),
        symbol: (typeof record.symbol === 'string' ? record.symbol : undefined) ??
            (typeof nestedData?.symbol === 'string' ? nestedData.symbol : undefined) ??
            (typeof nestedResult?.symbol === 'string' ? nestedResult.symbol : undefined),
        timeframe: (typeof record.timeframe === 'string' ? record.timeframe : undefined) ??
            (typeof record.tf === 'string' ? record.tf : undefined) ??
            (typeof nestedData?.timeframe === 'string' ? nestedData.timeframe : undefined) ??
            (typeof nestedData?.tf === 'string' ? nestedData.tf : undefined) ??
            (typeof nestedResult?.timeframe === 'string' ? nestedResult.timeframe : undefined) ??
            (typeof nestedResult?.tf === 'string' ? nestedResult.tf : undefined),
    };
};
exports.extractCandleHistoryPayload = extractCandleHistoryPayload;
const buildCandleHistorySearchParams = (timeframe, count, options) => {
    const params = new URLSearchParams();
    params.set('timeframe', timeframe.trim().toUpperCase());
    params.set('limit', String(count));
    if (typeof options?.from === 'number' && Number.isFinite(options.from) && options.from > 0) {
        params.set('from', String(Math.floor(options.from)));
    }
    if (typeof options?.to === 'number' && Number.isFinite(options.to) && options.to > 0) {
        params.set('to', String(Math.floor(options.to)));
    }
    return params;
};
exports.buildCandleHistorySearchParams = buildCandleHistorySearchParams;
const getCandleHistoryRequestTimeframes = (timeframe) => {
    const normalizedTimeframe = (0, candles_1.normalizeTimeframe)(timeframe);
    const fallbacks = {
        W1: ['W1', '1W'],
        MN: ['MN', '1MO'],
    };
    return fallbacks[normalizedTimeframe] ?? [normalizedTimeframe];
};
exports.getCandleHistoryRequestTimeframes = getCandleHistoryRequestTimeframes;
