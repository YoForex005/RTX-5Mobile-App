import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('tracked client environment may carry legacy feed credential for market-data fallback', () => {
  const envSource = readSource('.env');
  const otaCheckSource = readSource('scripts/ota/check-eas-env.js');
  const feedTokenLine = envSource
    .split(/\r?\n/)
    .find((line) => line.startsWith('EXPO_PUBLIC_FEED_BROKER_TOKEN='));

  // Key must exist; value may be empty or a legacy shared market-data token.
  assert.match(feedTokenLine ?? '', /^EXPO_PUBLIC_FEED_BROKER_TOKEN=/);
  assert.doesNotMatch(otaCheckSource, /EXPO_PUBLIC_FEED_BROKER_TOKEN/);
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
  assert.match(source, /secureCredentialBundleStore\.clear\(\)/);
  assert.doesNotMatch(source, /setSecureItemAsync\(ACCESS_TOKEN_KEY/);
  assert.doesNotMatch(source, /setSecureItemAsync\(FEED_BROKER_TOKEN_KEY/);
});
