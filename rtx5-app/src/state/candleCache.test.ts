import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { Candle, useTradingState } from './tradingState';
import { mergeHistoryIntoCandleCache, syncMergedCandleCache } from './candleCache';

const resetCandleCache = () => {
  useTradingState.setState((state) => ({
    ...state,
    candles: {},
  }));
};

beforeEach(() => {
  resetCandleCache();
});

afterEach(() => {
  resetCandleCache();
});

test('mergeHistoryIntoCandleCache heals history without stripping the active live candle', () => {
  const cachedCandles: Candle[] = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.13, high: 1.22, low: 1.09, close: 1.2, volume: 12 },
  ];
  const recentHistory: Candle[] = [
    { time: 60, open: 1.1, high: 1.14, low: 1.07, close: 1.12, volume: 15 },
    { time: 120, open: 1.11, high: 1.18, low: 1.1, close: 1.16, volume: 20 },
  ];

  useTradingState.getState().setCandleHistory('EURUSD', 'M1', cachedCandles);
  const merged = mergeHistoryIntoCandleCache('EURUSD', 'M1', recentHistory);

  assert.deepEqual(merged, [
    { time: 60, open: 1.1, high: 1.14, low: 1.07, close: 1.12, volume: 15 },
    { time: 120, open: 1.11, high: 1.22, low: 1.09, close: 1.2, volume: 20 },
  ]);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], merged);
});

test('syncMergedCandleCache restores the canonical merged series after raw history overwrites the cache', () => {
  const rawHistory: Candle[] = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.13, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
  ];
  const mergedSeries: Candle[] = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.11, high: 1.21, low: 1.09, close: 1.2, volume: 18 },
    { time: 180, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
  ];

  useTradingState.getState().setCandleHistory('EURUSD', 'M1', rawHistory);

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries), true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], mergedSeries);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries), false);
});

test('syncMergedCandleCache accepts canonical merged series without re-normalizing them', () => {
  const mergedSeries: Candle[] = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.11, high: 1.21, low: 1.09, close: 1.2, volume: 18 },
    { time: 180, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
  ];

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries, { canonical: true }), true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], mergedSeries);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries, { canonical: true }), false);
});
