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
      if (tag === 'ScrollView' && !isHorizontal && !/\bcanCancelContentTouches=\{false\}/.test(tagSource)) {
        issues.push(`${file}:${line} vertical ScrollView is missing canCancelContentTouches={false}`);
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
  assert.match(fastPressSource, /activateOnPressIn = false/);
  assert.match(fastPressSource, /const DEFAULT_HIT_SLOP = \{ top: 6, bottom: 6, left: 6, right: 6 \} as const/);
  assert.match(fastPressSource, /const DEFAULT_PRESS_RETENTION_OFFSET = \{ top: 20, bottom: 20, left: 20, right: 20 \} as const/);
  assert.match(fastPressSource, /const needsPressInHandler = activateOnPressIn \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsPressHandler = Boolean\(onPress\) \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsPressOutHandler = Boolean\(onPressOut\) \|\| activateOnPressIn \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /onPressIn=\{needsPressInHandler \? handlePressIn : undefined\}/);
  assert.match(fastPressSource, /onPress=\{needsPressHandler \? handlePress : undefined\}/);
  assert.match(fastPressSource, /onPressOut=\{needsPressOutHandler \? handlePressOut : undefined\}/);
  assert.match(fastPressSource, /onStartShouldSetResponder=\{onStartShouldSetResponder \? handleStartShouldSetResponder : undefined\}/);
  assert.match(fastPressSource, /onResponderGrant=\{onResponderGrant \? handleResponderGrant : undefined\}/);
  assert.match(fastPressSource, /onTouchStart=\{onTouchStart \? handleTouchStart : undefined\}/);
  assert.match(fastPressSource, /hitSlop=\{hitSlop \?\? DEFAULT_HIT_SLOP\}/);
  assert.match(fastPressSource, /pressRetentionOffset=\{pressRetentionOffset \?\? DEFAULT_PRESS_RETENTION_OFFSET\}/);
  assert.match(fastPressSource, /unstable_pressDelay=\{unstable_pressDelay \?\? 0\}/);
  assert.match(fastPressSource, /handledOnPressInRef\.current = true;\s*if \(onPress !== onPressIn\) \{\s*runPressAction\(onPress, event\);\s*\}/);
  assert.match(fastPressSource, /const handleStartShouldSetResponder = useCallback/);
  assert.match(fastPressSource, /return Boolean\(onStartShouldSetResponder\?\.\(event\)\)/);
  assert.match(fastPressSource, /const deliveredExplicitPressInRef = React\.useRef\(false\)/);
  assert.match(fastPressSource, /if \(onPressIn && \(!pressAlreadyHandled \|\| onPressIn !== onPress\)\) \{\s*deliveredExplicitPressInRef\.current = true;\s*runPressAction\(onPressIn, event\);\s*\}/);
  assert.match(fastPressSource, /if \(activateOnPressIn && onPress && !pressAlreadyHandled\) \{/);
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

  assert.match(ticketSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '..\/..\/utils\/actionLatency'/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.sell"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.buy"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.sell'/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.buy'/);
  assert.match(chartTradeHandlerSource, /runCriticalTradeAction\(`chart\.\$\{variant\}\.trade\.\$\{side\}`/);
});

test('action destination routes are warmed in non-blocking batches', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');

  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_SIZE = 1/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 750/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS = 30000/);
  assert.match(warmupSource, /requestAnimationFrame/);
  assert.match(warmupSource, /\/\(tabs\)\/quotes/);
  assert.match(warmupSource, /\/\(tabs\)\/chart/);
  assert.match(warmupSource, /\/\(tabs\)\/trade/);
  assert.match(warmupSource, /\/\(tabs\)\/history/);
  assert.match(warmupSource, /\/\(tabs\)\/settings/);
  assert.match(warmupSource, /\/settings\/news/);
  assert.match(warmupSource, /\/settings\/user-guide/);
  assert.match(warmupSource, /\/settings\/about/);
  assert.match(warmupSource, /\/trade\/order-ticket/);
  assert.match(warmupSource, /\/history\/filter/);
  assert.match(warmupSource, /\/chart\/objects/);
  assert.match(tabsSource, /import \{ warmActionRoutes \} from '..\/..\/src\/utils\/actionRouteWarmup'/);
  assert.match(tabsSource, /useEffect\(\(\) => warmActionRoutes\(router\), \[router\]\)/);
});

