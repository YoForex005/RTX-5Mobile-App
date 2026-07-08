import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PendingOrderPayloadError,
  buildPendingOrderRequestBody,
  normalizePendingOrderType,
} from './pendingOrderPayload.ts';

test('pending order payload targets the V2 pending contract', () => {
  assert.deepEqual(
    buildPendingOrderRequestBody({
      account_login: '200074',
      symbol: 'XAUUSD.c',
      side: 'buy',
      volume: 0.1,
      type: 'Buy Limit',
      price: 2320.5,
      price_sl: 0,
      price_tp: 2330.5,
      comment: 'ticket',
    }),
    {
      login: 200074,
      symbol: 'XAUUSD.c',
      side: 'buy',
      volume: 0.1,
      type: 'buy_limit',
      price: 2320.5,
      price_tp: 2330.5,
      comment: 'ticket',
    },
  );
});

test('pending order payload accepts price_open only as a local migration alias', () => {
  assert.deepEqual(
    buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.02,
      type: 'sell_stop',
      price_open: 1.069,
    }),
    {
      login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.02,
      type: 'sell_stop',
      price: 1.069,
    },
  );
});

test('pending order payload supports stop-limit orders with their limit price', () => {
  assert.equal(normalizePendingOrderType('Buy Stop Limit'), 'buy_stop_limit');
  assert.equal(normalizePendingOrderType('sell-stop-limit'), 'sell_stop_limit');

  assert.deepEqual(
    buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.01,
      type: 'buy_stop_limit',
      price: 1.08,
      stopLimitPrice: 1.075,
    }),
    {
      login: 200074,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.01,
      type: 'buy_stop_limit',
      price: 1.08,
      stopLimitPrice: 1.075,
    },
  );

  assert.deepEqual(
    buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.01,
      type: 'Sell Stop Limit',
      price: 1.07,
      stop_limit_price: 1.075,
    }),
    {
      login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.01,
      type: 'sell_stop_limit',
      price: 1.07,
      stopLimitPrice: 1.075,
    },
  );
});

test('pending order payload validates stop-limit price direction', () => {
  assert.throws(
    () => buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.01,
      type: 'buy_stop_limit',
      price: 1.08,
    }),
    PendingOrderPayloadError,
  );

  assert.throws(
    () => buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.01,
      type: 'buy_stop_limit',
      price: 1.08,
      stopLimitPrice: 1.081,
    }),
    PendingOrderPayloadError,
  );

  assert.throws(
    () => buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.01,
      type: 'sell_stop_limit',
      price: 1.07,
      stopLimitPrice: 1.069,
    }),
    PendingOrderPayloadError,
  );
});
