import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Chart Preferences warms and opens Schema & Colors on the immediate press path', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const hostSource = readSource('src/features/chart/ChartConfigDestinationHost.tsx');
  const controllerSource = readSource('src/features/chart/chartConfigDestinationController.ts');
  const schemaRowStart = settingsSource.indexOf('label="Chart Schema & Colors"');
  const schemaRowSource = settingsSource.slice(schemaRowStart, schemaRowStart + 260);
  const navRowStart = settingsSource.indexOf('function NavRow(');
  const navRowSource = settingsSource.slice(navRowStart, navRowStart + 900);

  assert.match(warmupSource, /'\/chart\/schema-colors'/);
  // Sidebar-style retained host — no router.push on the tap path for config rows.
  assert.match(
    settingsSource,
    /const handleOpenSchemaColors = useCallback\(\(\) => \{\s*openConfigDestination\('schema-colors', 'schemaColors'\);\s*\}, \[openConfigDestination\]\)/,
  );
  assert.match(settingsSource, /showChartConfigDestination\(destination\)/);
  assert.match(settingsSource, /openConfigDestination\('price-source'/);
  assert.match(settingsSource, /openConfigDestination\('open-order-mode'/);
  assert.match(settingsSource, /openConfigDestination\('alerts'/);
  assert.match(settingsSource, /showFastTabVisual\('chart'\)/);
  assert.match(hostSource, /ChartConfigDestinationHost/);
  assert.match(hostSource, /schema-colors|price-source|open-order-mode|alerts/);
  assert.match(controllerSource, /export function showChartConfigDestination/);
  assert.match(controllerSource, /visualApplier\?\.\(destination\)/);
  assert.notEqual(schemaRowStart, -1);
  assert.match(schemaRowSource, /onPress=\{handleOpenSchemaColors\}/);
  assert.notEqual(navRowStart, -1);
  assert.match(navRowSource, /onPress=\{onPress\}[\s\S]*activateOnPressIn[\s\S]*unstable_pressDelay=\{0\}/);
});

test('Chart Preferences and Schema & Colors back controls fire on touch-down', () => {
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const schemaSource = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const settingsBackStart = settingsSource.indexOf('onPress={handleReturnToChart}');
  const settingsBackSource = settingsSource.slice(settingsBackStart, settingsBackStart + 360);
  const schemaBackStart = schemaSource.indexOf('onPress={handleReturnFromSchema}');
  const schemaBackSource = schemaSource.slice(schemaBackStart, schemaBackStart + 380);

  assert.notEqual(settingsBackStart, -1);
  assert.match(settingsBackSource, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/);
  assert.notEqual(schemaBackStart, -1);
  assert.match(schemaBackSource, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(
    schemaSource,
    /const handleReturnFromSchema = useCallback\(\(\) => \{[\s\S]*if \(hosted && onHostedBack\) \{[\s\S]*onHostedBack\(\);/,
  );
  // Hosted toolbar open: hide retained layer immediately. Route path still uses deferred stack back.
  assert.match(
    settingsSource,
    /const handleReturnToChart = useCallback\(\(\) => \{[\s\S]*if \(hosted && onHostedBack\) \{[\s\S]*onHostedBack\(\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/chart'\)/,
  );
});

test('Chart toolbar Preferences opens and closes via retained host (no stack push on tap)', () => {
  const nativeSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const hostSource = readSource('src/features/chart/ChartSettingsHost.tsx');
  const controllerSource = readSource('src/features/chart/chartSettingsHostController.ts');
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(
    nativeSource,
    /const handleOpenSettingsScreen = useCallback\(\(\) => \{[\s\S]*showChartSettingsHost\(\);/,
  );
  assert.doesNotMatch(
    nativeSource.slice(
      nativeSource.indexOf('const handleOpenSettingsScreen'),
      nativeSource.indexOf('const handleToggleChartExpanded'),
    ),
    /router\.push\(['"]\/chart\/settings['"]\)/,
  );
  assert.match(
    nativeSource,
    /accessibilityLabel="Chart settings"[\s\S]*onPress=\{handleOpenSettingsScreen\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
  );
  assert.match(hostSource, /ChartSettingsScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/);
  assert.match(hostSource, /setNativeProps/);
  assert.match(controllerSource, /export function showChartSettingsHost/);
  assert.match(controllerSource, /visualApplier\?\.\(true\)/);
  assert.match(controllerSource, /visualApplier\?\.\(false\)/);
  assert.match(settingsSource, /hosted\?: boolean/);
  assert.match(settingsSource, /onHostedBack\?: \(\) => void/);
  assert.match(rootSource, /import \{ ChartSettingsHost \} from/);
  assert.match(
    rootSource,
    /<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/,
  );
});

test('Schema & Colors paints a fixed preview shell before enabling live data and WebView content', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const previewHostStart = source.indexOf('<View style={[styles.previewChart');
  const previewHostSource = source.slice(previewHostStart, previewHostStart + 900);

  assert.match(source, /SCHEMA_COLORS_PREVIEW_DELAY_MS = 120/);
  assert.match(source, /useDeferredRouteContentReady\(\s*SCHEMA_COLORS_PREVIEW_DELAY_MS,\s*isScreenFocused,\s*\)/);
  assert.match(source, /const previewActive = previewContentReady && isScreenFocused && !colorEditorOpen/);
  assert.match(source, /hosted && hostedActive/);
  assert.notEqual(previewHostStart, -1);
  assert.match(previewHostSource, /\{previewContentReady \? \([\s\S]*<LiveChartPreview/);
  assert.match(previewHostSource, /testID="chart-live-preview-placeholder"[\s\S]*style=\{StyleSheet\.absoluteFillObject\}/);
  assert.match(source, /previewChart: \{\s*height: 240,/);
});

test('root layout mounts ChartSettingsHost and ChartConfigDestinationHost with other retained hosts', () => {
  const rootSource = readSource('app/_layout.tsx');
  assert.match(rootSource, /import \{ ChartConfigDestinationHost \} from/);
  assert.match(rootSource, /import \{ ChartSettingsHost \} from/);
  assert.match(rootSource, /import \{ TradePositionActionHost \} from/);
  assert.match(
    rootSource,
    /<RegisterLaunchHost \/>[\s\S]*<TradePositionActionHost \/>[\s\S]*<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/,
  );
});
