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
  assert.match(source, /action\?: 'qr-scanner'/);
  assert.match(source, /\{ title: 'Accounts'[\s\S]*routePath: '\/settings\/accounts' \}/);
  assert.match(source, /\{ title: 'New Account'[\s\S]*routePath: '\/register' \}/);
  assert.match(source, /\{ title: 'Mailbox'[\s\S]*routePath: '\/settings\/mailbox' \}/);
  assert.match(source, /\{ title: 'News'[\s\S]*routePath: '\/settings\/news' \}/);
  assert.match(source, /\{ title: 'Economic Calender'[\s\S]*routePath: '\/settings\/economic-calendar' \}/);
  assert.match(source, /\{ title: 'Traders Community'[\s\S]*routePath: '\/settings\/traders-community' \}/);
  assert.match(source, /\{ title: 'MQL5 Algo Trading'[\s\S]*routePath: '\/settings\/mql5-algo-trading' \}/);
  assert.match(source, /\{ title: 'Theme', sub: themeMode === 'light' \? 'Light Mode' : 'Dark Mode', icon: 'color-palette-outline' \}/);
  assert.match(source, /\{ title: 'Language Preference'[\s\S]*routePath: '\/settings\/interface' \}/);
  assert.match(source, /\{ title: 'Journal'[\s\S]*routePath: '\/settings\/journal' \}/);
  assert.match(source, /\{ title: 'Help'[\s\S]*routePath: '\/settings\/user-guide' \}/);
  assert.match(source, /\{ title: 'QR Scanner'[\s\S]*action: 'qr-scanner' \}/);
  assert.match(source, /const handleSearchResultPress = useCallback\(\(item: SearchableSettingsItem\) => \{/);
  assert.match(source, /openReadySettingsRoute\(item\.routePath\)/);
  assert.match(source, /rightElement=\{[\s\S]*item\.title === 'Theme' \? \([\s\S]*<Switch[\s\S]*onValueChange=\{\(val\) => setThemeMode\(val \? 'light' : 'dark'\)\}/);
  assert.match(source, /onPress=\{item\.routePath \|\| item\.action \? \(\) => handleSearchResultPress\(item\) : undefined\}/);
});
