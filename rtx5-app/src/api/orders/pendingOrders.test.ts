import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildModifyPendingOrderRequestBody,
  normalizePendingOrderDto,
} from './pendingOrders.ts';

const baseDto = {
  ticket: 700123,
  account_login: 200074,
  symbol: 'eurusd',
  type: 'buy_limit',
  status: 'pending',
  time_setup: 1_784_800_000,
  volume_exact: '0.10000000',
  price_exact: '1.08000000',
};

test('pending-list normalization has deterministic exact-field precedence', () => {
  const normalized = normalizePendingOrderDto({
    ...baseDto,
    sl_exact: '1.07000000',
    price_sl_exact: '1.071',
    sl: 1.072,
    price_sl: 1.073,
    price_tp_exact: '1.09000000',
    tp: 1.091,
    price_tp: 1.092,
    time_expiry: 1_800_000_000,
    expiry: 1_800_000_001,
    expiration: 1_800_000_002,
  });

  assert.deepEqual(normalized, {
    ticket: 700123,
    accountLogin: 200074,
    symbol: 'EURUSD',
    type: 'buy_limit',
    status: 'pending',
    timeSetup: 1_784_800_000,
    volume: '0.1',
    price: '1.08',
    sl: '1.07',
    tp: '1.09',
    expiry: 1_800_000_000,
    timeDone: null,
    comment: null,
  });
});

test('omitted pending stop and expiry families normalize to null', () => {
  const {
    volume_exact: _omittedVolumeExact,
    price_exact: _omittedPriceExact,
    ...withoutExactValues
  } = baseDto;
  const normalized = normalizePendingOrderDto({
    ...withoutExactValues,
    volume: 0.1,
    price: 1.08,
  });
  assert.equal(normalized.sl, null);
  assert.equal(normalized.tp, null);
  assert.equal(normalized.expiry, null);
  assert.equal(normalized.volume, '0.1');
  assert.equal(normalized.price, '1.08');
});

test('a malformed higher-precedence exact field fails closed', () => {
  assert.throws(
    () => normalizePendingOrderDto({
      ...baseDto,
      sl_exact: 'not-a-decimal',
      sl: 1.07,
    }),
  );
});

test('pending modify preserves omission, null clear, and partial fields', () => {
  assert.deepEqual(buildModifyPendingOrderRequestBody({ sl: null }), { sl: null });
  assert.deepEqual(buildModifyPendingOrderRequestBody({ tp: '1.09' }), { tp: '1.09' });
  assert.deepEqual(buildModifyPendingOrderRequestBody({
    price: 1.081,
    sl: null,
    tp: 1.09,
  }), {
    price: '1.081',
    sl: null,
    tp: '1.09',
  });
  assert.throws(() => buildModifyPendingOrderRequestBody({}));
  assert.throws(() => buildModifyPendingOrderRequestBody({ price: undefined }));
  assert.throws(() => buildModifyPendingOrderRequestBody({ sl: 0 }));
  assert.throws(() => buildModifyPendingOrderRequestBody({ tp: 0 }));
});

test('pending cancel is zero-byte, stable-keyed, and always reaches reconciliation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/api/orders/pendingOrders.ts'),
    'utf8',
  );
  const cancelSource = source.slice(source.indexOf('export const cancelPendingOrder'));
  const requestSource = cancelSource.slice(
    cancelSource.indexOf('const response = await apiClient'),
    cancelSource.indexOf('assertPendingOrderOwnerCurrent(owner);', cancelSource.indexOf('const response = await apiClient')),
  );
  assert.match(requestSource, /method: 'DELETE'/);
  assert.match(requestSource, /'Idempotency-Key': idempotencyKey/);
  assert.doesNotMatch(requestSource, /\bbody\s*:/);
  assert.match(cancelSource, /catch \(error\) \{[\s\S]*primaryError = error/);
  assert.match(cancelSource, /reconcilePendingMutation\(owner, ticket\.numeric\)/);
  assert.match(cancelSource, /response\.status !== 200/);
  assert.match(source, /record\.status !== 'cancelled'/);
});

test('pending modify is partial, exact-200, owner-bound, and non-replaying', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/api/orders/pendingOrders.ts'),
    'utf8',
  );
  const modifySource = source.slice(
    source.indexOf('export const modifyPendingOrder'),
    source.indexOf('const parseCancelPendingOrderResponse'),
  );
  assert.match(modifySource, /assertActivePendingProtectionAllowed\(body\)/);
  assert.match(
    modifySource,
    /const body = buildModifyPendingOrderRequestBody\(input\);[\s\S]*assertActivePendingProtectionAllowed\(body\)/,
  );
  assert.match(modifySource, /'Idempotency-Key': idempotencyKey/);
  assert.match(modifySource, /replayAfterAuthRefresh: false/);
  assert.match(modifySource, /response\.status !== 200/);
  assert.match(modifySource, /reconcilePendingMutation\(owner, ticket\.numeric\)/);
});

test('captured pending reads cannot recapture a newly selected owner', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/api/orders/pendingOrders.ts'),
    'utf8',
  );
  const capturedReadSource = source.slice(
    source.indexOf('export const listPendingOrdersForCapturedOwner'),
    source.indexOf('const reconcilePendingMutation'),
  );
  assert.match(
    capturedReadSource,
    /owner: ActiveBrokerSessionOwnerStamp/,
  );
  assert.match(capturedReadSource, /listPendingOrdersForOwner\(owner\)/);
  assert.doesNotMatch(capturedReadSource, /capturePendingOrderOwner\(\)/);
});
