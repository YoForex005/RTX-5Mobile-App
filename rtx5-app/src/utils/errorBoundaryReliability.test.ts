import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { serializeStartupError } from './errorSerialization';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('root layout is protected by the app error boundary', () => {
  const source = readSource('app/_layout.tsx');

  assert.match(source, /import \{ ErrorBoundary \} from '\.\.\/src\/ui\/components\/ErrorBoundary'/);
  assert.match(source, /<Stack\.Screen name='index' options=\{\{ headerShown: false \}\} \/>/);
  assert.match(source, /<ErrorBoundary>[\s\S]*<InnerLayout \/>[\s\S]*<\/ErrorBoundary>/);
});

test('error boundary reload remounts the crashed subtree through the fast press path', () => {
  const source = readSource('src/ui/components/ErrorBoundary.tsx');

  assert.match(source, /resetKey: number/);
  assert.match(source, /resetKey: 0/);
  assert.match(source, /getDerivedStateFromError\(error: Error\): Partial<State>/);
  assert.match(source, /logStartupError\('error-boundary\.caught'/);
  assert.match(source, /this\.setState\(\(state\) => \(\{[\s\S]*resetKey: state\.resetKey \+ 1/);
  assert.match(source, /<React\.Fragment key=\{this\.state\.resetKey\}>/);
  assert.match(source, /latencyLabel="errorBoundary\.restart"/);
  assert.match(source, /accessibilityRole="button"/);
});

test('persisted auth restore rejects half sessions without an access token', () => {
  const source = readSource('src/state/userPreferences/store.ts');

  assert.match(source, /const accessToken = asString\(credentials\.accessToken\)/);
  assert.match(source, /if \(!accessToken\) \{\s*return null;\s*\}/);
  assert.match(source, /const isLoggedIn = asBoolean\(state\.isLoggedIn, false\) && accountDetails !== null/);
});

test('secure storage reads fail closed during startup restore', () => {
  const source = readSource('src/utils/secureStorage.ts');

  assert.match(source, /try \{[\s\S]*SecureStore\.getItemAsync\(key\)/);
  assert.match(source, /console\.warn\('\[SecureStorage\] Failed to read secure item'/);
  assert.match(source, /return null;/);
});

test('secondary persisted stores normalize valid-but-invalid shapes before hydration', () => {
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const tradeNotificationsSource = readSource('src/state/tradeNotifications.ts');

  assert.match(savedAccountsSource, /normalizeSavedAccountsPersistedState/);
  assert.match(savedAccountsSource, /accounts: Array\.isArray\(accounts\)/);
  assert.match(savedAccountsSource, /filter\(\(account\): account is SavedAccount => account !== null\)/);
  assert.match(savedAccountsSource, /merge: \(persistedState, currentState\) => \(\{/);
  assert.match(savedAccountsSource, /hasHydrated: true/);

  assert.match(tradeNotificationsSource, /normalizeTradeNotificationsPersistedState/);
  assert.match(tradeNotificationsSource, /normalizeEnabledKeys\(asRecord\(state\)\.enabledKeys\)/);
  assert.match(tradeNotificationsSource, /partialize: \(state\) => \(\{ enabledKeys: state\.enabledKeys \}\)/);
  assert.match(tradeNotificationsSource, /merge: \(persistedState, currentState\) => \(\{/);
});

test('startup diagnostics stringify non-error throws without throwing again', () => {
  const source = readSource('src/utils/errorSerialization.ts');

  assert.match(source, /const stringifyFallback = \(value: unknown\): string => \{/);
  assert.match(source, /const serialized = JSON\.stringify\(value\)/);
  assert.match(source, /return '\[Unserializable value\]'/);
  assert.match(source, /message: typeof error === 'string' \? error : safeStringify\(error\)/);

  const circular: { self?: unknown; toString: () => string } = {
    toString: () => {
      throw new Error('toString exploded');
    },
  };
  circular.self = circular;

  assert.deepEqual(serializeStartupError(circular), {
    name: 'NonError',
    message: '[Unserializable value]',
    stack: null,
  });
});
