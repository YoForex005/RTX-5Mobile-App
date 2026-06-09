import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const isActiveSourceFile = (path: string) =>
  !/\.test\./.test(path) &&
  !/SettingsScreen_old\.tsx$|SettingsScreen_restore\.tsx$/.test(path) &&
  !/(^|\/)(tmp_|old_)/.test(path);
const walkSourceFiles = (root: string): string[] => {
  const absoluteRoot = resolve(process.cwd(), root);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(absoluteRoot, entry);
    const relativePath = `${root}/${entry}`;
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(relativePath));
    } else if (entry.endsWith('.tsx')) {
      files.push(relativePath);
    }
  }

  return files;
};

const findJsxTagEnd = (source: string, start: number): number => {
  let quote: string | null = null;
  let braceDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (char === '>' && braceDepth === 0) return index;
  }

  return -1;
};

const isJsxOpeningTag = (source: string, index: number, tag: string) => {
  const next = source[index + tag.length + 1];
  const previous = source[index - 1] ?? '\n';
  return (
    (next === ' ' || next === '\n' || next === '\r' || next === '\t' || next === '>') &&
    !/[A-Za-z0-9_$]/.test(previous)
  );
};

const lineNumberAt = (source: string, index: number) => source.slice(0, index).split(/\r?\n/).length;

