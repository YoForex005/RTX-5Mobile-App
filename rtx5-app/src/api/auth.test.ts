import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

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
