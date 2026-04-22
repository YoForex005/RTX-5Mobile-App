"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const orderTicketPreviewUtils_1 = require("./orderTicketPreviewUtils");
(0, node_test_1.default)('preview series pads history and anchors the last point to live bid ask', () => {
    const series = (0, orderTicketPreviewUtils_1.buildOrderTicketPreviewSeries)({
        candles: [{ close: 1.2010 }, { close: 1.2012 }],
        bid: 1.2008,
        ask: 1.2010,
        sampleSize: 4,
    });
    strict_1.default.equal(series.length, 4);
    strict_1.default.deepEqual(series[series.length - 1], { bid: 1.2008, ask: 1.2010 });
    strict_1.default.deepEqual(series[0], series[1]);
});
(0, node_test_1.default)('price-decimal resolution respects the instrument tick size when present', () => {
    strict_1.default.equal((0, orderTicketPreviewUtils_1.resolveOrderTicketPriceDecimals)(0.0001, 1.2, 1.2002), 4);
    strict_1.default.equal((0, orderTicketPreviewUtils_1.resolveOrderTicketPriceDecimals)(0.01, 2450.1, 2450.3), 2);
});
