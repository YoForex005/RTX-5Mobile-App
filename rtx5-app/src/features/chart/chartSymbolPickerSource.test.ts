import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol pickers keep the saved chart symbol first and include fallback symbols', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.doesNotMatch(source, /const\s+CHART_SYMBOLS\s*=/, sourcePath);
    assert.doesNotMatch(source, /apiSymbols\.length\s*>\s*0\s*\?\s*apiSymbols\s*:/, sourcePath);
    assert.match(source, /DEFAULT_CHART_SYMBOLS/, sourcePath);
    assert.match(source, /const\s+buildAvailableChartSymbols\s*=\s*\(chartSymbol: string, apiSymbols: readonly string\[\]\)/, sourcePath);
    assert.match(source, /push\(chartSymbol\);[\s\S]*apiSymbols\.forEach\(push\);[\s\S]*DEFAULT_CHART_SYMBOLS\.forEach\(push\);/, sourcePath);
    assert.match(source, /const\s+availableSymbols\s*=\s*useMemo\([\s\S]*buildAvailableChartSymbols\(chartSymbol, apiSymbols\)/, sourcePath);
    assert.match(source, /subtitle:\s*resolveChartSymbolFullName\(sym\)/, sourcePath);
    assert.match(source, /resolveChartSymbolCategory\(chartSymbol\)/, sourcePath);
    assert.doesNotMatch(source, /setChartSymbol\(apiSymbols\[0\]\)/, sourcePath);
    assert.doesNotMatch(source, /symbolCategory\s*=\s*SYMBOL_CATEGORY\[baseSymbol\]\s*\?\?\s*'FX'/, sourcePath);
  }
});

test('market symbol API cache is broker scoped and parses full instrument payloads', () => {
  const querySource = readSource('src/query/market.ts');
  const extractorSource = readSource('src/domain/marketSymbols.ts');

  assert.match(querySource, /useUserPreferences\(\(state\) => state\.brokerId\)/);
  assert.match(querySource, /useUserPreferences\(\(state\) => state\.accountDetails\?\.id \?\? ''\)/);
  assert.match(querySource, /queryKey:\s*\['market', 'symbols', 'instrument-catalog-v2', brokerId, accountId\]/);
  assert.match(querySource, /staleTime:\s*1000 \* 60 \* 5/);
  assert.match(extractorSource, /'instruments'[\s\S]*'symbols'[\s\S]*'data'[\s\S]*'items'[\s\S]*'results'[\s\S]*'records'/);
  assert.match(extractorSource, /'symbol'[\s\S]*'Symbol'[\s\S]*'instrumentSymbol'[\s\S]*'code'[\s\S]*'ticker'/);
});

test('native compact symbol header opens immediately from the full header tap target', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(source, /const symbolPickerActions = useMemo\([\s\S]*availableSymbols\.map/);
  assert.match(source, /actions: symbolPickerActions/);
  assert.match(source, /instantOpen:\s*true/);
  assert.match(
    source,
    /accessibilityLabel=\{t\('Select Symbol'\)\}[\s\S]*onPress=\{handleOpenSymbolPicker\}[\s\S]*activateOnPressIn[\s\S]*hitSlop=\{8\}/,
  );
  assert.match(styles, /symbolSectionTapTarget:/);
  assert.match(styles, /symbolSectionContent:/);
  assert.match(styles, /APP_HEADER_MENU_VISUAL_LEFT/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_SHIFT = 26/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_INSET = Math\.max\(/);
  assert.match(styles, /paddingLeft: COMPACT_SYMBOL_DROPDOWN_LEFT_INSET/);
});

test('native chart toolbar keeps fast action openers on reliable press surfaces', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const menuSource = readSource('src/features/chart/components/ChartToolbarMenuFeature.tsx');
  const drawingSource = readSource('src/features/chart/components/ChartDrawingToolsFeature.tsx');

  assert.match(source, /const timeframePickerActions = useMemo\([\s\S]*timeframes\.map/);
  assert.match(source, /const chartTradeExpirationActions = useMemo\(/);
  assert.match(source, /const chartViewportActions = useMemo\(/);
  assert.match(source, /const drawingToolsActions = useMemo\(/);
  assert.match(source, /const chartMoreActions = useMemo\(/);
  assert.match(
    source,
    /title: t\('Timeframes'\)[\s\S]*instantOpen:\s*true[\s\S]*runActionAfterClose:\s*false[\s\S]*actions: timeframePickerActions/,
  );
  assert.match(source, /title: t\('Drawing Tools'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: drawingToolsActions/);
  assert.match(source, /title: t\('Options'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartMoreActions/);
  assert.match(source, /title: t\('Chart'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartViewportActions/);
  assert.match(source, /title: t\('Expiration'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartTradeExpirationActions/);
  assert.match(
    source,
    /const warmChartContextAndCommit = useCallback\([\s\S]*prefetchChartTimeframeHistory\(nextSymbol, nextTimeframe\)[\s\S]*setChartTimeframe\(nextTimeframe\)/,
  );
  assert.match(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/,
  );
  assert.doesNotMatch(
    source.slice(source.indexOf('const handleOpenObjectsScreen'), source.indexOf('const handleOpenSignalDetails')),
    /requestAnimationFrame/,
  );
  assert.doesNotMatch(
    source.slice(source.indexOf('const handleOpenSettingsScreen'), source.indexOf('const handleToggleChartExpanded')),
    /requestAnimationFrame/,
  );
  assert.match(source, /onPress=\{handleOpenTimeframePicker\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenChartTradeSheet\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenDrawingTools\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenSettingsScreen\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenMoreMenu\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenChartViewportMenu\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenChartExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(menuSource, /onPressIn=\{onPress\}/);
  assert.match(drawingSource, /onPressIn=\{onPress\}/);
});
