import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/state/userPreferences/store.ts'), 'utf8');

test('persisted user preferences are normalized before second-launch hydration reaches UI', () => {
  const storeSource = source();

  assert.match(storeSource, /const PREFERENCES_STORAGE_VERSION = 17/);
  assert.match(storeSource, /normalizePersistedUserPreferencesState/);
  assert.match(storeSource, /quoteSymbols: asStringArray\(state\.quoteSymbols\)/);
  assert.match(storeSource, /chartSymbol = asString\(state\.chartSymbol, 'GBPUSD'\)/);
  assert.match(storeSource, /chartTimeframe: normalizeCandleHistoryTimeframe\(state\.chartTimeframe\)/);
  assert.match(storeSource, /marketNewsSavedIds: Array\.from\(new Set\(asStringArray\(state\.marketNewsSavedIds\)\)\)/);
  assert.match(storeSource, /isLoggedIn = asBoolean\(state\.isLoggedIn, false\) && accountDetails !== null/);
  assert.match(storeSource, /merge: \(persistedState, currentState\) => \(\{/);
  assert.match(storeSource, /Ignoring invalid persisted preferences/);
  assert.doesNotMatch(storeSource, /state\.marketNewsSavedIds\.map\(\(id\) => id\.trim\(\)\)/);
});
