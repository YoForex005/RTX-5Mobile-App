import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChartTradeButtonPriceColor, resolveChartTradeButtonQuote } from './quoteFallback';

test('resolveChartTradeButtonQuote prefers live websocket bid and ask', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: 79595.51,
      liveAsk: 79620.51,
      fallbackBid: 79000,
      fallbackAsk: 79025,
    }),
    { bid: 79595.51, ask: 79620.51 },
  );
});

test('resolveChartTradeButtonQuote uses chart fallback prices while websocket quote is unavailable', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: undefined,
      liveAsk: Number.NaN,
      fallbackBid: 79595.51,
      fallbackAsk: 79620.51,
    }),
    { bid: 79595.51, ask: 79620.51 },
  );
});

test('resolveChartTradeButtonQuote keeps placeholders when neither source has usable prices', () => {
  assert.deepEqual(
    resolveChartTradeButtonQuote({
      liveBid: 0,
      liveAsk: -1,
      fallbackBid: undefined,
      fallbackAsk: null,
    }),
    { bid: 0, ask: 0 },
  );
});

test('resolveChartTradeButtonPriceColor follows MT-style per-price tick movement colors', () => {
  assert.deepEqual(
    resolveChartTradeButtonPriceColor({
      currentPrice: 4510.01,
      previousPrice: 4509.76,
      previousDirection: null,
      upColor: '#2563EB',
      downColor: '#EF4444',
      fallbackColor: '#EF4444',
    }),
    { color: '#2563EB', direction: 'up', lastPrice: 4510.01 },
  );

  assert.deepEqual(
    resolveChartTradeButtonPriceColor({
      currentPrice: 4509.21,
      previousPrice: 4510.01,
      previousDirection: 'up',
      upColor: '#2563EB',
      downColor: '#EF4444',
      fallbackColor: '#2563EB',
    }),
    { color: '#EF4444', direction: 'down', lastPrice: 4509.21 },
  );

  assert.deepEqual(
    resolveChartTradeButtonPriceColor({
      currentPrice: 4509.21,
      previousPrice: 4509.21,
      previousDirection: 'down',
      upColor: '#2563EB',
      downColor: '#EF4444',
      fallbackColor: '#2563EB',
    }),
    { color: '#EF4444', direction: 'down', lastPrice: 4509.21 },
  );
});
