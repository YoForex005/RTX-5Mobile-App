import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLivePriceCoherentCandles } from './chartDisplayCandles';
import type { Candle } from '../../domain/candles/core/candleTypes';

const staleGoldHistory: Candle[] = [
  { time: 1_769_000_000, open: 2370, high: 2388, low: 2365, close: 2384, volume: 10 },
  { time: 1_769_000_060, open: 2384, high: 2440, low: 2380, close: 2433, volume: 12 },
];

test('updates the active candle close from a coherent live quote', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: 2434,
    time: 1_769_000_090,
    nowSeconds: 1_769_000_090,
  });

  assert.notEqual(result, staleGoldHistory);
  assert.deepEqual(result.slice(0, -1), staleGoldHistory.slice(0, -1));
  assert.deepEqual(result[result.length - 1], {
    ...staleGoldHistory[staleGoldHistory.length - 1],
    high: 2440,
    low: 2380,
    close: 2434,
  });
});

test('widens the active candle wick when the same live quote makes a new high or low', () => {
  const candles: Candle[] = [
    { time: 1_769_000_000, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 3 },
  ];

  const newHigh = resolveLivePriceCoherentCandles(candles, 'M1', {
    price: 1.13,
    time: 1_769_000_030,
    nowSeconds: 1_769_000_030,
  });

  assert.deepEqual(newHigh, [
    { time: 1_769_000_000, open: 1.1, high: 1.13, low: 1.09, close: 1.13, volume: 3 },
  ]);

  const newLow = resolveLivePriceCoherentCandles(newHigh, 'M1', {
    price: 1.08,
    time: 1_769_000_045,
    nowSeconds: 1_769_000_045,
  });

  assert.deepEqual(newLow, [
    { time: 1_769_000_000, open: 1.1, high: 1.13, low: 1.08, close: 1.08, volume: 3 },
  ]);
});

test('appends a new live bucket from the first live price in that timeframe', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: 2435,
    time: 1_769_000_120,
    nowSeconds: 1_769_000_120,
  });

  assert.equal(result.length, staleGoldHistory.length + 1);
  assert.deepEqual(result[result.length - 1], {
    time: 1_769_000_120,
    open: 2435,
    high: 2435,
    low: 2435,
    close: 2435,
    volume: 0,
  });
});

test('replaces an incompatible stale candle regime with a live-price candle', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: 4539.64,
    time: 1_769_000_125,
    nowSeconds: 1_769_000_125,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].time, 1_769_000_120);
  assert.equal(result[0].open, 4539.64);
  assert.equal(result[0].high, 4539.64);
  assert.equal(result[0].low, 4539.64);
  assert.equal(result[0].close, 4539.64);
});

test('drops stale history when a generated live candle starts a new price regime', () => {
  const staleBitcoinHistoryWithLiveTail: Candle[] = [
    { time: 1_763_000_000, open: 79650, high: 79700, low: 79620, close: 79640, volume: 10 },
    { time: 1_763_000_060, open: 79640, high: 79660, low: 79590, close: 79595.51, volume: 12 },
    { time: 1_764_059_100, open: 77485.24, high: 77485.24, low: 77485.24, close: 77485.24, volume: 0 },
  ];

  const result = resolveLivePriceCoherentCandles(staleBitcoinHistoryWithLiveTail, 'M1', {
    price: 77485.24,
    time: 1_764_059_100,
    nowSeconds: 1_764_059_100,
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], staleBitcoinHistoryWithLiveTail[2]);
});

test('keeps substantial backend history when the latest live tail starts a new price regime', () => {
  const loadedHistoryWithLiveTail: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_000_020 + index * 60,
    open: 66200 + index,
    high: 66220 + index,
    low: 66180 + index,
    close: 66205 + index,
    volume: 10,
  }));
  loadedHistoryWithLiveTail.push({
    time: 1_771_001_820,
    open: 75907.21,
    high: 75907.21,
    low: 75902,
    close: 75907.21,
    volume: 0,
  });

  const result = resolveLivePriceCoherentCandles(loadedHistoryWithLiveTail, 'M1', {
    price: 75907.21,
    time: 1_771_001_820,
    nowSeconds: 1_771_001_820,
  });

  assert.equal(result.length, loadedHistoryWithLiveTail.length);
  assert.deepEqual(result, loadedHistoryWithLiveTail);
});

