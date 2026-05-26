import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('saved account switch promotes the selected account and refreshes account-scoped state', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(source, /const ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE =\s*'Account does not exist/);
  assert.match(source, /const ACCOUNT_SWITCH_STALE_QUERY_KEYS: ReadonlyArray<readonly unknown\[]> = \[/);
  assert.match(source, /\[ACCOUNTS_LIST_KEY\]/);
  assert.match(source, /\[ACCOUNT_DETAIL_KEY\]/);
  assert.match(source, /\['positions'\]/);
  assert.match(source, /\['accountSummary'\]/);
  assert.match(source, /const normalizeSwitchLogin = \(login: string\) => \{/);
  assert.match(source, /const removeAccountScopedQueries = \(queryClient: QueryClient\) => \{/);
  assert.match(source, /queryClient\.removeQueries\(\{ queryKey \}\)/);
  assert.match(source, /queryClient\.invalidateQueries\(\{ queryKey \}\)/);

  const switchStart = source.indexOf('const handleConnectSavedAccount = async (row: OtherAccountRow) => {');
  const switchEnd = source.indexOf('const handleRemoveSavedAccount = (row: OtherAccountRow) => {', switchStart);
  assert.notEqual(switchStart, -1);
  assert.notEqual(switchEnd, -1);
  const switchBody = source.slice(switchStart, switchEnd);

  assert.match(switchBody, /const password = await getSavedAccountPassword\(row\.brokerId, row\.login\)/);
  assert.match(switchBody, /const result = await signInWithCredentials\(\{/);
  assert.match(switchBody, /normalizeSwitchLogin\(result\.accountLogin\) !== normalizeSwitchLogin\(row\.login\)/);
  assert.match(switchBody, /throw new Error\(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE\)/);
  assert.match(switchBody, /userLogin\(/);
  assert.match(switchBody, /setIsDemoAccountFlag\(result\.accountType === 'demo'\)/);
  assert.match(switchBody, /useLiveAccountState\.getState\(\)\.resetMetrics\(\)/);
  assert.match(switchBody, /usePositionsState\.getState\(\)\.clearPositions\(\)/);
  assert.match(switchBody, /removeAccountScopedQueries\(queryClient\)/);
  assert.match(switchBody, /persistSelectedBrokerSession\(\{/);
  assert.match(switchBody, /persistAuthSessionTokens\(\{/);
  assert.match(switchBody, /bootstrapApp\(\{ accountLogin: result\.accountLogin \}\)/);
  assert.match(switchBody, /setSuccessMessage\(t\('Account switched successfully'\)\)/);
});

test('saved account switch removes stale entries when the broker reports a missing account', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(source, /const isMissingSavedAccountSwitchError = \(error: unknown\) => \{/);
  assert.match(source, /statusCode === 404/);
  assert.match(source, /normalizedMessage\.includes\('account not found'\)/);
  assert.match(source, /normalizedMessage\.includes\('account does not exist'\)/);
  assert.match(source, /normalizedMessage\.includes\('login not found'\)/);
  assert.match(source, /normalizedMessage\.includes\('user not found'\)/);
  assert.doesNotMatch(source, /normalizedMessage\.includes\('not found'\)/);

  const switchStart = source.indexOf('const handleConnectSavedAccount = async (row: OtherAccountRow) => {');
  const switchEnd = source.indexOf('const handleRemoveSavedAccount = (row: OtherAccountRow) => {', switchStart);
  const switchBody = source.slice(switchStart, switchEnd);

  assert.match(switchBody, /if \(isMissingSavedAccountSwitchError\(error\)\) \{/);
  assert.match(switchBody, /removeSavedAccount\(row\.login, row\.brokerId\)/);
  assert.match(switchBody, /removeSavedAccountPassword\(row\.brokerId, row\.login\)\.catch\(\(\) => undefined\)/);
  assert.match(switchBody, /Alert\.alert\(\s*t\('Account does not exist'\),\s*t\(ACCOUNT_SWITCH_ACCOUNT_MISSING_MESSAGE\),\s*\)/);
  assert.match(
    switchBody,
    /if \(!password\) \{[\s\S]*removeSavedAccount\(row\.login, row\.brokerId\);[\s\S]*removeSavedAccountPassword\(row\.brokerId, row\.login\)\.catch\(\(\) => undefined\);/,
  );
});

test('auth login errors preserve HTTP status for account switch decisions', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /const error = new Error\(errorBody\.message \|\| errorBody\.error \|\| 'Login failed'\) as Error & \{/);
  assert.match(source, /statusCode\?: number/);
  assert.match(source, /error\.statusCode = response\.status/);
  assert.match(source, /throw error/);
});
