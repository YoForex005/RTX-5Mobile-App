import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTradeIdempotencyKey,
  getTradeIdempotencyAction,
} from './tradeIdempotency';

test('idempotency routes cover every required trade mutation and nothing else', () => {
  assert.equal(getTradeIdempotencyAction('/orders', 'POST'), 'order');
  assert.equal(getTradeIdempotencyAction('/orders/pending', 'POST'), 'pending');
  assert.equal(getTradeIdempotencyAction('/orders/pending/42', 'PUT'), 'pending-modify-42');
  assert.equal(getTradeIdempotencyAction('/orders/pending/42', 'DELETE'), 'pending-cancel-42');
  assert.equal(getTradeIdempotencyAction('/positions/12345/close', 'POST'), 'close-12345');
  assert.equal(getTradeIdempotencyAction('/positions/12345', 'PUT'), null);
  assert.equal(getTradeIdempotencyAction('/orders', 'GET'), null);
});

test('trade idempotency keys are action-prefixed and unique per request', () => {
  const first = createTradeIdempotencyKey('order');
  const second = createTradeIdempotencyKey('order');

  assert.match(first, /^order-/);
  assert.match(second, /^order-/);
  assert.notEqual(first, second);
});
