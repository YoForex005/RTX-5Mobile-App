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

test('trade buy/sell success feedback uses the shared popup without device vibration', () => {
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const feedbackModalSource = readSource('src/ui/components/TradeFeedbackModal.tsx');
  const chartResultStart = chartSource.indexOf('const handleChartTradeResult = useCallback');
  const chartResultEnd = chartSource.indexOf('const [showSignalDetails', chartResultStart);
  assert.notEqual(chartResultStart, -1);
  assert.notEqual(chartResultEnd, -1);
  const chartResultSource = chartSource.slice(chartResultStart, chartResultEnd);

  assert.doesNotMatch(ticketSource, /\bVibration\b|\.vibrate\(/);
  assert.doesNotMatch(chartSource, /\bVibration\b|\.vibrate\(/);
  assert.doesNotMatch(feedbackModalSource, /\bVibration\b|\.vibrate\(/);
  assert.match(ticketSource, /without device vibration/);
  assert.match(ticketSource, /const \[tradeConfirmations, setTradeConfirmations\] = useState<OrderTicketTradeConfirmation\[\]>/);
  assert.match(ticketSource, /Market BUY\/SELL executions and broker rejections share the same detailed popup/);
  assert.match(
    ticketSource,
    /const successFeedback: TradeFeedbackState = \{[\s\S]*visible:\s*true,[\s\S]*type:\s*'success'[\s\S]*side:\s*requestedSide[\s\S]*symbol:\s*displaySymbol[\s\S]*volume,[\s\S]*executedAt:\s*new Date\(\)\.toLocaleTimeString\(\)[\s\S]*if \(positionTicket\) \{[\s\S]*successFeedback\.ticket = String\(positionTicket\);[\s\S]*if \(Number\.isFinite\(executionPrice\)\) \{[\s\S]*successFeedback\.price = executionPrice;[\s\S]*showModal\(successFeedback\)/,
  );
  assert.doesNotMatch(ticketSource, /showTradeConfirmation\(\{ side: requestedSide/);
  assert.match(ticketSource, /showTradeConfirmation\(\{ side: pendingSideValue, symbol, volume \}\)/);
  assert.match(ticketSource, /Shared modal overlay for market execution success and rejected order feedback/);
  assert.match(feedbackModalSource, /import \{ View, Text, Animated, StyleSheet, Modal \} from ["']react-native["']/);
  assert.match(
    feedbackModalSource,
    /<Modal[\s\S]*visible=\{state\.visible\}[\s\S]*transparent[\s\S]*animationType="none"[\s\S]*presentationStyle="overFullScreen"[\s\S]*statusBarTranslucent[\s\S]*onRequestClose=\{onClose\}[\s\S]*<View style=\{tfmStyles\.overlay\}/,
  );
  assert.match(feedbackModalSource, /const successTitle = sideLabel[\s\S]*`\$\{sideLabel\} Order Executed`[\s\S]*["']Order Executed["']/);
  assert.match(feedbackModalSource, /const successSummaryText = \[state\.symbol, volumeLabel\]\.filter\(Boolean\)\.join\(' - '\)/);
  assert.match(feedbackModalSource, /tfmStyles\.successSummary[\s\S]*tfmStyles\.executionRow[\s\S]*tfmStyles\.executionPrice[\s\S]*Done/);
  assert.doesNotMatch(feedbackModalSource, /tfmStyles\.detailsGrid|View Position|router\.push\('\/trade'\)/);
  assert.match(
    chartResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}[\s\S]*setTradeFeedback\(feedback\);[\s\S]*refreshPositions\(String\(accountLogin\)\)[\s\S]*refetchOrders\(\)[\s\S]*refetchAccountSummary\(\)/,
  );
  assert.doesNotMatch(chartResultSource, /setChartTradeConfirmations/);
  assert.doesNotMatch(chartSource, /ChartTradeConfirmation|CHART_TRADE_CONFIRMATION|chartTradeConfirmationStack|chartTradeConfirmationDone/);
});

test('action destination routes are warmed in non-blocking batches', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const orderTicketRouteSource = readSource('app/trade/order-ticket.tsx');
  const orderTicketLaunchHostSource = readSource('src/features/trade/OrderTicketLaunchHost.tsx');
  const orderTicketLaunchShellSource = readSource('src/features/trade/OrderTicketLaunchShell.tsx');
  const detailsRouteSource = readSource('app/quotes/details.tsx');
  const statisticsRouteSource = readSource('app/quotes/market-statistics.tsx');
  const quoteInfoLaunchHostSource = readSource('src/features/quotes/QuoteInfoLaunchHost.tsx');
  const quoteInfoLaunchShellSource = readSource('src/features/quotes/QuoteInfoLaunchShell.tsx');
  const brokersRouteSource = readSource('app/settings/brokers.tsx');
  const brokersLaunchHostSource = readSource('src/features/settings/BrokersLaunchHost.tsx');
  const brokersLaunchShellSource = readSource('src/features/settings/BrokersLaunchShell.tsx');
  const brokersLaunchControllerSource = readSource('src/features/settings/brokersLaunchController.ts');
  const brokersPreloadSource = readSource('src/features/settings/BrokersScreen/brokersScreenPreload.ts');
  const brokerDetailRouteSource = readSource('app/settings/broker-detail.tsx');
  const brokerDetailLaunchHostSource = readSource('src/features/settings/BrokerDetailLaunchHost.tsx');
  const brokerDetailLaunchShellSource = readSource('src/features/settings/BrokerDetailLaunchShell.tsx');
  const brokerDetailLaunchControllerSource = readSource('src/features/settings/brokerDetailLaunchController.ts');
  const brokerDetailPreloadSource = readSource('src/features/settings/brokerDetailScreenPreload.ts');

  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_SIZE = 8/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_BATCH_DELAY_MS = 16/);
  assert.match(warmupSource, /const ACTION_ROUTE_WARMUP_INITIAL_DELAY_MS = 0/);
  assert.match(warmupSource, /const ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS = 180/);
  assert.match(warmupSource, /ACTION_DEFERRED_MODULE_WARMUPS/);
  assert.match(warmupSource, /JOURNAL_ROUTE_CACHE_KEY/);
  assert.match(warmupSource, /preloadDeferredRouteModule\(module\.cacheKey, module\.load\)/);
  assert.match(warmupSource, /requestAnimationFrame/);
  assert.match(warmupSource, /\/quotes/);
  assert.match(warmupSource, /\/quotes\/details/);
  assert.match(warmupSource, /\/quotes\/market-statistics/);
  assert.match(warmupSource, /\/chart/);
  assert.match(warmupSource, /\/trade/);
  assert.match(warmupSource, /\/history/);
  assert.match(warmupSource, /\/settings/);
  assert.match(warmupSource, /\/settings\/news/);
  assert.match(warmupSource, /\/settings\/user-guide/);
  assert.match(warmupSource, /\/settings\/help/);
  assert.match(warmupSource, /\/settings\/about/);
  assert.match(warmupSource, /\/settings\/brokers/);
  assert.match(warmupSource, /\/settings\/broker-detail/);
  assert.match(warmupSource, /\/register-entry/);
  assert.match(warmupSource, /\/trade\/order-ticket/);
  assert.match(warmupSource, /\/history\/filter/);
  assert.match(warmupSource, /\/chart\/objects/);
  assert.match(tabsSource, /import \{ warmActionRoutes \} from '..\/..\/src\/utils\/actionRouteWarmup'/);
  assert.match(tabsSource, /useEffect\(\(\) => warmActionRoutes\(router\), \[router\]\)/);
  assert.match(tabsSource, /import \{ OrderTicketLaunchHost \} from/);
  assert.match(tabsSource, /import \{ QuoteInfoLaunchHost \} from/);
  assert.match(tabsSource, /import \{ BrokersLaunchHost \} from/);
  assert.match(tabsSource, /<SidebarDestinationHost \/>[\s\S]*<BrokersLaunchHost \/>[\s\S]*<OrderTicketLaunchHost \/>[\s\S]*<QuoteInfoLaunchHost \/>[\s\S]*<GlobalActionSheetHost \/>/);
  assert.match(tabsSource, /lazy: false/);
  assert.doesNotMatch(tabsSource, /lazy: true/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/order-ticket' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/details' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/market-statistics' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(orderTicketRouteSource, /cacheKey=\{ORDER_TICKET_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(orderTicketRouteSource, /fallback=\{\([\s\S]*<OrderTicketLaunchShell/);
  assert.doesNotMatch(orderTicketRouteSource, /SettingsRouteLaunchPreview/);
  assert.doesNotMatch(orderTicketRouteSource, /mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(orderTicketLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(orderTicketLaunchHostSource, /registerVisualApplier\([\s\S]*writeOrderTicketLaunchVisibilityNow/);
  assert.match(orderTicketLaunchHostSource, /<OrderTicketLaunchShell[\s\S]*symbol=\{snapshot\.symbol\}/);
  assert.match(orderTicketLaunchShellSource, /testID="order-ticket-launch-shell"/);
  assert.match(detailsRouteSource, /cacheKey=\{SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(detailsRouteSource, /fallback=\{\([\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="properties"/);
  assert.doesNotMatch(detailsRouteSource, /SettingsRouteLaunchPreview|mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(statisticsRouteSource, /cacheKey=\{MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(statisticsRouteSource, /fallback=\{\([\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="market-statistics"/);
  assert.doesNotMatch(statisticsRouteSource, /SettingsRouteLaunchPreview|mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(quoteInfoLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(quoteInfoLaunchHostSource, /destination === 'properties'[\s\S]*destination === 'market-statistics'/);
  assert.match(quoteInfoLaunchHostSource, /registerVisualApplier\([\s\S]*writeQuoteInfoLaunchDestinationNow/);
  assert.match(quoteInfoLaunchHostSource, /destination="properties"[\s\S]*destination="market-statistics"/);
  assert.match(quoteInfoLaunchHostSource, /testID="quote-info-launch-animated-host"/);
  assert.match(quoteInfoLaunchHostSource, /testID="quote-info-launch-react-host"/);
  assert.match(quoteInfoLaunchHostSource, /testID="quote-info-launch-react-properties"[\s\S]*testID="quote-info-launch-react-market-statistics"/);
  assert.match(brokersRouteSource, /cacheKey=\{BROKERS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(brokersRouteSource, /load=\{loadBrokersScreenRoute\}/);
  assert.match(brokersRouteSource, /mountDelayMs=\{0\}/);
  assert.match(brokersRouteSource, /fallback=\{\([\s\S]*<BrokersLaunchShell/);
  assert.match(brokersRouteSource, /showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*hideBrokersLaunch\(\);[\s\S]*safeRouterBack\(router, '\/settings\/accounts'\)/);
  assert.doesNotMatch(brokersRouteSource, /import \{ BrokersScreen \}/);
  assert.match(brokersPreloadSource, /BROKERS_ROUTE_MODULE_CACHE_KEY = 'settings\/brokers'/);
  assert.match(brokersPreloadSource, /import\('\.\/BrokersScreen'\)/);
  assert.match(warmupSource, /\{ cacheKey: BROKERS_ROUTE_MODULE_CACHE_KEY, load: loadBrokersScreenRoute \}/);
  assert.match(brokersLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(brokersLaunchHostSource, /registerVisualApplier\([\s\S]*writeBrokersLaunchVisibilityNow/);
  assert.match(brokersLaunchHostSource, /<BrokersLaunchShell[\s\S]*backLatencyLabel="brokers\.launch\.back"/);
  assert.match(brokersLaunchHostSource, /testID="brokers-launch-host"/);
  assert.match(brokersLaunchHostSource, /testID="brokers-launch-animated-host"/);
  assert.match(brokersLaunchHostSource, /testID="brokers-launch-react-host"/);
  assert.match(brokersLaunchShellSource, /testID="brokers-launch-shell"/);
  assert.match(brokersLaunchShellSource, /BROKERS_LAUNCH_FALLBACK_ROWS[\s\S]*Achiever Financials LTD[\s\S]*Omega Global Markets/);
  assert.match(brokersLaunchShellSource, /PUBLIC_BROKER_DIRECTORY_BASE_URL/);
  assert.match(brokersLaunchShellSource, /useBrokerServers\(true\)/);
  assert.match(brokersLaunchShellSource, /sortBrokerDirectoryRows\(buildBrokerDirectoryRows\(brokerServers\)\)/);
  assert.match(brokersLaunchShellSource, /Image\.prefetch\(logoUrl\)/);
  assert.match(brokersLaunchShellSource, /<Image[\s\S]*source=\{\{ uri: logoUri, cache: 'force-cache' \}\}[\s\S]*fadeDuration=\{0\}/);
  assert.doesNotMatch(brokersLaunchShellSource, /row\.initials|styles\.avatarText/);
  assert.doesNotMatch(brokersLaunchShellSource, /SKELETON_ROWS|Skeleton|ActivityIndicator|Loading brokers/);
  assert.doesNotMatch(brokersLaunchShellSource, /TextInput|FlatList/);
  assert.match(warmupSource, /prefetchBrokerServers\(\)\.catch\(\(\) => undefined\)/);
  assert.match(brokersLaunchControllerSource, /requestAnimationFrame\(\(\) => \{\s*globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(runIfCurrent, 0\)/);
  assert.match(rootSource, /import \{ BrokerDetailLaunchHost \} from/);
  assert.match(rootSource, /<\/Stack>[\s\S]*<BrokerDetailLaunchHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.match(brokerDetailRouteSource, /cacheKey=\{BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(brokerDetailRouteSource, /load=\{loadBrokerDetailScreenRoute\}/);
  assert.match(brokerDetailRouteSource, /mountDelayMs=\{0\}/);
  assert.match(brokerDetailRouteSource, /fallback=\{\([\s\S]*<BrokerDetailLaunchShell[\s\S]*selection=\{selection\}/);
  assert.match(brokerDetailRouteSource, /const handleOpenDemo = useCallback\(\(\) => \{[\s\S]*hideBrokerDetailLaunch\(\);[\s\S]*router\.push\('\/register-entry'\)/);
  assert.doesNotMatch(brokerDetailRouteSource, /preloadRegisterScreen/);
  assert.match(brokerDetailRouteSource, /onOpenDemo=\{handleOpenDemo\}/);
  assert.doesNotMatch(brokerDetailRouteSource, /import \{ BrokerDetailScreen \}/);
  assert.match(brokerDetailPreloadSource, /BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY = 'settings\/broker-detail'/);
  assert.match(warmupSource, /\{ cacheKey: BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY, load: loadBrokerDetailScreenRoute \}/);
  assert.match(brokerDetailLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(brokerDetailLaunchHostSource, /registerVisualApplier\([\s\S]*writeBrokerDetailLaunchVisibilityNow/);
  assert.match(brokerDetailLaunchHostSource, /testID="broker-detail-launch-animated-host"/);
  assert.match(brokerDetailLaunchHostSource, /testID="broker-detail-launch-react-host"/);
  assert.match(brokerDetailLaunchHostSource, /selection=\{snapshot\.selection\}/);
  assert.match(brokerDetailLaunchHostSource, /const openDemoAccount = useCallback\(\(\) => \{[\s\S]*brokerDetailLaunchController\.hide\(current\.revision\);[\s\S]*router\.push\('\/register-entry'\)/);
  assert.doesNotMatch(brokerDetailLaunchHostSource, /preloadRegisterScreen/);
  assert.equal((brokerDetailLaunchHostSource.match(/onOpenDemo=\{openDemoAccount\}/g) ?? []).length, 2);
  assert.match(brokerDetailLaunchShellSource, /testID="broker-detail-launch-shell"/);
  assert.match(brokerDetailLaunchShellSource, /selection\.brokerName[\s\S]*selection\.brokerServer/);
  assert.match(brokerDetailLaunchShellSource, /pointerEvents=\{onOpenDemo \? 'auto' : 'none'\}/);
  assert.match(brokerDetailLaunchShellSource, /onPress=\{onPress\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel=\{latencyLabel \?\? 'brokerDetail\.launch\.option'\}/);
  assert.doesNotMatch(
    brokerDetailLaunchShellSource,
    /useBrokerServers|TextInput|ActionSheet|useQueryClient|getSecureItemAsync|persistSelectedBrokerSession/,
  );
  assert.match(brokerDetailLaunchControllerSource, /BROKER_DETAIL_LAUNCH_FALLBACK_MS = 5_000/);
  assert.match(brokerDetailLaunchControllerSource, /requestAnimationFrame\(\(\) => \{\s*globalThis\.requestAnimationFrame\(\(\) => \{\s*setTimeout\(runIfCurrent, 0\)/);
  const reactQuoteInfoHostStart = quoteInfoLaunchHostSource.indexOf('testID="quote-info-launch-react-host"');
  assert.notEqual(reactQuoteInfoHostStart, -1);
  assert.doesNotMatch(
    quoteInfoLaunchHostSource.slice(reactQuoteInfoHostStart),
    /<Animated\.View|hostAnimatedStyle|animatedProps=/,
  );
  assert.match(quoteInfoLaunchHostSource, /hostAnimatedStyle = useAnimatedStyle\([\s\S]*elevation: visible \? 32 : 0/);
  assert.match(quoteInfoLaunchHostSource, /reactHostHidden: \{[\s\S]*elevation: 0,[\s\S]*opacity: 0,[\s\S]*zIndex: 0/);
  assert.match(quoteInfoLaunchHostSource, /reactHostVisible: \{[\s\S]*elevation: 33,[\s\S]*opacity: 1,[\s\S]*zIndex: 33/);
  assert.match(quoteInfoLaunchHostSource, /reactLayerHidden: \{[\s\S]*opacity: 0[\s\S]*reactLayerVisible: \{[\s\S]*opacity: 1/);
  assert.match(quoteInfoLaunchShellSource, /testID=\{'quote-info-launch-shell-' \+ destination\}/);
  assert.match(quoteInfoLaunchShellSource, /activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(quoteInfoLaunchShellSource, /function PropertiesLaunchViewport/);
  assert.match(quoteInfoLaunchShellSource, /makeSymbolDetailsStyles/);
  assert.match(quoteInfoLaunchShellSource, /s\.glassHero\.container/);
  assert.match(quoteInfoLaunchShellSource, /s\.glassHero\.header/);
  assert.match(quoteInfoLaunchShellSource, /s\.glassHero\.priceRow/);
  assert.match(quoteInfoLaunchShellSource, /s\.ticker\.container/);
  assert.match(quoteInfoLaunchShellSource, /s\.ticker\.spreadBadge/);
  assert.match(quoteInfoLaunchShellSource, /s\.ticker\.inner/);
  assert.match(quoteInfoLaunchShellSource, /s\.glassHero\.metricsRow/);
  assert.match(quoteInfoLaunchShellSource, /s\.glassHero\.rangeCard/);
  assert.match(quoteInfoLaunchShellSource, /s\.mom\.container/);
  assert.match(quoteInfoLaunchShellSource, /s\.act\.row/);
  assert.match(quoteInfoLaunchShellSource, /s\.sec\.card/);
  assert.doesNotMatch(
    quoteInfoLaunchShellSource,
    /useMarketData|useInstrumentMeta|useLatestDailyCandle|useQuery/,
  );
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
  assert.match(source, /activateOnPressIn\?: boolean/);
  assert.match(source, /textColor\?: string/);
  assert.match(uiStateSource, /textColor\?: string/);
  assert.match(source, /action\.textColor && !isVisuallyMuted && \{ color: action\.textColor \}/);
  assert.match(source, /textFontWeight\?: TextStyle\['fontWeight'\]/);
  assert.match(uiStateSource, /textFontWeight\?: TextStyle\['fontWeight'\]/);
  assert.match(source, /action\.textFontWeight && !isVisuallyMuted && \{ fontWeight: action\.textFontWeight \}/);
  assert.match(source, /const actionPressGestureRef = useRef<ActionSheetPressGesture>\(\{[\s\S]*start: null,[\s\S]*cancelled: false,[\s\S]*\}\)/);
  assert.match(source, /const recordActionRowPressStart = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*start: getActionSheetPressPoint\(event\),[\s\S]*cancelled: false/);
  assert.match(source, /const cancelActionRowPressForScroll = useCallback\(\(\) => \{[\s\S]*cancelled: true/);
  assert.match(source, /const recordActionRowPressMove = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*hasActionSheetPressMovedBeyondThreshold\(gesture\.start, getActionSheetPressPoint\(event\)\)[\s\S]*cancelled: true/);
  assert.match(source, /const handleActionRowPress = useCallback\(\(actionPress\?: \(\) => void\) => \{[\s\S]*if \(gesture\.cancelled\) \{[\s\S]*return;[\s\S]*\}[\s\S]*handleActionPress\(actionPress\)/);
  assert.match(source, /onPressIn=\{recordActionRowPressStart\}/);
  assert.match(source, /onTouchMove=\{recordActionRowPressMove\}/);
  assert.match(source, /const isActiveDisabled = action\.disabled \|\| action\.selected === true/);
  assert.match(source, /onPress=\{isActiveDisabled \? undefined : \(\) => handleActionRowPress\(action\.onPress\)\}/);
  assert.match(source, /activateOnPressIn=\{action\.activateOnPressIn === true && !isActiveDisabled/);
  assert.match(source, /onScrollBeginDrag=\{cancelActionRowPressForScroll\}/);
  assert.match(source, /onMomentumScrollBegin=\{cancelActionRowPressForScroll\}/);
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

test('chart properties color picker keeps readouts live and commits chart colors after gestures', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  assert.match(source, /<KeyboardAvoidingView behavior="padding" style=\{styles\.modalBackdropBottom\}>/);
  assert.match(source, /<Pressable style=\{StyleSheet\.absoluteFillObject\} onPress=\{\(\) => applyDraftColor\(draftColor\)\} \/>/);
  assert.doesNotMatch(source, /<Pressable style=\{styles\.modalBackdropBottom\} onPress=\{\(\) => applyDraftColor\(draftColor\)\}>/);
  assert.match(source, /const pickerColorValue = useMemo\(\(\) => \{/);
  assert.match(source, /ColorPicker cannot accept incomplete HEX drafts/);
  const pickerChangeStart = source.indexOf('const handlePickerColorChange = (value: string) => {');
  const pickerChangeEnd = source.indexOf('const handlePickerColorComplete', pickerChangeStart);
  assert.notEqual(pickerChangeStart, -1);
  assert.notEqual(pickerChangeEnd, -1);

  const pickerChangeSource = source.slice(pickerChangeStart, pickerChangeEnd);
  assert.match(pickerChangeSource, /requestAnimationFrame/);
  assert.match(pickerChangeSource, /setDraftColor\(nextDraft\)/);
  assert.doesNotMatch(pickerChangeSource, /setChartColor/);
  const colorPickerStart = source.indexOf('<ColorPicker');
  const colorPickerEnd = source.indexOf('</ColorPicker>', colorPickerStart);
  assert.notEqual(colorPickerStart, -1);
  assert.notEqual(colorPickerEnd, -1);

  const colorPickerSource = source.slice(colorPickerStart, colorPickerEnd);
  assert.match(colorPickerSource, /value=\{pickerColorValue\}/);
  assert.match(colorPickerSource, /onChangeJS=\{\(color\) => handlePickerColorChange\(color\.hex\.toUpperCase\(\)\)\}/);
  assert.match(colorPickerSource, /onCompleteJS=\{\(color\) => handlePickerColorComplete\(color\.hex\.toUpperCase\(\)\)\}/);
  assert.doesNotMatch(colorPickerSource, /\sonChange=\{/);
  assert.doesNotMatch(colorPickerSource, /\sonComplete=\{/);
  assert.match(source, /const previewActive = isScreenFocused && !colorEditorOpen/);
  assert.match(source, /import \{ useLiveSymbolQuote \} from '\.\.\/\.\.\/query\/websocket'/);
  assert.match(source, /import \{ calculateQuoteSpreadPoints \} from '\.\.\/\.\.\/utils\/quoteSpread'/);
  assert.doesNotMatch(source, /useMarketData/);
  assert.match(source, /Direct per-symbol ticks keep the Bid and Spread preview cards live/);
  assert.match(source, /useLiveSymbolQuote\(chartSymbol, previewActive, 0\)/);
  assert.match(source, /const liveSpreadPoints = calculateQuoteSpreadPoints\(liveQuote\?\.bid, liveQuote\?\.ask, liveQuote\?\.digits\)/);
  assert.match(source, /Number\.isFinite\(liveSpreadPoints\)[\s\S]*Number\(liveSpreadPoints\)\.toFixed\(1\)[\s\S]*Number\.isFinite\(liveQuote\?\.spread\)/);
  assert.match(source, /const livePreviewPrice = useMemo\(\(\) => \{/);
  assert.match(source, /const previewLiveCandle = useMemo\(\(\) => \{/);
  assert.match(source, /Blend the immediate live quote into the current preview candle/);
  assert.match(source, /high: Math\.max\(previewLastCandle\.high, livePreviewPrice\)/);
  assert.match(source, /low: Math\.min\(previewLastCandle\.low, livePreviewPrice\)/);
  assert.match(source, /close: livePreviewPrice/);
  assert.match(source, /const previewOhlcItems = previewLiveCandle/);
  assert.match(source, /formatQuote\(previewLiveCandle\.close, liveQuote\?\.digits\)/);
  assert.doesNotMatch(source, /formatQuote\(previewLastCandle\.close, liveQuote\?\.digits\)/);
  assert.match(source, /useLiveCandles\(chartSymbol, chartTimeframe, previewActive\)/);
  assert.match(source, /active=\{previewActive\}/);
});

test('chart properties show controls moved to the chart settings action sheet', () => {
  const chartPropertiesSource = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const typesSource = readSource('src/state/userPreferences/types.ts');
  const defaultsSource = readSource('src/state/userPreferences/chartColors.ts');

  assert.doesNotMatch(chartPropertiesSource, /const SHOW_FIELDS|setChartDisplaySetting|Show ticker|Show trade levels/);
  assert.match(chartSource, /const CHART_SCALE_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.match(chartSource, /title: t\('Chart settings'\)[\s\S]*titleAlign: 'center'/);
  assert.match(chartSource, /label: t\(item\.label\)/);
  assert.match(chartSource, /label: t\(item\.label\)[\s\S]*muted: enabled[\s\S]*onPress: \(\) => handleToggleChartDisplayAction\(item\.key\)/);
  assert.doesNotMatch(chartSource, /label: t\([^)]*Disable/);
  assert.doesNotMatch(chartSource, /subtitle: t\(.*(?:On|Off)/);
  assert.doesNotMatch(chartPropertiesSource, /showPeriodSeparators|Show period separators/);
  assert.doesNotMatch(typesSource, /showPeriodSeparators/);
  assert.doesNotMatch(defaultsSource, /showPeriodSeparators/);
});

test('chart properties keeps line color under candles and links candle colors to hidden bar colors', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const colorGroupsStart = source.indexOf('const COLOR_GROUPS: ColorGroup[] = [');
  const colorGroupsEnd = source.indexOf('];', colorGroupsStart);
  assert.notEqual(colorGroupsStart, -1);
  assert.notEqual(colorGroupsEnd, -1);

  const colorGroupsSource = source.slice(colorGroupsStart, colorGroupsEnd);
  assert.match(colorGroupsSource, /title: 'CANDLES'[\s\S]*key: 'candlesUptrend'[\s\S]*key: 'candlesDowntrend'[\s\S]*key: 'hollowBody'[\s\S]*key: 'lineBody'/);
  assert.doesNotMatch(colorGroupsSource, /OTHER CHART TYPES/);
  assert.doesNotMatch(colorGroupsSource, /key: 'barsUptrend'/);
  assert.doesNotMatch(colorGroupsSource, /key: 'barsDowntrend'/);
  assert.match(source, /const LINKED_CANDLE_COLOR_KEYS:[\s\S]*candlesUptrend: 'barsUptrend'[\s\S]*candlesDowntrend: 'barsDowntrend'/);

  const commitStart = source.indexOf('const commitChartColor = (key: keyof ChartColorsConfig, color: string) => {');
  const commitEnd = source.indexOf('const handleDraftColorChange', commitStart);
  assert.notEqual(commitStart, -1);
  assert.notEqual(commitEnd, -1);

  const commitSource = source.slice(commitStart, commitEnd);
  assert.match(commitSource, /Bar colors are hidden here/);
  assert.match(commitSource, /setChartColor\(key, color\)/);
  assert.match(commitSource, /const linkedBarKey = LINKED_CANDLE_COLOR_KEYS\[key\]/);
  assert.match(commitSource, /setChartColor\(linkedBarKey, color\)/);
  assert.match(source, /commitChartColor\(activeColorKey, normalized\)/);
});

test('chart properties dark chrome matches the Settings dark palette', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const settingsStyles = readSource('src/features/settings/SettingsScreen/styles.ts');
  const stylesStart = source.indexOf('function makeStyles');
  assert.notEqual(stylesStart, -1);
  const stylesSource = source.slice(stylesStart);

  assert.match(settingsStyles, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(settingsStyles, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
  assert.match(source, /Match the app dark palette for the chart preferences shell and cards/);
  assert.match(source, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(source, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
  assert.match(source, /const preferencesBackground = isDark \? SETTINGS_DARK_BACKGROUND : T\.bg/);
  assert.match(source, /const preferencesCardBackground = isDark \? SETTINGS_DARK_CARD_BACKGROUND : '#FFFFFF'/);
  assert.match(source, /const preferencesSoftCardBackground = isDark \? SETTINGS_DARK_CARD_BACKGROUND : '#F8FAFC'/);
  assert.doesNotMatch(source, /isDark \? '#(?:000000|1C1C1E)'/);

  const backgroundStyles = ['screen', 'header'];
  for (const styleName of backgroundStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,500}backgroundColor: preferencesBackground`));
  }

  const cardStyles = ['previewCard', 'panel', 'colorGroupCard', 'modalCard', 'bottomSheet'];
  for (const styleName of cardStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,700}backgroundColor: preferencesCardBackground`));
  }

  const readoutStyles = ['infoCard', 'infoCardThird'];
  for (const styleName of readoutStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,500}backgroundColor: preferencesSoftCardBackground`));
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

test('settings navigation surfaces keep heavyweight routes responsive on first touch', () => {
  const rowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const backBarSource = readSource('src/features/settings/SettingsBackBar.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const registerEntrySource = readSource('app/register-entry.tsx');
  const registerPreviewSource = readSource('src/features/settings/RegisterHandoffPreview.tsx');
  const registerHandoffSource = readSource('src/features/settings/registerHandoffState.ts');
  const registerPreloadSource = readSource('src/features/settings/registerScreenPreload.ts');
  const registerSource = readSource('app/register.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokersSource = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const accountCardStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/settings/accounts')}");
  const metricsRowStart = settingsSource.indexOf('<View style={styles.metricsRow}', accountCardStart);
  const registerRowStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/register-entry')}");
  const marketUpdatesStart = settingsSource.indexOf("t('MARKET UPDATES')", registerRowStart);

  assert.match(rowSource, /<FastPressable[\s\S]*latencyLabel=\{`settings\.row\.\$\{title\}`\}[\s\S]*onPress=\{onPress\}/);
  assert.match(rowSource, /activateOnPressIn\?: boolean/);
  assert.match(rowSource, /activateOnTouchStart\?: boolean/);
  assert.match(rowSource, /activateOnPressIn=\{activateOnPressIn\}/);
  assert.match(rowSource, /activateOnTouchStart=\{activateOnTouchStart\}/);
  assert.match(rowSource, /const SETTINGS_ROW_PRESS_RETENTION_OFFSET = \{ top: 8, bottom: 8, left: 18, right: 18 \} as const/);
  assert.match(rowSource, /pressRetentionOffset=\{SETTINGS_ROW_PRESS_RETENTION_OFFSET\}/);
  assert.match(rowSource, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(rowSource, /traceUiInteraction/);
  assert.notEqual(accountCardStart, -1);
  assert.notEqual(metricsRowStart, -1);
  assert.notEqual(registerRowStart, -1);
  assert.notEqual(marketUpdatesStart, -1);
  assert.match(settingsSource.slice(accountCardStart, metricsRowStart), /onPressIn=\{\(\) => prepareReadySettingsRoute\('\/settings\/accounts'\)\}[\s\S]*pressRetentionOffset=\{SETTINGS_SCROLL_PRESS_RETENTION_OFFSET\}/);
  assert.doesNotMatch(settingsSource.slice(accountCardStart, metricsRowStart), /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/settings\/accounts'\)\}|activateOnPressIn/);
  assert.match(settingsSource.slice(registerRowStart, marketUpdatesStart), /onPressIn=\{\(\) => prepareReadySettingsRoute\('\/register-entry'\)\}[\s\S]*pressRetentionOffset=\{SETTINGS_SCROLL_PRESS_RETENTION_OFFSET\}/);
  assert.doesNotMatch(settingsSource.slice(registerRowStart, marketUpdatesStart), /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/register-entry'\)\}|activateOnPressIn/);
  assert.match(backBarSource, /<FastPressable[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/settings'\)[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="settings\.back"/);
  assert.doesNotMatch(settingsSource, /SETTINGS_LOWER_CONTENT_DELAY_MS|lowerSettingsReady/);
  assert.match(settingsSource, /import \{ useDeferredRouteContentReady \} from/);
  assert.match(settingsSource, /const SETTINGS_BODY_PREWARM_DELAY_MS = 1200/);
  assert.match(settingsSource, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : SETTINGS_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.match(settingsSource, /\{routeBodyReady \? <>/);
  assert.match(settingsSource, /const SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/register-entry'[\s\S]*'\/register'[\s\S]*'\/settings\/economic-calendar'[\s\S]*'\/settings\/journal'[\s\S]*'\/settings\/help'[\s\S]*\] as const/);
  assert.doesNotMatch(settingsSource, /SettingsRegisterOpeningShell|registerOpeningShellVisible|SETTINGS_REGISTER_ROUTE_HANDOFF_DELAY_MS/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/user-guide'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/otp'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/support'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/traders-community'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/mailbox'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/news'/);
  assert.match(settingsSource, /const openReadySettingsRoute = useCallback/);
  // Detail routes are PUSHED (not replaced) so the (tabs) navigator — and the
  // pre-warmed chart WebView — stays mounted underneath, making BACK an instant
  // pop instead of a full tab re-mount (~1.8s freeze).
  assert.doesNotMatch(settingsSource, /router\.replace\(routePath as any\)/);
  assert.match(settingsSource, /router\.push\(routePath as any\)/);
  assert.match(settingsSource, /latencyLabel="settings\.search\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.register\.open"/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/settings\/accounts'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /const SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS = 50/);
  assert.match(settingsSource, /const SETTINGS_REGISTER_SCREEN_PRELOAD_DELAY_MS = 0/);
  assert.doesNotMatch(settingsSource, /SETTINGS_ROUTE_PREVIEW_ROUTE_DELAY_MS|scheduleRouteAfterPreviewPaint/);
  assert.match(settingsSource, /const SETTINGS_ROUTE_LOCK_MS = 1800/);
  assert.match(settingsSource, /const SETTINGS_ROUTE_PREFETCH_DELAY_MS = 0/);
  assert.match(settingsSource, /const scheduleSettingsRouteAfterVisualFrame = \(action: \(\) => void\) => \{[\s\S]*requestAnimationFrame\(runAfterFrame\)[\s\S]*setTimeout\(action, 0\)/);
  assert.match(settingsSource, /const warmRegisterScreen = useCallback\(\(\) => \{[\s\S]*void preloadRegisterScreen\(\)\.catch\(\(\) => undefined\);[\s\S]*\}, \[\]\)/);
  assert.match(settingsSource, /const scheduleRegisterScreenWarmupAfterTouch = useCallback\(\(\) => \{[\s\S]*scheduleSettingsRouteAfterVisualFrame\(warmRegisterScreen\);[\s\S]*\}, \[warmRegisterScreen\]\)/);
  assert.match(settingsSource, /preloadRegisterScreen/);
  assert.doesNotMatch(settingsSource, /RegisterHandoffPreview|SettingsRouteLaunchPreview/);
  assert.match(settingsSource, /import \{ warmSettingsRouteModules \} from '\.\.\/\.\.\/\.\.\/utils\/settingsRouteWarmup'/);
  assert.match(settingsSource, /showSidebarDestination,[\s\S]*type SidebarHostDestination/);
  assert.match(settingsSource, /const SETTINGS_HOSTED_ROUTE_DESTINATIONS:[\s\S]*'\/settings\/accounts': 'accounts'[\s\S]*'\/settings\/economic-calendar': 'economic-calendar'[\s\S]*'\/settings\/journal': 'journal'[\s\S]*'\/settings\/help': 'help'[\s\S]*'\/settings\/interface': 'interface'/);
  assert.doesNotMatch(settingsSource, /routeLaunchPreview|showRouteLaunchPreview|resolveSettingsRouteLaunchPreview/);
  assert.match(settingsSource, /const prepareReadySettingsRoute = useCallback\(\(routePath: SettingsReadyRoute\) => \{[\s\S]*warmSettingsRouteModules\(\);[\s\S]*\}, \[scheduleRegisterScreenWarmupAfterTouch\]\)/);
  assert.match(settingsSource, /if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}[\s\S]*routeLockRef\.current = false;[\s\S]*clearTimeout\(routeUnlockTimerRef\.current\)/);
  assert.match(settingsSource, /const isRegisterRoute = routePath === '\/register-entry' \|\| routePath === '\/register'/);
  assert.match(settingsSource, /const hostedDestination = SETTINGS_HOSTED_ROUTE_DESTINATIONS\[routePath\];[\s\S]*showSidebarDestination\(hostedDestination, 'settings'\)[\s\S]*routeLockRef\.current = false;[\s\S]*return;/);
  assert.match(settingsSource, /prepareReadySettingsRoute\(routePath\);[\s\S]*router\.push\(routePath as any\);[\s\S]*if \(isRegisterRoute\) \{[\s\S]*warmRegisterScreen\(\);[\s\S]*\}[\s\S]*unlockSettingsRoute\(\);/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/register-entry'\)\}[\s\S]*onPressIn=\{\(\) => prepareReadySettingsRoute\('\/register-entry'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.register\.open"[\s\S]*latencyBudgetMs=\{SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS\}/);
  assert.doesNotMatch(settingsSource, /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/(?:settings\/accounts|register-entry|settings\/economic-calendar|settings\/interface|settings\/journal|settings\/help)'\)\}/);
  assert.doesNotMatch(settingsSource, /registerLaunchPreviewLayer|settings\.register\.preview\.back/);
  assert.doesNotMatch(settingsSource, /subscribeRegisterScreenReady|<Modal/);
  assert.doesNotMatch(settingsSource, /if \(routePath === '\/register-entry'\)[\s\S]*return;/);
  assert.doesNotMatch(settingsSource, /if \(routePath === '\/register'\)[\s\S]*return;/);
  assert.doesNotMatch(settingsSource, /pushRegisterRoute|requestAnimationFrame\(pushRegisterRoute\)|setTimeout\(pushRegisterRoute|router\.push\('\/register-entry'/);
  assert.doesNotMatch(settingsSource, /registerRouteOpening|registerOpeningOverlay|registerOpeningTitle|SettingsRegisterPreviewInput/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_FORM_IMPORT_DELAY_MS = 0/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS = 0/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS = 3200/);
  assert.match(registerEntrySource, /subscribeRegisterScreenReady/);
  assert.match(registerEntrySource, /getPreloadedRegisterScreen/);
  assert.match(registerEntrySource, /preloadRegisterScreen/);
  assert.match(registerEntrySource, /React\.useState<RegisterScreenComponent \| null>\(null\)/);
  assert.match(registerEntrySource, /const preloadedScreen = getPreloadedRegisterScreen\(\)/);
  assert.match(registerEntrySource, /const scheduleRegisterScreenMount = React\.useCallback\(\(screenComponent: RegisterScreenComponent\) => \{/);
  assert.match(registerEntrySource, /requestAnimationFrame\(scheduleMountTimer\)/);
  assert.match(registerEntrySource, /scheduleRegisterScreenMount\(preloadedScreen\)/);
  assert.match(registerEntrySource, /scheduleRegisterScreenMount\(screenComponent\)/);
  assert.match(registerEntrySource, /\{RegisterScreen \? <RegisterScreen \/> : null\}/);
  assert.match(registerEntrySource, /StyleSheet\.absoluteFill[\s\S]*<RegisterHandoffPreview[\s\S]*backLatencyLabel="register\.entry\.back"/);
  assert.match(registerPreviewSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel=\{backLatencyLabel\}[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(registerEntrySource, /const scheduleRegisterEntryBackAfterVisualFrame = \(action: \(\) => void\) => \{[\s\S]*requestAnimationFrame\(runAfterFrame\)[\s\S]*setTimeout\(action, 0\)/);
  assert.match(registerEntrySource, /clearHandoffTimers\(\);[\s\S]*scheduleRegisterEntryBackAfterVisualFrame\(\(\) => \{[\s\S]*router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\);[\s\S]*\}\)/);
  assert.match(registerEntrySource, /router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\)/);
  assert.match(registerEntrySource, /BackHandler\.addEventListener\('hardwareBackPress',[\s\S]*startBackToSettings\(\);[\s\S]*return true/);
  assert.doesNotMatch(registerEntrySource, /safeRouterBack\(router, REGISTER_BACK_FALLBACK_HREF\)/);
  assert.doesNotMatch(registerEntrySource, /router\.replace\('\/register'\)|router\.push\('\/register'\)/);
  assert.doesNotMatch(registerEntrySource, /fontSize: 34|width: 68|minHeight: 84|useOrrnnDemoStatus|useOrrnnDemoGroups|useBrokerServers|ActionSheet|TextInput|useDeferredActiveFlag/);
  assert.match(registerPreviewSource, /<Text style=\{styles\.headerTitle\} numberOfLines=\{1\}>Demo Account<\/Text>[\s\S]*<PasswordPreview[\s\S]*label=\{t\('Master password'\)\}/);
  assert.doesNotMatch(registerPreviewSource, /heroSection|stats-chart-outline|Open Demo Account/);
  assert.match(registerPreviewSource, /<SelectPreview[\s\S]*label=\{t\('Group'\)\}[\s\S]*value=\{t\('Demo groups unavailable'\)\}/);
  assert.doesNotMatch(registerPreviewSource, /fontSize: 34|width: 68|minHeight: 84|useOrrnnDemoStatus|useOrrnnDemoGroups|useBrokerServers|ActionSheet|TextInput|useDeferredActiveFlag/);
  assert.match(registerHandoffSource, /const registerScreenReadyListeners = new Set<RegisterScreenReadyListener>\(\)/);
  assert.match(registerHandoffSource, /export function subscribeRegisterScreenReady/);
  assert.match(registerHandoffSource, /export function notifyRegisterScreenReady/);
  assert.match(registerPreloadSource, /let preloadedRegisterScreen: RegisterScreenComponent \| null = null/);
  assert.match(registerPreloadSource, /export function getPreloadedRegisterScreen/);
  assert.match(registerPreloadSource, /export function preloadRegisterScreen/);
  assert.match(registerPreloadSource, /import\('\.\.\/\.\.\/\.\.\/app\/register'\)/);
  assert.match(registerSource, /const REGISTER_INITIAL_PICKER_PRESS_GUARD_MS = 900/);
  assert.doesNotMatch(registerSource, /REGISTER_SECONDARY_CONTENT_DELAY_MS|registerSecondaryContentReady/);
  assert.match(registerSource, /const REGISTER_ROUTE_DATA_DELAY_MS = 900/);
  assert.match(registerSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(registerSource, /const registerDataActive = useDeferredActiveFlag\(\s*isScreenFocused && firstPaintReady,\s*REGISTER_ROUTE_DATA_DELAY_MS,\s*\)/);
  assert.match(registerSource, /notifyRegisterScreenReady/);
  assert.match(registerSource, /const registerReadyNotifiedRef = React\.useRef\(false\)/);
  assert.match(registerSource, /const handleRegisterRootLayout = React\.useCallback\(\(\) => \{[\s\S]*const notifyAfterPaint = \(\) => \{[\s\S]*notifyRegisterScreenReady\(\);[\s\S]*requestAnimationFrame/);
  assert.match(registerSource, /<View style=\{styles\.bg\} onLayout=\{handleRegisterRootLayout\}>/);
  assert.match(registerSource, /const getRegisterInteractionNow = \(\) => \(/);
  assert.match(registerSource, /const registerPickerPressBlockedUntilRef = React\.useRef\(\s*getRegisterInteractionNow\(\) \+ REGISTER_INITIAL_PICKER_PRESS_GUARD_MS,\s*\)/);
  assert.match(registerSource, /const registerPickerFocusSeenRef = React\.useRef\(false\)/);
  assert.match(registerSource, /if \(registerPickerFocusSeenRef\.current !== isScreenFocused\) \{[\s\S]*registerPickerPressBlockedUntilRef\.current =\s*getRegisterInteractionNow\(\) \+ REGISTER_INITIAL_PICKER_PRESS_GUARD_MS;[\s\S]*\}/);
  assert.match(registerSource, /const isRegisterInitialPickerPressBlocked = React\.useCallback\(\(\) => \(\s*getRegisterInteractionNow\(\) < registerPickerPressBlockedUntilRef\.current\s*\), \[\]\)/);
  assert.doesNotMatch(registerSource, /registerPickerPressReady|setRegisterPickerPressReady/);
  assert.match(registerSource, /const handleOpenCountryPicker = React\.useCallback\(\(\) => \{\s*if \(isRegisterInitialPickerPressBlocked\(\)\) \{\s*return;\s*\}[\s\S]*setCountryPickerOpen\(true\);/);
  assert.match(registerSource, /const handleOpenPhoneCountryPicker = React\.useCallback\(\(\) => \{\s*if \(isRegisterInitialPickerPressBlocked\(\)\) \{\s*return;\s*\}[\s\S]*setPhoneCountryPickerOpen\(true\);/);
  assert.match(registerSource, /onLayout=\{handleFieldLayout\('password'\)\}[\s\S]*journalActionLabel="pressed Register demo account button"/);
  assert.doesNotMatch(registerSource, /if \(!registerSecondaryContentReady\)|\{registerSecondaryContentReady \?/);
  assert.match(registerSource, /const \[mountedPickerHosts, setMountedPickerHosts\] = useState<Record<RegisterPickerHostKey, boolean>>/);
  assert.match(registerSource, /const mountPickerHost = React\.useCallback\(\(key: RegisterPickerHostKey\) => \{/);
  assert.doesNotMatch(registerSource, /REGISTER_PICKER_HOST_DELAY_MS|registerPickerHostReady/);
  assert.match(registerSource, /useOrrnnDemoStatus\(registerDataActive\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(registerDataActive && isDemoServiceReady\)/);
  assert.match(registerSource, /useBrokerServers\(registerDataActive\)/);
  assert.match(registerSource, /const countryPickerMounted = mountedPickerHosts\.country \|\| countryPickerOpen/);
  assert.match(registerSource, /const leveragePickerMounted = mountedPickerHosts\.leverage \|\| leveragePickerOpen/);
  assert.match(registerSource, /mountPickerHost\('country'\)/);
  assert.match(registerSource, /mountPickerHost\('leverage'\)/);
  assert.match(registerSource, /\{countryPickerMounted \? \([\s\S]*<ActionSheet[\s\S]*visible=\{countryPickerOpen\}/);
  assert.match(registerSource, /\{leveragePickerMounted \? \([\s\S]*<ActionSheet[\s\S]*visible=\{leveragePickerOpen\}/);
  assert.doesNotMatch(registerSource, /REGISTER_ROUTE_CONTENT_DELAY_MS|RegisterScreenContent|routeShell|useDeferredRouteContentReady/);
  assert.doesNotMatch(settingsSource, /title=\{t\('Mailbox'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/mailbox'\)\}/);
  assert.doesNotMatch(settingsSource, /title=\{t\('News'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/news'\)\}/);
  assert.match(settingsSource, /title=\{t\('Economic Calender'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/economic-calendar'\)\}/);
  assert.match(settingsSource, /title=\{t\('Support'\)\}[\s\S]*sub=\{supportEmail\}[\s\S]*onPress=\{handleEmailSupport\}/);
  assert.match(settingsSource, /title=\{t\('Help'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/help'\)\}/);
  assert.match(settingsSource, /latencyLabel="settings\.logout\.prompt"/);
  assert.doesNotMatch(settingsSource, /traceUiInteraction/);
  assert.match(accountsSource, /paddingLeft: 16/);
  assert.match(accountsSource, /marginLeft: 8/);
  assert.match(accountsSource, /runImmediateAction\('accounts\.optionsSheet\.open'[\s\S]*showAccountsActionSheet\(\{[\s\S]*presentation: 'mt5Plain',[\s\S]*detent: 'auto'/);
  assert.match(accountsSource, /latencyLabel="accounts\.back"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(accountsSource, /const handleConnectAccount = React\.useCallback\(\(\) => \{[\s\S]*preloadBrokersScreen\(\)[\s\S]*showBrokersLaunch\(\)[\s\S]*scheduleBrokersLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*hideSidebarDestination\(\);[\s\S]*router\.push\('\/settings\/brokers'\)/);
  assert.match(accountsSource, /onPress=\{handleConnectAccount\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="accounts\.connect\.open"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(accountsSource, /latencyLabel="accounts\.options\.open"/);
  assert.doesNotMatch(accountsSource, /traceUiInteraction/);
  assert.match(brokersSource, /paddingLeft: 16/);
  assert.match(brokersSource, /gap: 8/);
  assert.match(brokersSource, /latencyLabel="brokers\.back"/);
  assert.match(brokersSource, /const handleBack = \(\) => \{[\s\S]*showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*hideBrokersLaunch\(\);[\s\S]*safeRouterBack\(routerInstance, '\/settings\/accounts'\)/);
  assert.doesNotMatch(brokersSource, /latencyLabel="brokers\.qr"/);
  assert.doesNotMatch(brokersSource, /qr-code-outline/);
  assert.match(brokersSource, /latencyLabel="brokers\.custom"/);
  assert.match(brokersSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(brokersSource, /const routePaintReady = useDeferredRouteContentReady\(0, isScreenFocused\)/);
  assert.match(brokersSource, /useEffect\(\(\) => \{[\s\S]*!routePaintReady[\s\S]*brokerRecords\.length === 0[\s\S]*hideBrokersLaunch\(\);[\s\S]*\}, \[brokerRecords\.length, isScreenFocused, routePaintReady\]\)/);
  assert.doesNotMatch(brokersSource, /handleScreenLayout|onLayout=\{handleScreenLayout\}/);
  assert.match(tabsSource, /const isReturningFromBrokersToAccounts =[\s\S]*previousPath === '\/settings\/brokers'[\s\S]*hostedDestination\.activeDestination === 'accounts'[\s\S]*hostedDestination\.source === 'route-sync'/);
  assert.match(brokersSource, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(brokersSource, /pointerEvents="box-none"/);
  assert.match(brokersSource, /const BROKER_ROW_PRESS_CANCEL_MOVE_PX = 14/);
  assert.match(brokersSource, /type BrokerPressGesture = \{[\s\S]*start: BrokerPressPoint \| null;[\s\S]*handled: boolean;[\s\S]*cancelled: boolean;[\s\S]*\}/);
  assert.match(brokersSource, /const brokerPressGestureRef = useRef<BrokerPressGesture>\(\{[\s\S]*start: null,[\s\S]*handled: false,[\s\S]*cancelled: false,[\s\S]*\}\)/);
  assert.match(brokersSource, /function hasBrokerPressMovedBeyondThreshold\(start: BrokerPressPoint, end: BrokerPressPoint\)[\s\S]*BROKER_ROW_PRESS_CANCEL_MOVE_PX \* BROKER_ROW_PRESS_CANCEL_MOVE_PX/);
  assert.match(brokersSource, /const recordBrokerRowPressStart = \(broker: BrokerRow, event: GestureResponderEvent\) => \{[\s\S]*prepareBrokerDetailLaunch\(toBrokerDetailSelection\(broker\)\);[\s\S]*start: getBrokerPressPoint\(event\),[\s\S]*handled: false,[\s\S]*cancelled: false/);
  assert.match(brokersSource, /const cancelBrokerRowPressForScroll = \(\) => \{[\s\S]*cancelled: true/);
  assert.match(brokersSource, /const recordBrokerRowPressMove = \(event: GestureResponderEvent\) => \{[\s\S]*hasBrokerPressMovedBeyondThreshold\(gesture\.start, current\)[\s\S]*cancelBrokerRowPressForScroll\(\)/);
  assert.match(brokersSource, /const handleBrokerRowPress = \(broker: BrokerRow, event: GestureResponderEvent\) => \{[\s\S]*shouldIgnoreBrokerRowPress\(event\)[\s\S]*handleSelectBroker\(broker\)/);
  assert.match(brokersSource, /const openBrokerDetail = \(selection: BrokerDetailLaunchSelection\) => \{[\s\S]*showBrokerDetailLaunch\(selection\)[\s\S]*scheduleBrokerDetailLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*routerInstance\.push/);
  const openBrokerDetailStart = brokersSource.indexOf('const openBrokerDetail =');
  const recordBrokerPressStart = brokersSource.indexOf('const recordBrokerRowPressStart =', openBrokerDetailStart);
  assert.doesNotMatch(
    brokersSource.slice(openBrokerDetailStart, recordBrokerPressStart),
    /setBrokerConnection|persistSelectedBrokerSession/,
  );
  assert.match(brokersSource, /onScrollBeginDrag=\{cancelBrokerRowPressForScroll\}/);
  assert.match(brokersSource, /onMomentumScrollBegin=\{cancelBrokerRowPressForScroll\}/);
  const brokerRowsStart = brokersSource.indexOf('renderItem={({ item }) => (');
  const brokerRowsEnd = brokersSource.indexOf('ListEmptyComponent=', brokerRowsStart);
  assert.notEqual(brokerRowsStart, -1);
  assert.notEqual(brokerRowsEnd, -1);
  const brokerRowsSource = brokersSource.slice(brokerRowsStart, brokerRowsEnd);
  assert.equal((brokerRowsSource.match(/onPressIn=\{\(event\) => recordBrokerRowPressStart\(item, event\)\}/g) ?? []).length, 1);
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
  assert.match(brokerDetailSource, /router\.push\('\/register-entry'\)/);
  assert.doesNotMatch(brokerDetailSource, /preloadRegisterScreen/);
  const demoNavigationStart = brokerDetailSource.indexOf("const navigateToRegister = (type: 'demo' | 'real')");
  const serverSelectorStart = brokerDetailSource.indexOf('const openServerSelector =', demoNavigationStart);
  assert.notEqual(demoNavigationStart, -1);
  assert.notEqual(serverSelectorStart, -1);
  assert.doesNotMatch(
    brokerDetailSource.slice(demoNavigationStart, serverSelectorStart),
    /persistSelectedBrokerSession|setSecureItemAsync|showRegisterLaunch|scheduleRegisterLaunchNavigation/,
  );
  assert.doesNotMatch(brokerDetailSource, /registerLaunchController|prepareRegisterLaunch/);
  assert.match(brokerDetailSource, /useLayoutEffect\(\(\) => \{[\s\S]*!isScreenFocused \|\| !contentReady[\s\S]*markBrokerDetailLaunchCovered\(\)/);
  assert.doesNotMatch(brokerDetailSource, /pathname: '\/register'/);
  assert.doesNotMatch(brokerDetailSource, /MT5_BLUE_LIGHT/);
  assert.doesNotMatch(brokerDetailSource, /LOGIN_VIOLET/);
  assert.match(registerSource, /const REGISTER_BACK_FALLBACK_HREF = '\/\(tabs\)\/settings'/);
  assert.match(registerSource, /const scheduleRegisterBackAfterVisualFrame = \(action: \(\) => void\) => \{[\s\S]*requestAnimationFrame\(runAfterFrame\)[\s\S]*setTimeout\(action, 0\)/);
  assert.match(registerSource, /const styles = React\.useMemo\(\(\) => makeStyles\(T, isDark, insets\.top\), \[T, isDark, insets\.top\]\)/);
  assert.match(registerSource, /const registerBackNavigationStartedRef = React\.useRef\(false\)/);
  assert.match(registerSource, /if \(isScreenFocused\) \{[\s\S]*registerBackNavigationStartedRef\.current = false;[\s\S]*\}, \[isScreenFocused\]\);/);
  assert.match(registerSource, /const handleRegisterBack = React\.useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*if \(registerBackNavigationStartedRef\.current\) \{[\s\S]*return;[\s\S]*\}[\s\S]*registerBackNavigationStartedRef\.current = true;[\s\S]*router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\);[\s\S]*\}, \[\]\);/);
  assert.match(registerSource, /registerBackNavigationStartedRef\.current = true;[\s\S]*clearTimeout\(fieldFocusTimerRef\.current\);[\s\S]*scheduleRegisterBackAfterVisualFrame\(\(\) => \{[\s\S]*router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\);[\s\S]*\}\)/);
  assert.match(registerSource, /onPress=\{handleRegisterBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="register\.back"[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(rootSource, /const brokerFlowBackground = T\.bg/);
  assert.match(rootSource, /const brokerFlowScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none',[\s\S]*freezeOnBlur: false,[\s\S]*contentStyle: \{ backgroundColor: brokerFlowBackground \},[\s\S]*\} as const;/);
  assert.match(rootSource, /const registerScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none',[\s\S]*presentation: 'card',[\s\S]*gestureEnabled: false,[\s\S]*freezeOnBlur: false,[\s\S]*contentStyle: \{ backgroundColor: brokerFlowBackground \},[\s\S]*\} as const;/);
  assert.match(rootSource, /<Stack\.Screen name='register-entry' options=\{registerScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='register' options=\{registerScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='settings\/brokers' options=\{brokerFlowScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='settings\/broker-detail' options=\{brokerFlowScreenOptions\}/);
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
  const launchShellSource = readSource('src/features/trade/OrderTicketLaunchShell.tsx');

  assert.match(source, /latencyLabel="orderTicket\.back"/);
  assert.match(source, /const handleOrderTicketBack = useCallback\(\(\) => \{[\s\S]*backNavigationStartedRef\.current = true;[\s\S]*hideOrderTicketLaunch\(\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/trade'\)/);
  assert.match(source, /onPress=\{handleOrderTicketBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="orderTicket\.back"[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(source, /const wasFocusedRef = useRef\(false\);[\s\S]*if \(isScreenFocused\) \{[\s\S]*wasFocusedRef\.current = true;[\s\S]*if \(wasFocusedRef\.current\) \{[\s\S]*hideOrderTicketLaunch\(\)/);
  assert.match(launchShellSource, /backLatencyLabel = 'orderTicket\.shell\.back'/);
  assert.match(launchShellSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel=\{backLatencyLabel\}[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
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
  assert.match(source, /import \{ useDeferredRouteContentReady \} from '\.\.\/\.\.\/ui\/components\/DeferredRouteMount'/);
  assert.match(source, /const ORDER_TICKET_FULL_CONTENT_DELAY_MS = 0/);
  assert.match(source, /export function OrderTicketScreen\(\) \{[\s\S]*const isScreenFocused = useIsFocused\(\);[\s\S]*useDeferredRouteContentReady\(ORDER_TICKET_FULL_CONTENT_DELAY_MS, isScreenFocused\)/);
  assert.match(source, /const ORDER_TICKET_DATA_READY_DELAY_MS = 180/);
  assert.match(source, /const ORDER_TICKET_HEAVY_CONTENT_DELAY_MS = 240/);
  assert.match(source, /const routeDataReady = useDeferredRouteContentReady\(ORDER_TICKET_DATA_READY_DELAY_MS\)/);
  assert.match(source, /const heavyContentReady = useDeferredRouteContentReady\(ORDER_TICKET_HEAVY_CONTENT_DELAY_MS\)/);
  assert.match(source, /const routeQueriesActive = isScreenFocused && routeDataReady/);
  assert.match(source, /useMarketSymbols\(routeQueriesActive \|\| symbolPickerOpen\)/);
  assert.match(source, /useInstrumentMeta\(symbol, routeQueriesActive\)/);
  assert.match(source, /useLiveTick\(symbol, undefined, routeQueriesActive\)/);
  assert.match(source, /useAccountSummary\(loginStr, \{ enabled: routeQueriesActive \}\)/);
  assert.match(source, /if \(!routeQueriesActive\) return null/);
  assert.match(source, /heavyContentReady \? \([\s\S]*<LiveOrderTickExecutionGraph/);
  assert.match(source, /styles\.executionGraphPlaceholder/);
  assert.doesNotMatch(source, /livePill|liveDot|liveLabel/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('close position actions use the immediate trade path', () => {
  const rootSource = readSource('app/_layout.tsx');
  const overlaySource = readSource('src/ui/components/TradePositionRow/OverlayActions.tsx');
  const closePositionSource = readSource('src/features/trade/ClosePositionScreen.tsx');
  const closeBySource = readSource('src/features/trade/CloseByScreen.tsx');
  const positionsStateSource = readSource('src/state/positionsState.ts');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const closeFlowSource = readSource('src/features/trade/closePositionFlow.ts');

  assert.match(rootSource, /<Stack\.Screen name='quotes\/details' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/market-statistics' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/order-ticket' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/close-position' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(overlaySource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(overlaySource, /onPress=\{onClose\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="tradeRow\.closePosition\.submit"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  // The row's X closes the position immediately (optimistic) instead of opening the Close Position screen.
  assert.match(rowSource, /import \{ closePositionImmediately \} from '\.\.\/\.\.\/\.\.\/features\/trade\/closePositionFlow'/);
  assert.match(rowSource, /onClose=\{\(\) => runOverlayAction\(\(\) => closePositionImmediately\(item, \{ resolvedLogin: tradingLogin \}\)\)\}/);
  assert.match(closeFlowSource, /beginOptimisticClose\(ticketId\)[\s\S]*void positionsApi[\s\S]*\.closePosition\(ticketId\)/);
  assert.match(closeFlowSource, /finishOptimisticClose\(ticketId\)/);
  assert.match(closeFlowSource, /rollbackOptimisticClose\(closeSnapshot\)/);
  assert.match(closeFlowSource, /Alert\.alert\(feedback\.title, feedback\.message\)/);
  assert.match(closePositionSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(closePositionSource, /onPress=\{\(\) => \{ void handleClosePosition\(\); \}\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="closePosition\.submit"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(closePositionSource, /beginOptimisticClose\(ticketId\)[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/trade'\)[\s\S]*void positionsApi\.closePosition\(ticketId\)/);
  assert.match(closePositionSource, /finishOptimisticClose\(ticketId\)/);
  assert.match(closePositionSource, /rollbackOptimisticClose\(closeSnapshot\)/);
  assert.match(closePositionSource, /Alert\.alert\(feedback\.title, feedback\.message\)/);
  assert.match(closeBySource, /beginOptimisticClose\(sourcePosition\.id\)[\s\S]*beginOptimisticClose\(selectedPair\.id\)[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/trade'\)[\s\S]*void positionsApi\.closePosition\(sourcePosition\.id, selectedPair\.id\)/);
  assert.match(closeBySource, /finishOptimisticClose\(sourcePosition\.id\)[\s\S]*finishOptimisticClose\(selectedPair\.id\)/);
  assert.match(closeBySource, /rollbackOptimisticClose\(sourceSnapshot\)[\s\S]*rollbackOptimisticClose\(pairSnapshot\)/);
  assert.match(positionsStateSource, /const OPTIMISTIC_CLOSE_SUPPRESS_MS = 60_000/);
  assert.match(positionsStateSource, /const optimisticCloseUntilByPositionId = new Map<string, number>\(\)/);
  assert.match(positionsStateSource, /beginOptimisticClose: \(positionId\) => \{[\s\S]*markPositionOptimisticallyClosing\(positionId\)[\s\S]*get\(\)\.removePosition\(positionId\)/);
  assert.match(positionsStateSource, /finishOptimisticClose: \(positionId\) => \{[\s\S]*markPositionOptimisticallyClosing\(positionId\)[\s\S]*get\(\)\.removePosition\(positionId\)/);
  assert.match(positionsStateSource, /rollbackOptimisticClose: \(position\) => \{[\s\S]*clearPositionOptimisticallyClosing\(position\.id\)[\s\S]*positionSnapshots:/);
  assert.match(positionsStateSource, /dtos\.filter\(\(dto\) => !isPositionOptimisticallyClosing\(resolvePositionId\(dto\)\)\)/);
  assert.match(positionsStateSource, /if \(isPositionOptimisticallyClosing\(resolvePositionId\(dto\)\)\) \{/);
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
  assert.match(nativeChartSource, /runImmediateAction\('chart\.tradeSheet\.pending\.submit'/);
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

  assert.match(tabsSource, /backgroundColor: isDark \? T\.bg : '#ffffff'/);
  assert.match(tabsSource, /borderTopColor: isDark \? T\.borderSubtle : 'rgba\(0,0,0,0\.05\)'/);
  assert.match(tabsSource, /const inactiveTabColor = isDark \? T\.textMuted : T\.textDimmed/);
  assert.match(tabsSource, /const themeMode = useThemeMode\(\)/);
  assert.doesNotMatch(tabsSource, /useDeferredThemeMode\(\)/);
  assert.match(actionSheetStyles, /makeActionSheetStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(actionSheetStyles, /backgroundColor: isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.match(settingsStyles, /makeSettingsStyles = \(T: ThemeColors, themeMode: 'light' \| 'dark'\)/);
  assert.match(settingsStyles, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(settingsStyles, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
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
  assert.match(settingsSource, /const routePath = item\.routePath/);
  assert.match(settingsSource, /onPress=\{isThemeItem \? toggleThemeMode : routePath \|\| item\.action \? \(\) => handleSearchResultPress\(item\) : undefined\}/);
  assert.match(settingsSource, /onPressIn=\{routePath \? \(\) => prepareReadySettingsRoute\(routePath\) : undefined\}/);
  assert.doesNotMatch(settingsSource, /activateOnPressIn=\{isThemeItem\}/);
  assert.doesNotMatch(settingsSource, /title=\{t\('Theme'\)\}[\s\S]*onPress=\{toggleThemeMode\}[\s\S]*activateOnPressIn/);
  assert.match(settingsSource, /<View pointerEvents="none">[\s\S]*<Switch/);
  assert.match(settingRowSource, /activateOnPressIn\?: boolean/);
  assert.match(settingRowSource, /activateOnPressIn=\{activateOnPressIn\}/);
});
