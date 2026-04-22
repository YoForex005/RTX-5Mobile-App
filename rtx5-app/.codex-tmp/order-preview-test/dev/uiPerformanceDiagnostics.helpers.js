"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUiPerformanceSeverity = resolveUiPerformanceSeverity;
exports.trimUiPerformanceSamples = trimUiPerformanceSamples;
exports.buildUiThreadStallSample = buildUiThreadStallSample;
exports.buildUiFeedGapSample = buildUiFeedGapSample;
exports.formatUiPerformanceSampleKind = formatUiPerformanceSampleKind;
exports.formatUiPerformanceSampleMetrics = formatUiPerformanceSampleMetrics;
exports.buildUiPerformanceTraceMetrics = buildUiPerformanceTraceMetrics;
function resolveUiPerformanceSeverity(input) {
    if (input.kind === 'stall') {
        const blockedMs = input.blockedMs ?? input.settledMs;
        if (blockedMs >= 700)
            return 'slow';
        if (blockedMs >= 180)
            return 'warning';
        return 'ok';
    }
    if (input.kind === 'feed') {
        const gapMs = input.gapMs ?? input.settledMs;
        if (gapMs >= 3_000)
            return 'slow';
        if (gapMs >= 1_200)
            return 'warning';
        return 'ok';
    }
    if (input.nextFrameMs >= 120 || input.settledMs >= 260 || input.handlerMs >= 48) {
        return 'slow';
    }
    if (input.nextFrameMs >= 60 || input.settledMs >= 140 || input.handlerMs >= 20) {
        return 'warning';
    }
    return 'ok';
}
function trimUiPerformanceSamples(samples, limit) {
    if (limit <= 0) {
        return [];
    }
    return samples.slice(0, limit);
}
function buildUiThreadStallSample(input) {
    const sample = {
        id: input.id,
        kind: 'stall',
        label: 'js.thread.blocked',
        startedAtMs: input.startedAtMs,
        handlerMs: input.blockedMs,
        nextFrameMs: input.blockedMs,
        settledMs: input.blockedMs,
        blockedMs: input.blockedMs,
        context: input.context,
        recordedAtIso: input.recordedAtIso,
        severity: 'ok',
    };
    sample.severity = resolveUiPerformanceSeverity(sample);
    return sample;
}
function buildUiFeedGapSample(input) {
    const sample = {
        id: input.id,
        kind: 'feed',
        label: input.label,
        startedAtMs: input.startedAtMs,
        handlerMs: 0,
        nextFrameMs: input.gapMs,
        settledMs: input.gapMs,
        gapMs: input.gapMs,
        context: input.context,
        recordedAtIso: input.recordedAtIso,
        severity: 'ok',
    };
    sample.severity = resolveUiPerformanceSeverity(sample);
    return sample;
}
const formatMetricValue = (value) => `${Math.round(value ?? 0)}ms`;
function formatUiPerformanceSampleKind(sample) {
    if (sample.kind === 'navigation')
        return 'NAV';
    if (sample.kind === 'stall')
        return 'STALL';
    if (sample.kind === 'feed')
        return 'FEED';
    return 'ACT';
}
function formatUiPerformanceSampleMetrics(sample) {
    if (sample.kind === 'stall') {
        return `Blocked ${formatMetricValue(sample.blockedMs ?? sample.settledMs)}`;
    }
    if (sample.kind === 'feed') {
        return `Gap ${formatMetricValue(sample.gapMs ?? sample.settledMs)}`;
    }
    return `H ${formatMetricValue(sample.handlerMs)}  F ${formatMetricValue(sample.nextFrameMs)}  I ${formatMetricValue(sample.settledMs)}`;
}
function buildUiPerformanceTraceMetrics(sample) {
    if (sample.kind === 'stall') {
        return [
            { label: 'Blocked', value: formatMetricValue(sample.blockedMs ?? sample.settledMs) },
            { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
            { label: 'Settled', value: formatMetricValue(sample.settledMs) },
            { label: 'Severity', value: sample.severity.toUpperCase() },
            { label: 'Recorded', value: sample.recordedAtIso },
            ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
        ];
    }
    if (sample.kind === 'feed') {
        return [
            { label: 'Gap', value: formatMetricValue(sample.gapMs ?? sample.settledMs) },
            { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
            { label: 'Settled', value: formatMetricValue(sample.settledMs) },
            { label: 'Severity', value: sample.severity.toUpperCase() },
            { label: 'Recorded', value: sample.recordedAtIso },
            ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
        ];
    }
    return [
        { label: 'Handler', value: formatMetricValue(sample.handlerMs) },
        { label: 'Next frame', value: formatMetricValue(sample.nextFrameMs) },
        { label: 'Settled', value: formatMetricValue(sample.settledMs) },
        { label: 'Severity', value: sample.severity.toUpperCase() },
        { label: 'Recorded', value: sample.recordedAtIso },
        ...(sample.context ? [{ label: 'Context', value: sample.context }] : []),
    ];
}
