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

test('symbol picker stays fixed when the search keyboard opens (no focus-time jump)', () => {
  // Regression guard for the search-focus "jump": the symbol picker must opt
  // into keepFullHeightOnKeyboard, and the shared ActionSheet must honour it
  // cross-platform — (a) on Android by pinning the host to the full screen
  // height so the bottom-anchored sheet never rides the shrinking window up, and
  // (b) on iOS by disabling the KeyboardAvoidingView so it stops padding the
  // bottom-anchored sheet up. If any link in this chain is removed the jump returns.
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');
  const tabsLayoutSource = readSource('app/(tabs)/_layout.tsx');
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');

  // 1) Symbol picker opts in (and no longer relies on the old 'resize' avoidance).
  assert.match(chartSource, /title: t\('Select Symbol'\)[\s\S]*keepFullHeightOnKeyboard:\s*true/);
  assert.doesNotMatch(
    chartSource,
    /title: t\('Select Symbol'\)[\s\S]*androidKeyboardAvoidance:[\s\S]*actions: symbolPickerActions/,
  );

  // 2) Config type + global host passthrough exist.
  assert.match(uiStateSource, /keepFullHeightOnKeyboard\?:\s*boolean/);
  assert.match(tabsLayoutSource, /keepFullHeightOnKeyboard=\{activeConfig\?\.keepFullHeightOnKeyboard\}/);

  // 3) ActionSheet honours the flag cross-platform. The flag itself is no longer
  //    android-gated (it now also drives the iOS path).
  assert.match(
    actionSheetSource,
    /const keepFullHeightSheet\s*=\s*activeSearchable && activeKeepFullHeightOnKeyboard;/,
  );
  //    Android: avoidance math is opted out AND the host is pinned to the full
  //    (stable) screen height, top-anchored, so it cannot rise.
  assert.match(
    actionSheetSource,
    /const androidSearchableSheet\s*=\s*\n?\s*Platform\.OS === 'android' && activeSearchable && !keepFullHeightSheet;/,
  );
  assert.match(
    actionSheetSource,
    /keepFullHeightSheet\s*\n?\s*\?\s*\{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: screenHeight \}/,
  );
  //    iOS: the KeyboardAvoidingView is disabled so it stops padding the
  //    bottom-anchored sheet up (that upward push is the jump).
  assert.match(actionSheetSource, /enabled=\{!keepFullHeightSheet\}/);

  // 4) The chart must not run its own keyboard avoidance for a sheet's keyboard.
  assert.match(
    chartSource,
    /const actionSheetOwnsKeyboard\s*=[\s\S]*ui\.actionSheet !== null[\s\S]*scopedActionSheets\[ui\.actionSheetScope\] !== null[\s\S]*if \(actionSheetOwnsKeyboard\) \{\s*\n\s*return;/,
  );
});

test('market symbol API cache is broker scoped and parses full instrument payloads', () => {
  const querySource = readSource('src/query/market.ts');
  const extractorSource = readSource('src/domain/marketSymbols.ts');

  assert.match(querySource, /useUserPreferences\(\(state\) => state\.brokerId\)/);
  assert.match(querySource, /useUserPreferences\(\(state\) => state\.accountDetails\?\.id \?\? ''\)/);
  assert.match(querySource, /const accountScope\s*=\s*isLoggedIn \? accountId : 'public'/);
  assert.match(querySource, /queryKey:\s*\['market', 'symbols', 'instrument-catalog-v2', brokerId, accountScope\]/);
  assert.match(querySource, /staleTime:\s*1000 \* 60 \* 5/);
  assert.match(querySource, /primeInstrumentMetaCacheFromCatalogPayload\(data, cacheScope\)/);
  assert.match(extractorSource, /'instruments'[\s\S]*'symbols'[\s\S]*'data'[\s\S]*'items'[\s\S]*'results'[\s\S]*'records'/);
  assert.match(extractorSource, /'symbol'[\s\S]*'Symbol'[\s\S]*'instrumentSymbol'[\s\S]*'code'[\s\S]*'ticker'/);
});

test('native compact symbol header opens immediately from the full header tap target', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(source, /const symbolPickerActions = useMemo\([\s\S]*availableSymbols\.map/);
  assert.match(source, /actions: symbolPickerActions/);
  assert.match(source, /instantOpen:\s*true/);
  assert.doesNotMatch(source, /const stopSymbolPickerTouchPropagation = useCallback/);
  assert.doesNotMatch(source, /const handleSymbolPickerStartShouldSetResponder = useCallback/);
  assert.ok(
    source.indexOf('<WebView') < source.indexOf('style={styles.chartOverlaySymbolSection}'),
    'symbol dropdown hit target must render after the native WebView so Android taps reach it',
  );
  assert.match(
    source,
    /accessibilityLabel=\{t\('Select Symbol'\)\}[\s\S]*style=\{styles\.symbolSectionTapTarget\}[\s\S]*onPress=\{handleOpenSymbolPicker\}[\s\S]*activateOnPressIn[\s\S]*hitSlop=\{8\}/,
  );
  assert.match(styles, /symbolSectionTapTarget:/);
  assert.match(styles, /symbolSectionContent:/);
  assert.match(styles, /APP_HEADER_MENU_VISUAL_LEFT/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_SHIFT = 26/);
  assert.match(styles, /COMPACT_SYMBOL_DROPDOWN_LEFT_INSET = Math\.max\(/);
  assert.match(styles, /paddingLeft: COMPACT_SYMBOL_DROPDOWN_LEFT_INSET/);
});

test('native OHLC row renders below the full symbol name', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');
  const symbolNameRowIndex = source.indexOf('<View style={styles.symbolMetaRow}>');
  const ohlcRowIndex = source.indexOf('{showChartMetaRow && (', symbolNameRowIndex);
  const symbolPressableEndIndex = source.indexOf('</Pressable>', symbolNameRowIndex);

  assert.notEqual(symbolNameRowIndex, -1);
  assert.notEqual(ohlcRowIndex, -1);
  assert.ok(symbolNameRowIndex < ohlcRowIndex, 'OHLC row must render after the full symbol name row');
  assert.ok(ohlcRowIndex < symbolPressableEndIndex, 'OHLC row must stay inside the symbol header tap target');
  assert.doesNotMatch(source, /<DraggableChartMetaOverlay/);
  assert.match(source, /chartMetaItems\.map\(\(item\) => \(/);
  assert.match(styles, /symbolOhlcRow:/);
  assert.match(styles, /symbolOhlcPair:/);
  assert.match(styles, /symbolOhlcLabel:/);
  assert.match(styles, /symbolOhlcValue:/);
  assert.match(styles, /symbolSectionContent:\s*\{[\s\S]*backgroundColor: 'transparent'/);
  assert.match(styles, /symbolOhlcRow:\s*\{[\s\S]*marginTop: 1/);
  assert.doesNotMatch(source, /styles\.fxBadge,\s*\{\s*backgroundColor:/);
});

test('native chart toolbar keeps fast action openers on reliable press surfaces', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');
  const timeframePickerSource = readSource('src/features/chart/components/ChartTimeframePickerSheet.tsx');
  const menuSource = readSource('src/features/chart/components/ChartToolbarMenuFeature.tsx');
  const drawingSource = readSource('src/features/chart/components/ChartDrawingToolsFeature.tsx');
  const drawingToolsSource = readSource('src/features/chart/drawingTools/index.ts');
  const drawingTypesSource = readSource('src/features/chart/drawingTools/types.ts');
  const tradeFeatureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');
  const timeframeTextStyle = styles.slice(
    styles.indexOf('compactHeaderTimeframeText:'),
    styles.indexOf('/*', styles.indexOf('compactHeaderTimeframeText:')),
  );
  const toolbarTradeTextStyle = styles.slice(
    styles.indexOf('toolbarTradeText:'),
    styles.indexOf('toolbarTrailingGroup:', styles.indexOf('toolbarTradeText:')),
  );
  const timeframeHandlerSource = source.slice(
    source.indexOf('const handleOpenTimeframePicker = useCallback'),
    source.indexOf('const handleSelectChartType = useCallback', source.indexOf('const handleOpenTimeframePicker = useCallback')),
  );

  assert.match(timeframePickerSource, /TIMEFRAME_PICKER_GROUPS[\s\S]*title: 'Minutes'[\s\S]*options: \['M1', 'M5', 'M15', 'M30'\]/);
  assert.match(timeframePickerSource, /title: 'Hours'[\s\S]*options: \['H1', 'H4'\]/);
  assert.match(timeframePickerSource, /title: 'Days'[\s\S]*'D1'[\s\S]*'MN'/);
  assert.doesNotMatch(timeframePickerSource, /'M2'|'M3'|'M4'|'M6'|'M10'|'M12'|'M20'|'H2'|'H3'|'H6'|'H8'|'H12'/);
  assert.match(timeframePickerSource, /export function createTimeframePickerActionSheetActions/);
  assert.match(timeframePickerSource, /selected: active/);
  assert.match(timeframePickerSource, /disabled: !supported/);
  assert.doesNotMatch(timeframePickerSource, /Ionicons|iconName|icon:/);
  assert.doesNotMatch(timeframePickerSource, /<Modal|bottomDock|overlay:/);
  assert.doesNotMatch(source, /const \[timeframePickerVisible, setTimeframePickerVisible\] = useState\(false\)/);
  assert.match(source, /const chartTradeExpirationActions = useMemo\(/);
  assert.match(source, /chartTradeExpirationActions = useMemo\([\s\S]*name="infinite-outline"[\s\S]*label: t\('GTC'\)[\s\S]*name="today-outline"[\s\S]*label: t\('Today'\)[\s\S]*name="time-outline"[\s\S]*label: t\('Date and Time'\)[\s\S]*name="calendar-outline"[\s\S]*label: t\('Date'\)/);
  assert.match(source, /const timeframePickerActions = useMemo\(/);
  assert.match(source, /const drawingToolsActions = useMemo\(/);
  assert.match(source, /const chartTypePickerActions = useMemo\(/);
  assert.match(source, /const chartMoreActions = useMemo\(/);
  assert.match(source, /const scheduleChartActionSheetContextReset = useCallback/);
  assert.match(source, /requestAnimationFrame\(resetChartActionSheetContext\)/);
  assert.match(source, /const handleOpenTimeframePicker = useCallback\([\s\S]*timeframes\.forEach[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, tf\)[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*minimumTopInset: drawingToolsSheetTopInset[\s\S]*detent:\s*'adaptive'[\s\S]*instantOpen:\s*true[\s\S]*actions: timeframePickerActions/);
  assert.doesNotMatch(timeframeHandlerSource, /showActionIcons:\s*true/);
  assert.doesNotMatch(source, /<ChartTimeframePickerSheet[\s\S]*visible=\{timeframePickerVisible\}/);
  assert.match(source, /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*instantOpen:\s*true[\s\S]*actions: drawingToolsActions/);
  assert.doesNotMatch(source, /title:\s*t\('Drawing Tools'\)[\s\S]*presentation:\s*'mt5Plain'/);
  assert.doesNotMatch(drawingSource, /title="Drawing Tools"/);
  assert.match(drawingSource, /presentation="mt5Plain"[\s\S]*showActionIcons[\s\S]*actions=\{createDrawingToolsActionSheetActions/);
  assert.match(drawingTypesSource, /icon\?: ReactNode/);
  assert.match(drawingToolsSource, /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*icon: definition\.renderIcon\(iconColor\)/);
  assert.match(drawingToolsSource, /DRAWING_TOOL_COMMANDS\.map\(\(definition\) => \(\{[\s\S]*icon: definition\.renderIcon\(definition\.danger \? dangerIconColor : iconColor\)/);
  assert.match(source, /title: t\('Chart Type'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartTypePickerActions/);
  assert.match(source, /runImmediateAction\('chart\.moreMenu\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*instantOpen:\s*true[\s\S]*actions: chartMoreActions/);
  assert.doesNotMatch(source, /title:\s*(?:t\('Options'\)|'⋮')[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true/);
  assert.match(
    source,
    /runImmediateAction\('chart\.tradeSheet\.expiration\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*detent:\s*'auto'[\s\S]*instantOpen:\s*true[\s\S]*runActionAfterClose:\s*false[\s\S]*actions: chartTradeExpirationActions/,
  );
  assert.doesNotMatch(source, /title:\s*t\('Expiration'\)[\s\S]*actions: chartTradeExpirationActions/);
  assert.match(source, /requestAnimationFrame\(handleOpenChartTypePicker\)/);
  assert.doesNotMatch(source, /showChartTypeMenu\s*\?/);
  assert.doesNotMatch(source, /setShowChartTypeMenu/);
  assert.doesNotMatch(source, /styles\.chartTypeMenuCard/);
  assert.match(source, /showChartActionSheet\(\{[\s\S]*title: t\('Select Symbol'\)[\s\S]*actions: symbolPickerActions[\s\S]*\}\);[\s\S]*scheduleChartActionSheetContextReset\(\);/);
  assert.match(
    source,
    /title: t\('Select Symbol'\)[\s\S]*searchable:\s*true[\s\S]*keepFullHeightOnKeyboard:\s*true[\s\S]*actions: symbolPickerActions/,
  );
  assert.match(
    source,
    /const warmChartContextAndCommit = useCallback\([\s\S]*setChartSymbol\(nextSymbol\)[\s\S]*prefetchInstrument\(nextSymbol\)[\s\S]*setChartTimeframe\(nextTimeframe\)/,
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
  assert.match(source, /onPressIn=\{handleOpenChartTradeSheet\}/);
  assert.match(source, /onPress=\{handleOpenDrawingTools\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenSettingsScreen\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenMoreMenu\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenChartExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(timeframeTextStyle, /color:\s*TEXT_MUTED/);
  assert.doesNotMatch(timeframeTextStyle, /color:\s*BLUE/);
  assert.match(toolbarTradeTextStyle, /color:\s*TEXT_MUTED/);
  assert.doesNotMatch(toolbarTradeTextStyle, /color:\s*BLUE/);
  assert.match(tradeFeatureSource, /onPress=\{handlers\.onOpenExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(menuSource, /onPressIn=\{onPress\}/);
  assert.match(drawingSource, /onPressIn=\{onPress\}/);
});
