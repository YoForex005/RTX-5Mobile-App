import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
  validateQuoteTickForCandle,
} from './liveCandleOverlay';

const requireTick = (
  bid: number,
  timestamp: number,
  sequence: number,
  referencePrice?: number,
) => {
  const tick = validateQuoteTickForCandle(
    { bid, ask: bid + 0.0001, timestamp },
    { priceBasis: 'bid', sequence, referencePrice },
  );
  assert.ok(tick);
  return tick;
};

test('mergeTickIntoLiveCandle preserves close when an older same-bucket tick arrives late', () => {
  const first = requireTick(1.1, 1713744065, 1);
  const bucketTime = getLiveTickBucketTime(first, 'M1');
  const candle = createLiveCandleFromTick(bucketTime, first);
  const lateOlder = requireTick(1.05, 1713744061, 2, candle.close);

  const merged = mergeTickIntoLiveCandle(candle, lateOlder);

  assert.equal(merged.open, 1.1);
  assert.equal(merged.low, 1.05);
  assert.equal(merged.close, 1.1);
  assert.equal(merged.firstTickTs, first.timestamp);
  assert.equal(merged.lastTickTs, first.timestamp);
});

test('mergeTickIntoLiveCandle updates close only from the newest timestamp and sequence', () => {
  const first = requireTick(1.1, 1713744065, 1);
  const candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);
  const newer = requireTick(1.2, 1713744070, 2, candle.close);
  const sameTimestampNewerSequence = requireTick(1.25, 1713744070, 3, newer.price);

  const merged = mergeTickIntoLiveCandle(mergeTickIntoLiveCandle(candle, newer), sameTimestampNewerSequence);

  assert.equal(merged.high, 1.25);
  assert.equal(merged.close, 1.25);
  assert.equal(merged.lastTickTs, sameTimestampNewerSequence.timestamp);
  assert.equal(merged.lastSequence, sameTimestampNewerSequence.sequence);
});

test('validateQuoteTickForCandle rejects missing server timestamp and bad ticks', () => {
  assert.equal(validateQuoteTickForCandle({ bid: 1.1, ask: 1.2 }, { priceBasis: 'bid', sequence: 1 }), null);
  assert.equal(
    validateQuoteTickForCandle({ bid: 1.2, ask: 1.1, timestamp: 1713744065 }, { priceBasis: 'bid', sequence: 1 }),
    null,
  );
  assert.equal(
    validateQuoteTickForCandle(
      { bid: 2.0, ask: 2.0001, timestamp: 1713744065 },
      { priceBasis: 'bid', sequence: 1, referencePrice: 1.0 },
    ),
    null,
  );
});

test('validateQuoteTickForCandle supports last price basis only when a last price exists', () => {
  assert.equal(
    validateQuoteTickForCandle(
      { bid: 1.1, ask: 1.1001, timestamp: 1713744065 },
      { priceBasis: 'last', sequence: 1 },
    ),
    null,
  );

  const tick = validateQuoteTickForCandle(
    { bid: 1.1, ask: 1.1001, last: 1.10005, timestamp: 1713744065 },
    { priceBasis: 'last', sequence: 1 },
  );

  assert.ok(tick);
  assert.equal(tick.price, 1.10005);
});

test('validateQuoteTickForCandle supports mid price basis from bid and ask', () => {
  const tick = validateQuoteTickForCandle(
    { bid: 1.1, ask: 1.1002, timestamp: 1713744065 },
    { priceBasis: 'mid', sequence: 1 },
  );

  assert.ok(tick);
  assert.equal(tick.price, 1.1001);
});

test('validated duplicate ticks have the same stable signature', () => {
  const first = requireTick(1.1, 1713744065, 1);
  const duplicate = requireTick(1.1, 1713744065, 1);

  assert.equal(duplicate.signature, first.signature);
});

test('mergeTickIntoLiveCandle handles high-frequency same-bucket bursts without corrupting OHLC', () => {
  const first = requireTick(1.1, 1713744061, 1);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  for (let index = 2; index <= 250; index += 1) {
    const price = index % 2 === 0 ? 1.1 + index / 100000 : 1.1 - index / 100000;
    candle = mergeTickIntoLiveCandle(candle, requireTick(price, 1713744061, index, candle.close));
  }

  assert.equal(candle.volume, 0);
  assert.ok(candle.high > 1.102);
  assert.ok(candle.low < 1.098);
  assert.equal(candle.lastSequence, 250);
});
