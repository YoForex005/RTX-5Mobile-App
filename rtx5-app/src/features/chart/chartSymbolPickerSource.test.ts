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

test('chart type pickers stay compact and do not expose the retired OHLC bars chart type', () => {
  const nativeSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const webSource = readSource('src/features/chart/ChartScreen.web.tsx');
  const nativeActionsSource = nativeSource.slice(
    nativeSource.indexOf('const chartTypePickerActions = useMemo'),
    nativeSource.indexOf('const handleOpenChartTypePicker', nativeSource.indexOf('const chartTypePickerActions = useMemo')),
  );
  const nativeOpenSource = nativeSource.slice(
    nativeSource.indexOf('const handleOpenChartTypePicker = useCallback'),
    nativeSource.indexOf('const handleOpenObjectsScreen', nativeSource.indexOf('const handleOpenChartTypePicker = useCallback')),
  );
  const webActionsSource = webSource.slice(
    webSource.indexOf('title=\'Chart Type\''),
    webSource.indexOf('<ActionSheet', webSource.indexOf('title=\'Chart Type\'') + 1),
  );

  [nativeActionsSource, webActionsSource].forEach((chartTypeSource) => {
    assert.match(chartTypeSource, /Candlestick/);
    assert.match(chartTypeSource, /Hollow Candles/);
    assert.match(chartTypeSource, /Line/);
    assert.doesNotMatch(chartTypeSource, /OHLC Bars/);
    assert.doesNotMatch(chartTypeSource, /setChartVisualType\('bars'\)/);
    assert.doesNotMatch(chartTypeSource, /bar-chart-outline/);
  });
  assert.match(nativeOpenSource, /title: t\('Chart Type'\)[\s\S]*detent:\s*'auto'/);
  assert.doesNotMatch(nativeOpenSource, /detent:\s*'adaptive'/);
  assert.match(webActionsSource, /detent="auto"/);
  assert.doesNotMatch(webActionsSource, /detent="adaptive"/);
});

test('native chart dark UI colors match the global dark palette', () => {
  const chartStyles = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(chartStyles, /const APP_BG = T\.bg/);
  assert.match(chartStyles, /const CHART_CANVAS_BG = isDark \? T\.bg : '#FFFFFF'/);
  assert.match(chartStyles, /const BOTTOM_AREA_BG = isDark \? T\.bg : '#F8FAFC'/);
  assert.match(chartStyles, /const TRADE_SHEET_BG = isDark \? T\.bg : '#FFFFFF'/);
  assert.match(chartStyles, /const TRADE_SHEET_PANEL = isDark \? T\.glass2 : '#FFFFFF'/);
  assert.match(chartStyles, /backgroundColor: T\.glass2/);
  assert.match(chartStyles, /backgroundColor: isDark \? T\.bg : T\.glass2/);
  assert.doesNotMatch(chartStyles, /CHART_DARK_CHROME_BACKGROUND|CHART_DARK_CANVAS_BACKGROUND/);
  assert.doesNotMatch(chartStyles, /const SETTINGS_DARK_BACKGROUND|const SETTINGS_DARK_CARD_BACKGROUND/);
});

