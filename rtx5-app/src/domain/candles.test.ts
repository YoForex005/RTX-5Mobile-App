import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alignTimeToBucket,
  alignTimeToBucketWithReference,
  applyLivePriceToCandleSeries,
  extractIncomingCandlePayloads,
  getBucketGapCount,
  getExpectedNextCandleTime,
  hasDetachedShortCandleTail,
  hasExcessiveLivePriceGap,
  isRecentCandleBootstrapSeed,
  isRenderableCandleBootstrapSeed,
  isTrustworthyCandleBootstrapSeed,
  mergeRecentHistoryIntoCandles,
  mergeCandleUpdate,
  materializeCanonicalHistoryAndLiveCandles,
  materializeHistoryAndLiveCandles,
  normalizeCandle,
  normalizeSymbol,
  overlayLiveCandlesOnHistory,
  pruneLiveCandlesCoveredByHistory,
} from './candles';

test('candle-path normalizeSymbol matches quote-path broker suffix handling', () => {
  assert.equal(normalizeSymbol('GBPUSDm'), 'GBPUSD');
  assert.equal(normalizeSymbol('GBPUSD.c'), 'GBPUSD');
  assert.equal(normalizeSymbol(' XAU / USD m '), 'XAUUSD');
});

test('normalizeCandle accepts live quote ticks from /ws/feed', () => {
  const candle = normalizeCandle(
    {
      symbol: 'XAUUSD',
      bid: 4738.14,
      ask: 4738.28,
      timestamp: 1776067392067,
      type: 'tick',
    },
    'M1',
  );

  assert.deepEqual(candle, {
    time: 1776067380,
    open: 4738.14,
    high: 4738.14,
    low: 4738.14,
    close: 4738.14,
    volume: 0,
  });
});

test('extractIncomingCandlePayloads accepts nested candle update events from /ws/feed', () => {
  const parsed = extractIncomingCandlePayloads(
    {
      type: 'update',
      symbol: 'XAUUSD',
      candle: {
        time: 1776067380,
        open: 4738.530000000001,
        high: 4738.635,
        low: 4737.73,
        close: 4738.21,
        volume: 69,
      },
    },
    'M1',
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hasExplicitHighLow, true);
  assert.deepEqual(parsed[0].candle, {
    time: 1776067380,
    open: 4738.530000000001,
    high: 4738.635,
    low: 4737.73,
    close: 4738.21,
    volume: 69,
  });
});

test('normalizeCandle preserves explicit weekly history candle timestamps', () => {
  const weeklyOpenTime = Date.UTC(2026, 3, 13, 0, 0, 0) / 1000;
  const candle = normalizeCandle(
    {
      time: weeklyOpenTime,
      open: 1.1,
      high: 1.3,
      low: 1.0,
      close: 1.25,
      volume: 120,
    },
    'W1',
  );

  assert.deepEqual(candle, {
    time: weeklyOpenTime,
    open: 1.1,
    high: 1.3,
    low: 1.0,
    close: 1.25,
    volume: 120,
  });
});

test('normalizeCandle preserves explicit monthly history candle timestamps', () => {
  const monthlyOpenTime = Date.UTC(2026, 3, 1, 0, 0, 0) / 1000;
  const candle = normalizeCandle(
    {
      time: monthlyOpenTime,
      open: 1900,
      high: 1955,
      low: 1882,
      close: 1942,
      volume: 42,
    },
    'MN',
  );

  assert.deepEqual(candle, {
    time: monthlyOpenTime,
    open: 1900,
    high: 1955,
    low: 1882,
    close: 1942,
    volume: 42,
  });
});

test('alignTimeToBucket uses UTC week boundaries for raw weekly quote ticks', () => {
  const weeklyTickTime = Date.UTC(2026, 3, 15, 12, 0, 0) / 1000;

  assert.equal(
    alignTimeToBucket(weeklyTickTime, 'W1'),
    Date.UTC(2026, 3, 13, 0, 0, 0) / 1000,
  );
});

test('alignTimeToBucketWithReference advances monthly live buckets by calendar month', () => {
  const monthlyAnchor = Date.UTC(2026, 0, 31, 0, 0, 0) / 1000;
  const februaryTickTime = Date.UTC(2026, 1, 28, 12, 0, 0) / 1000;
  const marchTickTime = Date.UTC(2026, 2, 31, 12, 0, 0) / 1000;

  assert.equal(
    alignTimeToBucketWithReference(februaryTickTime, 'MN', monthlyAnchor),
    Date.UTC(2026, 1, 28, 0, 0, 0) / 1000,
  );
  assert.equal(
    alignTimeToBucketWithReference(marchTickTime, 'MN', monthlyAnchor),
    Date.UTC(2026, 2, 31, 0, 0, 0) / 1000,
  );
});

