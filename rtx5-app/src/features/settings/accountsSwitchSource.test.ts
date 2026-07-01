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

test('accounts screen uses broker branding and opens long-press delete for other accounts', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const userPreferencesSource = readSource('src/state/userPreferences/store.ts');
  const brokerSessionSource = readSource('src/state/brokerSessionStorage.ts');

  assert.doesNotMatch(source, /AppLogo/);
  assert.match(source, /import \{ ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, View \} from 'react-native'/);
  // Other-accounts list is virtualized: render the on-screen rows, lazy-render the rest on scroll.
  assert.match(source, /<FlatList[\s\S]*data=\{otherRows\}[\s\S]*initialNumToRender=/);
  assert.match(source, /import \{ BROKER_CONFIG_KEY, useBrokerConfig, useBrokerServers \} from '\.\.\/\.\.\/query\/broker'/);
  assert.match(source, /const buildBrokerLogoIndex = \(brokerServers\?: readonly BrokerServer\[\]\): BrokerLogoIndex => \{/);
  assert.match(source, /byBrokerName: Map<string, string>/);
  assert.match(source, /byServerName: Map<string, string>/);
  assert.match(source, /addBrokerLogoLookup\(byBrokerName, broker\.broker_name, logoUrl\)/);
  assert.match(source, /addBrokerLogoLookup\(byServerName, broker\.server, logoUrl\)/);
  assert.match(source, /const findBrokerLogoLookup = \(/);
  assert.match(source, /const \{ data: brokerServers \} = useBrokerServers\(isScreenFocused\)/);
  assert.match(source, /const brokerLogoIndex = useMemo\(\(\) => buildBrokerLogoIndex\(brokerServers\), \[brokerServers\]\)/);
  assert.match(source, /const activeBrokerLogoUrl = resolveAccountBrokerLogoUrl\([\s\S]*brokerLogoIndex,[\s\S]*brokerId,[\s\S]*serverUrl: brokerServerUrl,[\s\S]*brokerName: brokerConfig\?\.broker_name,[\s\S]*serverName: brokerConfig\?\.server_name,[\s\S]*brokerLogoUrl,[\s\S]*brokerConfig\?\.logo_url,[\s\S]*\)/);
  assert.match(source, /const savedLogoUrl = sa\.brokerId === activeBrokerId[\s\S]*brokerId: sa\.brokerId,[\s\S]*serverUrl: sa\.serverUrl,[\s\S]*brokerName: sa\.server,[\s\S]*serverName: sa\.server,[\s\S]*sa\.logoUrl,[\s\S]*activeBrokerLogoUrl/);
  assert.match(source, /const nextLogoUrl = activeBrokerLogoUrl \|\| existing\?\.logoUrl \|\| ''/);
  assert.match(savedAccountsSource, /logoUrl: account\.logoUrl \|\| existing\?\.logoUrl/);
  assert.match(userPreferencesSource, /brokerLogoUrl: logoUrl \|\| \(sameBroker \? state\.brokerLogoUrl : ''\) \|\| ''/);
  assert.match(brokerSessionSource, /const shouldKeepStoredLogo =[\s\S]*ACTIVE_BROKER_LOGO_URL_KEY/);
  assert.match(source, /function BrokerLogoAvatar\(/);
  assert.match(source, /source=\{\{ uri: logoUri \}\}/);

  const activeCardStart = source.indexOf('{/* Top: Avatar + Name + Connected badge */}');
  const activeCardEnd = source.indexOf('{/* Balance', activeCardStart);
  const activeCard = source.slice(activeCardStart, activeCardEnd);
  assert.match(activeCard, /<BrokerLogoAvatar[\s\S]*logoUri=\{activeBrokerLogoUrl\}/);

  const otherRowStart = source.indexOf('renderItem={({ item: row }) => {');
  const otherRowEnd = source.indexOf('{isExpanded && (', otherRowStart);
  const otherRow = source.slice(otherRowStart, otherRowEnd);
  assert.match(otherRow, /<BrokerLogoAvatar[\s\S]*logoUri=\{row\.logoUrl\}/);
  assert.match(otherRow, /row\.accountType === 'contest' &&/);
  assert.match(otherRow, /\{!!ribbonLabel && \(/);
  assert.doesNotMatch(otherRow, /: 'Real'/);
  assert.match(otherRow, /onLongPress=\{\(\) => openOtherAccountOptions\(row\)\}/);
  assert.doesNotMatch(otherRow, /secondaryDeleteButton/);

  const optionsStart = source.indexOf('const openOtherAccountOptions = (row: OtherAccountRow) => {');
  const optionsEnd = source.indexOf('const openQRSheet = (loginId: string) => {', optionsStart);
  const optionsBody = source.slice(optionsStart, optionsEnd);
  assert.match(optionsBody, /showAccountsActionSheet\(\{/);
  assert.match(optionsBody, /title,/);
  assert.match(optionsBody, /\{ label: t\('Delete account'\), danger: true, onPress: \(\) => handleRemoveSavedAccount\(row\) \}/);

  assert.match(source, /const handleRemoveSavedAccount = \(row: OtherAccountRow\) => \{\s*setDeleteTarget\(\{ type: 'saved', row \}\);/);
  assert.match(source, /deleteTarget && \(/);
  assert.match(source, /styles\.deleteHeaderRow/);
  assert.match(source, /styles\.deleteHeaderLeft/);
  assert.match(source, /styles\.deleteCloseButton/);
  assert.match(source, /styles\.deleteAccountCard/);
  assert.doesNotMatch(source, /styles\.deleteDeviceNote/);
  assert.doesNotMatch(source, /Only this device is changed/);
});

test('accounts screen backfill normalizes optional metadata before saved-account upsert', () => {
  const source = readSource('src/features/settings/AccountsScreen.tsx');
  const effectStart = source.indexOf('React.useEffect(() => {');
  const effectEnd = source.indexOf('// ── Live WebSocket account metrics', effectStart);
  assert.notEqual(effectStart, -1);
  assert.notEqual(effectEnd, -1);
  const effectBody = source.slice(effectStart, effectEnd);

  assert.match(effectBody, /const nextServerUrl = brokerServerUrl \|\| existing\?\.serverUrl \|\| ''/);
  assert.match(effectBody, /const nextLogoUrl = activeBrokerLogoUrl \|\| existing\?\.logoUrl \|\| ''/);
  assert.match(effectBody, /\(existing\.serverUrl \?\? ''\) === nextServerUrl/);
  assert.match(effectBody, /\(existing\.logoUrl \?\? ''\) === nextLogoUrl/);
  assert.match(effectBody, /serverUrl: nextServerUrl \|\| undefined/);
  assert.doesNotMatch(effectBody, /existing\.serverUrl === brokerServerUrl/);
  assert.doesNotMatch(effectBody, /existing\.logoUrl === nextLogoUrl/);
});

test('auth login errors preserve HTTP status for account switch decisions', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /const extractBackendErrorMessage = \(payload: any, fallback: string\): string => \{/);
  assert.match(source, /const error = new Error\(extractBackendErrorMessage\(errorBody, 'Login failed'\)\) as Error & \{/);
  assert.match(source, /statusCode\?: number/);
  assert.match(source, /error\.statusCode = response\.status/);
  assert.match(source, /throw error/);
});
