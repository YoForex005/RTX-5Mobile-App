import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('every authenticated login and account-switch path validates the feed handoff', () => {
  const login = source('app/login.tsx');
  const brokerDetail = source('src/features/settings/BrokerDetailScreen.tsx');
  const accountSwitch = source('src/api/authSession.ts');
  const register = source('app/register.tsx');

  assert.match(
    login,
    /resolveSessionFeedAuth\(\{[\s\S]*response,[\s\S]*brokerId: selectedEndpoints\.brokerId,[\s\S]*accountLogin: normalizedAccountId/,
  );
  assert.match(
    brokerDetail,
    /resolveSessionFeedAuth\(\{[\s\S]*response,[\s\S]*brokerId: selectedEndpoints\.brokerId,[\s\S]*accountLogin: trimmedLogin/,
  );
  assert.match(
    accountSwitch,
    /resolveSessionFeedAuth\(\{[\s\S]*response,[\s\S]*brokerId: String\(canonicalBrokerId\),[\s\S]*accountLogin: username/,
  );
  assert.match(
    register,
    /resolveSessionFeedAuth\(\{[\s\S]*response: feedAuthContractSource,[\s\S]*brokerId: demoAuthRoute\.endpoints\.brokerId,[\s\S]*accountLogin: sessionLogin/,
  );
});

test('refresh replaces the stored token and context without an Achiever old-token fallback', () => {
  const brokerApi = source('src/api/brokerApi.ts');
  const secureBundle = source('src/state/secureCredentialBundle.ts');
  const coordinator = source('src/services/brokerSessionCoordinator.ts');

  assert.match(
    brokerApi,
    /strictAchiever = session\.brokerId === ACHIEVER_BROKER_ID/,
  );
  assert.match(
    brokerApi,
    /normalized\.feedToken[\s\S]*\(!strictAchiever \? credentials\.feedToken : undefined\)/,
  );
  assert.match(
    brokerApi,
    /feedAuthContext: nextFeedAuthContext/,
  );
  assert.match(
    brokerApi,
    /updateActiveBrokerSessionCredentials\([\s\S]*storedCredentials\.feedAuthContext/,
  );
  assert.match(
    secureBundle,
    /feedToken,[\s\S]*feedAuthContext/,
  );
  assert.match(
    coordinator,
    /feedAuthContext: credentials\.feedAuthContext/,
  );
});