test('global action sheet actions use the immediate fast press path', () => {
  const source = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const dismissSource = readSource('src/ui/components/ActionSheet/dismissTimer.ts');

  assert.match(source, /import \{ FastPressable \} from '\.\.\/FastPressable'/);
  assert.match(source, /latencyLabel=\{`actionSheet\.\$\{action\.label\}`\}/);
  assert.match(source, /onPress=\{action\.disabled \? undefined : \(\) => handleActionPress\(action\.onPress\)\}/);
  assert.match(source, /latencyLabel="actionSheet\.cancel"/);
  assert.match(source, /latencyLabel="actionSheet\.dismissOverlay"/);
  assert.match(source, /style=\{\[StyleSheet\.absoluteFillObject, styles\.backdrop\]\}/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /pointerEvents="box-none"/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.match(dismissSource, /const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 0/);
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

  assert.match(screenSource, /keyboardShouldPersistTaps="always"/);
  assert.match(screenSource, /canCancelContentTouches=\{false\}/);
  assert.match(actionSheetSource, /keyboardShouldPersistTaps="always"/);
  assert.match(actionSheetSource, /canCancelContentTouches=\{false\}/);
  assert.match(sidebarSource, /keyboardShouldPersistTaps="always"/);
  assert.match(sidebarSource, /canCancelContentTouches=\{false\}/);
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

test('settings navigation surfaces use the immediate fast press path', () => {
  const rowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const backBarSource = readSource('src/features/settings/SettingsBackBar.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokersSource = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(rowSource, /<FastPressable[\s\S]*latencyLabel=\{`settings\.row\.\$\{title\}`\}[\s\S]*onPress=\{onPress\}/);
  assert.doesNotMatch(rowSource, /traceUiInteraction/);
  assert.match(backBarSource, /<FastPressable[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/settings'\)[\s\S]*activateOnPressIn[\s\S]*latencyLabel="settings\.back"/);
  assert.match(settingsSource, /latencyLabel="settings\.search\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.register\.open"/);
  assert.match(settingsSource, /title=\{t\('Mailbox'\)\}[\s\S]*onPress=\{\(\) => router\.push\('\/settings\/mailbox'\)\}/);
  assert.match(settingsSource, /latencyLabel="settings\.logout\.prompt"/);
  assert.doesNotMatch(settingsSource, /traceUiInteraction/);
  assert.match(accountsSource, /paddingLeft: 52/);
  assert.match(accountsSource, /latencyLabel="accounts\.back"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(accountsSource, /latencyLabel="accounts\.connect\.open"/);
  assert.match(accountsSource, /latencyLabel="accounts\.options\.open"/);
  assert.doesNotMatch(accountsSource, /traceUiInteraction/);
  assert.match(brokersSource, /paddingLeft: 52/);
  assert.match(brokersSource, /latencyLabel="brokers\.back"/);
  assert.match(brokersSource, /latencyLabel="brokers\.qr"/);
  assert.match(brokersSource, /latencyLabel="brokers\.custom"/);
  assert.match(brokersSource, /canCancelContentTouches=\{false\}/);
  assert.match(brokersSource, /pointerEvents="box-none"/);
  assert.doesNotMatch(brokersSource, /traceUiInteraction/);
  assert.match(brokerDetailSource, /paddingLeft: 52/);
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
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}/);
  assert.match(source, /latencyLabel="orderTicket\.pending\.submit"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.increment"/);
  assert.match(source, /latencyLabel="orderTicket\.sl\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.tp\.increment"/);
  assert.doesNotMatch(source, /traceUiInteraction/);
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
  assert.match(quotesSource, /canCancelContentTouches=\{false\}/);
  assert.match(quotesSource, /onPress=\{toggleEditMode\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.editMode\.toggle"/);
  assert.match(quotesSource, /onPress=\{handleHeaderBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.addSymbol\.back"/);
  assert.match(quotesSource, /latencyLabel="quotes\.search\.clear"/);
  assert.doesNotMatch(quotesSource, /traceUiInteraction/);
  assert.match(historySource, /latencyLabel="history\.sort\.open"/);
  assert.match(historySource, /latencyLabel=\{`history\.tab\.\$\{item\}`\}/);
  assert.doesNotMatch(historySource, /traceUiInteraction/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.summary\.toggle"/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.bulk\.open"/);
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
  assert.match(actionSheetStyles, /makeActionSheetStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(actionSheetStyles, /backgroundColor: isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.match(settingsStyles, /makeSettingsStyles = \(T: ThemeColors, themeMode: 'light' \| 'dark'\)/);
  assert.match(settingsStyles, /container: \{ flex: 1, backgroundColor: T\.bg \}/);
  assert.match(orderTicketSource, /function makeStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(orderTicketSource, /root: \{ flex: 1, backgroundColor: BG \}/);
  assert.match(sidebarSource, /const themeMode = useUserPreferences\(\(s\) => s\.themeMode\)/);
  assert.match(sidebarSource, /const isDark = themeMode === 'dark'/);
});