test('getExpectedNextCandleTime advances monthly candles by calendar month length', () => {
  const januaryMonthlyOpenTime = Date.UTC(2026, 0, 31, 0, 0, 0) / 1000;

  assert.equal(
    getExpectedNextCandleTime(januaryMonthlyOpenTime, 'MN'),
    Date.UTC(2026, 1, 28, 0, 0, 0) / 1000,
  );
  assert.equal(
    getExpectedNextCandleTime(Date.UTC(2026, 1, 28, 0, 0, 0) / 1000, 'MN'),
    Date.UTC(2026, 2, 31, 0, 0, 0) / 1000,
  );
});

test('getExpectedNextCandleTime skips weekend gaps for daily candles', () => {
  const fridayDailyOpenTime = Date.UTC(2026, 3, 17, 21, 0, 0) / 1000;

  assert.equal(
    getExpectedNextCandleTime(fridayDailyOpenTime, 'D1'),
    Date.UTC(2026, 3, 20, 21, 0, 0) / 1000,
  );
});

test('getBucketGapCount treats friday-to-monday as one daily bucket', () => {
  const fridayDailyOpenTime = Date.UTC(2026, 3, 17, 21, 0, 0) / 1000;
  const mondayDailyOpenTime = Date.UTC(2026, 3, 20, 21, 0, 0) / 1000;

  assert.equal(getBucketGapCount(fridayDailyOpenTime, mondayDailyOpenTime, 'D1'), 1);
});