test('native chart toolbar keeps fast action openers on reliable press surfaces', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const styles = readSource('src/features/chart/ChartScreen.styles.ts');
  const timeframePickerSource = readSource('src/features/chart/components/ChartTimeframePickerSheet.tsx');
  const menuSource = readSource('src/features/chart/components/ChartToolbarMenuFeature.tsx');
  const drawingSource = readSource('src/features/chart/components/ChartDrawingToolsFeature.tsx');
  const radialSource = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');
  const chartSettingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const chartMenuOrderSource = readSource('src/features/chart/ChartMenuOrderScreen.tsx');
  const uiStateSource = readSource('src/state/uiState.ts');
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
  assert.match(timeframePickerSource, /export function ChartTimeframePickerOverlay/);
  assert.match(timeframePickerSource, /const options = group\.options\.filter\(\(timeframe\) => supportedSet\.has\(timeframe\)\)/);
  assert.match(timeframePickerSource, /selected: active/);
  assert.match(timeframePickerSource, /disabled: !supported/);
  assert.match(timeframePickerSource, /activateOnPressIn: true/);
  assert.match(timeframePickerSource, /StyleSheet\.absoluteFillObject/);
  assert.match(timeframePickerSource, /justifyContent: 'center'/);
  assert.match(timeframePickerSource, /const CHART_DARK_PANEL_BACKGROUND = '#1E1E1E'/);
  assert.match(timeframePickerSource, /backgroundColor: isDark \? CHART_DARK_PANEL_BACKGROUND : '#FFFFFF'/);
  assert.match(timeframePickerSource, /borderColor: isDark \? 'rgba\(255,255,255,0\.10\)' : 'rgba\(15,23,42,0\.08\)'/);
  assert.match(timeframePickerSource, /shadowColor: '#000000'/);
  assert.doesNotMatch(timeframePickerSource, /rgba\(59,130,246,0\.25\)|shadowColor: isDark \? accentColor|rgba\(37,99,235,0\.18\)/);
  assert.doesNotMatch(timeframePickerSource, /Ionicons|iconName|icon:/);
  assert.doesNotMatch(timeframePickerSource, /<Modal|bottomDock/);
  assert.match(source, /import \{ ChartTimeframePickerOverlay \} from '\.\/components\/ChartTimeframePickerSheet'/);
  assert.match(source, /const \[timeframePickerVisible, setTimeframePickerVisible\] = useState\(false\)/);
  assert.match(source, /const chartTradeExpirationActions = useMemo\(/);
  assert.match(source, /chartTradeExpirationActions = useMemo\([\s\S]*name="infinite-outline"[\s\S]*label: t\('GTC'\)[\s\S]*name="today-outline"[\s\S]*label: t\('Today'\)[\s\S]*name="time-outline"[\s\S]*label: t\('Date and Time'\)[\s\S]*name="calendar-outline"[\s\S]*label: t\('Date'\)/);
  assert.doesNotMatch(source, /const timeframePickerActions = useMemo\(/);
  assert.match(source, /const drawingToolsActions = useMemo\(/);
  assert.match(source, /const chartTypePickerActions = useMemo\(/);
  assert.match(source, /const chartMoreActions = useMemo\(/);
  assert.match(source, /const CHART_SCALE_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.match(source, /chartOneClickPanelAtBottom: state\.chartOneClickPanelAtBottom/);
  assert.match(source, /chartVerticalScrollingLocked: state\.chartVerticalScrollingLocked/);
  assert.match(source, /chartAutoScaleEnabled: state\.chartAutoScaleEnabled/);
  assert.match(source, /setChartDisplaySetting: state\.setChartDisplaySetting/);
  assert.match(source, /const scheduleChartActionSheetContextReset = useCallback/);
  assert.match(source, /requestAnimationFrame\(resetChartActionSheetContext\)/);
  assert.match(source, /const handleTimeframeSelect = useCallback[\s\S]*setTimeframePickerVisible\(false\)[\s\S]*warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/);
  assert.match(timeframeHandlerSource, /timeframes\.forEach[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, tf\)[\s\S]*hideActionSheet\(\);[\s\S]*closeChartTapMenu\(\);[\s\S]*setTimeframePickerVisible\(true\)/);
  assert.doesNotMatch(timeframeHandlerSource, /showActionIcons:\s*true/);
  assert.doesNotMatch(timeframeHandlerSource, /showChartActionSheet|presentation:\s*'mt5Plain'|presentation:\s*'mt5TimeframeGrid'|detent:\s*'adaptive'/);
  assert.match(source, /<ChartTimeframePickerOverlay[\s\S]*visible=\{timeframePickerVisible\}[\s\S]*supportedTimeframes=\{timeframes\}[\s\S]*onClose=\{handleCloseTimeframePicker\}[\s\S]*onSelect=\{handleTimeframeSelect\}/);
  assert.match(source, /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*instantOpen:\s*true[\s\S]*actions: drawingToolsActions/);
  assert.doesNotMatch(source, /title:\s*t\('Drawing Tools'\)[\s\S]*presentation:\s*'mt5Plain'/);
  assert.doesNotMatch(drawingSource, /title="Drawing Tools"/);
  assert.match(drawingSource, /presentation="mt5Plain"[\s\S]*showActionIcons[\s\S]*actions=\{createDrawingToolsActionSheetActions/);
  assert.match(drawingTypesSource, /icon\?: ReactNode/);
  assert.match(drawingToolsSource, /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*icon: definition\.renderIcon\(iconColor\)/);
  assert.match(drawingToolsSource, /historyCommands\.map\(\(definition\) => \(\{[\s\S]*icon: definition\.renderIcon\(definition\.danger \? dangerIconColor : iconColor\)/);
  assert.match(source, /title: t\('Chart Type'\)[\s\S]*instantOpen:\s*true[\s\S]*actions: chartTypePickerActions/);
  assert.match(source, /runImmediateAction\('chart\.moreMenu\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*presentation:\s*'mt5Plain'[\s\S]*showActionIcons:\s*true[\s\S]*instantOpen:\s*true[\s\S]*actions: chartMoreActions/);
  assert.doesNotMatch(source, /label: t\(isVerticalScrollingLocked \? 'Unlock Vertical Scrolling' : 'Lock Vertical Scrolling'\)[\s\S]*onPress: handleToggleVerticalScrollingLock/);
  assert.match(source, /const handleToggleVerticalScrollingLock = \(\) => \{[\s\S]*setChartVerticalScrollingLocked\(next\)[\s\S]*setVerticalScrollingLocked\(\$\{next\}\)/);
  assert.match(source, /setVerticalScrollingLocked\(\$\{isVerticalScrollingLocked\}\)/);
  assert.match(source, /<ChartTapRadialMenu[\s\S]*onOpenScaleControls=\{handleOpenChartScaleMenu\}/);
  assert.match(radialSource, /accessibilityLabel: `\$\{t\('Chart'\)\} \$\{t\('Options'\)\}`[\s\S]*onPress: onOpenScaleControls[\s\S]*<Ionicons name="options-outline"/);
  assert.match(radialSource, /const CHART_TAP_ACTION_HIT_SLOP = \{ top: 14, bottom: 14, left: 14, right: 14 \} as const/);
  assert.match(radialSource, /const handleActionItemPress = React\.useCallback\(\(event: any, onPress: \(\) => void\) => \{[\s\S]*event\.stopPropagation\?\.\(\);[\s\S]*onPress\(\);[\s\S]*\}, \[\]\)/);
  assert.match(radialSource, /onPress=\{\(event\) => handleActionItemPress\(event, item\.onPress\)\}[\s\S]*activateOnPressIn[\s\S]*hitSlop=\{CHART_TAP_ACTION_HIT_SLOP\}/);
  assert.match(source, /const handleToggleOneClickPanelAtBottom = \(\) => \{[\s\S]*setChartOneClickPanelAtBottom\(!chartOneClickPanelAtBottom\)/);
  assert.match(source, /const handleToggleChartDisplayAction = useCallback\([\s\S]*setChartDisplaySetting\(key, next\)[\s\S]*setChartShowOnChartItem\(linkedShowOnChartKey, next\)/);
  assert.match(source, /const chartScaleActions = useMemo\([\s\S]*label: t\('Scroll to last bar'\)[\s\S]*label: t\('Reset vertical scale'\)[\s\S]*label: t\('Auto-scale'\)[\s\S]*label: t\('Vertical movement'\)[\s\S]*label: t\('One Click panel at the bottom'\)[\s\S]*CHART_SCALE_DISPLAY_ITEMS\.map/);
  assert.match(source, /label: t\('Auto-scale'\)[\s\S]*muted: isChartAutoScaleEnabled[\s\S]*onPress: handleToggleChartAutoScale/);
  assert.match(source, /label: t\('Vertical movement'\)[\s\S]*muted: !isVerticalScrollingLocked[\s\S]*onPress: handleToggleVerticalScrollingLock/);
  assert.match(source, /label: t\('One Click panel at the bottom'\)[\s\S]*muted: chartOneClickPanelAtBottom[\s\S]*onPress: handleToggleOneClickPanelAtBottom/);
  assert.match(source, /label: t\(item\.label\)[\s\S]*muted: enabled[\s\S]*onPress: \(\) => handleToggleChartDisplayAction\(item\.key\)/);
  assert.doesNotMatch(source, /label: t\([^)]*Disable/);
  assert.doesNotMatch(source, /subtitle: t\(.*(?:On|Off)/);
  assert.doesNotMatch(source, /label: t\(isChartAutoScaleEnabled \? 'Free chart movement' : 'Auto-scale'\)[\s\S]*selected: isChartAutoScaleEnabled/);
  assert.doesNotMatch(source, /label: t\(isVerticalScrollingLocked \? 'Unlock vertical scrolling' : 'Lock vertical scrolling'\)[\s\S]*selected: isVerticalScrollingLocked/);
  assert.match(source, /runImmediateAction\('chart\.radial\.scaleMenu\.open'[\s\S]*showChartActionSheet\(\{[\s\S]*title: t\('Chart settings'\)[\s\S]*titleAlign: 'center'[\s\S]*presentation: 'mt5Plain'[\s\S]*showActionIcons: true[\s\S]*detent: 'auto'[\s\S]*actions: chartScaleActions/);
  assert.doesNotMatch(radialSource, /const scaleActionItems/);
  assert.match(source, /const handleToggleChartAutoScale = \(\) => \{[\s\S]*setChartAutoScaleEnabled\(next\)[\s\S]*setChartAutoScaleEnabled\(\$\{next\}\)/);
  assert.match(source, /setChartAutoScaleEnabled\(\$\{isChartAutoScaleEnabled\}\)/);
  assert.match(uiStateSource, /pendingChartCommand: PendingChartCommand \| null[\s\S]*queueChartCommand: \(command: PendingChartCommand\) => void[\s\S]*clearPendingChartCommand: \(\) => void/);
  assert.match(chartSettingsSource, /const CHART_SETTINGS_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showOHLC'[\s\S]*label: 'Show OHLC'[\s\S]*key: 'showQuickTradingButtons'[\s\S]*label: 'Show quick trading buttons'[\s\S]*key: 'showLivePriceLine'[\s\S]*label: 'Show live price line'[\s\S]*key: 'showLastPriceLine'[\s\S]*label: 'Show last price line'[\s\S]*key: 'showGrid'[\s\S]*label: 'Show grid'[\s\S]*key: 'showObjectDescriptions'[\s\S]*label: 'Show object descriptions'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.doesNotMatch(chartSettingsSource, /label: 'Show bid price line'|label: 'Show ask price line'/);
  assert.match(chartSettingsSource, /const CHART_DISPLAY_TO_SHOW_ON_CHART_KEY:[\s\S]*showTradeLevels: 'slTpLevels'/);
  assert.match(chartSettingsSource, /title="Scroll to last bar"[\s\S]*handleRunChartCommand\('scrollToLastBar'\)[\s\S]*title="Reset vertical scale"[\s\S]*handleRunChartCommand\('resetVerticalScale'\)[\s\S]*title="Auto-scale"[\s\S]*enabled=\{chartAutoScaleEnabled\}[\s\S]*title="Vertical movement"[\s\S]*enabled=\{!chartVerticalScrollingLocked\}[\s\S]*onValueChange=\{handleToggleChartVerticalMovement\}/);
  assert.match(chartSettingsSource, /title="One Click panel at the bottom"[\s\S]*enabled=\{chartOneClickPanelAtBottom\}[\s\S]*onValueChange=\{setChartOneClickPanelAtBottom\}/);
  assert.match(chartSettingsSource, /CHART_SETTINGS_DISPLAY_ITEMS\.map\(\(item\) =>[\s\S]*title=\{item\.label\}[\s\S]*enabled=\{getChartDisplaySettingEnabled\(item\.key\)\}[\s\S]*onValueChange=\{\(value\) => handleToggleChartDisplaySetting\(item\.key, value\)\}/);
  assert.match(chartSettingsSource, /handleToggleChartDisplaySetting[\s\S]*setChartDisplaySetting\(key, value\)[\s\S]*setChartShowOnChartItem\(linkedShowOnChartKey, value\)/);
  assert.match(chartSettingsSource, />SHOW ON CHART<[\s\S]*label="Price Alerts"[\s\S]*router\.push\('\/chart\/alerts'\)/);
  assert.doesNotMatch(chartSettingsSource, /label="Order of menu items"|>NAVIGATION<|\/chart\/menu-order/);
  assert.match(chartMenuOrderSource, /export function ChartMenuOrderScreen/);
  assert.match(chartMenuOrderSource, /safeRouterBack\(router, '\/\(tabs\)\/chart'\)/);
  assert.doesNotMatch(chartMenuOrderSource, /QUICK_ACCESS|OTHER|Only 3 items can be placed|Price Alerts|Maximise|Add to favorites|Trading calculator|Analytics|Specification/);
  assert.doesNotMatch(source, /const chartPriceScaleActions = useMemo\(/);
  assert.doesNotMatch(source, /runImmediateAction\('chart\.priceScaleMenu\.open'/);
  assert.doesNotMatch(source, /style=\{styles\.chartPriceScaleMenuButton\}/);
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
    /const prefetchSymbolPickerHistory = useCallback\([\s\S]*slice\(0, CHART_SYMBOL_PICKER_PREFETCH_LIMIT\)[\s\S]*prefetchChartTimeframeHistory\(targetSymbol, chartTimeframe\)/,
  );
  assert.match(
    source,
    /showChartActionSheet\(\{[\s\S]*title: t\('Select Symbol'\)[\s\S]*actions: symbolPickerActions[\s\S]*\}\);[\s\S]*scheduleChartActionSheetContextReset\(\);[\s\S]*prefetchSymbolPickerHistory\(\);/,
  );
  assert.match(
    source,
    /const refreshSelectedChartHistory = useCallback\([\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/,
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
  assert.match(source, /accessibilityLabel="Chart settings"[\s\S]*onPress=\{handleOpenSettingsScreen\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenMoreMenu\}[\s\S]*activateOnPressIn/);
  assert.match(source, /onPress=\{handleOpenChartExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(timeframeTextStyle, /color:\s*TEXT_MUTED/);
  assert.doesNotMatch(timeframeTextStyle, /color:\s*BLUE/);
  assert.match(toolbarTradeTextStyle, /color:\s*TEXT_MUTED/);
  assert.doesNotMatch(toolbarTradeTextStyle, /color:\s*BLUE/);
  assert.match(tradeFeatureSource, /onPress=\{handlers\.onOpenExpirationMenu\}[\s\S]*activateOnPressIn/);
  assert.match(menuSource, /onPressIn=\{onPress\}/);
  assert.match(drawingSource, /onPress=\{onPress\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
});
