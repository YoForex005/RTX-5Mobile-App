import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/api/mt5Account.ts'), 'utf8');

test('unauthenticated MT5 account creation remains bound to the selected broker epoch', () => {
  assert.match(source, /brokerApi\.getJsonResponse<CreateMT5AccountResponse>/);
  assert.match(source, /skipAuth: true/);
  assert.match(source, /skipRefresh: true/);
  assert.doesNotMatch(source, /buildActiveApiUrl|timedFetch|response\.json\(/);
});
