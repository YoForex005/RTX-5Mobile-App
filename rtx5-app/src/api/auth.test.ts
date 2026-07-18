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
