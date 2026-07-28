import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession';
import {
  BrokerAPI,
  StaleBrokerSessionError,
  createBrokerRefreshRequestInit,
  normalizeBrokerRefreshResponse,
} from './brokerApi';

const activate = (brokerId = 'broker-a') => activateBrokerSession(
  beginActiveBrokerSessionTransition(),
  {
    brokerId,
    accountLogin: '10001',
    apiBase: `https://services.${brokerId}.com/api/v2`,
    feedWsBase: `wss://services.${brokerId}.com/ws/feed`,
    tradeWsBase: `wss://services.${brokerId}.com/ws/v2`,
    feedStatusUrl: `https://services.${brokerId}.com/ws/feed/status`,
    servicesDomain: `services.${brokerId}.com`,
    feedAuthContext: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token',
      brokerIdQueryParam: 'broker_id',
    },
    configVersion: 'cfg-1',
  },
  {
    accessToken: `access-${brokerId}`,
    refreshToken: `refresh-${brokerId}`,
    expiresAt: '2099-01-01T00:00:00.000Z',
    feedToken: `feed-${brokerId}`,
  },
);

type TestCredentialLease = Readonly<{
  accessToken: string;
  owner: NonNullable<ReturnType<typeof captureActiveBrokerSessionOwnerStamp>>;
}>;

const rotateCredentials = (accessToken = 'access-rotated'): TestCredentialLease => {
  const capture = captureActiveBrokerSession();
  assert.ok(capture);
  const identity = getActiveBrokerSessionIdentity(capture.session);
  assert.equal(updateActiveBrokerSessionCredentials(identity, {
    ...capture.credentials,
    accessToken,
    refreshToken: `${capture.credentials.refreshToken}-rotated`,
  }), true);
  const owner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(owner);
  return Object.freeze({ accessToken, owner });
};

const currentCredentialLease = (): TestCredentialLease => {
  const capture = captureActiveBrokerSession();
  const owner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(capture);
  assert.ok(owner);
  return Object.freeze({
    accessToken: capture.credentials.accessToken,
    owner,
  });
};

let originalFetch: typeof globalThis.fetch;

test.beforeEach(() => {
  __resetActiveBrokerSessionForTests();
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('refresh wire sends only the refresh token without bearer authorization', () => {
  const request = createBrokerRefreshRequestInit('rotating-refresh-1');
  const headers = new Headers(request.headers);

  assert.equal(request.method, 'POST');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('Authorization'), null);
  assert.deepEqual(JSON.parse(String(request.body)), {
    refresh_token: 'rotating-refresh-1',
  });
});

test('refresh response requires both rotated access and refresh credentials', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(normalized.accessToken, 'access-2');
  assert.equal(normalized.refreshToken, 'refresh-2');

  assert.throws(
    () => normalizeBrokerRefreshResponse({ access_token: 'access-2' }),
    /rotated refresh token/,
  );
  assert.throws(
    () => normalizeBrokerRefreshResponse({ refresh_token: 'refresh-2' }),
    /access token/,
  );
});

test('Achiever refresh validates exact identity and atomic feed contract', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    expires_in: 3600,
    broker_id: 'achiever-financials',
    account_login: 10001,
    feed_token: '  opaque+feed==  ',
    feed_auth_context: {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  }, {
    brokerId: 'achiever-financials',
    accountLogin: '10001',
  });

  assert.equal(normalized.brokerId, 'achiever-financials');
  assert.equal(normalized.accountLogin, '10001');
  assert.equal(normalized.feedToken, '  opaque+feed==  ');
  assert.deepEqual(normalized.feedAuthContext, {
    mode: 'query',
    credential: 'feed_token',
    tokenQueryParam: 'token',
    brokerIdQueryParam: 'broker_id',
  });
});

test('Achiever accepts a first refresh feed generation when no prior token exists', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    expires_in: 3600,
    broker_id: 'achiever-financials',
    account_login: 10001,
    feed_token: 'first-feed-generation',
    feed_auth_context: {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  }, {
    brokerId: 'achiever-financials',
    accountLogin: '10001',
  });

  assert.equal(normalized.feedToken, 'first-feed-generation');
  assert.equal(normalized.feedContractFailure, undefined);
});

