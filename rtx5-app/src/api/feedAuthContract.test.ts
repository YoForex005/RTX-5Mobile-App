import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_ENV_FEED_QUERY_CONTEXT,
  resolveEffectiveFeedAuthForSession,
  resolveFeedAuthContextFromAuthResponse,
  resolveSessionFeedAuth,
} from './feedAuthContract';

const withLegacyFeedEnv = (
  token: string,
  brokerId: string,
  run: () => void,
): void => {
  const previousToken = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  const previousBrokerId = process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  const previousMyPropToken = process.env.EXPO_PUBLIC_MYPROP_FEED_TOKEN;
  const previousAchieverToken = process.env.EXPO_PUBLIC_ACHIEVER_FEED_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = token;
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = brokerId;
  delete process.env.EXPO_PUBLIC_MYPROP_FEED_TOKEN;
  delete process.env.EXPO_PUBLIC_ACHIEVER_FEED_TOKEN;
  try {
    run();
  } finally {
    if (previousToken === undefined) delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    else process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previousToken;
    if (previousBrokerId === undefined) delete process.env.EXPO_PUBLIC_FEED_BROKER_ID;
    else process.env.EXPO_PUBLIC_FEED_BROKER_ID = previousBrokerId;
    if (previousMyPropToken === undefined) delete process.env.EXPO_PUBLIC_MYPROP_FEED_TOKEN;
    else process.env.EXPO_PUBLIC_MYPROP_FEED_TOKEN = previousMyPropToken;
    if (previousAchieverToken === undefined) delete process.env.EXPO_PUBLIC_ACHIEVER_FEED_TOKEN;
    else process.env.EXPO_PUBLIC_ACHIEVER_FEED_TOKEN = previousAchieverToken;
  }
};

const exactAchieverResponse = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  access_token: 'achiever-access-token',
  refresh_token: 'achiever-refresh-token',
  expires_in: 86_400,
  broker_id: 'achiever-financials',
  account_login: 10001,
  feed_token: 'achiever-feed-token',
  feed_auth_context: {
    mode: 'query',
    credential: 'feed_token',
    token_query_param: 'token',
    broker_id_query_param: 'broker_id',
  },
  ...overrides,
});

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
  withLegacyFeedEnv('env-market-data-token', 'myprop-trade', () => {
    const resolved = resolveSessionFeedAuth({
      response: { access_token: 'jwt', broker_id: 'myprop-trade' },
      brokerId: 'myprop-trade',
    });
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.feedToken, 'env-market-data-token');
    assert.deepEqual(resolved.feedAuthContext, LEGACY_ENV_FEED_QUERY_CONTEXT);
  });
});

test('effective session auth upgrades disabled sessions when env token is configured', () => {
  withLegacyFeedEnv('env-market-data-token', 'myprop-trade', () => {
    const resolved = resolveEffectiveFeedAuthForSession({
      brokerId: 'myprop-trade',
      feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_contract' },
      feedToken: undefined,
    });
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.feedToken, 'env-market-data-token');
    assert.equal(resolved.feedAuthContext.mode, 'query');
  });
});

