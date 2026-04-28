import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
} from '../../src/api/ws/liveCandleOverlay';
import {
  getExpectedNextCandleTime,
  materializeCanonicalHistoryAndLiveCandles,
} from '../../src/domain/candles';
import { resolveVisibleSeriesMode } from '../../src/api/ws/liveCandlesEnginePolicy';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeLiveOverlayCandle,
  secondsUtc,
  validateBidTick,
} from '../support/candleTestUtils';

test('history tail plus next-bucket live tick creates one clean live candle', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 1, 'M1');
  const nextTime = getExpectedNextCandleTime(history[0].time, 'M1');
  const tick = validateBidTick(1.2, nextTime + 5, 1);
  const live = [createLiveCandleFromTick(getLiveTickBucketTime(tick, 'M1', history[0].time), tick)];

  assert.equal(live[0].time, nextTime);
  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [history[0].time, nextTime]);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('same-bucket live tick updates the active live candle instead of appending', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const first = validateBidTick(100, bucket + 5, 1);
  const second = validateBidTick(102, bucket + 30, 2, {}, first.price);
  const live = mergeTickIntoLiveCandle(
    createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first),
    second,
  );

  assert.equal(live.time, bucket);
  assert.equal(live.open, 100);
  assert.equal(live.high, 102);
  assert.equal(live.close, 102);
});

test('far-ahead live tick merges into one series while preserving the gap', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const detached = [makeLiveOverlayCandle(secondsUtc(2024, 3, 22, 10, 10, 0), { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(history, detached, history, 'M1'), 'merged');

  const chartVisible = materializeCanonicalHistoryAndLiveCandles(history, detached, 'M1');
  assert.deepEqual(chartVisible.map((candle) => candle.time), [
    ...history.map((candle) => candle.time),
    secondsUtc(2024, 3, 22, 10, 10, 0),
  ]);
  assertNoDuplicateCandleTimes(chartVisible);
});

test('REST catch-up keeps the same merged series without duplicate live buckets', () => {
  const start = secondsUtc(2024, 3, 22, 10, 0, 0);
  const staleHistory = buildContiguousHistory(start, 3, 'M1');
  const detachedTime = secondsUtc(2024, 3, 22, 10, 10, 0);
  const detachedLive = [makeLiveOverlayCandle(detachedTime, { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(staleHistory, detachedLive, staleHistory, 'M1'), 'merged');

  const caughtUpHistory = buildContiguousHistory(start, 10, 'M1');
  assert.equal(resolveVisibleSeriesMode(caughtUpHistory, detachedLive, staleHistory, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(caughtUpHistory, detachedLive, 'M1');
  assert.deepEqual(visible[visible.length - 1].time, detachedTime);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});
