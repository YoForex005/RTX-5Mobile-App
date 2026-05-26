import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('login submit uses the shared stable fast press path', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /import \{ FastPressable as Pressable \} from '\.\.\/src\/ui\/components\/FastPressable'/);
  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/src\/utils\/actionLatency'/);
  assert.match(source, /Keyboard/);
  assert.doesNotMatch(source, /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from 'react-native'/);
  assert.match(source, /keyboardShouldPersistTaps="always"/);
  assert.match(source, /canCancelContentTouches=\{false\}/);
  assert.match(source, /const handleLoginPress = \(\) => \{/);
  assert.match(source, /if \(loginRequestInFlightRef\.current \|\| loginSubmitPressGuardRef\.current\) \{/);
  assert.match(source, /loginSubmitPressGuardRef\.current = true/);
  assert.match(source, /releaseLoginSubmitPressGuard\(\)/);
  assert.match(source, /runImmediateAction\('login\.submit\.touch'/);
  assert.match(source, /const scheduleLoginKeyboardDismiss = \(\) => \{/);
  assert.match(source, /const dismissKeyboard = \(\) => Keyboard\.dismiss\(\)/);
  assert.match(source, /globalThis\.requestAnimationFrame\(dismissKeyboard\)/);
  assert.match(source, /runImmediateAction\('login\.submit\.touch'[\s\S]*setIsLoading\(true\);[\s\S]*scheduleLoginSubmitAfterInputCommit\(\(\) => \{[\s\S]*void handleLogin\(snapshot\);[\s\S]*\}\);[\s\S]*scheduleLoginKeyboardDismiss\(\)/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.doesNotMatch(source, /setIsLoading\(true\);\s*Keyboard\.dismiss\(\);/);
  assert.match(source, /scheduleLoginSubmitAfterInputCommit\(\(\) => \{/);
  assert.match(source, /const snapshot = getLoginCredentialsSnapshot\(\)/);
  assert.match(source, /void handleLogin\(snapshot\)/);
  assert.match(source, /onPress=\{handleLoginPress\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /disabled=\{isLoading\}/);
  assert.match(source, /hitSlop=\{LOGIN_BUTTON_HIT_SLOP\}/);
  assert.match(source, /pressRetentionOffset=\{LOGIN_BUTTON_PRESS_RETENTION_OFFSET\}/);
  assert.match(source, /latencyLabel="login\.submit"/);
  assert.match(source, /unstable_pressDelay=\{0\}/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityState=\{\{ disabled: isLoading, busy: isLoading \}\}/);
  assert.match(source, /testID="login-submit-button"/);
  assert.match(source, /minHeight: 56/);
  assert.doesNotMatch(source, /loginBtnPressed: \{[\s\S]*transform:/);
});

test('login screen exposes register account navigation to the demo registration screen', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const handleRegisterAccountPress = \(\) => \{/);
  assert.match(source, /runImmediateAction\('login\.register\.open'/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.match(source, /router\.push\('\/register'\)/);
  assert.match(source, /onPress=\{handleRegisterAccountPress\}/);
  assert.match(source, /accessibilityLabel=\{t\('Register account'\)\}/);
  assert.match(source, /testID="login-register-account-button"/);
});

test('login broker id can be selected from the broker directory dropdown', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /import \{ ActionSheet \} from '\.\.\/src\/ui\/components\/ActionSheet'/);
  assert.match(source, /import \{ BROKER_CONFIG_KEY, useBrokerServers \} from '\.\.\/src\/query\/broker'/);
  assert.match(source, /const \[brokerPickerOpen, setBrokerPickerOpen\] = useState\(false\)/);
  assert.match(source, /useBrokerServers\(true\)/);
  assert.match(source, /const brokerOptions = useMemo<LoginBrokerOption\[\]>\(\(\) => \{/);
  assert.match(source, /const selectedBrokerOption = useMemo\(\(\) => \{/);
  assert.match(source, /const brokerPickerActions = useMemo\(\(\) => \{/);
  assert.match(source, /const selectBrokerOption = useCallback\(\(option: LoginBrokerOption\) => \{/);
  assert.match(source, /setBrokerConnection\(option\.brokerId, option\.serverUrl, option\.logoUrl\)/);
  assert.match(source, /persistSelectedBrokerSession\(\{/);
  assert.match(source, /onPress: \(\) => selectBrokerOption\(option\)/);
  assert.match(source, /serverUrl: normalizeBrokerServerUrl/);
  assert.match(source, /const handleBrokerPickerPress = \(\) => \{/);
  assert.match(source, /runImmediateAction\('login\.brokerPicker\.open'/);
  assert.match(source, /Keyboard\.dismiss\(\)/);
  assert.match(source, /testID="login-broker-picker-button"/);
  assert.match(source, /searchPlaceholder="Search brokers\.\.\."/);
  assert.match(
    source,
    /<ActionSheet[\s\S]*visible=\{brokerPickerOpen\}[\s\S]*actions=\{brokerPickerActions\}[\s\S]*searchable=\{brokerOptions\.length > 0\}[\s\S]*detent="large"[\s\S]*runActionAfterClose=\{false\}/,
  );
});

test('login validation snapshots the latest committed native field values', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /type LoginCredentialsSnapshot = \{/);
  assert.match(source, /type NativeSyntheticEvent/);
  assert.match(source, /type TextInputEndEditingEventData/);
  assert.match(source, /const scheduleLoginSubmitAfterInputCommit = \(task: \(\) => void\) => \{/);
  assert.match(source, /globalThis\.requestAnimationFrame\(task\)/);
  assert.doesNotMatch(source, /globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(task, 0\);/);
  assert.match(source, /scheduleLoginSubmitAfterInputCommit\(\(\) => \{[\s\S]*const snapshot = getLoginCredentialsSnapshot\(\);[\s\S]*void handleLogin\(snapshot\);[\s\S]*\}\)/);
  assert.match(source, /const brokerIdValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const brokerServerUrlValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const brokerLogoUrlValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const accountIdValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const passwordValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const updateBrokerId = \(value: string\) => \{[\s\S]*brokerIdValueRef\.current = value;[\s\S]*setBrokerId\(value\);[\s\S]*\}/);
  assert.match(source, /const updateAccountId = \(value: string\) => \{[\s\S]*accountIdValueRef\.current = value;[\s\S]*setAccountId\(value\);[\s\S]*\}/);
  assert.match(source, /const updatePassword = \(value: string\) => \{[\s\S]*passwordValueRef\.current = value;[\s\S]*setPassword\(value\);[\s\S]*\}/);
  assert.match(source, /const getLoginCredentialsSnapshot = \(\): LoginCredentialsSnapshot => \(\{/);
  assert.match(source, /brokerId: \(brokerIdValueRef\.current \?\? brokerId\)\.trim\(\)/);
  assert.match(source, /serverUrl: normalizeBrokerServerUrl\(/);
  assert.match(source, /logoUrl: brokerLogoUrlValueRef\.current \?\? selectedBrokerLogoUrl/);
  assert.match(source, /accountId: \(accountIdValueRef\.current \?\? accountId\)\.trim\(\)/);
  assert.match(source, /password: passwordValueRef\.current \?\? password/);
  assert.match(source, /const handleLogin = async \(snapshot: LoginCredentialsSnapshot = getLoginCredentialsSnapshot\(\)\) => \{/);
  assert.match(source, /const normalizedBrokerId = snapshot\.brokerId/);
  assert.match(source, /const normalizedServerUrl = snapshot\.serverUrl/);
  assert.match(source, /if \(!normalizedBrokerId\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /if \(!normalizedServerUrl\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /if \(!normalizedAccountId \|\| !currentPassword\) \{\s*setIsLoading\(false\);/);
  assert.match(source, /onChangeText=\{updateBrokerId\}/);
  assert.match(source, /onEndEditing=\{updateBrokerIdFromEndEditing\}/);
  assert.match(source, /onChangeText=\{updateAccountId\}/);
  assert.match(source, /onEndEditing=\{updateAccountIdFromEndEditing\}/);
  assert.match(source, /onChangeText=\{updatePassword\}/);
  assert.match(source, /onEndEditing=\{updatePasswordFromEndEditing\}/);
});

test('login submit has a synchronous duplicate request guard', () => {
  const source = readSource('app/login.tsx');

  assert.match(source, /const loginRequestInFlightRef = useRef\(false\)/);
  assert.match(source, /const loginSubmitPressGuardRef = useRef\(false\)/);
  assert.match(source, /const LOGIN_SUBMIT_PRESS_GUARD_MS = 350/);
  assert.match(source, /loginSubmitPressGuardTimerRef\.current = setTimeout\(\(\) => \{/);
  assert.match(source, /loginSubmitPressGuardRef\.current = false/);
  assert.match(source, /if \(loginRequestInFlightRef\.current\) \{\s*return;\s*\}/);
  assert.match(source, /loginRequestInFlightRef\.current = true/);
  assert.match(source, /finally \{\s*loginRequestInFlightRef\.current = false;/);
});

test('login success path does not wait on optional broker config or a fixed success delay', () => {
  const source = readSource('app/login.tsx');
  const loginRequestIndex = source.indexOf('const response: any = await loginAPI');
  const routerReplaceIndex = source.indexOf("router.replace('/(tabs)/quotes');", loginRequestIndex);
  const postLoginWorkIndex = source.indexOf('schedulePostLoginWork(() => {', routerReplaceIndex);
  const selectedBrokerPersistIndex = source.indexOf('persistSelectedBrokerSession({', postLoginWorkIndex);
  const authTokenPersistIndex = source.indexOf('persistAuthSessionTokens({', postLoginWorkIndex);
  const brokerConfigRefreshIndex = source.indexOf('void getBrokerConfig(canonicalBrokerId)', postLoginWorkIndex);

  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(routerReplaceIndex, -1);
  assert.notEqual(postLoginWorkIndex, -1);
  assert.notEqual(selectedBrokerPersistIndex, -1);
  assert.notEqual(authTokenPersistIndex, -1);
  assert.notEqual(brokerConfigRefreshIndex, -1);
  const loginCriticalPath = source.slice(loginRequestIndex, routerReplaceIndex);
  assert.doesNotMatch(
    loginCriticalPath,
    /checkBrokerServerHealth/,
    'login should not run a serial health probe after the user presses submit',
  );
  assert.doesNotMatch(
    loginCriticalPath,
    /persist(?:SelectedBrokerSession|AuthSessionTokens)/,
    'login should not wait for secure-storage writes before navigation',
  );
  assert.ok(
    brokerConfigRefreshIndex > loginRequestIndex,
    'broker config refresh should run after auth has already completed',
  );
  assert.ok(
    routerReplaceIndex > loginRequestIndex,
    'login should navigate after auth has completed',
  );
  assert.ok(
    postLoginWorkIndex > routerReplaceIndex,
    'non-critical login bookkeeping should be scheduled after navigation starts',
  );
  assert.ok(
    selectedBrokerPersistIndex > postLoginWorkIndex && authTokenPersistIndex > postLoginWorkIndex,
    'secure broker persistence should stay in the post-navigation work queue',
  );
  assert.ok(
    brokerConfigRefreshIndex > postLoginWorkIndex,
    'broker config refresh should stay in the post-navigation work queue',
  );
  assert.doesNotMatch(source, /await getBrokerConfig/);
  assert.doesNotMatch(source, /brokerConfig\s*=\s*await getBrokerConfig/);
  assert.doesNotMatch(source, /Login successful/);
  assert.doesNotMatch(
    source,
    /setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\)[\s\S]*\},\s*1200\s*\)/,
  );
  assert.match(source, /const schedulePostLoginWork = \(task: \(\) => void\) => \{[\s\S]*requestAnimationFrame/);
  assert.match(source, /router\.replace\('\/\(tabs\)\/quotes'\);\s*schedulePostLoginWork\(\(\) => \{/);
  assert.match(source, /queryClient\.setQueryData\(\[BROKER_CONFIG_KEY, canonicalBrokerId\], brokerConfig\)/);
});

test('broker detail login does not wait on health probes or secure storage before navigation', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const submitIndex = source.indexOf('const submitLogin = async () => {');
  const loginRequestIndex = source.indexOf('const response: any = await loginAPI', submitIndex);
  const routerReplaceIndex = source.indexOf("router.replace('/(tabs)/quotes');", loginRequestIndex);
  const postLoginWorkIndex = source.indexOf('scheduleBrokerDetailPostLoginWork(() => {', routerReplaceIndex);
  const selectedBrokerPersistIndex = source.indexOf('persistSelectedBrokerSession({', postLoginWorkIndex);
  const authTokenPersistIndex = source.indexOf('persistAuthSessionTokens({', postLoginWorkIndex);

  assert.notEqual(submitIndex, -1);
  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(routerReplaceIndex, -1);
  assert.notEqual(postLoginWorkIndex, -1);
  assert.notEqual(selectedBrokerPersistIndex, -1);
  assert.notEqual(authTokenPersistIndex, -1);
  assert.match(source, /const scheduleBrokerDetailKeyboardDismiss = \(\) => \{/);
  assert.match(source, /scheduleBrokerDetailKeyboardDismiss\(\);/);
  assert.doesNotMatch(source, /checkBrokerServerHealth/);
  const brokerDetailCriticalPath = source.slice(submitIndex, routerReplaceIndex);
  assert.doesNotMatch(
    brokerDetailCriticalPath,
    /persist(?:SelectedBrokerSession|AuthSessionTokens)/,
    'broker detail login should not wait for secure-storage writes before navigation',
  );
  assert.doesNotMatch(
    brokerDetailCriticalPath,
    /await Promise\.all/,
    'broker detail login should not await optional post-login bookkeeping before navigation',
  );
  assert.ok(
    postLoginWorkIndex > routerReplaceIndex,
    'broker detail post-login bookkeeping should be scheduled after navigation starts',
  );
  assert.ok(
    selectedBrokerPersistIndex > postLoginWorkIndex && authTokenPersistIndex > postLoginWorkIndex,
    'broker detail secure broker persistence should stay in the post-navigation work queue',
  );
  assert.match(source, /router\.replace\('\/\(tabs\)\/quotes'\);\s*scheduleBrokerDetailPostLoginWork\(\(\) => \{/);
});

test('login auth request has a bounded frontend timeout', () => {
  const source = readSource('src/api/auth.ts');

  assert.match(source, /const AUTH_LOGIN_TIMEOUT_MS = 8000/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /Login request timed out\. Please check your connection and try again\./);
  assert.match(source, /clearTimeout\(timeout\)/);
});

test('saved account credentials use native-safe SecureStore keys', () => {
  const source = readSource('src/state/savedAccounts.ts');

  assert.match(source, /const encodeCredentialKeyPart = \(value: string\) =>/);
  assert.match(source, /codePointAt\(0\)\?\.toString\(16\)\.padStart\(4, '0'\)/);
  assert.match(source, /export const makeSavedAccountCredentialKey = \(brokerId: string, login: string\) =>/);
  assert.match(source, /`rtx5_saved_account_pass\.\$\{encodeCredentialKeyPart\(brokerId\)\}\.\$\{encodeCredentialKeyPart\(login\)\}`/);
  assert.match(source, /setSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\), password\)/);
  assert.match(source, /getSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\)\)/);
  assert.match(source, /removeSecureItemAsync\(makeSavedAccountCredentialKey\(brokerId, login\)\)/);
  assert.doesNotMatch(source, /rtx5_saved_account_pass:/);
});
