"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPendingChartTradeValid = exports.resolveChartTradeFillPolicyLabel = exports.resolveDefaultStopLimitPrice = exports.getChartOrderSide = exports.isStopLimitChartOrderType = exports.supportsChartTradeFillPolicy = exports.isPendingChartOrderType = exports.CHART_ORDER_TYPES = void 0;
exports.CHART_ORDER_TYPES = [
    'Market Execution',
    'Buy Limit',
    'Sell Limit',
    'Buy Stop',
    'Sell Stop',
    'Buy Stop Limit',
    'Sell Stop Limit',
];
const isPendingChartOrderType = (orderType) => orderType !== 'Market Execution';
exports.isPendingChartOrderType = isPendingChartOrderType;
const supportsChartTradeFillPolicy = (orderType) => orderType === 'Market Execution'
    || orderType === 'Buy Limit'
    || orderType === 'Sell Limit'
    || orderType === 'Buy Stop Limit'
    || orderType === 'Sell Stop Limit';
exports.supportsChartTradeFillPolicy = supportsChartTradeFillPolicy;
const isStopLimitChartOrderType = (orderType) => orderType === 'Buy Stop Limit' || orderType === 'Sell Stop Limit';
exports.isStopLimitChartOrderType = isStopLimitChartOrderType;
const getChartOrderSide = (orderType, marketSide = 'buy') => {
    if (orderType === 'Market Execution') {
        return marketSide;
    }
    return orderType.toLowerCase().startsWith('sell') ? 'sell' : 'buy';
};
exports.getChartOrderSide = getChartOrderSide;
const resolveDefaultStopLimitPrice = (orderType, entryPrice, stopLimitOffset, roundPrice) => {
    if (!(0, exports.isStopLimitChartOrderType)(orderType) || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return 0;
    }
    const normalizedOffset = Math.max(0, stopLimitOffset);
    return orderType === 'Buy Stop Limit'
        ? roundPrice(Math.max(0, entryPrice - normalizedOffset))
        : roundPrice(entryPrice + normalizedOffset);
};
exports.resolveDefaultStopLimitPrice = resolveDefaultStopLimitPrice;
const normalizeChartTradeFillPolicyLabel = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (!normalized) {
        return null;
    }
    if (normalized === 'fok' || normalized === 'fillorkill') {
        return 'FOK';
    }
    if (normalized === 'ioc' || normalized === 'immediateorcancel') {
        return 'IOC';
    }
    if (normalized === 'return') {
        return 'Return';
    }
    if (normalized === 'boc' || normalized === 'bookorcancel') {
        return 'BOC';
    }
    return null;
};
const resolveChartTradeFillPolicyCandidate = (value) => {
    if (Array.isArray(value)) {
        for (const item of value) {
            const normalized = resolveChartTradeFillPolicyCandidate(item);
            if (normalized) {
                return normalized;
            }
        }
        return null;
    }
    if (typeof value === 'string' && value.includes(',')) {
        for (const item of value.split(',')) {
            const normalized = normalizeChartTradeFillPolicyLabel(item);
            if (normalized) {
                return normalized;
            }
        }
        return null;
    }
    return normalizeChartTradeFillPolicyLabel(value);
};
const resolveChartTradeFillPolicyLabel = (meta) => {
    const metaRecord = typeof meta === 'object' && meta !== null
        ? meta
        : null;
    if (metaRecord) {
        const candidates = [
            metaRecord.fillPolicy,
            metaRecord.fill_policy,
            metaRecord.fillPolicies,
            metaRecord.fill_policies,
            metaRecord.fillingMode,
            metaRecord.filling_mode,
            metaRecord.fillingModes,
            metaRecord.filling_modes,
        ];
        for (const candidate of candidates) {
            const normalized = resolveChartTradeFillPolicyCandidate(candidate);
            if (normalized) {
                return normalized;
            }
        }
    }
    return 'FOK';
};
exports.resolveChartTradeFillPolicyLabel = resolveChartTradeFillPolicyLabel;
const isPendingChartTradeValid = ({ orderType, entryPrice, stopLimitPrice, bid, ask, pointSize, }) => {
    if (!(0, exports.isPendingChartOrderType)(orderType) || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return false;
    }
    const epsilon = Math.max(pointSize / 10, 1e-9);
    const liveBid = Number.isFinite(bid) && bid > 0 ? bid : null;
    const liveAsk = Number.isFinite(ask) && ask > 0 ? ask : null;
    switch (orderType) {
        case 'Buy Limit':
            return liveAsk === null ? true : entryPrice <= liveAsk + epsilon;
        case 'Sell Limit':
            return liveBid === null ? true : entryPrice >= liveBid - epsilon;
        case 'Buy Stop':
            return liveAsk === null ? true : entryPrice >= liveAsk - epsilon;
        case 'Sell Stop':
            return liveBid === null ? true : entryPrice <= liveBid + epsilon;
        case 'Buy Stop Limit':
            return ((liveAsk === null || entryPrice >= liveAsk - epsilon) &&
                Number.isFinite(stopLimitPrice) &&
                stopLimitPrice > 0 &&
                stopLimitPrice < entryPrice - epsilon);
        case 'Sell Stop Limit':
            return ((liveBid === null || entryPrice <= liveBid + epsilon) &&
                Number.isFinite(stopLimitPrice) &&
                stopLimitPrice > 0 &&
                stopLimitPrice > entryPrice + epsilon);
        default:
            return false;
    }
};
exports.isPendingChartTradeValid = isPendingChartTradeValid;
