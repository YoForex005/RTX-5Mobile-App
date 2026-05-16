import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from './liveCandleAggregator.ts';
import { buildFreshHistoryLiveCandleSeries, materializeLiveCandleMap } from './freshHistoryLiveSeries.ts';
import type { MutableCandle } from '../core/candleTypes.ts';

test('fresh history/live merge keeps one bucket and lets live OHLC update the active candle', () => {
  const history = [
    { time: 1_713_744_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
    { time: 1_713_744_060, open: 1.15, high: 1.18, low: 1.12, close: 1.16, volume: 12 },
  ];
  const live = [
    { time: 1_713_744_075, open: 1.16, high: 1.24, low: 1.14, close: 1.22, volume: 20 },
    { time: 1_713_744_120, open: 1.22, high: 1.25, low: 1.21, close: 1.23, volume: 4 },
  ];

  const merged = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.deepEqual(merged.map((candle) => candle.time), [
    1_713_744_000,
    1_713_744_060,
    1_713_744_120,
  ]);
  assert.equal(new Set(merged.map((candle) => candle.time)).size, merged.length);
  assert.deepEqual(merged[1], {
    time: 1_713_744_060,
    open: 1.16,
    high: 1.24,
    low: 1.12,
    close: 1.22,
    volume: 20,
  });
});

test('backend live OHLC generates candles in the requested timeframe bucket before merge', () => {
  const liveMap = new Map<number, MutableCandle>();
  const history = [
    { time: 1_713_744_000, open: 100, high: 105, low: 95, close: 102, volume: 10 },
  ];

  applyLiveCandleToCandleMap(
    liveMap,
    { time: 1_713_744_610, open: 110, high: 112, low: 109, close: 111, volume: 3 },
    'M5',
    { historyCutoffTime: 1_713_744_000 },
  );
  applyLiveCandleToCandleMap(
    liveMap,
    { time: 1_713_744_660, open: 110, high: 113, low: 108, close: 108, volume: 6 },
    'M5',
    { historyCutoffTime: 1_713_744_000 },
  );

  const live = materializeLiveCandleMap(liveMap, 1_713_744_000);
  const merged = buildFreshHistoryLiveCandleSeries(history, live, 'M5');

  assert.deepEqual(live, [
    { time: 1_713_744_600, open: 110, high: 113, low: 108, close: 108, volume: 6 },
  ]);
  assert.deepEqual(merged.map((candle) => candle.time), [1_713_744_000, 1_713_744_600]);
});

test('closed history cutoff removes same-time live candles before visible merge', () => {
  const cutoff = 1_713_744_060;
  const liveMap = new Map<number, MutableCandle>([
    [
      cutoff,
      {
        time: cutoff,
        open: 9,
        high: 9,
        low: 9,
        close: 9,
        volume: 1,
        source: 'live_candle',
      },
    ],
    [
      cutoff + 60,
      {
        time: cutoff + 60,
        open: 1.16,
        high: 1.2,
        low: 1.15,
        close: 1.18,
        volume: 2,
        source: 'live_candle',
      },
    ],
  ]);

  const live = materializeLiveCandleMap(liveMap, cutoff);
  assert.deepEqual(live.map((candle) => candle.time), [cutoff + 60]);

  const merged = buildFreshHistoryLiveCandleSeries(
    [
      { time: 1_713_744_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
      { time: cutoff, open: 1.15, high: 1.18, low: 1.12, close: 1.16, volume: 12 },
    ],
    [
      { time: cutoff, open: 9, high: 9, low: 9, close: 9, volume: 1 },
      { time: cutoff + 60, open: 1.16, high: 1.2, low: 1.15, close: 1.18, volume: 2 },
    ],
    'M1',
    undefined,
    { closedHistoryLastTime: cutoff },
  );

  assert.deepEqual(merged.map((candle) => candle.time), [1_713_744_000, cutoff, cutoff + 60]);
  assert.equal(merged[1].close, 1.16);
  assert.equal(merged[1].high, 1.18);
});
