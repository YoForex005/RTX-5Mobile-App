import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLiveAccountMetrics,
  resolveAccountWsSession,
} from './accountSocket.helpers.ts';

test('resolveAccountWsSession prefers the resolved live MT5 login over legacy persisted ids', () => {
  const session = resolveAccountWsSession(
    {
      id: '92',
      credentials: {
        accessToken: 'jwt-token',
      },
    },
    200074,
  );

  assert.deepEqual(session, {
    token: 'jwt-token',
    login: '200074',
  });
});

test('resolveAccountWsSession prefers the persisted MT5 login when live state is stale', () => {
  const session = resolveAccountWsSession(
    {
      id: '200101',
      credentials: {
        accessToken: 'jwt-token',
      },
    },
    200074,
  );

  assert.deepEqual(session, {
    token: 'jwt-token',
    login: '200101',
  });
});

test('extractLiveAccountMetrics normalizes backend account aliases', () => {
  const metrics = extractLiveAccountMetrics({
    account_login: '100003',
    balance: 1250.5,
    equity: 1279.1,
    used_margin: 145.25,
    free_margin: 1133.85,
    margin_level: 880.5,
    floating_pnl: 28.6,
  });

  assert.deepEqual(metrics, {
    login: 100003,
    balance: 1250.5,
    equity: 1279.1,
    margin: 145.25,
    margin_free: 1133.85,
    margin_level: 880.5,
    floating: 28.6,
  });
});