test('hasDetachedShortCandleTail detects a short detached live tail', () => {
  assert.equal(
    hasDetachedShortCandleTail(
      [
        { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
        { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
        { time: 300, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
      ],
      'M1',
    ),
    true,
  );
  assert.equal(
    hasDetachedShortCandleTail(
      [
        { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
        { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
        { time: 300, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
        { time: 360, open: 1.23, high: 1.27, low: 1.22, close: 1.25, volume: 5 },
      ],
      'M1',
    ),
    true,
  );
});

test('hasDetachedShortCandleTail ignores contiguous and longer-tail series', () => {
  assert.equal(
    hasDetachedShortCandleTail(
      [
        { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
        { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
        { time: 180, open: 1.16, high: 1.19, low: 1.14, close: 1.17, volume: 7 },
      ],
      'M1',
    ),
    false,
  );
  assert.equal(
    hasDetachedShortCandleTail(
      [
        { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
        { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
        { time: 300, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
        { time: 360, open: 1.23, high: 1.27, low: 1.22, close: 1.25, volume: 5 },
        { time: 420, open: 1.25, high: 1.28, low: 1.24, close: 1.27, volume: 6 },
        { time: 480, open: 1.27, high: 1.3, low: 1.26, close: 1.29, volume: 7 },
      ],
      'M1',
    ),
    false,
  );
  assert.equal(
    hasDetachedShortCandleTail(
      [
        {
          time: Date.UTC(2026, 3, 17, 21, 0, 0) / 1000,
          open: 1.1,
          high: 1.2,
          low: 1.05,
          close: 1.15,
          volume: 100,
        },
        {
          time: Date.UTC(2026, 3, 20, 21, 0, 0) / 1000,
          open: 1.15,
          high: 1.22,
          low: 1.12,
          close: 1.2,
          volume: 10,
        },
      ],
      'D1',
    ),
    false,
  );
});

test('isTrustworthyCandleBootstrapSeed rejects thin live-only slices and detached short tails', () => {
  assert.equal(
    isTrustworthyCandleBootstrapSeed(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 4 },
        { time: 120, open: 1.11, high: 1.14, low: 1.1, close: 1.13, volume: 5 },
        { time: 180, open: 1.13, high: 1.15, low: 1.12, close: 1.14, volume: 6 },
      ],
      'M1',
    ),
    false,
  );
  assert.equal(
    isTrustworthyCandleBootstrapSeed(
      [
        { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
        { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
        { time: 180, open: 1.16, high: 1.19, low: 1.14, close: 1.17, volume: 7 },
        { time: 240, open: 1.17, high: 1.2, low: 1.16, close: 1.18, volume: 9 },
        { time: 300, open: 1.18, high: 1.21, low: 1.17, close: 1.2, volume: 11 },
        { time: 360, open: 1.2, high: 1.22, low: 1.19, close: 1.21, volume: 8 },
        { time: 600, open: 1.3, high: 1.34, low: 1.29, close: 1.33, volume: 4 },
        { time: 660, open: 1.33, high: 1.36, low: 1.32, close: 1.35, volume: 5 },
      ],
      'M1',
    ),
    false,
  );
});

test('isTrustworthyCandleBootstrapSeed accepts contiguous chart seeds with enough context', () => {
  assert.equal(
    isTrustworthyCandleBootstrapSeed(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 4 },
        { time: 120, open: 1.11, high: 1.14, low: 1.09, close: 1.13, volume: 5 },
        { time: 180, open: 1.13, high: 1.16, low: 1.12, close: 1.15, volume: 6 },
        { time: 240, open: 1.15, high: 1.18, low: 1.14, close: 1.17, volume: 7 },
        { time: 300, open: 1.17, high: 1.19, low: 1.16, close: 1.18, volume: 8 },
        { time: 360, open: 1.18, high: 1.2, low: 1.17, close: 1.19, volume: 9 },
        { time: 420, open: 1.19, high: 1.22, low: 1.18, close: 1.21, volume: 10 },
        { time: 480, open: 1.21, high: 1.24, low: 1.2, close: 1.23, volume: 11 },
      ],
      'M1',
    ),
    true,
  );
});

test('isRecentCandleBootstrapSeed rejects cache seeds that end far behind the current session', () => {
  assert.equal(
    isRecentCandleBootstrapSeed(
      [
        { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 4 },
        { time: 120, open: 1.11, high: 1.14, low: 1.09, close: 1.13, volume: 5 },
        { time: 180, open: 1.13, high: 1.16, low: 1.12, close: 1.15, volume: 6 },
        { time: 240, open: 1.15, high: 1.18, low: 1.14, close: 1.17, volume: 7 },
        { time: 300, open: 1.17, high: 1.19, low: 1.16, close: 1.18, volume: 8 },
        { time: 360, open: 1.18, high: 1.2, low: 1.17, close: 1.19, volume: 9 },
        { time: 420, open: 1.19, high: 1.22, low: 1.18, close: 1.21, volume: 10 },
        { time: 480, open: 1.21, high: 1.24, low: 1.2, close: 1.23, volume: 11 },
      ],
      'M1',
      2,
      900,
    ),
    false,
  );
});

test('isRenderableCandleBootstrapSeed requires both a healthy shape and recent tail', () => {
  const contiguousSeed = [
    { time: 60, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: 4 },
    { time: 120, open: 1.11, high: 1.14, low: 1.09, close: 1.13, volume: 5 },
    { time: 180, open: 1.13, high: 1.16, low: 1.12, close: 1.15, volume: 6 },
    { time: 240, open: 1.15, high: 1.18, low: 1.14, close: 1.17, volume: 7 },
    { time: 300, open: 1.17, high: 1.19, low: 1.16, close: 1.18, volume: 8 },
    { time: 360, open: 1.18, high: 1.2, low: 1.17, close: 1.19, volume: 9 },
    { time: 420, open: 1.19, high: 1.22, low: 1.18, close: 1.21, volume: 10 },
    { time: 480, open: 1.21, high: 1.24, low: 1.2, close: 1.23, volume: 11 },
  ];

  assert.equal(isRenderableCandleBootstrapSeed(contiguousSeed, 'M1', 8, 2, 540), true);
  assert.equal(isRenderableCandleBootstrapSeed(contiguousSeed, 'M1', 8, 2, 900), false);
});

test('materializeHistoryAndLiveCandles keeps daily history attached across weekend rollover', () => {
  const fridayDailyOpenTime = Date.UTC(2026, 3, 17, 21, 0, 0) / 1000;
  const mondayDailyOpenTime = Date.UTC(2026, 3, 20, 21, 0, 0) / 1000;

  const materialized = materializeHistoryAndLiveCandles(
    [
      {
        time: fridayDailyOpenTime,
        open: 1.1,
        high: 1.2,
        low: 1.05,
        close: 1.15,
        volume: 100,
      },
    ],
    [
      {
        time: mondayDailyOpenTime,
        open: 1.15,
        high: 1.22,
        low: 1.12,
        close: 1.2,
        volume: 10,
      },
    ],
    'D1',
  );

  assert.deepEqual(materialized.map((candle) => candle.time), [
    fridayDailyOpenTime,
    mondayDailyOpenTime,
  ]);
});

test('materializeHistoryAndLiveCandles keeps monthly history attached after a short month boundary', () => {
  const februaryMonthlyOpenTime = Date.UTC(2026, 1, 28, 0, 0, 0) / 1000;
  const marchMonthlyOpenTime = Date.UTC(2026, 2, 31, 0, 0, 0) / 1000;

  const materialized = materializeHistoryAndLiveCandles(
    [
      {
        time: februaryMonthlyOpenTime,
        open: 1900,
        high: 1940,
        low: 1880,
        close: 1925,
        volume: 50,
      },
    ],
    [
      {
        time: marchMonthlyOpenTime,
        open: 1925,
        high: 1960,
        low: 1910,
        close: 1950,
        volume: 5,
      },
    ],
    'MN',
  );

  assert.deepEqual(materialized.map((candle) => candle.time), [
    februaryMonthlyOpenTime,
    marchMonthlyOpenTime,
  ]);
});

test('materializeCanonicalHistoryAndLiveCandles keeps daily history attached across weekend rollover', () => {
  const fridayDailyOpenTime = Date.UTC(2026, 3, 17, 21, 0, 0) / 1000;
  const mondayDailyOpenTime = Date.UTC(2026, 3, 20, 21, 0, 0) / 1000;

  const materialized = materializeCanonicalHistoryAndLiveCandles(
    [
      {
        time: fridayDailyOpenTime,
        open: 1.1,
        high: 1.2,
        low: 1.05,
        close: 1.15,
        volume: 100,
      },
    ],
    [
      {
        time: mondayDailyOpenTime,
        open: 1.15,
        high: 1.22,
        low: 1.12,
        close: 1.2,
        volume: 10,
      },
    ],
    'D1',
  );

  assert.deepEqual(materialized.map((candle) => candle.time), [
    fridayDailyOpenTime,
    mondayDailyOpenTime,
  ]);
});

test('materializeCanonicalHistoryAndLiveCandles drops stale history when the live stream is detached', () => {
  const materialized = materializeCanonicalHistoryAndLiveCandles(
    [
      { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.12, volume: 10 },
      { time: 120, open: 1.12, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
    ],
    [
      { time: 300, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
      { time: 360, open: 1.23, high: 1.27, low: 1.22, close: 1.25, volume: 5 },
    ],
    'M1',
  );

  assert.deepEqual(materialized, [
    { time: 300, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
    { time: 360, open: 1.23, high: 1.27, low: 1.22, close: 1.25, volume: 5 },
  ]);
});

test('materializeCanonicalHistoryAndLiveCandles lets the live bucket override overlapping history', () => {
  const materialized = materializeCanonicalHistoryAndLiveCandles(
    [
      { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
      { time: 120, open: 1.13, high: 1.18, low: 1.1, close: 1.16, volume: 12 },
    ],
    [
      { time: 120, open: 1.12, high: 1.21, low: 1.09, close: 1.2, volume: 18 },
      { time: 180, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
    ],
    'M1',
  );

  assert.deepEqual(materialized, [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.12, high: 1.21, low: 1.09, close: 1.2, volume: 18 },
    { time: 180, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
  ]);
});

test('extractIncomingCandlePayloads dedupes multiple quote ticks into one bucket-safe candle', () => {
  const parsed = extractIncomingCandlePayloads(
    {
      data: [
        { symbol: 'XAUUSD', bid: 4738.14, ask: 4738.28, timestamp: 1776067392067, type: 'tick' },
        { symbol: 'XAUUSD', bid: 4738.34, ask: 4738.47, timestamp: 1776067392828, type: 'tick' },
      ],
    },
    'M1',
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hasExplicitHighLow, false);
  assert.deepEqual(parsed[0].candle, {
    time: 1776067380,
    open: 4738.14,
    high: 4738.34,
    low: 4738.14,
    close: 4738.34,
    volume: 0,
  });
});

test('mergeCandleUpdate preserves wick extremes when a live quote tick moves the active candle', () => {
  const merged = mergeCandleUpdate(
    {
      time: 1776067380,
      open: 4738.530000000001,
      high: 4738.635,
      low: 4737.73,
      close: 4738.21,
      volume: 69,
    },
    {
      time: 1776067380,
      open: 4738.34,
      high: 4738.34,
      low: 4738.34,
      close: 4738.34,
      volume: 0,
    },
  );

  assert.deepEqual(merged, {
    time: 1776067380,
    open: 4738.530000000001,
    high: 4738.635,
    low: 4737.73,
    close: 4738.34,
    volume: 69,
  });
});

test('applyLivePriceToCandleSeries updates the active bucket from quote ticks', () => {
  const updated = applyLivePriceToCandleSeries(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
    ],
    1.34291,
    1776071307276,
    'M1',
  );

  assert.deepEqual(updated, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34291,
      low: 1.342795,
      close: 1.34291,
      volume: 97,
    },
  ]);
});

test('applyLivePriceToCandleSeries returns the existing series for duplicate no-op live ticks', () => {
  const candles = [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34289,
      low: 1.342795,
      close: 1.342875,
      volume: 0,
    },
  ];

  const updated = applyLivePriceToCandleSeries(
    candles,
    1.342875,
    1776071310000,
    'M1',
  );

  assert.equal(updated, candles);
});

test('applyLivePriceToCandleSeries appends a new bucket when the live quote rolls over', () => {
  const updated = applyLivePriceToCandleSeries(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
    ],
    1.34295,
    1776071341000,
    'M1',
  );

  assert.equal(updated.length, 2);
  // Immediate rollover keeps the live handoff continuous by opening the new
  // bucket from the previous close until recent REST history heals the true
  // bucket open.
  assert.deepEqual(updated[1], {
    time: 1776071340,
    open: 1.342875,
    high: 1.34295,
    low: 1.342875,
    close: 1.34295,
    volume: 0,
  });
});

test('hasExcessiveLivePriceGap flags stale series that require a history resync', () => {
  const needsResync = hasExcessiveLivePriceGap(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
    ],
    1.34325,
    1776071701000,
    'M1',
  );

  assert.equal(needsResync, true);
});

test('applyLivePriceToCandleSeries can append the current live bucket even when history is stale', () => {
  const updated = applyLivePriceToCandleSeries(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
    ],
    1.34325,
    1776071701000,
    'M1',
    {
      maxAutoGapFillCandles: 5,
      allowSparseAppendOnGap: true,
    },
  );

  // Sparse append while a resync is in flight: intermediate buckets are left
  // missing (not fabricated with flat bars), and the new bar opens at the
  // tick's own price.
  assert.deepEqual(updated, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34289,
      low: 1.342795,
      close: 1.342875,
      volume: 97,
    },
    {
      time: 1776071700,
      open: 1.34325,
      high: 1.34325,
      low: 1.34325,
      close: 1.34325,
      volume: 0,
    },
  ]);
});

test('materializeHistoryAndLiveCandles drops stale history when the live stream is detached', () => {
  const materialized = materializeHistoryAndLiveCandles(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34294,
        low: 1.34281,
        close: 1.3429,
        volume: 88,
      },
    ],
    [
      {
        time: 1776071760,
        open: 1.34325,
        high: 1.34342,
        low: 1.34312,
        close: 1.34336,
        volume: 0,
      },
    ],
    'M1',
  );

  assert.deepEqual(materialized, [
    {
      time: 1776071760,
      open: 1.34325,
      high: 1.34342,
      low: 1.34312,
      close: 1.34336,
      volume: 0,
    },
  ]);
});

test('materializeHistoryAndLiveCandles overlays live candles onto recent history when the series stays contiguous', () => {
  const materialized = materializeHistoryAndLiveCandles(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34294,
        low: 1.34281,
        close: 1.3429,
        volume: 88,
      },
    ],
    [
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34299,
        low: 1.3428,
        close: 1.34296,
        volume: 0,
      },
      {
        time: 1776071400,
        open: 1.34296,
        high: 1.34318,
        low: 1.34296,
        close: 1.34311,
        volume: 0,
      },
    ],
    'M1',
  );

  assert.deepEqual(materialized, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34289,
      low: 1.342795,
      close: 1.342875,
      volume: 97,
    },
    {
      time: 1776071340,
      open: 1.342875,
      high: 1.34299,
      low: 1.3428,
      close: 1.34296,
      volume: 88,
    },
    {
      time: 1776071400,
      open: 1.34296,
      high: 1.34318,
      low: 1.34296,
      close: 1.34311,
      volume: 0,
    },
  ]);
});

