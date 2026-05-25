import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLivePriceCoherentCandles } from './chartDisplayCandles';
import type { Candle } from '../../domain/candles/core/candleTypes';

const staleGoldHistory: Candle[] = [
  { time: 1_769_000_000, open: 2370, high: 2388, low: 2365, close: 2384, volume: 10 },
  { time: 1_769_000_060, open: 2384, high: 2440, low: 2380, close: 2433, volume: 12 },
];

test('keeps coherent candles when the fresh quote matches the history price regime', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: 2434,
    time: 1_769_000_090,
    nowSeconds: 1_769_000_090,
  });

  assert.equal(result, staleGoldHistory);
  assert.deepEqual(result, staleGoldHistory);
});

test('replaces an incompatible stale candle regime with a live-price candle', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: 4539.64,
    time: 1_769_000_125,
    nowSeconds: 1_769_000_125,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].time, 1_769_000_100);
  assert.equal(result[0].open, 4539.64);
  assert.equal(result[0].high, 4539.64);
  assert.equal(result[0].low, 4539.64);
  assert.equal(result[0].close, 4539.64);
});

test('drops stale history when a generated live candle starts a new price regime', () => {
  const staleBitcoinHistoryWithLiveTail: Candle[] = [
    { time: 1_763_000_000, open: 79650, high: 79700, low: 79620, close: 79640, volume: 10 },
    { time: 1_763_000_060, open: 79640, high: 79660, low: 79590, close: 79595.51, volume: 12 },
    { time: 1_764_059_100, open: 77485.24, high: 77485.24, low: 77485.24, close: 77485.24, volume: 0 },
  ];

  const result = resolveLivePriceCoherentCandles(staleBitcoinHistoryWithLiveTail, 'M1', {
    price: 77485.24,
    time: 1_764_059_100,
    nowSeconds: 1_764_059_100,
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], staleBitcoinHistoryWithLiveTail[2]);
});

test('does not synthesize candles without a positive finite live price', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: null,
    nowSeconds: 1_769_000_125,
  });

  assert.equal(result, staleGoldHistory);
  assert.deepEqual(result, staleGoldHistory);
});
