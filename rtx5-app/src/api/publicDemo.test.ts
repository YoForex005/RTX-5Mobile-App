import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import type { CreateOrrnnDemoAccountRequest } from './publicDemo';

const TEST_PUBLIC_DEMO_API_BASE_URL = 'https://demo-api.example.com/api/v1';
let configuredPublicDemoModule: Promise<typeof import('./publicDemo')> | null = null;

const loadConfiguredPublicDemo = () => {
  process.env.EXPO_PUBLIC_DEMO_API_BASE_URL = TEST_PUBLIC_DEMO_API_BASE_URL;
  configuredPublicDemoModule ??= import('./publicDemo');
  return configuredPublicDemoModule;
};

const demoRequest: CreateOrrnnDemoAccountRequest = {
  group: 'orrnn/demo-std',
  email: 'trader@example.com',
  master_pass: 'Strong-Pass-123',
  investor_pass: 'Read-Only-Pass',
  first_name: 'Jane',
  last_name: 'Doe',
  country: 'US',
  currency: 'USD',
  leverage: 100,
};

function mockFetch(t: { after: (fn: () => void) => void }, implementation: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('createOrrnnDemoAccount posts compact body to /api/v1/public/demo-account', async (t) => {
  const { createOrrnnDemoAccount, PUBLIC_DEMO_API_BASE_URL } = await loadConfiguredPublicDemo();
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};

  mockFetch(t, (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));

    return new Response(
      JSON.stringify({
        login: 900000001,
        broker_id: 'orrnn',
        group: 'orrnn/demo-std',
        currency: 'USD',
        leverage: 100,
        balance: 10000,
        api_key: 'rtx5_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        created_at: 0,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch);

  const response = await createOrrnnDemoAccount({
    ...demoRequest,
    phone: '+1-555-0100',
    initial_balance: 10000,
    origin_broker: 'fxtrust',
  });

  assert.match(capturedUrl, /\/api\/v1\/public\/demo-account$/);
  assert.equal(capturedUrl, `${PUBLIC_DEMO_API_BASE_URL}/public/demo-account`);
  assert.equal(capturedBody.group, 'orrnn/demo-std');
  assert.equal(capturedBody.email, 'trader@example.com');
  assert.equal(capturedBody.last_name, 'Doe');
  assert.equal(capturedBody.phone, '+1-555-0100');
  assert.equal(capturedBody.country, 'US');
  assert.equal(capturedBody.currency, 'USD');
  assert.equal(capturedBody.leverage, 100);
  assert.equal(capturedBody.initial_balance, 10000);
  assert.equal(capturedBody.origin_broker, 'fxtrust');
  assert.equal(capturedBody.comment, undefined);
  assert.equal(response.login, 900000001);
  assert.equal(response.api_key, 'rtx5_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
});

test('demo broker identities are explicit environment contracts with no synthesized defaults', () => {
  const source = readSource('src/api/publicDemo.ts');
  const registerSource = readSource('app/register.tsx');

  assert.match(source, /export const ORRNN_DEMO_BROKER_ID = process\.env\.EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID \|\| ''/);
  assert.match(source, /export const ORRNN_DEMO_ORIGIN_BROKER =[\s\S]*process\.env\.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER[\s\S]*process\.env\.EXPO_PUBLIC_ORIGIN_BROKER[\s\S]*'';/);
  assert.match(source, /export const TEST_ORRNN_DEMO_ORIGIN_BROKER =[\s\S]*process\.env\.EXPO_PUBLIC_TEST_BROKER_ID[\s\S]*'';/);
  assert.doesNotMatch(source, /ORRNN_DEMO_BROKER_ID[\s\S]{0,120}\|\|\s*['"]orrnn['"]/);
  assert.doesNotMatch(source, /ORRNN_DEMO_ORIGIN_BROKER[\s\S]{0,220}\|\|\s*['"]orrnn['"]/);
  assert.doesNotMatch(source, /TEST_ORRNN_DEMO_ORIGIN_BROKER[\s\S]{0,160}\|\|\s*['"]testorrnn['"]/);
  assert.match(registerSource, /const DEMO_ORIGIN_BROKER_OPTIONS: readonly DemoOriginBrokerOption\[] = \[/);
  assert.match(registerSource, /const DEFAULT_DEMO_ORIGIN_BROKER = DEMO_ORIGIN_BROKER_OPTIONS\[0\]/);
  assert.match(registerSource, /const \[selectedOriginBrokerValue, setSelectedOriginBrokerValue\]/);
  assert.match(registerSource, /origin_broker: trimmedOriginBroker \|\| undefined/);
  assert.match(registerSource, /latencyLabel="register\.originBroker\.open"/);
});

test('resolveOrrnnDemoBrokerAuthRoute accepts only the exact approved rich endpoint set', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', [{
    broker_id: 'orrnn',
    broker_name: 'Orrnn',
    enabled: true,
    active: true,
    license_active: true,
    config_version: 'orrnn-v2',
    schema_version: 'broker-directory.rich.v1',
    services_domain: 'trade.orrnn.example',
    market_api_url: 'https://trade.orrnn.example/api/v2',
    feed_wss_url: 'wss://trade.orrnn.example/ws/feed',
    feed_status_https_url: 'https://trade.orrnn.example/ws/feed/status',
    trade_wss_url: 'wss://trade.orrnn.example/ws/v2',
    server: '69.197.178.27:443',
    server_ip: '69.197.178.27',
    logo_url: ' https://cdn.orrnn.example/logo.png ',
  }]);

  assert.equal(route.serverUrl, 'https://trade.orrnn.example/api/v2');
  assert.equal(route.logoUrl, 'https://cdn.orrnn.example/logo.png');
  assert.equal(route.source, 'broker-directory');
  assert.deepEqual(route.endpoints, {
    brokerId: 'orrnn',
    apiBase: 'https://trade.orrnn.example/api/v2',
    feedWsBase: 'wss://trade.orrnn.example/ws/feed',
    feedStatusUrl: 'https://trade.orrnn.example/ws/feed/status',
    tradeWsBase: 'wss://trade.orrnn.example/ws/v2',
    servicesDomain: 'trade.orrnn.example',
    configVersion: 'orrnn-v2',
  });
});

test('resolveOrrnnDemoBrokerAuthRoute rejects opaque unapproved broker records', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', [{
    broker_id: 'orrnn',
    broker_name: 'Orrnn',
    server: 'Orrnn-Demo',
    server_ip: '69.197.178.27',
  }]);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('resolveOrrnnDemoBrokerAuthRoute requires a broker directory services domain for Orrnn login', async () => {
  const { resolveOrrnnDemoBrokerAuthRoute } = await loadConfiguredPublicDemo();
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', []);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('register fallback login commits the exact approved route through the atomic session coordinator', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /resolveOrrnnDemoBrokerAuthRoute\(canonicalBrokerId, brokerServers\)/);
  assert.match(source, /demoAuthRoute\.source !== 'broker-directory'/);
  assert.match(source, /refetchBrokerServers\(\)/);
  assert.match(source, /const commitAuthorization = authorizeBrokerSessionCommit\(\)/);
  assert.match(source, /const isRegisterAttemptCancelled = \(\) =>/);
  assert.match(source, /if \(isRegisterAttemptCancelled\(\)\) return;/);
  assert.match(
    source,
    /loginAPI\(\{[\s\S]*broker_id: canonicalBrokerId,[\s\S]*\}, \{[\s\S]*serverUrl: demoAuthRoute\.serverUrl,[\s\S]*signal: loginAbortController\.signal,[\s\S]*\}\)/,
  );
  assert.match(
    source,
    /await commitBrokerSession\(\{[\s\S]*brokerId: demoAuthRoute\.endpoints\.brokerId,[\s\S]*apiBase: demoAuthRoute\.endpoints\.apiBase,[\s\S]*feedWsBase: demoAuthRoute\.endpoints\.feedWsBase,[\s\S]*feedStatusUrl: demoAuthRoute\.endpoints\.feedStatusUrl,[\s\S]*servicesDomain: demoAuthRoute\.endpoints\.servicesDomain,[\s\S]*configVersion: demoAuthRoute\.endpoints\.configVersion/,
  );
  assert.match(
    source,
    /credentials: \{[\s\S]*accessToken: sessionToken,[\s\S]*refreshToken: sessionRefreshToken,[\s\S]*expiresAt: sessionExpiresAt/,
  );
  assert.match(source, /\}, commitAuthorization\)/);
  assert.match(source, /isStaleBrokerSessionCommitError\(error\)/);
  assert.match(source, /cancelBrokerSessionCommitAuthorization\(commitAuthorization\)/);
  assert.doesNotMatch(source, /persistSelectedBrokerSession|persistAuthSessionTokens/);
});

test('public demo status and groups use the dedicated public demo API base URL', async (t) => {
  const {
    PUBLIC_DEMO_API_BASE_URL,
    getOrrnnDemoGroups,
    getOrrnnDemoStatus,
  } = await loadConfiguredPublicDemo();
  const capturedUrls: string[] = [];

  mockFetch(t, (async (input) => {
    capturedUrls.push(String(input));
    const body = capturedUrls.length === 1
      ? {
        service: 'orrnn-demo',
        status: 'ok',
        broker: 'active',
        demo_groups_available: 1,
        total_demo_accounts: 28,
        database: 'connected',
      }
      : {
        count: 1,
        groups: [{
          name: 'orrnn/demo-std',
          description: 'Orrnn Standard Demo',
          currency: 'USD',
          leverage: 100,
        }],
      };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch);

  await getOrrnnDemoStatus();
  await getOrrnnDemoGroups();

  assert.deepEqual(capturedUrls, [
    `${PUBLIC_DEMO_API_BASE_URL}/public/demo-status`,
    `${PUBLIC_DEMO_API_BASE_URL}/public/demo-groups`,
  ]);
});

test('public demo setup failures use user-safe temporary unavailable copy', async (t) => {
  const {
    OrrnnDemoApiError,
    getOrrnnDemoGroups,
    getOrrnnDemoStatus,
  } = await loadConfiguredPublicDemo();
  const temporaryUnavailableCopy =
    'Demo account service is temporarily unavailable. Please try again in a moment.';
  let requestCount = 0;

  mockFetch(t, (async () => {
    requestCount += 1;
    return new Response('The origin web server returned an invalid response.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }) as typeof fetch);

  const assertFriendlyGatewayError = (error: unknown) => {
    assert.ok(error instanceof OrrnnDemoApiError);
    assert.equal(error.statusCode, 502);
    assert.equal(error.message, temporaryUnavailableCopy);
    assert.doesNotMatch(error.message, /HTTP 502|origin web server/i);
    return true;
  };

  await assert.rejects(() => getOrrnnDemoStatus(), assertFriendlyGatewayError);
  await assert.rejects(() => getOrrnnDemoGroups(), assertFriendlyGatewayError);
  assert.equal(requestCount, 2);
});

test('createOrrnnDemoAccount omits blank optional strings from compact body', async (t) => {
  const { createOrrnnDemoAccount } = await loadConfiguredPublicDemo();
  let capturedBody: Record<string, unknown> = {};

  mockFetch(t, (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}'));

    return new Response(
      JSON.stringify({
        login: 900000002,
        broker_id: 'orrnn',
        group: 'orrnn/demo-std',
        currency: 'USD',
        leverage: 100,
        balance: 10000,
        created_at: 0,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch);

  await createOrrnnDemoAccount({
    ...demoRequest,
    last_name: '   ',
    phone: '',
    origin_broker: ' ',
    comment: '',
  });

  assert.equal(capturedBody.first_name, 'Jane');
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'last_name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'phone'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'origin_broker'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody, 'comment'), false);
});

test('createOrrnnDemoAccount treats documented 201 ExceptionResult as an error', async (t) => {
  const { createOrrnnDemoAccount, OrrnnDemoApiError } = await loadConfiguredPublicDemo();
  mockFetch(t, (async () => new Response(
    JSON.stringify({
      code: 'MT_RET_ERR_PERMISSIONS',
      message: 'Only demo groups are accepted.',
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    },
  )) as typeof fetch);

  await assert.rejects(
    () => createOrrnnDemoAccount(demoRequest),
    (error) => {
      assert.ok(error instanceof OrrnnDemoApiError);
      assert.equal(error.statusCode, 201);
      assert.match(error.message, /MT_RET_ERR_PERMISSIONS/);
      return true;
    },
  );
});

test('createOrrnnDemoAccount accepts live success responses that omit api_key', async (t) => {
  const { createOrrnnDemoAccount } = await loadConfiguredPublicDemo();
  mockFetch(t, (async () => new Response(
    JSON.stringify({
      login: 200107,
      Name: 'Codex Smoke',
      Group: 'orrnn/demo-std',
      Leverage: 100,
      Currency: 'USD',
      balance: 10000,
      Status: 'active',
      Registration: 1777269350,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )) as typeof fetch);

  const response = await createOrrnnDemoAccount(demoRequest);

  assert.equal(response.login, 200107);
  assert.equal(response.api_key, undefined);
  assert.equal(response.Group, 'orrnn/demo-std');
});
