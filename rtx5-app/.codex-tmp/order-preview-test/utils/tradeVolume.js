"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_TRADE_VOLUME_STEP = exports.FALLBACK_MAX_TRADE_VOLUME = exports.DEFAULT_TRADE_VOLUME = void 0;
exports.resolveTradeVolumeBounds = resolveTradeVolumeBounds;
exports.normalizeTradeVolume = normalizeTradeVolume;
exports.incrementTradeVolume = incrementTradeVolume;
exports.formatTradeVolume = formatTradeVolume;
exports.sanitizeTradeVolumeDraft = sanitizeTradeVolumeDraft;
exports.DEFAULT_TRADE_VOLUME = 0.01;
exports.FALLBACK_MAX_TRADE_VOLUME = 100;
exports.FALLBACK_TRADE_VOLUME_STEP = 0.01;
function toFiniteNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}
function countDecimals(value) {
    const normalized = value.toString();
    if (!normalized.includes('.')) {
        return 0;
    }
    return normalized.split('.')[1]?.length ?? 0;
}
function roundToDecimals(value, decimals) {
    return Number(value.toFixed(Math.min(Math.max(decimals, 0), 6)));
}
function resolveTradeVolumeBounds(bounds) {
    const minVolume = Math.max(toFiniteNumber(bounds?.minVolume) ?? exports.DEFAULT_TRADE_VOLUME, exports.DEFAULT_TRADE_VOLUME);
    const maxVolume = Math.max(toFiniteNumber(bounds?.maxVolume) ?? exports.FALLBACK_MAX_TRADE_VOLUME, minVolume);
    const stepVolume = Math.max(toFiniteNumber(bounds?.stepVolume) ?? exports.FALLBACK_TRADE_VOLUME_STEP, exports.FALLBACK_TRADE_VOLUME_STEP);
    const decimals = Math.max(countDecimals(minVolume), countDecimals(stepVolume), 2);
    return {
        minVolume,
        maxVolume,
        stepVolume,
        decimals,
    };
}
function normalizeTradeVolume(value, bounds) {
    const { minVolume, maxVolume, stepVolume, decimals } = resolveTradeVolumeBounds(bounds);
    const parsed = toFiniteNumber(value);
    if (parsed === null) {
        return minVolume;
    }
    const clamped = Math.min(maxVolume, Math.max(minVolume, parsed));
    const offset = Math.round((clamped - minVolume) / stepVolume);
    const stepped = minVolume + offset * stepVolume;
    return Math.min(maxVolume, Math.max(minVolume, roundToDecimals(stepped, decimals)));
}
function incrementTradeVolume(value, direction, bounds) {
    const { stepVolume } = resolveTradeVolumeBounds(bounds);
    return normalizeTradeVolume((toFiniteNumber(value) ?? exports.DEFAULT_TRADE_VOLUME) + direction * stepVolume, bounds);
}
function formatTradeVolume(value, bounds) {
    const { decimals } = resolveTradeVolumeBounds(bounds);
    return normalizeTradeVolume(value, bounds).toFixed(decimals);
}
function sanitizeTradeVolumeDraft(input) {
    const stripped = input.replace(/[^0-9.]/g, '');
    const [head = '', ...tail] = stripped.split('.');
    if (tail.length === 0) {
        return stripped;
    }
    return `${head}.${tail.join('')}`;
}
