import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildCandleHistorySearchParams,
  extractCandleHistoryPayload,
  getCandleHistoryRequestTimeframes,
} from './candleHistoryQuery';
import {
  CANDLE_HISTORY_TIMEFRAMES,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  MAX_CANDLE_SERIES_LENGTH,
  getTimeframeSeconds,
} from '../core/candles';

test('extractCandleHistoryPayload accepts raw array responses from /api/v2/candles', () => {
  const candles = [
    { time: 1775738220, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 90 },
    { time: 1775738280, open: 1.15, high: 1.21, low: 1.12, close: 1.18, volume: 95 },
  ];

  const extracted = extractCandleHistoryPayload(candles);

  assert.deepEqual(extracted.candles, candles);
  assert.equal(extracted.symbol, undefined);
  assert.equal(extracted.timeframe, undefined);
});

test('extractCandleHistoryPayload accepts wrapped candle payloads', () => {
  const payload = {
    symbol: 'eurusd',
    timeframe: 'm1',
    candles: [{ time: 1775738220, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 90 }],
  };

  const extracted = extractCandleHistoryPayload(payload);

  assert.equal(extracted.symbol, 'eurusd');
  assert.equal(extracted.timeframe, 'm1');
  assert.equal(extracted.candles.length, 1);
});

test('extractCandleHistoryPayload accepts nested data wrappers used by some gateways', () => {
  const payload = {
    data: {
      symbol: 'XAUUSD',
      tf: 'H1',
      items: [{ time: 1775738220, open: 3020, high: 3024, low: 3018, close: 3022, volume: 14 }],
    },
  };

  const extracted = extractCandleHistoryPayload(payload);

  assert.equal(extracted.symbol, 'XAUUSD');
  assert.equal(extracted.timeframe, 'H1');
  assert.equal(extracted.candles.length, 1);
});

test('buildCandleHistorySearchParams anchors history requests with Unix-second bounds', () => {
  const params = buildCandleHistorySearchParams('m1', 500, {
    from: 1775738200.9,
    to: 1775738800.4,
  });

  assert.equal(params.get('timeframe'), 'M1');
  assert.equal(params.get('limit'), '500');
  assert.equal(params.get('from'), '1775738200');
  assert.equal(params.get('to'), '1775738800');
});

test('buildCandleHistorySearchParams leaves explicit backend timeframe token casing intact', () => {
  const params = buildCandleHistorySearchParams('1m', 500);

  assert.equal(params.get('timeframe'), '1m');
});

test('getCandleHistoryRequestTimeframes requests only the selected backend timeframe', () => {
  assert.deepEqual(CANDLE_HISTORY_TIMEFRAMES, ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('M1'), ['M1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('1m'), ['M1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('H1'), ['H1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('W1'), ['W1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('MN'), ['MN']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('M3'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('3m'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('H2'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('2h'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('bad-period'), []);
});

test('default candle history request fills the chart buffer so M1 includes previous dates', () => {
  assert.equal(DEFAULT_CANDLE_HISTORY_LIMIT, MAX_CANDLE_SERIES_LENGTH);
  assert.equal(MAX_CANDLE_SERIES_LENGTH, 2_500);
  assert.ok(DEFAULT_CANDLE_HISTORY_LIMIT * getTimeframeSeconds('M1') > 24 * 60 * 60);
});

test('candle history loader keeps a public no-login backend fallback', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/candles/api/candles.ts'), 'utf8');

  assert.match(source, /PUBLIC_API_V1_BASE_URL/);
  assert.match(source, /const hasAuthToken = Boolean\(getStoredAccessToken\(\)\)/);
  assert.match(source, /fetchPublicCandleHistory\(/);
  assert.match(source, /\/candles\/\$\{encodeURIComponent\(requestedSymbol\)\}/);
  assert.match(source, /\/candles\?\$\{queryParams\.toString\(\)\}/);
});

test('candle history abort handling is safe in React Native without DOMException globals', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/candles/api/candles.ts'), 'utf8');

  assert.match(source, /const isAbortSignalLike = \(value: unknown\)/);
  assert.match(source, /const isAbortError = \(error: unknown\)/);
  assert.doesNotMatch(source, /instanceof DOMException/);
  assert.doesNotMatch(source, /instanceof AbortSignal/);
});
