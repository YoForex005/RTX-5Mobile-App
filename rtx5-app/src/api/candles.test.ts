import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCandleHistorySearchParams, extractCandleHistoryPayload } from './candleHistoryQuery';

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

test('buildCandleHistorySearchParams anchors history requests to a bounded recent window', () => {
  const params = buildCandleHistorySearchParams('m1', 500, {
    from: 1775738200.9,
    to: 1775738800.4,
  });

  assert.equal(params.get('timeframe'), 'M1');
  assert.equal(params.get('limit'), '500');
  assert.equal(params.get('from'), '1775738200');
  assert.equal(params.get('to'), '1775738800');
});
