import assert from 'node:assert/strict';
import test from 'node:test';

import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';

const identity = { brokerId: 'broker-a', accountLogin: '1001', sessionEpoch: 7 } as const;

test('socket payload identity rejects explicit cross-session values', () => {
  assert.equal(payloadMatchesSocketIdentity({ broker_id: 'broker-b' }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ data: { login: '1002' } }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ payload: { session_epoch: 6 } }, identity), false);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'positions.1002' }, identity), false);
});

test('socket payload identity accepts matching or protocol-implicit identity', () => {
  assert.equal(payloadMatchesSocketIdentity({
    broker_id: 'BROKER-A',
    account_login: 1001,
    session_epoch: 7,
    channel: 'metrics.1001',
  }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'candles.XAUUSD.1m' }, identity), true);
  assert.equal(payloadMatchesSocketIdentity({ channel: 'ticks.XAUUSD', data: { bid: 1 } }, identity), true);
});