test('does not append an incoherent quote-only candle to substantial backend history', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_000_020 + index * 60,
    open: 66200 + index,
    high: 66220 + index,
    low: 66180 + index,
    close: 66205 + index,
    volume: 10,
  }));

  const result = resolveLivePriceCoherentCandles(loadedHistory, 'M1', {
    price: 75907.21,
    time: 1_771_001_820,
    nowSeconds: 1_771_001_820,
  });

  assert.equal(result.length, loadedHistory.length);
  assert.deepEqual(result, loadedHistory);
});

test('removes an existing incoherent flat live tail before rendering substantial history', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_000_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const flatLiveTail = Object.assign(
    {
      time: 1_771_001_820,
      open: 75907.21,
      high: 75907.21,
      low: 75907.21,
      close: 75907.21,
      volume: 0,
    } satisfies Candle,
    { source: 'live_candle' as const, closed: false as const, lastQuoteTime: 1_771_001_821 },
  );

  const result = resolveLivePriceCoherentCandles([...loadedHistory, flatLiveTail], 'M1', {
    price: 75907.21,
    time: flatLiveTail.time,
    nowSeconds: flatLiveTail.time,
  });

  assert.equal(result.length, loadedHistory.length);
  assert.deepEqual(result, loadedHistory);
});

test('keeps backend-updated live flat tails that inherited earlier quote metadata', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_100_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const backendUpdatedTail = Object.assign(
    {
      time: 1_771_101_820,
      open: 75907.21,
      high: 75907.21,
      low: 75907.21,
      close: 75907.21,
      volume: 0,
    } satisfies Candle,
    {
      source: 'live_candle' as const,
      closed: false as const,
      lastQuoteTime: 1_771_101_821,
      lastBackendUpdateTime: 1_771_101_821,
    },
  );

  const candles = [...loadedHistory, backendUpdatedTail];
  const result = resolveLivePriceCoherentCandles(candles, 'M1', {
    price: 75907.21,
    time: backendUpdatedTail.time,
    nowSeconds: backendUpdatedTail.time,
  });

  assert.equal(result.length, candles.length);
  assert.deepEqual(result, candles);
});

test('removes consecutive incoherent quote-generated flat live tails as one group', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_200_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const firstFlatTail = Object.assign(
    {
      time: 1_771_201_820,
      open: 75900,
      high: 75900,
      low: 75900,
      close: 75900,
      volume: 0,
    } satisfies Candle,
    { source: 'live_candle' as const, closed: false as const, lastQuoteTime: 1_771_201_821 },
  );
  const secondFlatTail = Object.assign(
    {
      time: 1_771_201_880,
      open: 75907.21,
      high: 75907.21,
      low: 75907.21,
      close: 75907.21,
      volume: 0,
    } satisfies Candle,
    { source: 'live_candle' as const, closed: false as const, lastQuoteTime: 1_771_201_881 },
  );

  const result = resolveLivePriceCoherentCandles(
    [...loadedHistory, firstFlatTail, secondFlatTail],
    'M1',
    {
      price: 75907.21,
      time: secondFlatTail.time,
      nowSeconds: secondFlatTail.time,
    },
  );

  assert.equal(result.length, loadedHistory.length);
  assert.deepEqual(result, loadedHistory);
});

test('keeps coherent quote-generated flat tails before trimming a newer incoherent quote tail', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_771_300_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const coherentFlatTail = Object.assign(
    {
      time: 1_771_301_820,
      open: 80635,
      high: 80635,
      low: 80635,
      close: 80635,
      volume: 0,
    } satisfies Candle,
    { source: 'live_candle' as const, closed: false as const, lastQuoteTime: 1_771_301_821 },
  );
  const incoherentFlatTail = Object.assign(
    {
      time: 1_771_301_880,
      open: 75907.21,
      high: 75907.21,
      low: 75907.21,
      close: 75907.21,
      volume: 0,
    } satisfies Candle,
    { source: 'live_candle' as const, closed: false as const, lastQuoteTime: 1_771_301_881 },
  );

  const result = resolveLivePriceCoherentCandles(
    [...loadedHistory, coherentFlatTail, incoherentFlatTail],
    'M1',
    {
      price: 75907.21,
      time: incoherentFlatTail.time,
      nowSeconds: incoherentFlatTail.time,
    },
  );

  assert.deepEqual(result, [...loadedHistory, coherentFlatTail]);
});

