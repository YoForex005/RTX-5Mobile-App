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
      volume: 1,
    },
  );
});

test('buildQuoteRolloverCandle keeps the previous close once a live overlay is already active', () => {
  assert.deepEqual(
    buildQuoteRolloverCandle(180, 469.486, 469.826, true),
    {
      time: 180,
      open: 469.486,
      high: 469.826,
      low: 469.486,
      close: 469.826,
      volume: 1,
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
      { time: 180, open: 1.15, high: 1.19, low: 1.13, close: 1.17, volume: 16 },
      { time: 240, open: 1.18, high: 1.22, low: 1.17, close: 1.21, volume: 14 },
    ],
  );
});

test('shouldAcceptBootstrapHistory rejects thin bootstrap history windows', () => {
  assert.equal(
    shouldAcceptBootstrapHistory(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 10 },
      ],
      'M1',
    ),
    false,
  );
});

test('shouldBackfillBootstrapHistory only schedules a full fetch after a short first-paint load', () => {
  assert.equal(shouldBackfillBootstrapHistory(FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), true);
  assert.equal(shouldBackfillBootstrapHistory(0, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), false);
  assert.equal(shouldBackfillBootstrapHistory(500, 500), false);
  assert.equal(shouldBackfillBootstrapHistory(500, FAST_BOOTSTRAP_CANDLE_HISTORY_LIMIT), false);
});
