import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('tracked generic feed credential is bound to one exact broker identity', () => {
  const envSource = readSource('.env');
  const otaCheckSource = readSource('scripts/ota/check-eas-env.js');
  const feedTokenLine = envSource
    .split(/\r?\n/)
    .find((line) => line.startsWith('EXPO_PUBLIC_FEED_BROKER_TOKEN='));
  const feedBrokerIdLine = envSource
    .split(/\r?\n/)
    .find((line) => line.startsWith('EXPO_PUBLIC_FEED_BROKER_ID='));

  assert.match(feedTokenLine ?? '', /^EXPO_PUBLIC_FEED_BROKER_TOKEN=/);
  const configuredToken = String(feedTokenLine ?? '').split('=', 2)[1]?.trim() ?? '';
  if (configuredToken) {
    assert.match(
      feedBrokerIdLine ?? '',
      /^EXPO_PUBLIC_FEED_BROKER_ID=[a-z0-9][a-z0-9._-]*$/,
    );
  }
  assert.doesNotMatch(otaCheckSource, /EXPO_PUBLIC_FEED_BROKER_TOKEN/);
});

test('Achiever cannot select any static EXPO_PUBLIC feed credential', () => {
  const source = readSource('src/api/feedAuth.ts');

  assert.doesNotMatch(
    source,
    /process\.env\.EXPO_PUBLIC_ACHIEVER(?:_FINANCIALS)?_FEED_TOKEN/,
  );
  assert.match(
    source,
    /normalizedBrokerId === 'achiever-financials'[\s\S]*return ''/,
  );
});

test('secure storage refuses a plaintext AsyncStorage fallback on web', () => {
  const source = readSource('src/utils/secureStorage.ts');

  assert.doesNotMatch(source, /@react-native-async-storage\/async-storage/);
  assert.match(source, /Platform\.OS === 'web'/);
  assert.match(source, /throw new Error\('Secure credential storage is unavailable on web\.'\)/);
});

test('broker auth persistence uses the bound versioned bundle, not individual token writes', () => {
  const source = readSource('src/state/brokerSessionStorage.ts');
  const bundleSource = readSource('src/state/secureCredentialBundle.ts');

  assert.match(source, /secureCredentialBundleStore\.replace\(input\)/);
  assert.match(bundleSource, /const bundle = createBundle\(input\)/);
  assert.match(bundleSource, /const brokerId = normalizeBrokerId\(input\.brokerId\)/);
  assert.match(bundleSource, /const accountLogin = cleanString\(input\.accountLogin\)/);
  assert.match(bundleSource, /feedAuthContext/);
  assert.match(bundleSource, /feedToken,[\s\S]*feedAuthContext/);
  assert.match(source, /secureCredentialBundleStore\.clear\(\)/);
  assert.doesNotMatch(source, /setSecureItemAsync\(ACCESS_TOKEN_KEY/);
  assert.doesNotMatch(source, /setSecureItemAsync\(FEED_BROKER_TOKEN_KEY/);
});
