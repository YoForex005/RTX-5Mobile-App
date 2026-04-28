import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
  validateQuoteTickForCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { assertValidCandleSeries, secondsUtc, validateBidTick } from '../support/candleTestUtils';

const buildBurst = (count: number, startTimestamp: number) =>
  Array.from({ length: count }, (_, index) => {
    const wave = index % 2 === 0 ? index : -index;
    return {
      price: 1.1 + wave / 10_000_000,
      timestamp: startTimestamp + Math.floor(index / 1000),
      sequence: index + 1,
    };
  });

const independentlyReduce = (ticks: ReturnType<typeof buildBurst>) => ({
  open: ticks[0].price,
  high: Math.max(...ticks.map((tick) => tick.price)),
  low: Math.min(...ticks.map((tick) => tick.price)),
  close: ticks[ticks.length - 1].price,
  volume: 0,
});

const reduceThroughLiveOverlay = (ticks: ReturnType<typeof buildBurst>) => {
  const first = validateBidTick(ticks[0].price, ticks[0].timestamp, ticks[0].sequence);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  for (let index = 1; index < ticks.length; index += 1) {
    const input = ticks[index];
    const tick = validateBidTick(input.price, input.timestamp, input.sequence, {}, candle.close);
    candle = mergeTickIntoLiveCandle(candle, tick);
  }

  return candle;
};

for (const [label, count] of [
  ['1,000 ticks in 10 seconds', 1_000],
  ['5,000 ticks in 60 seconds', 5_000],
  ['20,000 ticks in 5 minutes', 20_000],
] as const) {
  test(`high-frequency burst preserves independently calculated OHLC: ${label}`, () => {
    const ticks = buildBurst(count, secondsUtc(2024, 3, 22, 12, 0, 1));
    const expected = independentlyReduce(ticks);
    const candle = reduceThroughLiveOverlay(ticks);

    assert.equal(candle.open, expected.open);
    assert.equal(candle.high, expected.high);
    assert.equal(candle.low, expected.low);
    assert.equal(candle.close, expected.close);
    assert.equal(candle.volume, expected.volume);
    assert.equal(candle.lastSequence, count);
    assertValidCandleSeries([candle]);
  });
}

test('queue-sized burst duplicate signatures can be suppressed before OHLC merge', () => {
  const signatures = new Set<string>();
  const timestamp = secondsUtc(2024, 3, 22, 12, 0, 1);
  const tickInputs = Array.from({ length: 4096 }, () => ({ bid: 1.1, ask: 1.1001, timestamp }));
  let accepted = 0;

  for (let index = 0; index < tickInputs.length; index += 1) {
    const tick = validateQuoteTickForCandle(tickInputs[index], {
      priceBasis: 'bid',
      sequence: index + 1,
      referencePrice: 1.1,
    });
    if (tick && !signatures.has(tick.signature)) {
      signatures.add(tick.signature);
      accepted += 1;
    }
  }

  assert.equal(accepted, 1);
});
