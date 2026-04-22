"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveQuoteTickTimestamp = void 0;
const coerceQuoteTimestampCandidate = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const resolveQuoteTickTimestamp = (payload, fallbackMs = Date.now()) => {
    const candidates = [payload.time, payload.timestamp, payload.t];
    for (const candidate of candidates) {
        const normalized = coerceQuoteTimestampCandidate(candidate);
        if (normalized !== null) {
            return normalized;
        }
    }
    return fallbackMs;
};
exports.resolveQuoteTickTimestamp = resolveQuoteTickTimestamp;
