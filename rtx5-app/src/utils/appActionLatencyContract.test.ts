import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
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

test('shared fast action budget is capped at one local frame', () => {
  const latencySource = readSource('src/utils/actionLatency.ts');
  const fastPressSource = readSource('src/ui/components/FastPressable.tsx');

  assert.match(latencySource, /export const APP_ACTION_MAX_LATENCY_MS = 20/);
  assert.match(latencySource, /export const FAST_PRESS_GUARD_RESET_MS = 120/);
  assert.match(latencySource, /requestAnimationFrame/);
  assert.match(latencySource, /first frame took/);
  assert.match(latencySource, /export function runImmediateAction/);
  assert.match(latencySource, /export const CRITICAL_TRADE_ACTION_MAX_LATENCY_MS = 10/);
  assert.match(latencySource, /export function runCriticalTradeAction/);
  assert.match(latencySource, /scheduleActionLatencyCheck\(label, startedAtMs, budgetMs\)/);
  assert.match(fastPressSource, /latencyBudgetMs\?: number/);
  assert.match(fastPressSource, /onPressIn=\{handlePressIn\}/);
  assert.match(fastPressSource, /onPress=\{handlePress\}/);
  assert.match(fastPressSource, /unstable_pressDelay=\{unstable_pressDelay \?\? 0\}/);
  assert.match(fastPressSource, /scheduleActionLatencyCheck\(latencyLabel, startedAtMs, latencyBudgetMs\)/);
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

  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_SIZE = 4/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 80/);
  assert.match(warmupSource, /requestAnimationFrame/);
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
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.match(dismissSource, /const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 1/);
});

test('settings navigation surfaces use the immediate fast press path', () => {
  const rowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const backBarSource = readSource('src/features/settings/SettingsBackBar.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(rowSource, /<FastPressable[\s\S]*latencyLabel=\{`settings\.row\.\$\{title\}`\}[\s\S]*onPress=\{onPress\}/);
  assert.doesNotMatch(rowSource, /traceUiInteraction/);
  assert.match(backBarSource, /<FastPressable[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/settings'\)[\s\S]*latencyLabel="settings\.back"/);
  assert.match(settingsSource, /latencyLabel="settings\.search\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.register\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.logout\.prompt"/);
  assert.doesNotMatch(settingsSource, /traceUiInteraction/);
  assert.match(accountsSource, /latencyLabel="accounts\.connect\.open"/);
  assert.match(accountsSource, /latencyLabel="accounts\.options\.open"/);
  assert.doesNotMatch(accountsSource, /traceUiInteraction/);
  assert.match(rootSource, /<FastPressable[\s\S]*latencyLabel="stack\.back"/);
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

  assert.match(quotesSource, /latencyLabel="quotes\.addAsset\.open"/);
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
