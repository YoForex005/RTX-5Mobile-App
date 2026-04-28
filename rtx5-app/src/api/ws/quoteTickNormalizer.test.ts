import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeQuoteTickPayload } from './quoteTickNormalizer';

test('normalizeQuoteTickPayload maps bid ask aliases and broker symbol suffixes', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'XAUUSDm',
    bidPrice: '2300.10',
    askPrice: '2300.40',
    serverTime: 1713705000,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'XAUUSD');
  assert.equal(result.update.bid, 2300.1);
  assert.equal(result.update.ask, 2300.4);
  assert.equal(result.update.timestamp, 1713705000);
});

test('normalizeQuoteTickPayload accepts nested quote objects from transport payloads', () => {
  const result = normalizeQuoteTickPayload({
    quote: {
      s: 'EURUSD.c',
      b: 1.085,
      a: 1.0852,
      lastPrice: 1.0851,
      lastTickAt: '1713705060',
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'EURUSD');
  assert.equal(result.update.bid, 1.085);
  assert.equal(result.update.ask, 1.0852);
  assert.equal(result.update.last, 1.0851);
  assert.equal(result.update.timestamp, 1713705060);
});

test('normalizeQuoteTickPayload accepts nested payload tick objects and createdAt timestamps', () => {
  const result = normalizeQuoteTickPayload({
    type: 'quote',
    payload: {
      tick: {
        instrumentSymbol: 'XAUUSD.c',
        bid_price: '2320.10',
        ask_price: '2320.45',
        createdAt: '2024-03-22T10:06:05.000Z',
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.symbol, 'XAUUSD');
  assert.equal(result.update.bid, 2320.1);
  assert.equal(result.update.ask, 2320.45);
  assert.equal(result.update.timestamp, 1711101965000);
});

test('normalizeQuoteTickPayload can update bid ask UI store while flagging missing candle timestamp', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'BTCUSD',
    bid: 85000,
    ask: 85025,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.bid, 85000);
  assert.equal(result.update.ask, 85025);
  assert.equal(result.update.timestamp, null);
  assert.equal(result.update.timestampSource, 'missing');
});

test('normalizeQuoteTickPayload uses receive-time fallback when socket feed omits timestamp', () => {
  const result = normalizeQuoteTickPayload(
    {
      symbol: 'BTCUSD',
      bid: 85000,
      ask: 85025,
    },
    1713705123456,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.update.bid, 85000);
  assert.equal(result.update.ask, 85025);
  assert.equal(result.update.timestamp, 1713705123456);
  assert.equal(result.update.timestampSource, 'received_at');
});

test('normalizeQuoteTickPayload rejects non-finite bid ask before it reaches candles', () => {
  const result = normalizeQuoteTickPayload({
    symbol: 'XAUUSD',
    bidPrice: Number.NaN,
    askPrice: 2300.4,
    serverTime: 1713705000,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_bid_ask',
    rawKeys: ['symbol', 'bidPrice', 'askPrice', 'serverTime'],
  });
});