test('MyProp-scoped env token cannot upgrade an Achiever session', () => {
  withLegacyFeedEnv('myprop-env-token', 'myprop-trade', () => {
    const resolved = resolveEffectiveFeedAuthForSession({
      brokerId: 'achiever-financials',
      feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_contract' },
      feedToken: undefined,
    });
    assert.equal(resolved.source, 'none');
    assert.equal(resolved.feedToken, undefined);
    assert.deepEqual(resolved.feedAuthContext, {
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  });
});

test('Achiever-specific public env fallback is ignored', () => {
  withLegacyFeedEnv('myprop-env-token', 'myprop-trade', () => {
    process.env.EXPO_PUBLIC_ACHIEVER_FEED_TOKEN = 'achiever-env-token';
    const resolved = resolveEffectiveFeedAuthForSession({
      brokerId: 'achiever-financials',
      feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_contract' },
      feedToken: undefined,
    });
    assert.equal(resolved.source, 'none');
    assert.equal(resolved.feedToken, undefined);
    assert.deepEqual(resolved.feedAuthContext, {
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  });
});

test('explicit backend Achiever feed contract wins over unrelated env config', () => {
  withLegacyFeedEnv('myprop-env-token', 'myprop-trade', () => {
    const resolved = resolveSessionFeedAuth({
      response: exactAchieverResponse({
        feed_token: 'achiever-login-token',
      }),
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    });
    assert.equal(resolved.source, 'backend');
    assert.equal(resolved.feedToken, 'achiever-login-token');
    assert.deepEqual(resolved.feedAuthContext, {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    });
  });
});

test('Achiever requires explicit matching broker and account identity', () => {
  const contract = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 86_400,
    feed_token: 'backend-feed-token',
    feed_auth_context: {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  };
  assert.throws(
    () => resolveSessionFeedAuth({
      response: { ...contract, account_login: 10001 },
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    }),
    /broker identity/,
  );
  assert.throws(
    () => resolveSessionFeedAuth({
      response: {
        ...contract,
        broker_id: 'achiever-financials',
        account_login: 99999,
      },
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    }),
    /requested account/,
  );
});

test('Achiever token-only and context-only handoffs fail closed without reuse', () => {
  const identity = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 86_400,
    broker_id: 'achiever-financials',
    account_login: 10001,
  };
  const tokenOnly = resolveSessionFeedAuth({
    response: { ...identity, feed_token: 'new-token-without-context' },
    brokerId: 'achiever-financials',
    accountLogin: '10001',
    existingFeedToken: 'old-token-must-not-survive',
  });
  assert.deepEqual(tokenOnly, {
    feedAuthContext: {
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    },
    source: 'none',
  });

  const contextOnly = resolveSessionFeedAuth({
    response: {
      ...identity,
      feed_auth_context: {
        mode: 'query',
        credential: 'feed_token',
        token_query_param: 'token',
        broker_id_query_param: 'broker_id',
      },
    },
    brokerId: 'achiever-financials',
    accountLogin: '10001',
    existingFeedToken: 'old-token-must-not-survive',
  });
  assert.deepEqual(contextOnly, {
    feedAuthContext: {
      mode: 'disabled_unconfigured',
      reason: 'missing_credential',
    },
    source: 'none',
  });
});

test('Achiever rejects unsafe, duplicate, aliased, or access-token query contracts', () => {
  const base = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 86_400,
    broker_id: 'achiever-financials',
    account_login: '10001',
    feed_token: 'backend-feed-token',
  };
  for (const feed_auth_context of [
    {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token&broker',
      broker_id_query_param: 'broker_id',
    },
    {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'token',
    },
    {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    },
    {
      mode: 'query',
      credential: 'access_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  ]) {
    const resolved = resolveSessionFeedAuth({
      response: { ...base, feed_auth_context },
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    });
    assert.equal(resolved.feedToken, undefined);
    assert.deepEqual(resolved.feedAuthContext, {
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  }
});

test('Achiever context tolerates extra raw keys like every other broker (gateway handoff parity)', () => {
  // The shared gateway login handoff emits account_login_query_param (and may
  // add future keys) alongside the four required fields. GTA's generic path
  // ignores unknown keys — Achiever must too, or a benign backend addition
  // silently blacks out live data. Extra keys are ignored; the resolved
  // context keeps the exact four-field shape the session validators require.
  for (const feed_auth_context of [
    {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
      account_login_query_param: 'account_login',
    },
    {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
      account_login_query_param: '',
    },
    {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
      future_extension: 'unsupported',
    },
  ]) {
    const resolved = resolveSessionFeedAuth({
      response: exactAchieverResponse({ feed_auth_context }),
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    });
    assert.equal(resolved.source, 'backend');
    assert.equal(resolved.feedToken, 'achiever-feed-token');
    assert.deepEqual(resolved.feedAuthContext, {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    });
  }
});

test('Achiever feed activation requires the complete root same-response auth tuple', () => {
  const invalidResponses: Record<string, unknown>[] = [
    exactAchieverResponse({ access_token: undefined }),
    exactAchieverResponse({ access_token: undefined, token: 'access-alias' }),
    exactAchieverResponse({ refresh_token: undefined }),
    exactAchieverResponse({ refresh_token: undefined, refreshToken: 'refresh-alias' }),
    exactAchieverResponse({ expires_in: undefined }),
    exactAchieverResponse({ expires_in: '86400' }),
    exactAchieverResponse({ expires_in: 0 }),
  ];

  for (const response of invalidResponses) {
    const resolved = resolveSessionFeedAuth({
      response,
      brokerId: 'achiever-financials',
      accountLogin: '10001',
      existingFeedToken: 'old-token-must-not-survive',
    });
    assert.deepEqual(resolved, {
      feedAuthContext: {
        mode: 'disabled_unconfigured',
        reason: 'missing_contract',
      },
      source: 'none',
    });
  }
});

test('Achiever rejects a feed credential equal to the root access credential', () => {
  const resolved = resolveSessionFeedAuth({
    response: exactAchieverResponse({
      access_token: 'same-credential',
      feed_token: 'same-credential',
    }),
    brokerId: 'achiever-financials',
    accountLogin: '10001',
  });

  assert.deepEqual(resolved, {
    feedAuthContext: {
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    },
    source: 'none',
  });
});

test('Achiever backend feed token is preserved verbatim', () => {
  const resolved = resolveSessionFeedAuth({
    response: exactAchieverResponse({
      feed_token: '  opaque+feed==  ',
    }),
    brokerId: 'achiever-financials',
    accountLogin: '10001',
  });
  assert.equal(resolved.feedToken, '  opaque+feed==  ');
});