test('keeps valid backend flat tails when no live quote candidate exists', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_772_000_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const backendFlatTail: Candle = {
    time: 1_772_001_820,
    open: 75907.21,
    high: 75907.21,
    low: 75907.21,
    close: 75907.21,
    volume: 0,
  };

  const candles = [...loadedHistory, backendFlatTail];
  const result = resolveLivePriceCoherentCandles(candles, 'M1', {
    price: null,
    nowSeconds: backendFlatTail.time,
  });

  assert.equal(result.length, candles.length);
  assert.deepEqual(result, candles);
});

test('keeps unannotated backend flat tails when a same-bucket live quote matches', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_772_100_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const backendFlatTail: Candle = {
    time: 1_772_101_820,
    open: 75907.21,
    high: 75907.21,
    low: 75907.21,
    close: 75907.21,
    volume: 0,
  };

  const candles = [...loadedHistory, backendFlatTail];
  const result = resolveLivePriceCoherentCandles(candles, 'M1', {
    price: 75907.21,
    time: backendFlatTail.time,
    nowSeconds: backendFlatTail.time,
  });

  assert.equal(result.length, candles.length);
  assert.deepEqual(result, candles);
});

test('keeps backend-provenance flat tails even when the live quote has the same bucket', () => {
  const loadedHistory: Candle[] = Array.from({ length: 30 }, (_, index) => ({
    time: 1_773_000_020 + index * 60,
    open: 80600 + index,
    high: 80630 + index,
    low: 80580 + index,
    close: 80610 + index,
    volume: 10,
  }));
  const backendFlatTail = Object.assign(
    {
      time: 1_773_001_820,
      open: 75907.21,
      high: 75907.21,
      low: 75907.21,
      close: 75907.21,
      volume: 0,
    } satisfies Candle,
    { source: 'history' as const, closed: true as const },
  );

  const candles = [...loadedHistory, backendFlatTail];
  const result = resolveLivePriceCoherentCandles(candles, 'M1', {
    price: 75907.21,
    time: backendFlatTail.time,
    nowSeconds: backendFlatTail.time,
  });

  assert.equal(result.length, candles.length);
  assert.deepEqual(result, candles);
});

test('drops substantial but time-disconnected stale history when the live session resumes far later', () => {
  // 25 contiguous mid-May history bars at ~$79.6k, then the live session resumes
  // ~20 days later at ~$67.3k. Stitching them would crush the live bars off-scale,
  // so only the coherent live tail should survive.
  const history: Candle[] = Array.from({ length: 25 }, (_, index) => ({
    time: 1_778_700_000 + index * 60,
    open: 79600 + index,
    high: 79620 + index,
    low: 79580 + index,
    close: 79605 + index,
    volume: 10,
  }));
  const lastHistoryTime = 1_778_700_000 + 24 * 60;
  const liveTailTime = lastHistoryTime + 20 * 24 * 60 * 60;
  const liveTail: Candle = {
    time: liveTailTime,
    open: 67300,
    high: 67320,
    low: 67280,
    close: 67305,
    volume: 5,
  };

  const result = resolveLivePriceCoherentCandles([...history, liveTail], 'M1', {
    price: 67305,
    time: liveTailTime,
    nowSeconds: liveTailTime,
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], liveTail);
});

test('does not synthesize candles without a positive finite live price', () => {
  const result = resolveLivePriceCoherentCandles(staleGoldHistory, 'M1', {
    price: null,
    nowSeconds: 1_769_000_125,
  });

  assert.equal(result, staleGoldHistory);
  assert.deepEqual(result, staleGoldHistory);
});
