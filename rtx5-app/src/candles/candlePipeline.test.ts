import test from 'node:test';
import assert from 'node:assert/strict';

import { applyLiveCandleToCandleMap, applyTickToCandleMap } from './candleAggregator';
import { normalizeHistoryCandle, normalizeLiveCandle, normalizeLiveTick } from './candleNormalizer';
import { createCandleMap, materializeCandleMap, sortAndDedupeCandles } from './candleMerger';
import { validateCandle } from './candleValidator';
import {
  getBucketStart,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  SUPPORTED_TIMEFRAMES,
} from './timeframeUtils';
import { normalizeCandleSeries } from '../domain/candles';
import { buildRestHistorySeedCandles, splitRestHistoryCandles } from '../domain/candleProvenance';
import type { Candle } from './candleTypes';

const candle = (time: number, close = 1.1): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

test('normalizes backend history aliases and rejects invalid OHLC', () => {
  const normalized = normalizeHistoryCandle({
    t: 1_713_744_000_000,
    o: '1.10',
    h: '1.12',
    l: '1.09',
    c: '1.11',
    v: '7',
  });

  assert.deepEqual(normalized, {
    time: 1_713_744_000,
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.11,
    volume: 7,
  });

  assert.equal(
    normalizeHistoryCandle({ t: 1_713_744_000, o: 1.1, h: 1.09, l: 1.08, c: 1.11 }),
    null,
  );
});

test('normalizes live ticks without frontend timestamp fallback', () => {
  assert.deepEqual(
    normalizeLiveTick({ symbol: 'EURUSDm', bid: '1.2345', ask: '1.2347', timestamp: 1_713_744_001_000 }),
    {
      symbol: 'EURUSD',
      price: 1.2345,
      timestamp: 1_713_744_001,
    },
  );

  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', bid: 1.2, ask: 1.3 }), null);
});

test('bucket utilities are deterministic and UTC aligned', () => {
  assert.equal(normalizeTimeframe('1m'), 'M1');
  assert.equal(normalizeTimeframe('1M'), 'MN');
  assert.equal(getBucketStart(Date.UTC(2024, 3, 22, 12, 34, 56), '15m'), 1_713_789_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 22, 12, 34, 56), '1d'), 1_713_744_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 24, 12, 0, 0), '1w'), 1_713_744_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 24, 12, 0, 0), '1M'), 1_711_929_600);
});

test('strict timeframe normalization rejects unknown backend tokens', () => {
  assert.equal(normalizeTimeframeStrict('M3'), 'M3');
  assert.equal(normalizeTimeframeStrict(120), 'H2');
  assert.equal(normalizeTimeframeStrict('bad-period'), null);
  assert.equal(normalizeTimeframe('bad-period'), 'M1');

  const liveCandle = normalizeLiveCandle({
    time: 1_713_744_000,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    timeframe: 'bad-period',
  });

  assert.equal(liveCandle?.timeframe, undefined);
});

test('sortAndDedupeCandles keeps one valid candle per timestamp and prefers latest backend value', () => {
  const result = sortAndDedupeCandles([
    candle(120, 1.2),
    { ...candle(60, 1.1), high: Number.NaN },
    candle(60, 1.11),
    candle(60, 1.12),
  ]);

  assert.deepEqual(result.map((item) => [item.time, item.close]), [
    [60, 1.12],
    [120, 1.2],
  ]);
});

