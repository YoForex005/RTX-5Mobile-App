import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('add symbol category rows use professional monochrome market logos', () => {
  const source = readSource('src/features/quotes/QuotesScreen.tsx');

  assert.match(source, /type AddSymbolFolderLogoMeta = \{/);
  assert.match(source, /const ADD_SYMBOL_FOLDER_LOGO_META: Record<AddSymbolFolderKey, AddSymbolFolderLogoMeta> = \{/);
  assert.match(source, /commodities: \{[\s\S]*icon: 'flame'/);
  assert.match(source, /cryptocurrenciesMtt: \{[\s\S]*icon: 'logo-bitcoin'/);
  assert.match(source, /forexMarket: \{[\s\S]*icon: 'earth'/);
  assert.match(source, /indices: \{[\s\S]*icon: 'bar-chart'/);
  assert.match(source, /metalsMtt: \{[\s\S]*icon: 'diamond'/);
  assert.match(source, /function AddSymbolFolderLogo\(\{ folderKey, isDark \}: \{ folderKey: AddSymbolFolderKey; isDark: boolean \}\)/);
  assert.match(source, /backgroundColor: isDark \? 'rgba\(148,163,184,0\.12\)' : '#F8FAFC'/);
  assert.match(source, /<Ionicons name=\{meta\.icon\} size=\{meta\.iconSize \?\? 23\} color=\{isDark \? '#E5E7EB' : '#111827'\} \/>/);
  assert.match(source, /<AddSymbolFolderLogo folderKey=\{item\.key\} isDark=\{isDark\} \/>/);
  assert.doesNotMatch(source, /<Ionicons name="folder-open"/);
  assert.doesNotMatch(source, /folderLogoCodePill/);
  assert.doesNotMatch(source, /folderLogoHighlight/);
  assert.doesNotMatch(source, /code: 'BTC'/);
});
