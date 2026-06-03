import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('register demo form scrolls the focused lower fields above the keyboard', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /type RegisterFieldKey =/);
  assert.match(source, /const REGISTER_FIELD_SCROLL_OFFSET_Y = Platform\.OS === 'android' \? 232 : 176/);
  assert.match(source, /const REGISTER_FIELD_FOCUS_DELAY_MS = Platform\.OS === 'android' \? 260 : 80/);
  assert.match(source, /const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform\.OS === 'android' \? 220 : 120/);
  assert.match(source, /const scrollViewRef = React\.useRef<React\.ElementRef<typeof ScrollView> \| null>\(null\)/);
  assert.match(source, /const fieldYPositionsRef = React\.useRef<Partial<Record<RegisterFieldKey, number>>>\(\{\}\)/);
  assert.match(source, /const fieldFocusTimerRef = React\.useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /ref=\{scrollViewRef\}/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING/);
  assert.match(source, /scrollViewRef\.current\?\.scrollTo\(\{\s*y: Math\.max\(0, fieldY - REGISTER_FIELD_SCROLL_OFFSET_Y\),\s*animated: true,\s*\}\)/);
  assert.match(source, /fieldFocusTimerRef\.current = setTimeout\(\(\) => \{\s*scrollFieldAboveKeyboard\(field\);\s*\}, REGISTER_FIELD_FOCUS_DELAY_MS\)/);

  for (const field of [
    'phone',
    'password',
    'investorPassword',
    'initialBalance',
  ]) {
    assert.match(
      source,
      new RegExp(
        `<View style=\\{styles\\.inputRow\\} onLayout=\\{handleFieldLayout\\('${field}'\\)\\}>[\\s\\S]*onFocus=\\{\\(\\) => handleFieldFocus\\('${field}'\\)\\}`,
      ),
    );
  }

  assert.match(
    source,
    /const handleOpenCountryPicker = React\.useCallback\(\(\) => \{[\s\S]*handleFieldFocus\('country'\)/,
  );
  assert.match(
    source,
    /<View style=\{styles\.inputRow\} onLayout=\{handleFieldLayout\('country'\)\}>[\s\S]*<Pressable[\s\S]*onPress=\{handleOpenCountryPicker\}/,
  );

  assert.match(
    source,
    /const handleOpenOriginBrokerPicker = React\.useCallback\(\(\) => \{[\s\S]*handleFieldFocus\('originBroker'\)/,
  );
  assert.match(
    source,
    /<View style=\{styles\.inputRow\} onLayout=\{handleFieldLayout\('originBroker'\)\}>[\s\S]*onPress=\{handleOpenOriginBrokerPicker\}/,
  );
});

test('register demo form keeps last name optional and formats phone with selected dial code', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /type DemoCountryCode = \(typeof DEMO_COUNTRY_OPTIONS\)\[number\]\['code'\]/);
  assert.match(source, /const \[phoneCountryCode, setPhoneCountryCode\] = useState<DemoCountryCode>\(DEFAULT_DEMO_COUNTRY\.code\)/);
  assert.match(source, /const formatDemoPhoneForSubmission = \(dialCode: string, phoneNumber: string\) => \{/);
  assert.match(source, /return trimmedPhone\.startsWith\('\+'\) \? trimmedPhone : `\$\{dialCode\}\$\{trimmedPhone\}`/);
  assert.match(source, /const submissionPhone = formatDemoPhoneForSubmission\(selectedPhoneCountry\.dialCode, trimmedPhone\)/);
  assert.match(source, /phone: submissionPhone/);
  assert.match(source, /last_name: trimmedLastName \|\| undefined/);
  assert.doesNotMatch(source, /!trimmedFirstName \|\| !trimmedLastName \|\| !trimmedEmail/);
  assert.match(source, /if \(!trimmedFirstName \|\| !trimmedEmail \|\| !password \|\| !investorPassword \|\| !trimmedCountry\)/);
  assert.match(source, /visible=\{phoneCountryPickerOpen\}/);
  assert.match(source, /actions=\{phoneCountryPickerActions\}/);
  assert.match(source, /searchPlaceholder=\{t\('Search country codes\.\.\.'\)\}/);
});

test('register demo form uses broker dropdown, read-only currency, and searchable local leverage range', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /import \{ BROKER_CONFIG_KEY, useBrokerServers \} from '\.\.\/src\/query\/broker'/);
  assert.match(source, /useBrokerServers\(isScreenFocused\)/);
  assert.match(source, /const DEMO_LEVERAGE_MIN = 100/);
  assert.match(source, /const DEMO_LEVERAGE_MAX = 20000/);
  assert.match(source, /const DEMO_LEVERAGE_OPTIONS: readonly DemoLeverageOption\[\] = Array\.from/);
  assert.match(source, /DEMO_LEVERAGE_OPTIONS\.map\(\(option\) => \(\{/);
  assert.match(source, /searchPlaceholder=\{t\('Search leverage\.\.\.'\)\}/);

  assert.match(source, /const originBrokerOptions = React\.useMemo<RegisterBrokerOption\[\]>/);
  assert.match(source, /const originBrokerPickerActions = React\.useMemo\(\(\) => \{/);
  assert.match(source, /visible=\{originBrokerPickerOpen\}/);
  assert.match(source, /actions=\{originBrokerPickerActions\}/);
  assert.match(source, /searchable=\{originBrokerOptions\.length > 0\}/);
  assert.match(source, /searchPlaceholder=\{t\('Search brokers\.\.\.'\)\}/);

  assert.match(source, /const selectedCurrency = selectedDemoGroup\?\.currency \|\| 'USD'/);
  assert.match(source, /<Text style=\{styles\.selectValue\} numberOfLines=\{1\}>\{selectedCurrency\}<\/Text>/);
  assert.doesNotMatch(source, /currencyPickerOpen/);
  assert.doesNotMatch(source, /currencyPickerActions/);
  assert.doesNotMatch(source, /handleOpenCurrencyPicker/);
});