test('preserves backend history timestamps instead of frontend rebucketing', () => {
  const base = 1_713_744_000;
  const result = normalizeCandleSeries(
    [
      { time: base + 1, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
      { time: base + 45, open: 100.5, high: 102, low: 98, close: 101, volume: 4 },
      { time: base + 60, open: 101, high: 103, low: 100, close: 102, volume: 5 },
    ],
    'M1',
  );

  assert.deepEqual(result, [
    { time: base + 1, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
    { time: base + 45, open: 100.5, high: 102, low: 98, close: 101, volume: 4 },
    { time: base + 60, open: 101, high: 103, low: 100, close: 102, volume: 5 },
  ]);
});

test('preserves explicit higher-timeframe backend timestamps', () => {
  const weeklyOpenTime = Date.UTC(2026, 3, 15, 22, 0, 0) / 1000;
  const result = normalizeCandleSeries(
    [{ time: weeklyOpenTime, open: 1.1, high: 1.3, low: 1.0, close: 1.25, volume: 120 }],
    'W1',
  );

  assert.deepEqual(result, [
    { time: weeklyOpenTime, open: 1.1, high: 1.3, low: 1.0, close: 1.25, volume: 120 },
  ]);
});

test('applyTickToCandleMap creates and updates candles with stable OHLC rules', () => {
  const map = createCandleMap();
  const first = applyTickToCandleMap(map, { symbol: 'EURUSD', price: 1.2, timestamp: 1_713_744_001 }, 'M1');
  assert.equal(first.changed, true);

  const second = applyTickToCandleMap(map, { symbol: 'EURUSD', price: 1.25, timestamp: 1_713_744_020, volume: 3 }, 'M1');
  assert.equal(second.changed, true);

  const late = applyTickToCandleMap(map, { symbol: 'EURUSD', price: 1.15, timestamp: 1_713_744_010 }, 'M1');
  assert.equal(late.changed, true);

  const [result] = materializeCandleMap(map);
  assert.deepEqual(result, {
    time: 1_713_744_000,
    open: 1.2,
    high: 1.25,
    low: 1.15,
    close: 1.25,
    volume: 3,
  });
  assert.equal(validateCandle(result), true);
});

test('standard OHLC generation is identical for every supported symbol and timeframe', () => {
  const symbols = ['EURUSDm', 'XAUUSD', 'BTCUSD', 'USDJPY.c'];
  const baseTimestamp = Date.UTC(2024, 3, 22, 10, 37, 1) / 1000;

  symbols.forEach((rawSymbol, symbolIndex) => {
    SUPPORTED_TIMEFRAMES.forEach((timeframe, timeframeIndex) => {
      const map = createCandleMap();
      const symbol = normalizeSymbol(rawSymbol);
      const basePrice = 100 + symbolIndex * 1000 + timeframeIndex * 10;
      const expectedBucket = getBucketStart(baseTimestamp, timeframe);

      assert.notEqual(expectedBucket, null);
      applyTickToCandleMap(map, { symbol, price: basePrice, timestamp: baseTimestamp, sequence: 1 }, timeframe);
      applyTickToCandleMap(map, { symbol, price: basePrice + 2, timestamp: baseTimestamp + 20, sequence: 2 }, timeframe);
      applyTickToCandleMap(map, { symbol, price: basePrice - 1, timestamp: baseTimestamp + 10, sequence: 3 }, timeframe);

      assert.deepEqual(materializeCandleMap(map), [
        {
          time: expectedBucket,
          open: basePrice,
          high: basePrice + 2,
          low: basePrice - 1,
          close: basePrice + 2,
          volume: 0,
        },
      ], `${symbol} ${timeframe}`);
    });
  });
});

test('history plus buffered live events merge through a timestamp-keyed map without filling gaps', () => {
  const history = [
    { time: 1_713_744_000, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
    { time: 1_713_744_060, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
  ];
  const map = createCandleMap(history);

  const buffered = [
    { symbol: 'EURUSD', price: 1.4, timestamp: 1_713_744_180 },
    { symbol: 'EURUSD', price: 1.25, timestamp: 1_713_744_062 },
  ].sort((left, right) => left.timestamp - right.timestamp);

  for (const tick of buffered) {
    applyTickToCandleMap(map, tick, 'M1', { historyCutoffTime: history[history.length - 1].time });
  }

  const result = materializeCandleMap(map);
  assert.deepEqual(result.map((item) => item.time), [1_713_744_000, 1_713_744_060, 1_713_744_180]);
  assert.equal(new Set(result.map((item) => item.time)).size, result.length);
});

test('M1 REST history seeds the backend current candle so first live tick does not create frontend gaps', () => {
  const symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];
  const base = 1_776_071_280;

  for (const symbol of symbols) {
    const history = normalizeCandleSeries(
      [
        { time: base, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
        { time: base + 60, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
        { time: base + 120, open: 1.15, high: 1.3, low: 1.1, close: 1.25, volume: 15 },
      ],
      'M1',
    );
    const { closedHistory, currentCandle } = splitRestHistoryCandles(history, 'M1', 'bid');
    const seed = buildRestHistorySeedCandles(closedHistory, currentCandle);
    const map = createCandleMap(seed.candles);

    assert.deepEqual(seed.candles.map((item) => item.time), [base, base + 60, base + 120], symbol);
    assert.equal(seed.closedHistoryLastTime, base + 60, symbol);

    const sameBucketTick = applyTickToCandleMap(
      map,
      { symbol, price: 1.28, timestamp: base + 125, sequence: 1 },
      'M1',
      { historyCutoffTime: seed.closedHistoryLastTime },
    );
    assert.equal(sameBucketTick.ignored, false, symbol);
    assert.deepEqual(materializeCandleMap(map).map((item) => item.time), [base, base + 60, base + 120], symbol);

    const nextBucketTick = applyTickToCandleMap(
      map,
      { symbol, price: 1.3, timestamp: base + 180, sequence: 2 },
      'M1',
      { historyCutoffTime: seed.closedHistoryLastTime },
    );
    assert.equal(nextBucketTick.ignored, false, symbol);
    assert.deepEqual(materializeCandleMap(map).map((item) => item.time), [base, base + 60, base + 120, base + 180], symbol);
  }
});

test('live ticks cannot rewrite the closed history cutoff candle', () => {
  const history = [
    { time: 1_713_744_000, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
    { time: 1_713_744_060, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
  ];
  const map = createCandleMap(history);

  const result = applyTickToCandleMap(
    map,
    { symbol: 'EURUSD', price: 1.5, timestamp: 1_713_744_062 },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.deepEqual(materializeCandleMap(map), history);
});

test('backend live candle is authoritative for its timestamp', () => {
  const map = createCandleMap([candle(60, 1.1)]);
  const result = applyLiveCandleToCandleMap(map, {
    time: 60,
    open: 1.2,
    high: 1.4,
    low: 1.1,
    close: 1.3,
    volume: 50,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(materializeCandleMap(map), [
    { time: 60, open: 1.2, high: 1.4, low: 1.1, close: 1.3, volume: 50 },
  ]);
});

test('backend live candle snapshots inside one timeframe bucket update one candle', () => {
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_005, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
    'M1',
  );
  applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_045, open: 100.5, high: 102, low: 98, close: 101, volume: 4 },
    'M1',
  );

  assert.deepEqual(materializeCandleMap(map), [
    { time: 1_713_744_000, open: 100, high: 102, low: 98, close: 101, volume: 4 },
  ]);
});
