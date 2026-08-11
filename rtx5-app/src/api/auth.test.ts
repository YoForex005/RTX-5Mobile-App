import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { isLoginRequestAbortedError, loginAPI } from './auth';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('loginAPI requires a broker service domain and does not use shared proxy fallback', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /isBrokerServiceBaseUrl\(options\.serverUrl\)/);
  assert.match(source, /getBrokerBackendDomainUnavailableMessage\(credentials\.broker_id\)/);
  assert.match(source, /const apiBaseUrl = buildBrokerApiBaseUrl\(options\.serverUrl\)/);
  assert.match(source, /body: JSON\.stringify\(credentials\)/);
  assert.doesNotMatch(source, /AUTH_PROXY_API_BASE_URL/);
  assert.doesNotMatch(source, /normalizeBrokerProxyServerAddress\(options\.proxyServer\)/);
  assert.doesNotMatch(source, /server: proxyServer/);
});

test('loginAPI sends numeric demo login to the exact demobackend V2 route', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      account_login: 200107,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await loginAPI(
      { login: 200107, password: 'secret', broker_id: 'orrnn-demo' },
      { serverUrl: 'https://demobackend.orrnn.com' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, 'https://demobackend.orrnn.com/api/v2/auth/login');
  assert.deepEqual(capturedBody, {
    login: 200107,
    password: 'secret',
    broker_id: 'orrnn-demo',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'username'), false);
});

test('both account login screens send numeric login for exact orrnn-demo selection', () => {
  const loginScreen = readSource('app/login.tsx');
  const brokerDetail = readSource('src/features/settings/BrokerDetailScreen.tsx');

  for (const source of [loginScreen, brokerDetail]) {
    assert.match(source, /isOrrnnDemoLogin/);
    assert.match(source, /login: Number\(numericDemoLogin\)/);
    assert.match(source, /broker_id: ORRNN_DEMO_PUBLIC_BROKER_ID/);
    assert.match(source, /username:/);
  }
});

test('loginAPI surfaces caller cancellation separately from its timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const rejectAbort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (init?.signal?.aborted) {
        rejectAbort();
        return;
      }
      init?.signal?.addEventListener('abort', rejectAbort, { once: true });
    })) as typeof fetch;

  try {
    const controller = new AbortController();
    const request = loginAPI(
      { username: '1001', password: 'secret', broker_id: 'broker-a' },
      { serverUrl: 'https://services.broker-a.example/api/v2', signal: controller.signal },
    );
    controller.abort();

    await assert.rejects(request, isLoginRequestAbortedError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
