import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OrrnnDemoApiError,
  createOrrnnDemoAccount,
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
