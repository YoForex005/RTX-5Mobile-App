import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLivePriceToCandleSeries,
  extractIncomingCandlePayloads,
  hasExcessiveLivePriceGap,
  mergeRecentHistoryIntoCandles,
  mergeCandleUpdate,
  normalizeCandle,
  normalizeSymbol,
  overlayLiveCandlesOnHistory,
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
    volume: 0,
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
      volume: 0,
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
  assert.deepEqual(updated[1], {
    time: 1776071340,
    open: 1.34295,
    high: 1.34295,
    low: 1.34295,
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