test('Achiever refresh disables a repeated feed generation while keeping rotated REST credentials', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    expires_in: 3600,
    broker_id: 'achiever-financials',
    account_login: 10001,
    feed_token: 'same-feed-generation',
    feed_auth_context: {
      mode: 'query',
      credential: 'feed_token',
      token_query_param: 'token',
      broker_id_query_param: 'broker_id',
    },
  }, {
    brokerId: 'achiever-financials',
    accountLogin: '10001',
    previousFeedToken: 'same-feed-generation',
  });

  assert.equal(normalized.accessToken, 'access-2');
  assert.equal(normalized.refreshToken, 'refresh-2');
  assert.equal(normalized.feedToken, undefined);
  assert.equal(normalized.feedContractFailure, 'feed_generation_reused');
  assert.deepEqual(normalized.feedAuthContext, {
    mode: 'disabled_unconfigured',
    reason: 'missing_credential',
  });
});

test('Achiever refresh omission clears the feed pair instead of retaining it', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    broker_id: 'achiever-financials',
    account_login: 10001,
  }, {
    brokerId: 'achiever-financials',
    accountLogin: '10001',
  });

  assert.equal(normalized.feedToken, undefined);
  assert.deepEqual(normalized.feedAuthContext, {
    mode: 'disabled_unconfigured',
    reason: 'missing_contract',
  });
});

test('Achiever refresh rejects missing or cross-account identity', () => {
  assert.throws(
    () => normalizeBrokerRefreshResponse({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      account_login: 10001,
    }, {
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    }),
    /broker identity/,
  );
  assert.throws(
    () => normalizeBrokerRefreshResponse({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      broker_id: 'achiever-financials',
      account_login: 20002,
    }, {
      brokerId: 'achiever-financials',
      accountLogin: '10001',
    }),
    /requested account/,
  );
});

test('REST request uses only the atomically captured broker endpoint and token', async () => {
  activate();
  const api = new BrokerAPI();
  let capturedUrl = '';
  let capturedAuthorization = '';
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions');
  assert.equal(response.status, 200);
  assert.equal(capturedUrl, 'https://services.broker-a.com/api/v2/positions');
  assert.equal(capturedAuthorization, 'Bearer access-broker-a');
  api.dispose();
});

test('preflight refresh adopts its exact credential owner before the first send', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  let capturedAuthorization = '';
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return rotateCredentials('access-preflight-refreshed');
  };
  globalThis.fetch = (async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions');

  assert.equal(response.status, 200);
  assert.deepEqual(tokenChecks, [false]);
  assert.equal(capturedAuthorization, 'Bearer access-preflight-refreshed');
  api.dispose();
});

test('trade mutations receive scoped idempotency keys while non-trade calls do not', async () => {
  activate();
  const api = new BrokerAPI();
  const requests: Array<{ url: string; headers: Headers; body: BodyInit | null | undefined }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  await api.request('/orders', { method: 'POST', body: '{}' });
  await api.request('/orders/pending', { method: 'POST', body: '{}' });
  await api.request('/orders/pending/42', { method: 'PUT', body: '{}' });
  await api.request('/orders/pending/42', { method: 'DELETE' });
  await api.request('/positions/12345/close', { method: 'POST', body: '{"mode":"full"}' });
  await api.request('/positions/12345/close', { method: 'POST', body: '{"mode":"full"}' });
  await api.request('/positions/12345', { method: 'PUT', body: '{}' });

  const idempotencyKeys = requests.map((request) => request.headers.get('Idempotency-Key'));
  assert.deepEqual(idempotencyKeys.slice(0, 6).map(Boolean), [true, true, true, true, true, true]);
  assert.equal(idempotencyKeys[6], null);
  assert.equal(new Set(idempotencyKeys.slice(0, 6)).size, 6);
  assert.match(idempotencyKeys[0] ?? '', /^order-/);
  assert.match(idempotencyKeys[4] ?? '', /^close-12345-/);
  assert.match(idempotencyKeys[5] ?? '', /^close-12345-/);
  assert.notEqual(idempotencyKeys[4], idempotencyKeys[5]);
  requests.slice(4, 6).forEach((request) => {
    assert.equal(request.url, 'https://services.broker-a.com/api/v2/positions/12345/close');
    assert.equal(request.body, '{"mode":"full"}');
  });
  requests.slice(0, 6).forEach((request) => {
    assert.equal(request.headers.get('Authorization'), 'Bearer access-broker-a');
    assert.equal(request.headers.get('Content-Type'), 'application/json');
  });
  api.dispose();
});

