import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_ENV_FEED_QUERY_CONTEXT,
  resolveEffectiveFeedAuthForSession,
  resolveFeedAuthContextFromAuthResponse,
  resolveSessionFeedAuth,
} from './feedAuthContract';

test('token presence alone never invents a feed authentication contract from backend body', () => {
  assert.deepEqual(resolveFeedAuthContextFromAuthResponse({ feed_token: 'secret' }, true), {
    mode: 'disabled_unconfigured',
    reason: 'missing_contract',
  });
});

test('explicit query contract is retained without secret values', () => {
  assert.deepEqual(resolveFeedAuthContextFromAuthResponse({
    feed_auth_context: {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  }, true), {
    mode: 'query',
    credential: 'feed_token',
    tokenQueryParam: 'token',
    brokerIdQueryParam: 'broker_id',
  });
});

test('missing credential and malformed query metadata fail closed distinctly', () => {
  assert.deepEqual(resolveFeedAuthContextFromAuthResponse({
    feed_auth: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
    },
  }, false), {
    mode: 'disabled_unconfigured',
    reason: 'missing_credential',
  });
  assert.deepEqual(resolveFeedAuthContextFromAuthResponse({
    feed_auth: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token&broker',
    },
  }, true), {
    mode: 'disabled_unconfigured',
    reason: 'missing_contract',
  });
});

test('session feed auth falls back to legacy env query contract when backend omits feed_auth', () => {
  const previous = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'env-market-data-token';
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = '';
  try {
    const resolved = resolveSessionFeedAuth({
      response: { access_token: 'jwt', broker_id: 'myprop-trade' },
      brokerId: 'myprop-trade',
    });
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.feedToken, 'env-market-data-token');
    assert.deepEqual(resolved.feedAuthContext, LEGACY_ENV_FEED_QUERY_CONTEXT);
  } finally {
    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previous;
    }
  }
});

test('effective session auth upgrades disabled sessions when env token is configured', () => {
  const previous = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'env-market-data-token';
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = '';
  try {
    const resolved = resolveEffectiveFeedAuthForSession({
      brokerId: 'myprop-trade',
      feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_contract' },
      feedToken: undefined,
    });
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.feedToken, 'env-market-data-token');
    assert.equal(resolved.feedAuthContext.mode, 'query');
  } finally {
    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previous;
    }
  }
});
