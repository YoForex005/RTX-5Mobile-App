import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { secondsUtc, validateBidTick } from '../support/candleTestUtils';

test('older same-bucket tick can update low but must not move close backward', () => {
  const base = secondsUtc(2024, 3, 22, 12, 0, 0);
  const first = validateBidTick(100, base + 5, 1);
  const newer = validateBidTick(105, base + 20, 2, {}, first.price);
  const lateOlder = validateBidTick(98, base + 10, 3, {}, newer.price);

  const candle = mergeTickIntoLiveCandle(
    mergeTickIntoLiveCandle(createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first), newer),
    lateOlder,
  );

  assert.equal(candle.open, 100);
  assert.equal(candle.high, 105);
  assert.equal(candle.low, 98);
  assert.equal(candle.close, 105);
  assert.equal(candle.lastTickTs, newer.timestamp);
});

test('earlier same-bucket tick before the first observed tick can heal wick without changing open or close', () => {
  const base = secondsUtc(2024, 3, 22, 12, 0, 0);
  const firstObserved = validateBidTick(102, base + 20, 1);
  const closeTick = validateBidTick(104, base + 40, 2, {}, firstObserved.price);
  const trueEarlierOpen = validateBidTick(100, base + 2, 3, {}, closeTick.price);

  const candle = mergeTickIntoLiveCandle(
    mergeTickIntoLiveCandle(
      createLiveCandleFromTick(getLiveTickBucketTime(firstObserved, 'M1'), firstObserved),
      closeTick,
    ),
    trueEarlierOpen,
  );

  assert.equal(candle.open, 102);
  assert.equal(candle.high, 104);
  assert.equal(candle.low, 100);
  assert.equal(candle.close, 104);
  assert.equal(candle.firstTickTs, firstObserved.timestamp);
  assert.equal(candle.lastTickTs, closeTick.timestamp);
});

test('same timestamp uses sequence to decide the newest close', () => {
  const timestamp = secondsUtc(2024, 3, 22, 12, 0, 10);
  const first = validateBidTick(100, timestamp, 1);
  const sameTimeNewerSequence = validateBidTick(101, timestamp, 2, {}, first.price);
  const sameTimeOlderSequence = validateBidTick(99, timestamp, 1, {}, sameTimeNewerSequence.price);

  const candle = mergeTickIntoLiveCandle(
    mergeTickIntoLiveCandle(
      createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first),
      sameTimeNewerSequence,
    ),
    sameTimeOlderSequence,
  );

  assert.equal(candle.high, 101);
  assert.equal(candle.low, 99);
  assert.equal(candle.close, 101);
  assert.equal(candle.lastSequence, 2);
});