test('trade idempotency preserves a caller-provided retry key', async () => {
  activate();
  const api = new BrokerAPI();
  let capturedKey = '';
  globalThis.fetch = (async (_input, init) => {
    capturedKey = new Headers(init?.headers).get('Idempotency-Key') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  await api.request('/orders', {
    method: 'POST',
    body: '{}',
    headers: { 'Idempotency-Key': 'order-retry-abc123' },
  });

  assert.equal(capturedKey, 'order-retry-abc123');
  api.dispose();
});

test('non-replayable mutation causally rebinds its settled 401 after refresh without replaying the write', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  const requests: Array<{ url: string; authorization: string }> = [];
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return forceRefresh
      ? rotateCredentials('access-refreshed')
      : currentCredentialLease();
  };
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization') ?? '',
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(init ?? {}, 'replayAfterAuthRefresh'),
      false,
    );
    return new Response(
      JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions/12345', {
    method: 'PUT',
    body: '{"price_sl":0,"price_tp":1.091}',
    replayAfterAuthRefresh: false,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(tokenChecks, [false, true]);
  assert.deepEqual(requests, [{
    url: 'https://services.broker-a.com/api/v2/positions/12345',
    authorization: 'Bearer access-broker-a',
  }]);
  api.dispose();
});

test('default 401 handling still replays eligible requests once with the refreshed token', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  const authorizations: string[] = [];
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return forceRefresh
      ? rotateCredentials('access-refreshed')
      : currentCredentialLease();
  };
  globalThis.fetch = (async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('Authorization') ?? '');
    return authorizations.length === 1
      ? new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
      : new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions', { method: 'GET' });

  assert.equal(response.status, 200);
  assert.deepEqual(tokenChecks, [false, true]);
  assert.deepEqual(authorizations, [
    'Bearer access-broker-a',
    'Bearer access-refreshed',
  ]);
  api.dispose();
});

