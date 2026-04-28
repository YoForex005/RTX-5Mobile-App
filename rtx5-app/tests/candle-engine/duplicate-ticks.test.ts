import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { secondsUtc, validateBidTick } from '../support/candleTestUtils';

test('stable duplicate signatures suppress fake volume and OHLC changes', () => {
  const seen = new Set<string>();
  const timestamp = secondsUtc(2024, 3, 22, 12, 0, 1);
  const first = validateBidTick(100, timestamp, 1);
  const duplicateA = validateBidTick(100, timestamp, 2);
  const duplicateB = validateBidTick(100, timestamp, 3);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  seen.add(first.signature);
  for (const duplicate of [duplicateA, duplicateB]) {
    if (!seen.has(duplicate.signature)) {
      seen.add(duplicate.signature);
      candle = mergeTickIntoLiveCandle(candle, duplicate);
    }
  }

  assert.equal(duplicateA.signature, first.signature);
  assert.equal(duplicateB.signature, first.signature);
  assert.equal(candle.open, 100);
  assert.equal(candle.high, 100);
  assert.equal(candle.low, 100);
  assert.equal(candle.close, 100);
  assert.equal(candle.volume, 0);
});

test('same timestamp with changed price is not treated as identical duplicate', () => {
  const timestamp = secondsUtc(2024, 3, 22, 12, 0, 1);
  const first = validateBidTick(100, timestamp, 1);
  const changed = validateBidTick(101, timestamp, 2, {}, first.price);

  assert.notEqual(changed.signature, first.signature);

  const candle = mergeTickIntoLiveCandle(
    createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first),
    changed,
  );

  assert.equal(candle.high, 101);
  assert.equal(candle.close, 101);
  assert.equal(candle.volume, 0);
});
