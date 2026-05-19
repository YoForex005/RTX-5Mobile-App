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
  assert.match(source, /Keyboard\.dismiss\(\)/);
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
  assert.match(source, /const accountIdValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const passwordValueRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const updateBrokerId = \(value: string\) => \{[\s\S]*brokerIdValueRef\.current = value;[\s\S]*setBrokerId\(value\);[\s\S]*\}/);
  assert.match(source, /const updateAccountId = \(value: string\) => \{[\s\S]*accountIdValueRef\.current = value;[\s\S]*setAccountId\(value\);[\s\S]*\}/);
  assert.match(source, /const updatePassword = \(value: string\) => \{[\s\S]*passwordValueRef\.current = value;[\s\S]*setPassword\(value\);[\s\S]*\}/);
  assert.match(source, /const getLoginCredentialsSnapshot = \(\): LoginCredentialsSnapshot => \(\{/);
  assert.match(source, /brokerId: \(brokerIdValueRef\.current \?\? brokerId\)\.trim\(\)/);
  assert.match(source, /accountId: \(accountIdValueRef\.current \?\? accountId\)\.trim\(\)/);
  assert.match(source, /password: passwordValueRef\.current \?\? password/);
  assert.match(source, /const handleLogin = async \(snapshot: LoginCredentialsSnapshot = getLoginCredentialsSnapshot\(\)\) => \{/);
  assert.match(source, /const normalizedBrokerId = snapshot\.brokerId/);
  assert.match(source, /if \(!normalizedBrokerId\) \{/);
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
  const brokerConfigRefreshIndex = source.indexOf('void getBrokerConfig(canonicalBrokerId)', postLoginWorkIndex);

  assert.notEqual(loginRequestIndex, -1);
  assert.notEqual(routerReplaceIndex, -1);
  assert.notEqual(postLoginWorkIndex, -1);
  assert.notEqual(brokerConfigRefreshIndex, -1);
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
