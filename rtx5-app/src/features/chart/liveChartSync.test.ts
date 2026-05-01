import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  formatCandleGapDuration,
  getChartSeriesUpdateMode,
  RenderableChartCandle,
  resolveLatestCandleGap,
} from './liveChartSync';

const makeCandle = (
  time: number,
  overrides: Partial<RenderableChartCandle> = {},
): RenderableChartCandle => ({
  time,
  open: 1.1,
  high: 1.2,
  low: 1.0,
  close: 1.15,
  volume: 10,
  ...overrides,
});

test('getChartSeriesUpdateMode uses incremental updates when only the active candle changes', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { high: 1.25, close: 1.2 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { high: 1.3, close: 1.22 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'incremental');
});

test('getChartSeriesUpdateMode uses incremental updates when one new candle appends cleanly', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { close: 1.2 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { close: 1.2 }),
    makeCandle(220, { open: 1.2, high: 1.21, low: 1.19, close: 1.205 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'incremental');
});

test('getChartSeriesUpdateMode forces a full reload when recent history changes behind the active candle', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { low: 0.99, close: 1.2 }),
    makeCandle(220, { close: 1.21 }),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160, { low: 0.95, close: 1.2 }),
    makeCandle(220, { close: 1.21 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'full_reload');
});

test('getChartSeriesUpdateMode forces a full reload when the rolling window shifts during long sessions', () => {
  const previous = buildChartSeriesSnapshot([
    makeCandle(100),
    makeCandle(160),
    makeCandle(220),
  ]);

  const next = buildChartSeriesSnapshot([
    makeCandle(160),
    makeCandle(220),
    makeCandle(280),
  ]);

  assert.equal(getChartSeriesUpdateMode(previous, next), 'full_reload');
});

test('getChartSeriesUpdateMode requests a full reload for the first synced series', () => {
  const next = buildChartSeriesSnapshot([makeCandle(100)]);

  assert.equal(getChartSeriesUpdateMode(EMPTY_CHART_SERIES_SNAPSHOT, next), 'full_reload');
});

test('resolveLatestCandleGap reports the last visible missing candle span', () => {
  const gap = resolveLatestCandleGap(
    [
      makeCandle(60),
      makeCandle(120),
      makeCandle(600),
    ],
    'M1',
  );

  assert.deepEqual(gap, {
    fromTime: 120,
    expectedTime: 180,
    toTime: 600,
    missingSeconds: 420,
    label: '7m 0s',
  });
});

test('formatCandleGapDuration uses day hour minute second units', () => {
  assert.equal(formatCandleGapDuration(93784), '1d 2h 3m 4s');
  assert.equal(formatCandleGapDuration(45), '45s');
});
