import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
  validateQuoteTickForCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { assertValidCandleSeries, secondsUtc, validateBidTick } from '../support/candleTestUtils';

const buildCandleFromPrices = (prices: number[]) => {
  const baseTime = secondsUtc(2024, 3, 22, 12, 0, 1);
  const first = validateBidTick(prices[0], baseTime, 1);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  prices.slice(1).forEach((price, index) => {
    candle = mergeTickIntoLiveCandle(
      candle,
      validateBidTick(price, baseTime + index + 1, index + 2, {}, candle.close),
    );
  });

  return candle;
};

test('first valid tick creates O=H=L=C', () => {
  const candle = buildCandleFromPrices([100]);

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 100);
  assert.equal(candle.low, 100);
  assert.equal(candle.close, 100);
  assert.equal(candle.volume, 0);
});

test('rising ticks update high and close without moving open', () => {
  const candle = buildCandleFromPrices([100, 102]);

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 102);
  assert.equal(candle.low, 100);
  assert.equal(candle.close, 102);
});

test('falling ticks update low and close without moving open', () => {
  const candle = buildCandleFromPrices([100, 98]);

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 100);
  assert.equal(candle.low, 98);
  assert.equal(candle.close, 98);
});

test('mixed ticks preserve first open, extremes, and latest close', () => {
  const candle = buildCandleFromPrices([100, 105, 99, 103]);

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 105);
  assert.equal(candle.low, 99);
  assert.equal(candle.close, 103);
  assert.equal(candle.volume, 0);
  assertValidCandleSeries([candle]);
});

test('repeated valid ticks do not corrupt OHLC shape', () => {
  const candle = buildCandleFromPrices([100, 100, 100]);

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 100);
  assert.equal(candle.low, 100);
  assert.equal(candle.close, 100);
  assert.equal(candle.volume, 0);
  assertValidCandleSeries([candle]);
});

test('invalid prices and malformed spreads are rejected before candle generation', () => {
  const options = { priceBasis: 'bid' as const, sequence: 1 };

  assert.equal(validateQuoteTickForCandle({ bid: 0, ask: 0.0001, timestamp: 1 }, options), null);
  assert.equal(validateQuoteTickForCandle({ bid: Number.NaN, ask: 1, timestamp: 1 }, options), null);
  assert.equal(validateQuoteTickForCandle({ bid: null, ask: 1, timestamp: 1 }, options), null);
  assert.equal(validateQuoteTickForCandle({ bid: 101, ask: 100, timestamp: 1 }, options), null);
});

test('single bad price spike is rejected when it exceeds reference-price guardrail', () => {
  assert.equal(
    validateQuoteTickForCandle(
      { bid: 999999, ask: 1000000, timestamp: secondsUtc(2024, 3, 22, 12, 0, 5) },
      { priceBasis: 'bid', sequence: 2, referencePrice: 2300 },
    ),
    null,
  );
});
