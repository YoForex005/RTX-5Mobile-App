import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSettingsScreenSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/settings/SettingsScreen/SettingsScreen.tsx'), 'utf8');

test('settings search results reuse the same routes as settings rows', () => {
  const source = readSettingsScreenSource();

  assert.match(source, /type SearchableSettingsItem = \{/);
  assert.match(source, /routePath\?: SettingsReadyRoute/);
  assert.match(source, /action\?: 'support-email'/);
  assert.match(source, /const supportEmail = getConfiguredSupportEmail\(\)/);
  assert.match(source, /const handleEmailSupport = useCallback\(async \(\) => \{/);
  assert.match(source, /buildHelpMailto\(\{/);
  assert.match(source, /Linking\.openURL\(mailtoUrl\)/);
  assert.match(source, /\{ title: 'Accounts'[\s\S]*routePath: '\/settings\/accounts' \}/);
  assert.match(source, /\{ title: 'New Account'[\s\S]*routePath: '\/register-entry' \}/);
  assert.match(source, /\{ title: 'Economic Calender'[\s\S]*routePath: '\/settings\/economic-calendar' \}/);
  assert.match(source, /\{ title: 'Theme', sub: themeMode === 'light' \? 'Light Mode' : 'Dark Mode', icon: 'color-palette-outline' \}/);
  assert.match(source, /\{ title: 'Language Preference'[\s\S]*routePath: '\/settings\/interface' \}/);
  assert.match(source, /\{ title: 'Journal'[\s\S]*routePath: '\/settings\/journal' \}/);
  assert.match(source, /\{ title: 'Support', sub: supportEmail[\s\S]*action: 'support-email' \}/);
  assert.match(source, /\{ title: 'Help', sub: 'FAQ'[\s\S]*routePath: '\/settings\/help' \}/);
  assert.match(source, /const handleSearchResultPress = useCallback\(\(item: SearchableSettingsItem\) => \{/);
  assert.match(source, /item\.action === 'support-email'[\s\S]*void handleEmailSupport\(\)/);
  assert.match(source, /openReadySettingsRoute\(item\.routePath\)/);
  assert.match(source, /const isThemeItem = item\.title === 'Theme'/);
  assert.match(source, /rightElement=\{[\s\S]*isThemeItem \? \([\s\S]*<Switch[\s\S]*onValueChange=\{\(val\) => setThemeMode\(val \? 'light' : 'dark'\)\}/);
  assert.match(source, /const routePath = item\.routePath/);
  assert.match(source, /onPress=\{isThemeItem \? toggleThemeMode : routePath \|\| item\.action \? \(\) => handleSearchResultPress\(item\) : undefined\}/);
  assert.match(source, /onPressIn=\{routePath \? \(\) => prepareReadySettingsRoute\(routePath\) : undefined\}/);
  assert.doesNotMatch(source, /onTouchStart=\{routePath \? \(\) => showRouteLaunchPreview\(routePath\) : undefined\}/);
  assert.doesNotMatch(source, /activateOnPressIn=\{isThemeItem \|\| Boolean\(routePath\)\}/);
  assert.match(source, /title=\{t\('Support'\)\}[\s\S]*sub=\{supportEmail\}[\s\S]*onPress=\{handleEmailSupport\}/);
  assert.match(source, /title=\{t\('Help'\)\}[\s\S]*sub=\{t\('FAQ'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/help'\)\}/);
  assert.match(source, /t\('MARKET UPDATES'\)/);
  assert.match(source, /title=\{t\('Economic Calender'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/economic-calendar'\)\}/);
  assert.doesNotMatch(source, /\{ title: 'Mailbox'[\s\S]*routePath: '\/settings\/mailbox' \}/);
  assert.doesNotMatch(source, /\{ title: 'News'[\s\S]*routePath: '\/settings\/news' \}/);
  assert.doesNotMatch(source, /title=\{t\('Mailbox'\)\}[\s\S]*openReadySettingsRoute\('\/settings\/mailbox'\)/);
  assert.doesNotMatch(source, /title=\{t\('News'\)\}[\s\S]*openReadySettingsRoute\('\/settings\/news'\)/);
  assert.doesNotMatch(source, /QRScannerModal|showScanner|qr-scanner|QR Scanner|setShowScanner/);
  assert.doesNotMatch(source, /MQL5 Algo Trading|\/settings\/mql5-algo-trading/);
  assert.doesNotMatch(source, /Chat & Messages|Traders Community|\/settings\/traders-community/);
  assert.doesNotMatch(source, /FAQ & Documentation|FAQs & Documentation/);
  assert.doesNotMatch(source, /feature-status|statusKey|openFeatureStatus|statusModal|title: 'OTP'|SOCIAL & ALGO|COMMUNITY/);
});

test('settings account card only shows connected status when an authenticated login session exists', () => {
  const source = readSettingsScreenSource();

  assert.match(source, /import \{ hasAuthenticatedAccountSession \} from '\.\.\/accountConnectionStatus'/);
  assert.match(source, /const isAccountConnected = hasAuthenticatedAccountSession\(isLoggedIn, accountDetails\)/);
  assert.match(source, /\{isAccountConnected \? \([\s\S]*style=\{styles\.connectedPill\}[\s\S]*style=\{styles\.greenDot\}[\s\S]*style=\{styles\.connectedText\}[\s\S]*t\('Connected'\)[\s\S]*\) : null\}/);
  assert.doesNotMatch(source, /t\('Not connected'\)/);
});
