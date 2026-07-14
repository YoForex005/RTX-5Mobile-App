import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker rows render a plain chevron without a circular shell', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const rowStart = source.indexOf('renderItem={({ item }) => (');
  const rowEnd = source.indexOf('ListEmptyComponent=', rowStart);
  const rowSource = source.slice(rowStart, rowEnd);
  const selectBtnStart = source.indexOf('selectBtn: {');
  const selectBtnEnd = source.indexOf('emptyState:', selectBtnStart);
  const selectBtnStyle = source.slice(selectBtnStart, selectBtnEnd);

  assert.notEqual(rowStart, -1);
  assert.notEqual(rowEnd, -1);
  assert.match(rowSource, /style=\{styles\.selectBtn\}[\s\S]*pointerEvents="none"[\s\S]*<Ionicons name="chevron-forward"/);
  assert.notEqual(selectBtnStart, -1);
  assert.notEqual(selectBtnEnd, -1);
  assert.match(selectBtnStyle, /width: 36/);
  assert.match(selectBtnStyle, /height: 36/);
  assert.match(selectBtnStyle, /alignItems: 'center'/);
  assert.match(selectBtnStyle, /justifyContent: 'center'/);
  assert.doesNotMatch(selectBtnStyle, /borderRadius|borderWidth|borderColor|backgroundColor/);
});

test('broker rows resolve real broker logos before falling back to initials', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const directoryRowsSource = readSource(
    'src/features/settings/BrokersScreen/brokerDirectoryRows.ts',
  );

  assert.match(source, /buildBrokerDirectoryRows/);
  assert.match(source, /sortBrokerDirectoryRows/);
  assert.match(directoryRowsSource, /function normalizeBrokerLogoUrl\(logoUrl\?: string \| null\)/);
  assert.match(directoryRowsSource, /function resolveBrokerLogoUrl\(broker: BrokerServer\)/);
  assert.match(directoryRowsSource, /const BROKER_LOGO_KEYS = \[/);
  assert.match(directoryRowsSource, /'logo_url'/);
  assert.match(directoryRowsSource, /'image_url'/);
  assert.match(directoryRowsSource, /'brand_logo_url'/);
  assert.match(directoryRowsSource, /logoUrl: resolveBrokerLogoUrl\(broker\)/);
  assert.match(directoryRowsSource, /function buildBrokerDomainLogoUrl\(domain\?: string\)/);
  assert.match(directoryRowsSource, /https:\/\/www\.google\.com\/s2\/favicons\?domain=/);
  assert.match(source, /const logoUri = broker\.logoUrl \|\| buildBrokerDomainLogoUrl\(broker\.domain\)/);
  assert.match(source, /source=\{\{ uri: logoUri, cache: 'force-cache' \}\}[\s\S]*fadeDuration=\{0\}/);
  assert.match(source, /failed=\{Boolean\(logoFailed\[item\.logoUrl \|\| buildBrokerDomainLogoUrl\(item\.domain\)\]\)\}/);
  assert.match(directoryRowsSource, /myproptrade: 'myprop\.trade'/);
  assert.match(directoryRowsSource, /gtabroker: 'growtradingacademy\.com'/);
  assert.match(directoryRowsSource, /testorrnn: 'orrnn\.com'/);
});