test('pruneLiveCandlesCoveredByHistory removes live bars already superseded by refreshed history', () => {
  const pruned = pruneLiveCandlesCoveredByHistory(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34294,
        low: 1.34281,
        close: 1.3429,
        volume: 88,
      },
    ],
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34292,
        low: 1.34279,
        close: 1.34289,
        volume: 0,
      },
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34299,
        low: 1.3428,
        close: 1.34296,
        volume: 0,
      },
      {
        time: 1776071400,
        open: 1.34296,
        high: 1.34318,
        low: 1.34296,
        close: 1.34311,
        volume: 0,
      },
    ],
  );

  assert.deepEqual(pruned, [
    {
      time: 1776071340,
      open: 1.342875,
      high: 1.34299,
      low: 1.3428,
      close: 1.34296,
      volume: 0,
    },
    {
      time: 1776071400,
      open: 1.34296,
      high: 1.34318,
      low: 1.34296,
      close: 1.34311,
      volume: 0,
    },
  ]);
});

test('overlayLiveCandlesOnHistory preserves the live candle while adding healed history behind it', () => {
  const merged = overlayLiveCandlesOnHistory(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071340,
        open: 1.342875,
        high: 1.34294,
        low: 1.34281,
        close: 1.3429,
        volume: 88,
      },
    ],
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071700,
        open: 1.34325,
        high: 1.3434,
        low: 1.3431,
        close: 1.3433,
        volume: 0,
      },
    ],
  );

  assert.deepEqual(merged, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34289,
      low: 1.342795,
      close: 1.342875,
      volume: 97,
    },
    {
      time: 1776071340,
      open: 1.342875,
      high: 1.34294,
      low: 1.34281,
      close: 1.3429,
      volume: 88,
    },
    {
      time: 1776071700,
      open: 1.34325,
      high: 1.3434,
      low: 1.3431,
      close: 1.3433,
      volume: 0,
    },
  ]);
});

