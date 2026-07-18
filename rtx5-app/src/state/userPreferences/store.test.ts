import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/state/userPreferences/store.ts'), 'utf8');

test('persisted user preferences are normalized before second-launch hydration reaches UI', () => {
  const storeSource = source();

  assert.match(storeSource, /const PREFERENCES_STORAGE_VERSION = 22/);
  assert.match(storeSource, /const CHART_DRAWING_RECORDS_STORAGE_KEY = 'rtx5-chart-drawing-records-v1'/);
  assert.match(storeSource, /normalizePersistedUserPreferencesState/);
  assert.match(storeSource, /quoteSymbols: asStringArray\(state\.quoteSymbols\)/);
  assert.match(storeSource, /chartSymbol = asString\(state\.chartSymbol, 'GBPUSD'\)/);
  assert.match(storeSource, /chartTimeframe: normalizeCandleHistoryTimeframe\(state\.chartTimeframe\)/);
  assert.match(storeSource, /const normalizeChartVisualType = \(value: unknown\): ChartVisualType => \{[\s\S]*if \(value === 'bars'\) return 'candles';[\s\S]*value === 'candles' \|\| value === 'line' \|\| value === 'hollow'/);
  assert.match(storeSource, /chartVisualType: normalizeChartVisualType\(state\.chartVisualType\)/);
  assert.match(storeSource, /chartVerticalScrollingLocked: asBoolean\(state\.chartVerticalScrollingLocked, false\)/);
  assert.match(storeSource, /chartAutoScaleEnabled: asBoolean\(state\.chartAutoScaleEnabled, false\)/);
  assert.match(storeSource, /hasPersistedLivePriceLine = typeof record\.showLivePriceLine === 'boolean'/);
  assert.match(storeSource, /!hasPersistedLivePriceLine && typeof record\.showBidPriceLine === 'boolean'[\s\S]*next\.showLivePriceLine = record\.showBidPriceLine/);
  assert.match(storeSource, /next\.showAskPriceLine = false/);
  assert.match(storeSource, /DEFAULT_CHART_COLOR_SCHEME/);
  assert.match(storeSource, /LEGACY_BLUE_DEFAULT_CHART_COLORS/);
  assert.match(storeSource, /isLegacyBlueDefaultChartColors\(state\.chartColors\)/);
  assert.match(storeSource, /chartColorScheme: nextChartColorScheme/);
  assert.match(storeSource, /chartColors: nextChartColors/);
  assert.match(storeSource, /chartColorScheme: DEFAULT_CHART_COLOR_SCHEME/);
  assert.match(storeSource, /chartColors: buildChartColorsForScheme\(DEFAULT_CHART_COLOR_SCHEME\)/);
  assert.match(storeSource, /setChartVisualType: \(chartType\) => set\(\{ chartVisualType: normalizeChartVisualType\(chartType\) \}\)/);
  assert.doesNotMatch(storeSource, /const isChartVisualType/);
  assert.match(storeSource, /persistChartDrawingRecordsBySymbol\(nextRecordsBySymbol\)/);
  assert.match(storeSource, /readChartDrawingRecordsBySymbol\(\)[\s\S]*\.then\(\(storedRecordsBySymbol\) => \{[\s\S]*\.finally\(\(\) => \{[\s\S]*setHasHydrated\(true\)/);
  assert.doesNotMatch(storeSource, /marketNewsSavedIds|setMarketNewsSavedIds|toggleMarketNewsSavedId/);
  assert.match(storeSource, /Boolean\(accountDetails\?\.credentials\?\.accessToken\)/);
  assert.match(storeSource, /merge: \(persistedState, currentState\) => \(\{/);
  assert.match(storeSource, /Ignoring invalid persisted preferences/);
  assert.match(storeSource, /let preferenceWriteFlushScheduled = false/);
  assert.match(storeSource, /function schedulePreferenceWriteFlush\(\) \{[\s\S]*if \(preferenceWriteFlushScheduled\) return;[\s\S]*preferenceWriteFlushScheduled = true;[\s\S]*setTimeout\(flushPendingPreferenceWrites, 0\)/);
  assert.match(storeSource, /setItem: \(name, value\) => \{[\s\S]*sanitizePreferenceAuthStorageValue\(value\)[\s\S]*pendingPreferenceWrites\.set\([\s\S]*sanitized as StorageValue<PersistedUserPreferencesState>[\s\S]*schedulePreferenceWriteFlush\(\);[\s\S]*\}/);
});

test('persisted preferences strip credentials and migrate the legacy blob before hydration', () => {
  const storeSource = source();

  assert.match(storeSource, /sanitizePreferenceAuthStorageValue\(parsed\)/);
  assert.match(storeSource, /migrateLegacyAuthSessionCredentials\(\{/);
  assert.match(storeSource, /await AsyncStorage\.setItem\(name, JSON\.stringify\(persistedStorageValue\)\)/);
  assert.match(storeSource, /AsyncStorage\.removeItem\(name\)/);
  assert.match(
    storeSource,
    /accountDetails: state\.accountDetails[\s\S]*id: state\.accountDetails\.id,[\s\S]*name: state\.accountDetails\.name,[\s\S]*server: state\.accountDetails\.server/,
  );
  const partializeStart = storeSource.indexOf('function partializeUserPreferences');
  const partializeEnd = storeSource.indexOf('\nexport const useUserPreferences', partializeStart);
  const partializeSource = storeSource.slice(partializeStart, partializeEnd);
  assert.doesNotMatch(partializeSource, /accessToken|refreshToken|expiresAt|credentials:/);
});

test('candidate broker setters cannot rebind an authenticated session', () => {
  const storeSource = source();

  assert.match(
    storeSource,
    /setBrokerId: \(id\) =>[\s\S]*set\(\(state\) => state\.isLoggedIn \? state : \{ brokerId: id \}\)/,
  );
  assert.match(
    storeSource,
    /setBrokerConnection: \(brokerId, serverUrl = '', logoUrl = ''\) =>[\s\S]*if \(state\.isLoggedIn\) \{[\s\S]*return state;/,
  );
});
