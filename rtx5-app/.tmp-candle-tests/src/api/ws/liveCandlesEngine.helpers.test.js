"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const liveCandlesEngine_helpers_1 = require("./liveCandlesEngine.helpers");
(0, node_test_1.default)('buildQuoteRolloverCandle uses the first observed quote as the provisional open from pure history', () => {
    strict_1.default.deepEqual((0, liveCandlesEngine_helpers_1.buildQuoteRolloverCandle)(120, 464.067, 469.486, false), {
        time: 120,
        open: 469.486,
        high: 469.486,
        low: 469.486,
        close: 469.486,
        volume: 1,
    });
});
(0, node_test_1.default)('buildQuoteRolloverCandle keeps the previous close once a live overlay is already active', () => {
    strict_1.default.deepEqual((0, liveCandlesEngine_helpers_1.buildQuoteRolloverCandle)(180, 469.486, 469.826, true), {
        time: 180,
        open: 469.486,
        high: 469.826,
        low: 469.486,
        close: 469.826,
        volume: 1,
    });
});
(0, node_test_1.default)('mergeFetchedHistoryIntoWindow preserves the existing trusted window when a refresh snapshot is shorter', () => {
    strict_1.default.deepEqual((0, liveCandlesEngine_helpers_1.mergeFetchedHistoryIntoWindow)([
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
        { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
    ], [
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
    ], 'M1'), [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
        { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
    ]);
});
(0, node_test_1.default)('mergeFetchedHistoryIntoWindow heals the existing window with fresher recent history', () => {
    strict_1.default.deepEqual((0, liveCandlesEngine_helpers_1.mergeFetchedHistoryIntoWindow)([
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
        { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
    ], [
        { time: 120, open: 1.11, high: 1.16, low: 1.1, close: 1.15, volume: 15 },
        { time: 180, open: 1.15, high: 1.19, low: 1.14, close: 1.18, volume: 16 },
        { time: 240, open: 1.18, high: 1.22, low: 1.17, close: 1.21, volume: 14 },
    ], 'M1'), [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.16, low: 1.1, close: 1.15, volume: 15 },
        { time: 180, open: 1.15, high: 1.19, low: 1.13, close: 1.17, volume: 16 },
        { time: 240, open: 1.18, high: 1.22, low: 1.17, close: 1.21, volume: 14 },
    ]);
});
(0, node_test_1.default)('shouldAcceptBootstrapHistory rejects thin bootstrap history windows', () => {
    strict_1.default.equal((0, liveCandlesEngine_helpers_1.shouldAcceptBootstrapHistory)([
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
    ], 'M1'), false);
});
