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

test('pending order payload rejects unsupported stop-limit orders before POST', () => {
  assert.equal(normalizePendingOrderType('Buy Stop Limit'), null);
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
});