test('mergeRecentHistoryIntoCandles heals the active candle wick without resetting the series', () => {
  const healed = mergeRecentHistoryIntoCandles(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34291,
        low: 1.342795,
        close: 1.34291,
        volume: 0,
      },
    ],
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34299,
        low: 1.34277,
        close: 1.34288,
        volume: 101,
      },
    ],
    'M1',
  );

  assert.deepEqual(healed, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34299,
      low: 1.34277,
      close: 1.34291,
      volume: 101,
    },
  ]);
});

test('mergeRecentHistoryIntoCandles corrects the active candle open while preserving the latest live close', () => {
  const healed = mergeRecentHistoryIntoCandles(
    [
      {
        time: 1776071280,
        open: 1.34291,
        high: 1.34296,
        low: 1.34289,
        close: 1.34295,
        volume: 0,
      },
    ],
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34299,
        low: 1.34277,
        close: 1.34288,
        volume: 101,
      },
    ],
    'M1',
  );

  assert.deepEqual(healed, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34299,
      low: 1.34277,
      close: 1.34295,
      volume: 101,
    },
  ]);
});

test('mergeRecentHistoryIntoCandles backfills missing history behind a sparse live bar and keeps the latest live close', () => {
  const healed = mergeRecentHistoryIntoCandles(
    [
      {
        time: 1776071280,
        open: 1.342825,
        high: 1.34289,
        low: 1.342795,
        close: 1.342875,
        volume: 97,
      },
      {
        time: 1776071700,
        open: 1.34325,
        high: 1.34342,
        low: 1.34312,
        close: 1.34336,
        volume: 0,
      },
    ],
    [
      {
        time: 1776071340,
        open: 1.34288,
        high: 1.34294,
        low: 1.34281,
        close: 1.3429,
        volume: 88,
      },
      {
        time: 1776071400,
        open: 1.3429,
        high: 1.34305,
        low: 1.34286,
        close: 1.343,
        volume: 92,
      },
      {
        time: 1776071700,
        open: 1.3432,
        high: 1.34345,
        low: 1.34305,
        close: 1.34331,
        volume: 101,
      },
    ],
    'M1',
  );

  assert.deepEqual(healed, [
    {
      time: 1776071280,
      open: 1.342825,
      high: 1.34289,
      low: 1.342795,
      close: 1.342875,
      volume: 97,
    },
    {
      time: 1776071340,
      open: 1.34288,
      high: 1.34294,
      low: 1.34281,
      close: 1.3429,
      volume: 88,
    },
    {
      time: 1776071400,
      open: 1.3429,
      high: 1.34305,
      low: 1.34286,
      close: 1.343,
      volume: 92,
    },
    {
      time: 1776071700,
      open: 1.3432,
      high: 1.34345,
      low: 1.34305,
      close: 1.34336,
      volume: 101,
    },
  ]);
});
