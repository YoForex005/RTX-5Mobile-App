import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('loginAPI supports gateway proxy login for broker server entries', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /AUTH_PROXY_API_BASE_URL/);
  assert.match(source, /normalizeBrokerProxyServerAddress\(options\.proxyServer\)/);
  assert.match(
    source,
    /const apiBaseUrl = proxyServer && !options\.serverUrl[\s\S]*AUTH_PROXY_API_BASE_URL[\s\S]*buildBrokerApiBaseUrl\(options\.serverUrl\)/,
  );
  assert.match(
    source,
    /const requestBody: LoginRequest & \{ server\?: string \} = proxyServer[\s\S]*\{ \.\.\.credentials, server: proxyServer \}[\s\S]*credentials/,
  );
  assert.match(source, /body: JSON\.stringify\(requestBody\)/);
});
