import assert from 'node:assert';
import { buildFreshHistoryLiveCandleSeries, materializeLiveCandleMap } from './src/domain/candles/series/freshHistoryLiveSeries.js';
import { applyQuoteTickExtensionToCandleMap } from './src/domain/candles/series/liveCandleAggregator.js';

const timeframe = 'M1';

// History from backend: 1713744000 (closed) and 1713744062 (forming - unaligned)
const historyCandles = [
  { time: 1713744000, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10, source: 'history', closed: true },
  { time: 1713744062, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12, source: 'history', closed: false },
];

const historyCutoffTime = 1713744000;
const liveCandleMap = new Map();

// 1. Tick arrives for 1713744090
applyQuoteTickExtensionToCandleMap(
  liveCandleMap,
  { price: 1.3, time: 1713744090 },
  timeframe,
  {
    historyCutoffTime,
    latestHistoryCandle: historyCandles[historyCandles.length - 1],
  }
);

// 2. Materialize live candles
const liveCandles = materializeLiveCandleMap(liveCandleMap, historyCutoffTime);

// 3. Build fresh history live series
const result = buildFreshHistoryLiveCandleSeries(historyCandles, liveCandles);

console.log('Result timestamps:', result.map(c => c.time));
assert.equal(result.length, 2, 'Should not have duplicate candles for the same bucket');
