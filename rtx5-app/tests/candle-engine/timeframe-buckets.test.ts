import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignTimeToBucket,
  alignTimeToBucketWithReference,
  getExpectedNextCandleTime,
} from '../../src/domain/candles';
import { getLiveTickBucketTime } from '../../src/api/ws/liveCandleOverlay';
import { secondsUtc, validateBidTick } from '../support/candleTestUtils';

test('M1 tick at 12:01:23 creates bucket at 12:01:00', () => {
  const tickTime = secondsUtc(2024, 3, 22, 12, 1, 23);
  assert.equal(alignTimeToBucket(tickTime, 'M1'), secondsUtc(2024, 3, 22, 12, 1, 0));
});

test('M5 tick at 12:04:59 maps to 12:00 and tick at 12:05:00 maps to a new bucket', () => {
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 3, 22, 12, 4, 59), 'M5'),
    secondsUtc(2024, 3, 22, 12, 0, 0),
  );
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 3, 22, 12, 5, 0), 'M5'),
    secondsUtc(2024, 3, 22, 12, 5, 0),
  );
});

test('all supported intraday timeframes produce deterministic buckets', () => {
  const sample = secondsUtc(2024, 3, 22, 10, 37, 45);
  const expectedByTimeframe: Record<string, number> = {
    M1: secondsUtc(2024, 3, 22, 10, 37, 0),
    M3: secondsUtc(2024, 3, 22, 10, 36, 0),
    M5: secondsUtc(2024, 3, 22, 10, 35, 0),
    M15: secondsUtc(2024, 3, 22, 10, 30, 0),
    M30: secondsUtc(2024, 3, 22, 10, 30, 0),
    H1: secondsUtc(2024, 3, 22, 10, 0, 0),
    H2: secondsUtc(2024, 3, 22, 10, 0, 0),
    H4: secondsUtc(2024, 3, 22, 8, 0, 0),
  };

  for (const [timeframe, expected] of Object.entries(expectedByTimeframe)) {
    assert.equal(alignTimeToBucket(sample, timeframe), expected, timeframe);
  }
});

test('H1 end-of-hour and day-change ticks map to the correct bucket starts', () => {
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 3, 22, 12, 59, 59), 'H1'),
    secondsUtc(2024, 3, 22, 12, 0, 0),
  );
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 3, 23, 0, 0, 0), 'D1'),
    secondsUtc(2024, 3, 23, 0, 0, 0),
  );
});

test('W1 buckets start on UTC Monday and MN buckets start on first day of month', () => {
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 3, 24, 13, 15, 0), 'W1'),
    secondsUtc(2024, 3, 22, 0, 0, 0),
  );
  assert.equal(
    alignTimeToBucket(secondsUtc(2024, 4, 31, 23, 59, 59), 'MN'),
    secondsUtc(2024, 4, 1, 0, 0, 0),
  );
});

test('live bucket alignment uses UTC month starts across uneven months', () => {
  const january31Bucket = secondsUtc(2024, 0, 31, 0, 0, 0);
  const februaryTick = secondsUtc(2024, 1, 29, 11, 0, 0);
  const marchTick = secondsUtc(2024, 2, 31, 12, 0, 0);

  assert.equal(
    alignTimeToBucketWithReference(februaryTick, 'MN', january31Bucket),
    secondsUtc(2024, 1, 1, 0, 0, 0),
  );
  assert.equal(
    alignTimeToBucketWithReference(marchTick, 'MN', january31Bucket),
    secondsUtc(2024, 2, 1, 0, 0, 0),
  );
});

test('validated live ticks map to exactly one bucket per timeframe', () => {
  const tick = validateBidTick(1.1, secondsUtc(2024, 3, 22, 12, 5, 1), 1);

  for (const timeframe of ['M1', 'M3', 'M5', 'M15', 'M30', 'H1', 'H2', 'H4', 'D1', 'W1', 'MN']) {
    const bucket = getLiveTickBucketTime(tick, timeframe);
    assert.equal(Number.isFinite(bucket), true, timeframe);
    assert.equal(getExpectedNextCandleTime(bucket, timeframe) > bucket, true, timeframe);
  }
});
