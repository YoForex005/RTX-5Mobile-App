"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHART_DRAWING_KINDS = void 0;
exports.getChartDrawingBucketKey = getChartDrawingBucketKey;
exports.getDefaultChartDrawingLabel = getDefaultChartDrawingLabel;
exports.getChartDrawingLabels = getChartDrawingLabels;
exports.sanitizePersistedChartDrawings = sanitizePersistedChartDrawings;
exports.CHART_DRAWING_KINDS = [
    'trendline',
    'fib',
    'brush',
    'text',
    'patterns',
    'prediction',
    'pitchfork',
    'smiley',
    'measure',
];
const REQUIRED_POINT_COUNT = {
    trendline: 2,
    fib: 2,
    brush: 2,
    text: 1,
    patterns: 3,
    prediction: 2,
    pitchfork: 3,
    smiley: 1,
    measure: 2,
};
const DEFAULT_DRAWING_LABELS = {
    trendline: 'Trend Line',
    fib: 'Fib Zone',
    brush: 'Highlight',
    text: 'Text',
    patterns: 'Pattern',
    prediction: 'Long Position',
    pitchfork: 'Pitchfork',
    smiley: 'Sticker',
    measure: 'Measure',
};
function isChartDrawingKind(value) {
    return typeof value === 'string' && exports.CHART_DRAWING_KINDS.includes(value);
}
function isSerializedChartTime(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return (Number.isInteger(candidate.year) &&
        Number.isInteger(candidate.month) &&
        Number.isInteger(candidate.day));
}
function sanitizeDrawingPoint(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value;
    if (!isSerializedChartTime(candidate.time) || typeof candidate.price !== 'number' || !Number.isFinite(candidate.price)) {
        return null;
    }
    return {
        time: candidate.time,
        price: candidate.price,
    };
}
function getChartDrawingBucketKey(symbol) {
    const trimmed = (0, symbols_1.normalizeSymbol)(symbol);
    return trimmed.length > 0 ? trimmed : 'DEFAULT';
}
function getDefaultChartDrawingLabel(kind, index) {
    const baseLabel = DEFAULT_DRAWING_LABELS[kind];
    const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
    return `${baseLabel} ${safeIndex}`;
}
function getChartDrawingLabels(drawings) {
    return drawings.map((drawing) => drawing.label);
}
function sanitizePersistedChartDrawing(value, index) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value;
    if (!isChartDrawingKind(candidate.kind)) {
        return null;
    }
    const requiredPointCount = REQUIRED_POINT_COUNT[candidate.kind];
    const points = Array.isArray(candidate.points)
        ? candidate.points
            .map((point) => sanitizeDrawingPoint(point))
            .filter((point) => point !== null)
            .slice(0, requiredPointCount)
        : [];
    if (points.length < requiredPointCount) {
        return null;
    }
    const label = typeof candidate.label === 'string' && candidate.label.trim().length > 0
        ? candidate.label.trim()
        : getDefaultChartDrawingLabel(candidate.kind, index + 1);
    const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0
        ? candidate.id.trim()
        : `${candidate.kind}_${index + 1}`;
    return {
        id,
        kind: candidate.kind,
        label,
        hidden: Boolean(candidate.hidden),
        points,
        text: typeof candidate.text === 'string' ? candidate.text : undefined,
    };
}
function sanitizePersistedChartDrawings(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item, index) => sanitizePersistedChartDrawing(item, index))
        .filter((item) => item !== null);
}
const symbols_1 = require("../../domain/symbols");
