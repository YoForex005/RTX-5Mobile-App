import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  OrrnnDemoApiError,
  PUBLIC_DEMO_API_BASE_URL,
  createOrrnnDemoAccount,
  getOrrnnDemoGroups,
  getOrrnnDemoStatus,
  resolveOrrnnDemoBrokerAuthRoute,
  type CreateOrrnnDemoAccountRequest,
} from './publicDemo';

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

test('resolveOrrnnDemoBrokerAuthRoute prefers the Orrnn broker services domain', () => {
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', [{
    broker_id: 'orrnn',
    broker_name: 'Orrnn',
    services_domain: 'https://trade.orrnn.example/api/v2',
    server: '69.197.178.27:443',
    server_ip: '69.197.178.27',
    logo_url: ' https://cdn.orrnn.example/logo.png ',
  }]);

  assert.equal(route.serverUrl, 'https://trade.orrnn.example');
  assert.equal(route.logoUrl, 'https://cdn.orrnn.example/logo.png');
  assert.equal(route.source, 'broker-directory');
});

test('resolveOrrnnDemoBrokerAuthRoute rejects non-URL broker servers', () => {
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', [{
    broker_id: 'orrnn',
    broker_name: 'Orrnn',
    server: 'Orrnn-Demo',
    server_ip: '69.197.178.27',
  }]);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('resolveOrrnnDemoBrokerAuthRoute requires a broker directory services domain for Orrnn login', () => {
  const route = resolveOrrnnDemoBrokerAuthRoute('orrnn', []);

  assert.equal(route.serverUrl, '');
  assert.equal(route.source, 'missing');
});

test('register fallback login uses resolved Orrnn broker route and persists secure session', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /resolveOrrnnDemoBrokerAuthRoute\(canonicalBrokerId, brokerServers\)/);
  assert.match(source, /demoAuthRoute\.source !== 'broker-directory'/);
  assert.match(source, /refetchBrokerServers\(\)/);
  assert.match(
    source,
    /loginAPI\(\{[\s\S]*broker_id: canonicalBrokerId,[\s\S]*\}, \{[\s\S]*serverUrl: demoAuthRoute\.serverUrl,[\s\S]*\}\)/,
  );
  assert.match(
    source,
    /persistSelectedBrokerSession\(\{[\s\S]*brokerId: canonicalBrokerId,[\s\S]*serverUrl: demoAuthRoute\.serverUrl,[\s\S]*logoUrl: demoAuthRoute\.logoUrl,[\s\S]*\}\)/,
  );
  assert.match(
    source,
    /persistAuthSessionTokens\(\{[\s\S]*accessToken: sessionToken,[\s\S]*refreshToken: sessionRefreshToken,[\s\S]*expiresAt: sessionExpiresAt,[\s\S]*\}\)/,
  );
});

test('public demo status and groups use the dedicated public demo API base URL', async (t) => {
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
