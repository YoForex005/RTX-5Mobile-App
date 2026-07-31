import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatChartCandleCountdown,
  getChartCandleCountdownSeconds,
  resolveChartCandleCloseTimeMs,
} from './chartCandleCountdown';

const utcMs = (
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): number => Date.UTC(year, month, day, hour, minute, second);

test('countdown uses the selected M1 and M5 boundaries without an M1 fallback', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;
  const nowMs = utcMs(2026, 6, 31, 10, 0, 23);

  assert.equal(
    getChartCandleCountdownSeconds({ candleOpenTime, timeframe: 'M1', nowMs }),
    37,
  );
  assert.equal(
    getChartCandleCountdownSeconds({ candleOpenTime, timeframe: 'M5', nowMs }),
    277,
  );
  assert.equal(formatChartCandleCountdown(37), '00:37');
  assert.equal(formatChartCandleCountdown(277), '04:37');
});

test('invalid timeframe is rejected instead of silently becoming M1', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;

  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M2',
      nowMs: utcMs(2026, 6, 31, 10, 0, 23),
    }),
    null,
  );
  assert.equal(resolveChartCandleCloseTimeMs(candleOpenTime, 'M2'), null);
});

test('countdown reaches zero and waits for the next candle timestamp', () => {
  const candleOpenTime = utcMs(2026, 6, 31, 10, 0) / 1000;

  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M5',
      nowMs: utcMs(2026, 6, 31, 10, 5),
    }),
    0,
  );
  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime,
      timeframe: 'M5',
      nowMs: utcMs(2026, 6, 31, 10, 7),
    }),
    0,
  );
  assert.equal(formatChartCandleCountdown(0), '00:00');
});

test('monthly countdown follows the real UTC calendar boundary', () => {
  const februaryOpenSeconds = utcMs(2028, 1, 1) / 1000;

  assert.equal(
    resolveChartCandleCloseTimeMs(februaryOpenSeconds, 'MN'),
    utcMs(2028, 2, 1),
  );
  assert.equal(
    getChartCandleCountdownSeconds({
      candleOpenTime: februaryOpenSeconds,
      timeframe: 'MN',
      nowMs: utcMs(2028, 1, 29, 23, 59, 59),
    }),
    1,
  );
});

test('long countdowns use hour and day-aware labels', () => {
  assert.equal(formatChartCandleCountdown(4 * 60 * 60), '04:00:00');
  assert.equal(formatChartCandleCountdown(7 * 24 * 60 * 60), '7d 00:00:00');
});

