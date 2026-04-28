import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT,
  buildQuoteRolloverCandle,
  mergeFetchedHistoryIntoWindow,
  shouldBackfillBootstrapHistory,
  shouldAcceptBootstrapHistory,
} from './liveCandlesEngine.helpers';

test('buildQuoteRolloverCandle uses the first observed quote as the provisional open from pure history', () => {
  assert.deepEqual(
    buildQuoteRolloverCandle(120, 464.067, 469.486, false),
    {
      time: 120,
      open: 469.486,
      high: 469.486,
      low: 469.486,
      close: 469.486,
      volume: 0,
    },
  );
});

test('buildQuoteRolloverCandle opens from the first observed quote even when live overlay is active', () => {
  assert.deepEqual(
    buildQuoteRolloverCandle(180, 469.486, 469.826, true),
    {
      time: 180,
      open: 469.826,
      high: 469.826,
      low: 469.826,
      close: 469.826,
      volume: 0,
    },
  );
});

test('mergeFetchedHistoryIntoWindow preserves the existing trusted window when a refresh snapshot is shorter', () => {
  assert.deepEqual(
    mergeFetchedHistoryIntoWindow(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
        { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
      ],
      [
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
      ],
      'M1',
    ),
    [
      { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
      { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
      { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
      { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.19, volume: 13 },
    ],
  );
});

test('mergeFetchedHistoryIntoWindow heals the existing window with fresher recent history', () => {
  assert.deepEqual(
    mergeFetchedHistoryIntoWindow(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
        { time: 120, open: 1.11, high: 1.15, low: 1.1, close: 1.14, volume: 11 },
        { time: 180, open: 1.14, high: 1.18, low: 1.13, close: 1.17, volume: 12 },
      ],
      [
        { time: 120, open: 1.11, high: 1.16, low: 1.1, close: 1.15, volume: 15 },
        { time: 180, open: 1.15, high: 1.19, low: 1.14, close: 1.18, volume: 16 },
        { time: 240, open: 1.18, high: 1.22, low: 1.17, close: 1.21, volume: 14 },
      ],
      'M1',
    ),
    [
      { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
      { time: 120, open: 1.11, high: 1.16, low: 1.1, close: 1.15, volume: 15 },
      { time: 180, open: 1.15, high: 1.19, low: 1.14, close: 1.18, volume: 16 },
      { time: 240, open: 1.18, high: 1.22, low: 1.17, close: 1.21, volume: 14 },
    ],
  );
});

test('shouldAcceptBootstrapHistory requires a trustworthy backend history window', () => {
  assert.equal(
    shouldAcceptBootstrapHistory(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
      ],
      'M1',
    ),
    false,
  );
  assert.equal(
    shouldAcceptBootstrapHistory(
      Array.from({ length: 8 }, (_, index) => {
        const price = 1.1 + index * 0.01;
        return {
          time: 60 + index * 60,
          open: price,
          high: price + 0.01,
          low: price - 0.01,
          close: price,
          volume: 10,
        };
      }),
      'M1',
    ),
    true,
  );
});

test('shouldBackfillBootstrapHistory only schedules a full fetch after a short first-paint load', () => {
  assert.equal(shouldBackfillBootstrapHistory(FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), true);
  assert.equal(shouldBackfillBootstrapHistory(0, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), false);
  assert.equal(shouldBackfillBootstrapHistory(2500, 2500), false);
  assert.equal(shouldBackfillBootstrapHistory(500, 500), true);
  assert.equal(shouldBackfillBootstrapHistory(500, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), true);
});