const collectScrollResponderIssues = (file: string, source: string) => {
  const issues: string[] = [];

  for (const tag of ['ScrollView', 'FlatList', 'SectionList']) {
    let index = 0;
    while ((index = source.indexOf(`<${tag}`, index)) !== -1) {
      if (!isJsxOpeningTag(source, index, tag)) {
        index += tag.length + 1;
        continue;
      }

      const end = findJsxTagEnd(source, index);
      if (end < 0) break;

      const tagSource = source.slice(index, end);
      const line = lineNumberAt(source, index);
      if (!/\bkeyboardShouldPersistTaps=/.test(tagSource)) {
        issues.push(`${file}:${line} ${tag} is missing keyboardShouldPersistTaps="always"`);
      } else if (!/\bkeyboardShouldPersistTaps=(?:"always"|'always'|\{["']always["']\})/.test(tagSource)) {
        issues.push(`${file}:${line} ${tag} must use keyboardShouldPersistTaps="always"`);
      }

      const isHorizontal = /\bhorizontal\b(?:=\{true\})?/.test(tagSource);
      // Accept either the legacy Android-only optimization `={false}` OR
      // the Platform-aware form `={Platform.OS === 'ios'}` which keeps the
      // Android latency win while letting iOS use its default scroll-takeover
      // behavior (otherwise iOS scroll locks when a finger lands on any
      // Pressable child).
      const hasOptimization = /\bcanCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/.test(tagSource);
      if (tag === 'ScrollView' && !isHorizontal && !hasOptimization) {
        issues.push(`${file}:${line} vertical ScrollView is missing canCancelContentTouches={false} or canCancelContentTouches={Platform.OS === 'ios'}`);
      }

      index = end + 1;
    }
  }

  return issues;
};

test('shared press action budget is capped without touch-down activation by default', () => {
  const latencySource = readSource('src/utils/actionLatency.ts');
  const fastPressSource = readSource('src/ui/components/FastPressable.tsx');

  assert.match(latencySource, /export const APP_ACTION_MAX_LATENCY_MS = 20/);
  assert.match(latencySource, /export const FAST_PRESS_GUARD_RESET_MS = 120/);
  assert.match(latencySource, /requestAnimationFrame/);
  assert.match(latencySource, /first frame took/);
  assert.match(latencySource, /const STALE_ACTION_LATENCY_SAMPLE_MS = 5000/);
  assert.match(latencySource, /if \(elapsedMs > STALE_ACTION_LATENCY_SAMPLE_MS\) \{/);
  assert.match(latencySource, /export function runImmediateAction/);
  assert.match(latencySource, /export const CRITICAL_TRADE_ACTION_MAX_LATENCY_MS = 10/);
  assert.match(latencySource, /export function runCriticalTradeAction/);
  assert.match(latencySource, /scheduleActionLatencyCheck\(label, startedAtMs, budgetMs\)/);
  assert.match(fastPressSource, /from 'react-native'/);
  assert.match(fastPressSource, /latencyBudgetMs\?: number/);
  assert.match(fastPressSource, /activateOnPressIn\?: boolean/);
  assert.match(fastPressSource, /activateOnTouchStart\?: boolean/);
  assert.match(fastPressSource, /activateOnPressIn = false/);
  assert.match(fastPressSource, /activateOnTouchStart = false/);
  assert.match(fastPressSource, /const DEFAULT_HIT_SLOP = \{ top: 6, bottom: 6, left: 6, right: 6 \} as const/);
  assert.match(fastPressSource, /const DEFAULT_PRESS_RETENTION_OFFSET = \{ top: 20, bottom: 20, left: 20, right: 20 \} as const/);
  assert.match(fastPressSource, /const needsPressInHandler = activateOnPressIn \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsPressHandler = Boolean\(onPress\) \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsTouchStartHandler = activateOnTouchStart \|\| Boolean\(onTouchStart\)/);
  assert.match(fastPressSource, /const needsPressOutHandler = Boolean\(onPressOut\) \|\| activateOnPressIn \|\| activateOnTouchStart \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /onPressIn=\{needsPressInHandler \? handlePressIn : undefined\}/);
  assert.match(fastPressSource, /onPress=\{needsPressHandler \? handlePress : undefined\}/);
  assert.match(fastPressSource, /onPressOut=\{needsPressOutHandler \? handlePressOut : undefined\}/);
  assert.match(fastPressSource, /onStartShouldSetResponder=\{onStartShouldSetResponder \? handleStartShouldSetResponder : undefined\}/);
  assert.match(fastPressSource, /onResponderGrant=\{onResponderGrant \? handleResponderGrant : undefined\}/);
  assert.match(fastPressSource, /onTouchStart=\{needsTouchStartHandler \? handleTouchStart : undefined\}/);
  assert.match(fastPressSource, /hitSlop=\{hitSlop \?\? DEFAULT_HIT_SLOP\}/);
  assert.match(fastPressSource, /pressRetentionOffset=\{pressRetentionOffset \?\? DEFAULT_PRESS_RETENTION_OFFSET\}/);
  assert.match(fastPressSource, /unstable_pressDelay=\{unstable_pressDelay \?\? 0\}/);
  assert.match(fastPressSource, /android_disableSound=\{props\.android_disableSound \?\? true\}/);
  assert.match(fastPressSource, /handledOnPressInRef\.current = true;\s*if \(onPress !== onPressIn\) \{\s*runPressAction\(onPress, event\);\s*\}/);
  assert.match(fastPressSource, /const handleStartShouldSetResponder = useCallback/);
  assert.match(fastPressSource, /return Boolean\(onStartShouldSetResponder\?\.\(event\)\)/);
  assert.match(fastPressSource, /const deliveredExplicitPressInRef = React\.useRef\(false\)/);
  assert.match(fastPressSource, /if \(onPressIn && \(!pressAlreadyHandled \|\| onPressIn !== onPress\)\) \{\s*deliveredExplicitPressInRef\.current = true;\s*runPressAction\(onPressIn, event\);\s*\}/);
  assert.match(fastPressSource, /if \(activateOnPressIn && onPress && !pressAlreadyHandled\) \{/);
  assert.match(fastPressSource, /if \(activateOnTouchStart && onPress && !pressAlreadyHandled\) \{/);
  assert.match(fastPressSource, /if \(onPress !== onPressIn\) \{/);
  assert.match(fastPressSource, /if \(onPressIn && !deliveredExplicitPressInRef\.current\) \{\s*runPressAction\(onPressIn, event\);\s*\}/);
  assert.match(fastPressSource, /cancelled gestures that never emit onPress/);
  assert.match(fastPressSource, /scheduleActionLatencyCheck\(latencyLabel, startedAtMs, latencyBudgetMs\)/);
  assert.doesNotMatch(fastPressSource, /const pressAction = onPress \?\? onPressIn/);
  assert.doesNotMatch(fastPressSource, /markPressHandledOnTouchDown/);
  assert.doesNotMatch(fastPressSource, /onStartShouldSetResponder=\{activateOnPressIn/);
  assert.doesNotMatch(fastPressSource, /onResponderGrant=\{activateOnPressIn/);
  assert.doesNotMatch(fastPressSource, /onTouchStart=\{activateOnPressIn/);
});

test('screen and shared UI pressables use the immediate fast press component', () => {
  const files = [
    ...walkSourceFiles('app'),
    ...walkSourceFiles('src/features'),
    ...walkSourceFiles('src/ui/components'),
  ].filter((file) => file !== 'src/ui/components/FastPressable.tsx');

  for (const file of files) {
    const source = readSource(file);
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from 'react-native'/,
      `${file} must use FastPressable for Pressable actions`,
    );
  }
});

test('buy and sell actions use the stricter critical trade budget', () => {
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const symbolDetailsSource = readSource('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx');
  const chartWebSource = readSource('src/features/chart/ChartScreen.web.tsx');
  const chartTradeHandlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');

  assert.match(ticketSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS, runImmediateAction \} from '..\/..\/utils\/actionLatency'/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.sell"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.buy"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.sell'/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.buy'/);
  assert.match(chartTradeHandlerSource, /runCriticalTradeAction\(`chart\.\$\{variant\}\.trade\.\$\{side\}`/);
});

test('chart trade one-click and ticket paths keep heavy work out of the tap paint', () => {
  const ordersSource = readSource('src/query/orders.ts');
  const chartTradeHandlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const oneClickStart = chartTradeHandlerSource.indexOf('if (oneClickAccepted) {');
  const ticketPathStart = chartTradeHandlerSource.indexOf("logChartTradeDiagnostic('[Trade] navigate path", oneClickStart);
  assert.notEqual(oneClickStart, -1);
  assert.notEqual(ticketPathStart, -1);
  const oneClickSource = chartTradeHandlerSource.slice(oneClickStart, ticketPathStart);

  assert.match(ordersSource, /const TRADE_POST_SUCCESS_REFRESH_DELAY_MS = 250/);
  assert.match(ordersSource, /export const usePlaceOrderExecutor = \(\) => \{/);
  assert.match(ordersSource, /submitPlaceOrderWithCacheUpdate\(queryClient, payload\)/);
  assert.match(ordersSource, /const scheduleTradePostSuccessRefresh = \(work: \(\) => void\) => \{[\s\S]*setTimeout\(work, TRADE_POST_SUCCESS_REFRESH_DELAY_MS\)/);
  assert.match(
    ordersSource,
    /state\.upsertPosition\(newPos\);[\s\S]*scheduleTradePostSuccessRefresh\(\(\) => \{[\s\S]*refreshPositions\(mt5Login\)[\s\S]*queryClient\.invalidateQueries\(\{ queryKey: \['positions'\] \}\)/,
  );
  assert.match(chartTradeHandlerSource, /const chartTradeActionDisabled = !isCurrentChartSymbol;/);
  assert.match(chartTradeHandlerSource, /import \{ usePlaceOrderExecutor \} from '..\/..\/..\/..\/query\/orders'/);
  assert.match(chartTradeHandlerSource, /import \{ getApiLatencyNow \} from '..\/..\/..\/..\/utils\/apiLatency'/);
  assert.match(chartTradeHandlerSource, /const placeOrder = usePlaceOrderExecutor\(\);/);
  assert.match(chartTradeHandlerSource, /const CHART_TRADE_QUEUE_LIMIT = 10/);
  assert.match(chartTradeHandlerSource, /type QueuedChartTrade = \{/);
  assert.match(chartTradeHandlerSource, /const tradeQueueRef = React\.useRef<QueuedChartTrade\[\]>\(\[\]\);/);
  assert.match(chartTradeHandlerSource, /function processNextQueuedTrade\(\) \{[\s\S]*placeOrder\(payload,/);
  assert.match(chartTradeHandlerSource, /queueWaitMs/);
  assert.match(chartTradeHandlerSource, /backendMs/);
  assert.match(chartTradeHandlerSource, /title: 'Trade Queue Full'/);
  assert.match(oneClickSource, /tradeQueueRef\.current\.push\(queuedTrade\);[\s\S]*processNextQueuedTrade\(\);/);
  assert.match(chartTradeHandlerSource, /const isChartTradeActionBusy = \(side: TradeSide\) => activeSide === side && tradeTapLockRef\.current;/);
  assert.match(
    chartTradeHandlerSource,
    /const runAfterChartTradeTapPaint = \(work: \(\) => void\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(work, 0\)/,
  );
  assert.match(
    chartTradeHandlerSource,
    /\} else \{[\s\S]*runAfterChartTradeTapPaint\(\(\) => \{[\s\S]*router\.push\(\{[\s\S]*pathname: '\/trade\/order-ticket'/,
  );
  assert.doesNotMatch(chartTradeHandlerSource, /if \(tradeTapLockRef\.current \|\| sharedLockSide !== null\)/);
  assert.doesNotMatch(oneClickSource, /placeOrder\(payload,/);
  assert.doesNotMatch(oneClickSource, /releaseTradeTapLock\(CHART_TRADE_TAP_RELEASE_DELAY_MS\)/);
  assert.doesNotMatch(chartTradeHandlerSource, /isPending/);
  assert.doesNotMatch(chartTradeHandlerSource, /usePlaceOrderMutation/);
});

test('trade success feedback uses compact strips without device vibration', () => {
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const feedbackModalSource = readSource('src/ui/components/TradeFeedbackModal.tsx');

  assert.doesNotMatch(ticketSource, /\bVibration\b|\.vibrate\(/);
  assert.doesNotMatch(feedbackModalSource, /\bVibration\b|\.vibrate\(/);
  assert.match(ticketSource, /without device vibration/);
  assert.match(ticketSource, /const \[tradeConfirmations, setTradeConfirmations\] = useState<OrderTicketTradeConfirmation\[\]>/);
  assert.match(ticketSource, /showTradeConfirmation\(\{ side: requestedSide, symbol, volume \}\)/);
  assert.match(ticketSource, /showTradeConfirmation\(\{ side: pendingSideValue, symbol, volume \}\)/);
  assert.match(ticketSource, /Error modal overlay for rejected order feedback/);
  assert.doesNotMatch(ticketSource, /showModal\(\{\s*visible:\s*true,\s*type:\s*'success'/);
});

test('action destination routes are warmed in non-blocking batches', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_SIZE = 8/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 16/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS = 0/);
  assert.match(warmupSource, /requestAnimationFrame/);
  assert.match(warmupSource, /\/quotes/);
  assert.match(warmupSource, /\/chart/);
  assert.match(warmupSource, /\/trade/);
  assert.match(warmupSource, /\/history/);
  assert.match(warmupSource, /\/settings/);
  assert.match(warmupSource, /\/settings\/news/);
  assert.match(warmupSource, /\/settings\/user-guide/);
  assert.match(warmupSource, /\/settings\/help/);
  assert.match(warmupSource, /\/settings\/about/);
  assert.match(warmupSource, /\/trade\/order-ticket/);
  assert.match(warmupSource, /\/history\/filter/);
  assert.match(warmupSource, /\/chart\/objects/);
  assert.match(tabsSource, /import \{ warmActionRoutes \} from '..\/..\/src\/utils\/actionRouteWarmup'/);
  assert.match(tabsSource, /useEffect\(\(\) => warmActionRoutes\(router\), \[router\]\)/);
  assert.match(tabsSource, /lazy: false/);
  assert.doesNotMatch(tabsSource, /lazy: true/);
});

test('global action sheet actions avoid selecting rows while scrolling', () => {
  const source = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const dismissSource = readSource('src/ui/components/ActionSheet/dismissTimer.ts');
  const uiStateSource = readSource('src/state/uiState.ts');

  assert.match(source, /import \{ FastPressable \} from '\.\.\/FastPressable'/);
  assert.match(source, /BackHandler/);
  assert.match(source, /FlatList/);
  assert.match(source, /latencyLabel=\{`actionSheet\.\$\{action\.label\}`\}/);
  assert.match(source, /runActionAfterClose = true/);
  assert.match(source, /activeConfig\.runActionAfterClose \?\? false/);
  assert.match(source, /const ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_FAST_OPEN_OVERLAY_DURATION_MS = 0/);
  assert.match(source, /const ACTION_SHEET_FAST_OPEN_SHEET_DURATION_MS = 0/);
  assert.match(source, /const ACTION_SHEET_INLINE_ACTION_LIMIT = 12/);
  assert.match(source, /const shouldRenderInlineActions =[\s\S]*!activeSearchable[\s\S]*filteredActions\.length <= ACTION_SHEET_INLINE_ACTION_LIMIT[\s\S]*estimatedActionsHeight <= actionsMaxHeight/);
  assert.match(source, /const inlineActionRows = useMemo/);
  assert.match(source, /shouldRenderInlineActions \? \(/);
  assert.match(source, /const isFast = mode === 'fast'/);
  assert.match(source, /duration: isFast \? 60 : ACTION_SHEET_OPEN_OVERLAY_DURATION_MS/);
  assert.match(source, /duration: isFast \? 80 : ACTION_SHEET_OPEN_SHEET_DURATION_MS/);
  assert.match(source, /if \(activeInstantOpen\) \{[\s\S]*sheetTranslateY\.setValue\(80\);/);
  assert.match(source, /const ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX = 10/);
  assert.match(source, /type ActionSheetPressGesture = \{[\s\S]*start: ActionSheetPressPoint \| null;[\s\S]*cancelled: boolean;[\s\S]*\}/);
  assert.match(source, /const actionPressGestureRef = useRef<ActionSheetPressGesture>\(\{[\s\S]*start: null,[\s\S]*cancelled: false,[\s\S]*\}\)/);
  assert.match(source, /const recordActionRowPressStart = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*start: getActionSheetPressPoint\(event\),[\s\S]*cancelled: false/);
  assert.match(source, /const cancelActionRowPressForScroll = useCallback\(\(\) => \{[\s\S]*cancelled: true/);
  assert.match(source, /const recordActionRowPressMove = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*hasActionSheetPressMovedBeyondThreshold\(gesture\.start, getActionSheetPressPoint\(event\)\)[\s\S]*cancelled: true/);
  assert.match(source, /const handleActionRowPress = useCallback\(\(actionPress\?: \(\) => void\) => \{[\s\S]*if \(gesture\.cancelled\) \{[\s\S]*return;[\s\S]*\}[\s\S]*handleActionPress\(actionPress\)/);
  assert.match(source, /onPressIn=\{recordActionRowPressStart\}/);
  assert.match(source, /onTouchMove=\{recordActionRowPressMove\}/);
  assert.match(source, /onPress=\{action\.disabled \? undefined : \(\) => handleActionRowPress\(action\.onPress\)\}/);
  assert.match(source, /onScrollBeginDrag=\{cancelActionRowPressForScroll\}/);
  assert.match(source, /onMomentumScrollBegin=\{cancelActionRowPressForScroll\}/);
  const rowSourceStart = source.indexOf('const renderActionRow = useCallback');
  const rowSourceEnd = source.indexOf('const renderAction = useCallback', rowSourceStart);
  const rowSource = source.slice(rowSourceStart, rowSourceEnd);
  assert.doesNotMatch(rowSource, /activateOnPressIn/);
  assert.match(source, /latencyLabel="actionSheet\.cancel"/);
  assert.match(source, /latencyLabel="actionSheet\.dismissOverlay"/);
  assert.match(source, /style=\{\[StyleSheet\.absoluteFillObject, styles\.backdrop\]\}/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /const ACTION_SHEET_KEEP_HOST_MOUNTED = true/);
  assert.match(source, /const hasIncomingConfig =[\s\S]*actions\.length > 0/);
  assert.match(source, /data=\{filteredActions\}/);
  assert.match(source, /initialNumToRender=\{initialActionRowsToRender\}/);
  assert.match(source, /maxToRenderPerBatch=\{12\}/);
  assert.match(source, /windowSize=\{5\}/);
  assert.match(source, /removeClippedSubviews=\{Platform\.OS === 'android'\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /pointerEvents="box-none"/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.match(uiStateSource, /showActionSheet: \(config\) => set\(\{ actionSheet: \{ \.\.\.config, instantOpen: true \} \}\)/);
  assert.match(dismissSource, /const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 1/);
});

test('bottom-sheet style dropdowns avoid native slide animations on open', () => {
  const bottomSheetFiles = [
    'src/features/settings/MailboxScreen.tsx',
    'src/features/settings/Mql5AlgoTradingScreen.tsx',
    'src/features/chart/ChartColorsScreen.tsx',
    'src/features/settings/ChartPropertiesScreen.tsx',
  ];

  for (const file of bottomSheetFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /animationType=["']slide["']/, `${file} must not use native slide animation for bottom sheets`);
  }
});

test('shared scroll containers keep taps active while keyboard or scroll responders are present', () => {
  const screenSource = readSource('src/ui/components/Screen.tsx');
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');
  const files = [
    ...walkSourceFiles('app'),
    ...walkSourceFiles('src/features'),
    ...walkSourceFiles('src/ui/components'),
  ].filter(isActiveSourceFile);

  const canCancelPattern = /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/;
  assert.match(screenSource, /keyboardShouldPersistTaps="always"/);
  assert.match(screenSource, canCancelPattern);
  assert.match(actionSheetSource, /keyboardShouldPersistTaps="always"/);
  assert.match(actionSheetSource, canCancelPattern);
  assert.match(sidebarSource, /keyboardShouldPersistTaps="always"/);
  assert.match(sidebarSource, canCancelPattern);
  for (const file of files) {
    const source = readSource(file);
    assert.doesNotMatch(
      source,
      /keyboardShouldPersistTaps=\{?['"]handled['"]\}?/,
      `${file} must keep taps active instead of swallowing the first tap while keyboard is open`,
    );
  }

  const scrollResponderIssues = files.flatMap((file) => collectScrollResponderIssues(file, readSource(file)));
  assert.deepEqual(scrollResponderIssues, []);
});

test('settings navigation surfaces keep scrollable rows release-confirmed', () => {
  const rowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const backBarSource = readSource('src/features/settings/SettingsBackBar.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const registerSource = readSource('app/register.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokersSource = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const accountCardStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/settings/accounts')}");
  const metricsRowStart = settingsSource.indexOf('<View style={styles.metricsRow}', accountCardStart);
  const registerRowStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/register')}");
  const lowerSettingsStart = settingsSource.indexOf('{lowerSettingsReady ? (', registerRowStart);

  assert.match(rowSource, /<FastPressable[\s\S]*latencyLabel=\{`settings\.row\.\$\{title\}`\}[\s\S]*onPress=\{onPress\}/);
  assert.match(rowSource, /activateOnPressIn\?: boolean/);
  assert.match(rowSource, /activateOnPressIn=\{activateOnPressIn\}/);
  assert.doesNotMatch(rowSource, /activateOnTouchStart/);
  assert.match(rowSource, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(rowSource, /traceUiInteraction/);
  assert.notEqual(accountCardStart, -1);
  assert.notEqual(metricsRowStart, -1);
  assert.notEqual(registerRowStart, -1);
  assert.notEqual(lowerSettingsStart, -1);
  assert.doesNotMatch(settingsSource.slice(accountCardStart, metricsRowStart), /activateOnPressIn|activateOnTouchStart/);
  assert.doesNotMatch(settingsSource.slice(registerRowStart, lowerSettingsStart), /activateOnPressIn|activateOnTouchStart/);
  assert.match(backBarSource, /<FastPressable[\s\S]*router\.replace\('\/\(tabs\)\/settings'\)[\s\S]*activateOnPressIn[\s\S]*latencyLabel="settings\.back"/);
  assert.match(settingsSource, /const SETTINGS_LOWER_CONTENT_DELAY_MS = 80/);
  assert.match(settingsSource, /const SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/economic-calendar'[\s\S]*'\/settings\/journal'[\s\S]*'\/settings\/help'[\s\S]*\] as const/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/user-guide'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/otp'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/support'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/traders-community'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/mailbox'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/news'/);
  assert.match(settingsSource, /const openReadySettingsRoute = useCallback/);
  assert.match(settingsSource, /router\.replace\(routePath as any\)/);
  assert.match(settingsSource, /router\.push\(routePath as any\)/);
  assert.match(settingsSource, /latencyLabel="settings\.search\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.register\.open"/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/settings\/accounts'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/register'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.register\.open"/);
  assert.doesNotMatch(settingsSource, /title=\{t\('Mailbox'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/mailbox'\)\}/);
  assert.doesNotMatch(settingsSource, /title=\{t\('News'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/news'\)\}/);
  assert.match(settingsSource, /title=\{t\('Economic Calender'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/economic-calendar'\)\}/);
  assert.match(settingsSource, /title=\{t\('Support'\)\}[\s\S]*sub=\{supportEmail\}[\s\S]*onPress=\{handleEmailSupport\}/);
  assert.match(settingsSource, /title=\{t\('Help'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/help'\)\}/);
  assert.match(settingsSource, /latencyLabel="settings\.logout\.prompt"/);
  assert.doesNotMatch(settingsSource, /traceUiInteraction/);
  assert.match(accountsSource, /paddingLeft: 16/);
  assert.match(accountsSource, /marginLeft: 8/);
  assert.match(accountsSource, /showAccountsActionSheet\(\{[\s\S]*title: t\('Settings'\),[\s\S]*detent: 'auto'/);
  assert.match(accountsSource, /latencyLabel="accounts\.back"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(accountsSource, /latencyLabel="accounts\.connect\.open"/);
  assert.match(accountsSource, /latencyLabel="accounts\.options\.open"/);
  assert.doesNotMatch(accountsSource, /traceUiInteraction/);
  assert.match(brokersSource, /paddingLeft: 16/);
  assert.match(brokersSource, /gap: 8/);
  assert.match(brokersSource, /latencyLabel="brokers\.back"/);
  assert.doesNotMatch(brokersSource, /latencyLabel="brokers\.qr"/);
  assert.doesNotMatch(brokersSource, /qr-code-outline/);
  assert.match(brokersSource, /latencyLabel="brokers\.custom"/);
  assert.match(brokersSource, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(brokersSource, /pointerEvents="box-none"/);
  assert.match(brokersSource, /const BROKER_ROW_PRESS_CANCEL_MOVE_PX = 14/);
  assert.match(brokersSource, /type BrokerPressGesture = \{[\s\S]*start: BrokerPressPoint \| null;[\s\S]*handled: boolean;[\s\S]*cancelled: boolean;[\s\S]*\}/);
  assert.match(brokersSource, /const brokerPressGestureRef = useRef<BrokerPressGesture>\(\{[\s\S]*start: null,[\s\S]*handled: false,[\s\S]*cancelled: false,[\s\S]*\}\)/);
  assert.match(brokersSource, /function hasBrokerPressMovedBeyondThreshold\(start: BrokerPressPoint, end: BrokerPressPoint\)[\s\S]*BROKER_ROW_PRESS_CANCEL_MOVE_PX \* BROKER_ROW_PRESS_CANCEL_MOVE_PX/);
  assert.match(brokersSource, /const recordBrokerRowPressStart = \(event: GestureResponderEvent\) => \{[\s\S]*start: getBrokerPressPoint\(event\),[\s\S]*handled: false,[\s\S]*cancelled: false/);
  assert.match(brokersSource, /const cancelBrokerRowPressForScroll = \(\) => \{[\s\S]*cancelled: true/);
  assert.match(brokersSource, /const recordBrokerRowPressMove = \(event: GestureResponderEvent\) => \{[\s\S]*hasBrokerPressMovedBeyondThreshold\(gesture\.start, current\)[\s\S]*cancelBrokerRowPressForScroll\(\)/);
  assert.match(brokersSource, /const handleBrokerRowPress = \(broker: BrokerRow, event: GestureResponderEvent\) => \{[\s\S]*shouldIgnoreBrokerRowPress\(event\)[\s\S]*handleSelectBroker\(broker\)/);
  assert.match(brokersSource, /onScrollBeginDrag=\{cancelBrokerRowPressForScroll\}/);
  assert.match(brokersSource, /onMomentumScrollBegin=\{cancelBrokerRowPressForScroll\}/);
  const brokerRowsStart = brokersSource.indexOf('renderItem={({ item }) => (');
  const brokerRowsEnd = brokersSource.indexOf('ListEmptyComponent=', brokerRowsStart);
  assert.notEqual(brokerRowsStart, -1);
  assert.notEqual(brokerRowsEnd, -1);
  const brokerRowsSource = brokersSource.slice(brokerRowsStart, brokerRowsEnd);
  assert.equal((brokerRowsSource.match(/onPressIn=\{recordBrokerRowPressStart\}/g) ?? []).length, 1);
  assert.equal((brokerRowsSource.match(/onTouchMove=\{recordBrokerRowPressMove\}/g) ?? []).length, 1);
  assert.equal((brokerRowsSource.match(/onPress=\{\(event\) => handleBrokerRowPress\(item, event\)\}/g) ?? []).length, 1);
  assert.doesNotMatch(brokerRowsSource, /onPress=\{\(\) => handleSelectBroker\(item\)\}/);
  assert.match(brokerRowsSource, /latencyLabel=\{`brokers\.row\.\$\{item\.brokerId\}`\}/);
  assert.match(brokerRowsSource, /<View[\s\S]*style=\{styles\.selectBtn\}[\s\S]*pointerEvents="none"[\s\S]*<Ionicons name="chevron-forward"/);
  assert.doesNotMatch(brokerRowsSource, /latencyLabel=\{`brokers\.info\.\$\{item\.brokerId\}`\}/);
  assert.doesNotMatch(brokerRowsSource, /activateOnPressIn|activateOnTouchStart/);
  assert.doesNotMatch(brokersSource, /traceUiInteraction/);
  assert.match(brokerDetailSource, /paddingLeft: 16/);
  assert.match(brokerDetailSource, /gap: 8/);
  // Accent buttons accept either the theme token (T.accent) or the brand
  // blue (#2563EB) so the global color refresh doesn't break the contract.
  const accentColorPattern = `(?:T\\.accent|primaryBlue|['"]#2563EB['"])`;
  assert.match(registerSource, new RegExp(`registerBtn: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}[\\s\\S]*shadowColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`optionIconDemo: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`optionIconReal: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`loginBtn: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}[\\s\\S]*shadowColor: ${accentColorPattern}`));
  assert.doesNotMatch(brokerDetailSource, /MT5_BLUE_LIGHT/);
  assert.doesNotMatch(brokerDetailSource, /LOGIN_VIOLET/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.back"/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.login\.submit"/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.server\.open"/);
  assert.match(brokerDetailSource, /activateOnPressIn/);
  assert.doesNotMatch(brokerDetailSource, /traceUiInteraction/);
  assert.match(rootSource, /<FastPressable[\s\S]*activateOnPressIn[\s\S]*latencyLabel="stack\.back"/);
  assert.doesNotMatch(rootSource, /traceUiInteraction/);
});

test('trade ticket execution actions use the immediate fast press path', () => {
  const source = readSource('src/features/trade/OrderTicketScreen.tsx');

  assert.match(source, /latencyLabel="orderTicket\.back"/);
  assert.match(source, /latencyLabel="orderTicket\.symbol\.open"/);
  assert.match(source, /visible=\{symbolPickerOpen\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}/);
  assert.match(source, /latencyLabel="orderTicket\.pending\.submit"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.increment"/);
  assert.match(source, /latencyLabel="orderTicket\.sl\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.tp\.increment"/);
  assert.doesNotMatch(source, /livePill|liveDot|liveLabel/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('close position actions use the immediate trade path', () => {
  const rootSource = readSource('app/_layout.tsx');
  const overlaySource = readSource('src/ui/components/TradePositionRow/OverlayActions.tsx');
  const closePositionSource = readSource('src/features/trade/ClosePositionScreen.tsx');

  assert.match(rootSource, /<Stack\.Screen name='trade\/close-position' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(overlaySource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(overlaySource, /onPress=\{onClose\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="tradeRow\.closePosition\.open"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(closePositionSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(closePositionSource, /onPress=\{\(\) => \{ void handleClosePosition\(\); \}\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="closePosition\.submit"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
});

test('high-traffic tab screens keep fast actions off the old trace wrapper', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const chartSettingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');

  assert.match(quotesSource, /const hideActionSheet = useUIState\(\(s\) => s\.hideActionSheet\)/);
  assert.match(quotesSource, /const openAddSymbolModal = useCallback/);
  assert.match(quotesSource, /hideActionSheet\(\);\s*setShowAddModal\(true\)/);
  assert.match(quotesSource, /<Modal[\s\S]*visible=\{visible\}[\s\S]*animationType="none"/);
  assert.match(quotesSource, /onPress=\{openAddSymbolModal\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.addAsset\.open"/);
  assert.match(quotesSource, /animationType="none"/);
  assert.match(quotesSource, /latencyLabel="quotes\.addSymbol\.search\.clear"/);
  assert.match(quotesSource, /latencyLabel=\{`quotes\.addSymbol\.folder\.\$\{item\.key\}`\}/);
  assert.match(quotesSource, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(quotesSource, /onPress=\{toggleEditMode\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.editMode\.toggle"/);
  assert.match(quotesSource, /onPress=\{handleHeaderBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.addSymbol\.back"/);
  assert.match(quotesSource, /latencyLabel="quotes\.search\.clear"/);
  assert.doesNotMatch(quotesSource, /traceUiInteraction/);
  assert.match(historySource, /latencyLabel="history\.sort\.open"/);
  assert.match(historySource, /latencyLabel="history\.sort\.open"[\s\S]*activateOnTouchStart/);
  assert.match(historySource, /latencyLabel=\{`history\.tab\.\$\{item\}`\}/);
  assert.doesNotMatch(historySource, /traceUiInteraction/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.summary\.toggle"/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.bulk\.open"/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.bulk\.open"[\s\S]*activateOnTouchStart/);
  assert.doesNotMatch(tradeSummarySource, /traceUiInteraction/);
  assert.match(chartSettingsSource, /latencyLabel="chartSettings\.back"/);
  assert.match(chartSettingsSource, /latencyLabel=\{`chartSettings\.nav\.\$\{label\}`\}/);
  assert.doesNotMatch(chartSettingsSource, /traceUiInteraction/);
});

test('chart native and web hot actions use the shared immediate action guard', () => {
  const nativeChartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const webChartSource = readSource('src/features/chart/ChartScreen.web.tsx');

  assert.match(nativeChartSource, /import \{ runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.timeframePicker\.open'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.moreMenu\.open'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.tradeSheet\.pending\.editOnChart'/);
  assert.match(nativeChartSource, /onPress=\{handleOpenSymbolPicker\}[\s\S]*activateOnTouchStart/);
  assert.match(nativeChartSource, /onPress=\{handleOpenTimeframePicker\}[\s\S]*activateOnTouchStart/);
  assert.match(nativeChartSource, /onPress=\{handleOpenDrawingTools\}[\s\S]*activateOnTouchStart/);
  assert.match(nativeChartSource, /onPress=\{handleOpenMoreMenu\}[\s\S]*activateOnTouchStart/);
  assert.doesNotMatch(nativeChartSource, /traceUiInteraction/);
  assert.match(webChartSource, /import \{ runCriticalTradeAction, runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(webChartSource, /runImmediateAction\('chart\.web\.timeframePicker\.open'/);
  assert.match(webChartSource, /runImmediateAction\('chart\.web\.moreMenu\.open'/);
  assert.doesNotMatch(webChartSource, /traceUiInteraction/);
});

test('fast action surfaces keep light and dark theme styling wired', () => {
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const actionSheetStyles = readSource('src/ui/components/ActionSheet/styles.ts');
  const settingsStyles = readSource('src/features/settings/SettingsScreen/styles.ts');
  const orderTicketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(tabsSource, /backgroundColor: isDark \? '#040609' : '#ffffff'/);
  assert.match(tabsSource, /const themeMode = useThemeMode\(\)/);
  assert.doesNotMatch(tabsSource, /useDeferredThemeMode\(\)/);
  assert.match(actionSheetStyles, /makeActionSheetStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(actionSheetStyles, /backgroundColor: isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.match(settingsStyles, /makeSettingsStyles = \(T: ThemeColors, themeMode: 'light' \| 'dark'\)/);
  assert.match(settingsStyles, /const SETTINGS_DARK_BACKGROUND = '#000000'/);
  assert.match(settingsStyles, /const SETTINGS_DARK_CARD_BACKGROUND = '#0d1628'/);
  assert.match(settingsStyles, /const resolveSettingsBackground = \(T: ThemeColors, themeMode: 'light' \| 'dark'\) =>\s*themeMode === 'dark' \? SETTINGS_DARK_BACKGROUND : T\.bg/);
  assert.match(settingsStyles, /const resolveSettingsCardBackground = \(T: ThemeColors, themeMode: 'light' \| 'dark'\) =>\s*themeMode === 'dark' \? SETTINGS_DARK_CARD_BACKGROUND : T\.glass2/);
  assert.match(settingsStyles, /const settingsBackground = resolveSettingsBackground\(T, themeMode\)/);
  assert.match(settingsStyles, /const settingsCardBackground = resolveSettingsCardBackground\(T, themeMode\)/);
  assert.match(settingsStyles, /screen: \{ flex: 1, backgroundColor: settingsBackground \}/);
  assert.match(settingsStyles, /container: \{ flex: 1, backgroundColor: settingsBackground \}/);
  assert.match(settingsStyles, /headerWrap: \{[\s\S]*backgroundColor: settingsBackground/);
  assert.match(settingsStyles, /metricBlock: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /singleRowCard: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /singleRowCardLogout: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /groupCard: \{ backgroundColor: settingsCardBackground/);
  assert.match(orderTicketSource, /function makeStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(orderTicketSource, /root: \{ flex: 1, backgroundColor: BG \}/);
  assert.match(sidebarSource, /const themeMode = useThemeMode\(\)/);
  assert.match(sidebarSource, /const T = useMemo\(\(\) => \(themeMode === 'light' \? GLight : GDark\), \[themeMode\]\)/);
  assert.match(sidebarSource, /const isDark = themeMode === 'dark'/);
});

test('theme toggles acknowledge before persisted preference writes', () => {
  const storeSource = readSource('src/state/userPreferences/store.ts');
  const themeModeSource = readSource('src/state/themeMode.ts');
  const rootSource = readSource('app/_layout.tsx');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const settingRowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');

  assert.match(storeSource, /const pendingPreferenceWrites = new Map<string, StorageValue<PersistedUserPreferencesState>>\(\)/);
  assert.match(storeSource, /function schedulePreferenceWriteFlush\(\)/);
  assert.match(storeSource, /requestAnimationFrame/);
  assert.match(storeSource, /setTimeout\(flushPendingPreferenceWrites, 0\)/);
  assert.match(storeSource, /partialize: partializeUserPreferences/);
  assert.match(storeSource, /function scheduleThemeModePreferenceCommit\(commit: \(\) => void\)/);
  assert.match(storeSource, /setImmediateThemeMode\(mode\);[\s\S]*pendingThemeModeCommit = mode;[\s\S]*scheduleThemeModePreferenceCommit/);
  assert.match(storeSource, /set\(\{ themeMode: nextMode \}\);/);
  assert.doesNotMatch(storeSource, /if \(get\(\)\.themeMode === mode\) return;\s*set\(\{ themeMode: mode \}\);/);
  assert.doesNotMatch(storeSource, /createJSONStorage\(\(\) => AsyncStorage\)/);
  assert.match(themeModeSource, /export function useDeferredThemeMode\(delayMs = 750\): ThemeMode/);
  assert.match(themeModeSource, /NavigationContext, NavigationRouteContext/);
  assert.match(themeModeSource, /function useNavigationFocusState\(\): boolean/);
  assert.match(themeModeSource, /navigation\.addListener\('focus'/);
  assert.match(themeModeSource, /navigation\.addListener\('blur'/);
  assert.match(themeModeSource, /const frozenThemeModeRef = useRef\(useThemeModeState\.getState\(\)\.themeMode\)/);
  assert.match(themeModeSource, /isFocusedRef\.current \? state\.themeMode : frozenThemeModeRef\.current/);
  assert.match(themeModeSource, /useThemeModeState\.subscribe\(\(state, previousState\)/);
  assert.match(themeModeSource, /setTimeout\(\(\) => \{[\s\S]*setThemeMode\(state\.themeMode\);[\s\S]*\}, delayMs\)/);
  assert.match(readSource('src/ui/theme/useTheme.ts'), /const themeMode = useThemeMode\(\)/);
  assert.match(rootSource, /function AppStatusBar\(\)[\s\S]*const isDark = useIsDarkTheme\(\)/);
  assert.match(rootSource, /const navigationThemeMode = useDeferredThemeMode\(\)/);
  assert.doesNotMatch(rootSource, /function InnerLayout\(\) \{\s*const T = useTheme\(\)/);
  assert.match(tabsSource, /const themeMode = useThemeMode\(\)/);
  assert.match(tabsSource, /const isDark = themeMode === 'dark'/);
  assert.match(tabsSource, /const T = themeMode === 'light' \? GLight : GDark/);
  assert.doesNotMatch(tabsSource, /useDeferredThemeMode\(\)/);
  assert.doesNotMatch(tabsSource, /const T = useTheme\(\)/);
  assert.doesNotMatch(sidebarSource, /SIDEBAR_THEME_COMMIT_DELAY_MS/);
  assert.match(sidebarSource, /function SidebarThemeSelector\(\{ ds, T \}: SidebarThemeSelectorProps\)/);
  assert.match(sidebarSource, /<SidebarThemeSelector ds=\{ds\} T=\{T\} \/>/);
  assert.match(sidebarSource, /const selectedThemeMode = pendingThemeMode \?\? appliedThemeMode/);
  assert.match(sidebarSource, /const \[pendingThemeMode, setPendingThemeMode\] = useState<ThemeMode \| null>\(null\)/);
  assert.match(sidebarSource, /setPendingThemeMode\(nextMode\)/);
  assert.match(sidebarSource, /setThemeMode\(nextMode\)/);
  assert.doesNotMatch(sidebarSource, /requestAnimationFrame\(scheduleCommitTimer\)/);
  assert.doesNotMatch(sidebarSource, /setTimeout\(commitPendingThemeMode/);
  assert.match(sidebarSource, /onPress=\{\(\) => handleThemeModePress\('light'\)\}/);
  assert.match(sidebarSource, /onPress=\{\(\) => handleThemeModePress\('dark'\)\}/);
  assert.match(sidebarSource, /<Pressable[\s\S]*style=\{!selectedIsDark \? ds\.themeOptActive : ds\.themeOptInactive\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="sidebar\.themeLight"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(sidebarSource, /<Pressable[\s\S]*style=\{selectedIsDark \? ds\.themeOptActive : ds\.themeOptInactive\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="sidebar\.themeDark"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(settingsSource, /const toggleThemeMode = useCallback\(\(\) => \{\s*setThemeMode\(themeMode === 'light' \? 'dark' : 'light'\);/);
  assert.match(settingsSource, /const isThemeItem = item\.title === 'Theme'/);
  assert.match(settingsSource, /onPress=\{isThemeItem \? toggleThemeMode : item\.routePath \|\| item\.action \? \(\) => handleSearchResultPress\(item\) : undefined\}/);
  assert.match(settingsSource, /activateOnPressIn=\{isThemeItem\}/);
  assert.match(settingsSource, /title=\{t\('Theme'\)\}[\s\S]*onPress=\{toggleThemeMode\}[\s\S]*activateOnPressIn/);
  assert.match(settingsSource, /<View pointerEvents="none">[\s\S]*<Switch/);
  assert.match(settingRowSource, /activateOnPressIn\?: boolean/);
  assert.match(settingRowSource, /activateOnPressIn=\{activateOnPressIn\}/);
});
