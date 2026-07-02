import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearApiLatencySamples,
  getApiLatencySamples,
  recordApiLatency,
  sanitizeApiLatencyEndpoint,
  timedFetch,
} from './apiLatency';

function mockFetch(t: { after: (fn: () => void) => void }, implementation: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearApiLatencySamples();
  });
}

test('sanitizeApiLatencyEndpoint strips host and redacts sensitive query values', () => {
  assert.equal(
    sanitizeApiLatencyEndpoint('https://backend.orrnn.com/api/v2/auth/login?token=%5Bredacted-fixture%5D&symbol=BTCUSD'),
    '/api/v2/auth/login?token=%5Bredacted%5D&symbol=BTCUSD',
  );
  assert.equal(
    sanitizeApiLatencyEndpoint('/orders?password=1234&ticket=42'),
    '/orders?password=%5Bredacted%5D&ticket=42',
  );
});

test('recordApiLatency stores newest samples first and caps the in-memory buffer', () => {
  clearApiLatencySamples();

  for (let index = 0; index < 125; index += 1) {
    recordApiLatency({
      label: `sample.${index}`,
      method: 'GET',
      endpoint: `/sample/${index}`,
      source: 'unknown',
      status: 200,
      ok: true,
      durationMs: index,
    });
  }

  const samples = getApiLatencySamples();
  assert.equal(samples.length, 120);
  assert.equal(samples[0].label, 'sample.124');
  assert.equal(samples[samples.length - 1].label, 'sample.5');
});

test('timedFetch records status, method, endpoint, and source for successful responses', async (t) => {
  clearApiLatencySamples();
  mockFetch(t, (async () => new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch);

  const response = await timedFetch('https://backend.orrnn.com/api/v2/orders', {
    method: 'POST',
  }, {
    label: 'trade.placeMarketOrder.buy',
    method: 'POST',
    endpoint: '/orders',
    source: 'trade',
  });

  assert.equal(response.status, 201);
  const [sample] = getApiLatencySamples();
  assert.equal(sample.label, 'trade.placeMarketOrder.buy');
  assert.equal(sample.method, 'POST');
  assert.equal(sample.endpoint, '/orders');
  assert.equal(sample.source, 'trade');
  assert.equal(sample.status, 201);
  assert.equal(sample.ok, true);
  assert.equal(typeof sample.durationMs, 'number');
});

test('timedFetch records rejected network calls before rethrowing', async (t) => {
  clearApiLatencySamples();
  mockFetch(t, (async () => {
    throw new Error('network down');
  }) as typeof fetch);

  await assert.rejects(
    () => timedFetch('https://backend.orrnn.com/api/v2/auth/register', {
      method: 'POST',
    }, {
      label: 'auth.register',
      method: 'POST',
      endpoint: '/auth/register',
      source: 'register',
    }),
    /network down/,
  );

  const [sample] = getApiLatencySamples();
  assert.equal(sample.label, 'auth.register');
  assert.equal(sample.status, null);
  assert.equal(sample.ok, false);
  assert.equal(sample.error, 'network down');
});

test('timedFetch aborts requests that exceed the frontend timeout', async (t) => {
  clearApiLatencySamples();
  mockFetch(t, (((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch));

  await assert.rejects(
    () => timedFetch('https://backend.orrnn.com/api/v2/account/200082', {
      method: 'GET',
    }, {
      label: 'apiClient.GET',
      method: 'GET',
      endpoint: '/account/200082',
      source: 'apiClient',
      timeoutMs: 10,
    }),
    /Request timed out after 10ms/,
  );

  const [sample] = getApiLatencySamples();
  assert.equal(sample.label, 'apiClient.GET');
  assert.equal(sample.status, null);
  assert.equal(sample.ok, false);
  assert.equal(sample.error, 'Request timed out after 10ms');
});

test('timedFetch rejects on timeout even when native fetch ignores abort', async (t) => {
  clearApiLatencySamples();
  mockFetch(t, (() => new Promise<Response>(() => undefined)) as typeof fetch);

  await assert.rejects(
    () => timedFetch('https://backend.orrnn.com/api/v2/watchlist', undefined, {
      label: 'apiClient.GET',
      method: 'GET',
      endpoint: '/watchlist',
      source: 'apiClient',
      timeoutMs: 10,
    }),
    /Request timed out after 10ms/,
  );

  const [sample] = getApiLatencySamples();
  assert.equal(sample.label, 'apiClient.GET');
  assert.equal(sample.status, null);
  assert.equal(sample.ok, false);
  assert.equal(sample.error, 'Request timed out after 10ms');
});