test('external credential rotation during a 401 refresh rejects instead of replaying', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveRefresh: ((response: Response) => void) | undefined;
  let notifyRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    notifyRefreshStarted = resolve;
  });
  let requestCount = 0;
  globalThis.fetch = ((input) => {
    requestCount += 1;
    if (String(input).endsWith('/auth/refresh')) {
      notifyRefreshStarted?.();
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    }
    return Promise.resolve(new Response(
      JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await refreshStarted;
  rotateCredentials('access-external');
  resolveRefresh?.(new Response(JSON.stringify({
    access_token: 'access-internal-refresh',
    refresh_token: 'refresh-internal-refresh',
    expires_at: '2099-01-01T00:00:00.000Z',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  await assert.rejects(pending, StaleBrokerSessionError);
  assert.equal(requestCount, 2);
  api.dispose();
});

test('epoch transition aborts in-flight work and discards its completion', async () => {
  activate();
  const api = new BrokerAPI();
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await Promise.resolve();
  beginActiveBrokerSessionTransition();
  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('delayed 2xx completion is discarded after an external credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveFetch: ((response: Response) => void) | undefined;
  let notifyFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    notifyFetchStarted = resolve;
  });
  globalThis.fetch = (() => {
    notifyFetchStarted?.();
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await fetchStarted;
  rotateCredentials();
  resolveFetch?.(new Response('{"positions":[]}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('delayed fetch error is replaced by stale ownership after credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let rejectFetch: ((error: Error) => void) | undefined;
  let notifyFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    notifyFetchStarted = resolve;
  });
  globalThis.fetch = (() => {
    notifyFetchStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await fetchStarted;
  rotateCredentials();
  rejectFetch?.(new Error('upstream failed'));

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('absolute endpoints outside the active API base are rejected', async () => {
  activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{}')) as typeof globalThis.fetch;

  await assert.rejects(
    api.request('https://services.broker-b.com/api/v2/positions'),
    /outside the active broker API base/,
  );
  api.dispose();
});

test('feed URL uses only committed non-secret auth metadata and in-memory credential', async () => {
  activate();
  const api = new BrokerAPI();

  const url = await api.getQuoteWebSocketUrl();
  assert.equal(
    url,
    'wss://services.broker-a.com/ws/feed?token=feed-broker-a&broker_id=broker-a',
  );
  api.dispose();
});

test('Achiever feed URL uses the exact host and one-pass opaque query encoding', async () => {
  const opaqueFeedToken = ' opaque+feed=%value&part?# ';
  activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    {
      brokerId: 'achiever-financials',
      accountLogin: '10001',
      apiBase: 'https://service.achieverfinancials.com/api/v2',
      feedWsBase: 'wss://service.achieverfinancials.com/ws/feed',
      tradeWsBase: 'wss://service.achieverfinancials.com/ws/v2',
      feedStatusUrl: 'https://service.achieverfinancials.com/ws/feed/status',
      servicesDomain: 'service.achieverfinancials.com',
      feedAuthContext: {
        mode: 'query',
        credential: 'feed_token',
        tokenQueryParam: 'token',
        brokerIdQueryParam: 'broker_id',
      },
      configVersion: 'cfg-achiever',
    },
    {
      accessToken: 'access-achiever',
      refreshToken: 'refresh-achiever',
      expiresAt: '2099-01-01T00:00:00.000Z',
      feedToken: opaqueFeedToken,
    },
  );
  const api = new BrokerAPI();

  const parsed = new URL(await api.getQuoteWebSocketUrl());
  assert.equal(parsed.protocol, 'wss:');
  assert.equal(parsed.host, 'service.achieverfinancials.com');
  assert.equal(parsed.pathname, '/ws/feed');
  assert.deepEqual([...parsed.searchParams.keys()].sort(), ['broker_id', 'token']);
  assert.equal(parsed.searchParams.getAll('token').length, 1);
  assert.equal(parsed.searchParams.get('token'), opaqueFeedToken);
  assert.equal(parsed.searchParams.get('broker_id'), 'achiever-financials');
  api.dispose();
});

test('trade socket uses the validated /ws/v2 route derived during session commit', async () => {
  activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    {
      brokerId: 'broker-a',
      accountLogin: '10001',
      apiBase: 'https://services.broker-a.com/api/v2',
      feedWsBase: 'wss://services.broker-a.com/ws/feed',
      feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
      servicesDomain: 'services.broker-a.com',
      feedAuthContext: { mode: 'none' },
      configVersion: 'cfg-1',
    },
    {
      accessToken: 'access-a',
      refreshToken: '',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  );
  const api = new BrokerAPI();

  assert.equal(
    await api.getWebSocketUrl(),
    'wss://services.broker-a.com/ws/v2?token=access-a',
  );
  api.dispose();
});

test('JSON body completion is discarded when the session epoch changes during parsing', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveBody: ((value: unknown) => void) | undefined;
  let notifyBodyStarted: (() => void) | undefined;
  const bodyStarted = new Promise<void>((resolve) => {
    notifyBodyStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: () => {
      notifyBodyStarted?.();
      return new Promise((resolve) => {
        resolveBody = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const pending = api.getJsonResponse<{ value: number }>('/instruments');
  await bodyStarted;
  beginActiveBrokerSessionTransition();
  resolveBody?.({ value: 7 });

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('cache commit helper rejects a parsed response after an epoch transition', async () => {
  const capture = activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{"value":7}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof globalThis.fetch;

  const result = await api.getJsonResponse<{ value: number }>('/instruments');
  beginActiveBrokerSessionTransition();

  assert.throws(
    () => api.commitJsonResponse(
      result,
      capture.session.cacheNamespace,
      (data) => data.value,
    ),
    StaleBrokerSessionError,
  );
  api.dispose();
});

test('raw response body readers reject an epoch change while decoding', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveText: ((value: string) => void) | undefined;
  let notifyTextStarted: (() => void) | undefined;
  const textStarted = new Promise<void>((resolve) => {
    notifyTextStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: () => {
      notifyTextStarted?.();
      return new Promise<string>((resolve) => {
        resolveText = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const response = await api.request('/positions');
  const pendingBody = response.text();
  await textStarted;
  beginActiveBrokerSessionTransition();
  resolveText?.('{"positions":[]}');

  await assert.rejects(pendingBody, StaleBrokerSessionError);
  api.dispose();
});

test('delayed error-body parsing is discarded after credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveBody: ((value: unknown) => void) | undefined;
  let notifyBodyStarted: (() => void) | undefined;
  const bodyStarted = new Promise<void>((resolve) => {
    notifyBodyStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: false,
    status: 422,
    json: () => {
      notifyBodyStarted?.();
      return new Promise((resolve) => {
        resolveBody = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const pending = api.getJsonResponse<{ error: string }>('/positions');
  await bodyStarted;
  rotateCredentials();
  resolveBody?.({ error: 'INVALID_REQUEST' });

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('cache commit helper rejects a parsed response after credential rotation', async () => {
  const capture = activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{"value":7}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof globalThis.fetch;

  const result = await api.getJsonResponse<{ value: number }>('/instruments');
  rotateCredentials();

  assert.throws(
    () => api.commitJsonResponse(
      result,
      capture.session.cacheNamespace,
      (data) => data.value,
    ),
    StaleBrokerSessionError,
  );
  api.dispose();
});
