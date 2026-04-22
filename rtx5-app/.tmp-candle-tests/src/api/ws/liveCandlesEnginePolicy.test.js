"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const liveCandlesEnginePolicy_1 = require("./liveCandlesEnginePolicy");
const makeCandle = (time) => ({ time });
(0, node_test_1.default)('shouldRenderBootstrapPreview stays false for cold bootstrap without seeded history', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldRenderBootstrapPreview)(0, 0), false);
});
(0, node_test_1.default)('shouldRenderBootstrapPreview stays true once a merged series already exists', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldRenderBootstrapPreview)(0, 1), true);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldRenderBootstrapPreview)(2, 0), true);
});
(0, node_test_1.default)('shouldAdoptCachedSeries accepts merged cache while entry is still bootstrapping', () => {
    const current = [makeCandle(200)];
    const cached = [makeCandle(100), makeCandle(160), makeCandle(220)];
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldAdoptCachedSeries)('bootstrapping', 0, current, cached), true);
});
(0, node_test_1.default)('shouldAdoptCachedSeries rejects a shorter stale cache once the engine is ready', () => {
    const current = [makeCandle(100), makeCandle(160), makeCandle(220)];
    const cached = [makeCandle(100), makeCandle(160)];
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldAdoptCachedSeries)('ready', current.length, current, cached), false);
});
(0, node_test_1.default)('shouldAdoptCachedSeries rejects an identical cache snapshot', () => {
    const current = [makeCandle(100), makeCandle(160), makeCandle(220)];
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldAdoptCachedSeries)('ready', current.length, current, current), false);
});
(0, node_test_1.default)('resolveVisibleSeriesMode preserves the current visible series when history is absent', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([], [makeCandle(220)], [makeCandle(160)], 'M1'), 'current');
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([], [makeCandle(220)], [], 'M1'), 'current');
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([], [], [], 'M1'), 'empty');
});
(0, node_test_1.default)('resolveVisibleSeriesMode keeps trusted history visible when live candles detach from history', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([makeCandle(100), makeCandle(160)], [makeCandle(340)], [makeCandle(220)], 'M1'), 'history');
});
(0, node_test_1.default)('resolveVisibleSeriesMode keeps the chart empty on cold start when history is detached from live', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([makeCandle(100), makeCandle(160)], [makeCandle(340)], [], 'M1'), 'empty');
});
(0, node_test_1.default)('resolveCurrentVisibleSeries prefers the fresh live-only segment when history is detached', () => {
    const liveOnly = [makeCandle(340), makeCandle(400)];
    const current = [makeCandle(100), makeCandle(160), makeCandle(220)];
    strict_1.default.deepEqual((0, liveCandlesEnginePolicy_1.resolveCurrentVisibleSeries)([makeCandle(100), makeCandle(160)], liveOnly, current), liveOnly);
});
(0, node_test_1.default)('resolveCurrentVisibleSeries falls back to the current visible series when live candles are temporarily empty', () => {
    const current = [makeCandle(220), makeCandle(280)];
    strict_1.default.deepEqual((0, liveCandlesEnginePolicy_1.resolveCurrentVisibleSeries)([makeCandle(100), makeCandle(160)], [], current), current);
});
(0, node_test_1.default)('resolveVisibleSeriesMode merges history and live candles when they stay contiguous', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.resolveVisibleSeriesMode)([makeCandle(100), makeCandle(160)], [makeCandle(220)], [makeCandle(160)], 'M1'), 'merged');
});
(0, node_test_1.default)('shouldSyncVisibleSeriesCache rejects detached current slices from the shared bootstrap cache', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldSyncVisibleSeriesCache)('current', [makeCandle(340)], 'M1'), false);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldSyncVisibleSeriesCache)('current', [
        makeCandle(60),
        makeCandle(120),
        makeCandle(180),
        makeCandle(240),
        makeCandle(300),
        makeCandle(360),
        makeCandle(420),
        makeCandle(480),
    ], 'M1'), false);
});
(0, node_test_1.default)('shouldSyncVisibleSeriesCache keeps merged and history snapshots cacheable', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldSyncVisibleSeriesCache)('history', [makeCandle(100)], 'M1'), true);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldSyncVisibleSeriesCache)('merged', [makeCandle(100), makeCandle(160)], 'M1'), true);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldSyncVisibleSeriesCache)('empty', [], 'M1'), false);
});
(0, node_test_1.default)('shouldKeepBootstrappingOnHistoryFailure stays true until the engine has a safe visible series', () => {
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldKeepBootstrappingOnHistoryFailure)(0, 0), true);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldKeepBootstrappingOnHistoryFailure)(1, 0), false);
    strict_1.default.equal((0, liveCandlesEnginePolicy_1.shouldKeepBootstrappingOnHistoryFailure)(0, 2), false);
});
