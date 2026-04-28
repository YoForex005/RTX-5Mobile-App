import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import {
  isRenderableCandleBootstrapSeed,
  isTrustworthyCandleBootstrapSeed,
  sortAndDedupeCandles,
} from '../../src/domain/candles';
import { splitRestHistoryCandles } from '../../src/domain/candleProvenance';
import { mergeHistoryIntoCandleCache, syncMergedCandleCache } from '../../src/state/candleCache';
import { useTradingState } from '../../src/state/tradingState';
import {
  buildContiguousHistory,
  makeCandle,
  makeLiveOverlayCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const resetCandleCache = () => {
  useTradingState.setState((state) => ({
    ...state,
    candles: {},
  }));
};

beforeEach(resetCandleCache);
afterEach(resetCandleCache);

test('old closed trusted cache can seed the chart when shape and recency are safe', () => {
  const now = secondsUtc(2024, 3, 22, 12, 10, 30);
  const cache = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 10, 'M1');

  assert.equal(isTrustworthyCandleBootstrapSeed(cache, 'M1'), true);
  assert.equal(isRenderableCandleBootstrapSeed(cache, 'M1', 8, 2, now), true);
});

test('thin live-only cache cannot seed the chart history path', () => {
  const liveOnly = [
    makeLiveOverlayCandle(secondsUtc(2024, 3, 22, 12, 5, 0), { close: 1.3 }),
  ];

  assert.equal(isTrustworthyCandleBootstrapSeed(liveOnly, 'M1'), false);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', liveOnly, { canonical: true }), false);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'], undefined);
});

test('backend M1 cache with market-close gaps can seed the chart', () => {
  const backendCache = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 0, 0), { close: 1.1 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 1, 0), { close: 1.2 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 8, 0), { close: 1.3 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 9, 0), { close: 1.4 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 10, 0), { close: 1.5 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 11, 0), { close: 1.6 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 12, 0), { close: 1.7 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 13, 0), { close: 1.8 }),
  ];

  assert.equal(isTrustworthyCandleBootstrapSeed(backendCache, 'M1'), true);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', backendCache, { canonical: true }), true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], backendCache);
});

test('cache dedupes unsorted candle times before use', () => {
  const unsorted = [
    makeTrustedHistoryCandle(180, { close: 1.3 }),
    makeTrustedHistoryCandle(60, { close: 1.1 }),
    makeTrustedHistoryCandle(120, { close: 1.2 }),
    makeTrustedHistoryCandle(120, { close: 1.25, high: 1.25 }),
  ];

  const normalized = sortAndDedupeCandles(unsorted);

  assert.deepEqual(normalized.map((candle) => candle.time), [60, 120, 180]);
  assert.equal(normalized[1].close, 1.25);
});

test('corrupted OHLC cache entries are rejected during normalization', () => {
  const corrupted = [
    makeCandle(60, { open: 1.2, high: 1.1, low: 1.0, close: 1.15 }),
    makeTrustedHistoryCandle(120, { close: 1.2 }),
  ];

  const normalized = sortAndDedupeCandles(corrupted);

  assert.deepEqual(normalized.map((candle) => candle.time), [120]);
});

test('REST history merge stores the backend-authoritative candle series without splitting current candle', () => {
  const restPayload = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ];

  const stored = mergeHistoryIntoCandleCache('EURUSD', 'M1', restPayload);

  assert.deepEqual(stored.map((candle) => candle.time), [60, 120, 180]);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], stored);
});

test('same-time live overlay does not promote a thin one-candle cache', () => {
  const trusted = makeTrustedHistoryCandle(120, { close: 1.1 });
  const live = makeLiveOverlayCandle(120, { close: 1.9 });

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', [trusted, live], { canonical: true }), false);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'], undefined);
});

test('app restart during live candle relies on REST split to avoid trusting current candle', () => {
  const restartedPayload = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.5 }),
  ];

  const { closedHistory, currentCandle } = splitRestHistoryCandles(restartedPayload, 'M1', 'bid');

  assert.deepEqual(closedHistory.map((candle) => candle.time), [60, 120]);
  assert.equal(currentCandle?.time, 180);
});
