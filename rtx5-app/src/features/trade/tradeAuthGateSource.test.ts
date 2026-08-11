import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertGuardBefore(block: string, laterMarker: string): void {
  const guardIndex = block.indexOf('requestOrrnnDemoTradeAuth');
  const laterIndex = block.indexOf(laterMarker);
  assert.notEqual(guardIndex, -1, 'shared demo trade guard is missing');
  assert.notEqual(laterIndex, -1, `missing protected operation: ${laterMarker}`);
  assert.ok(guardIndex < laterIndex, `guard must run before ${laterMarker}`);
}

test('trade auth prompt uses the native Android alert, safe actions, and direct routes', () => {
  const source = readSource('src/features/trade/tradeAuthPrompt.ts');
  const rootSource = readSource('app/_layout.tsx');

  assert.match(source, /import \{ Alert \} from 'react-native'/);
  assert.match(source, /Alert\.alert\(/);
  assert.match(
    source,
    /Create a demo account to place the trade, or log in if you already have credentials\./,
  );
  assert.match(source, /text: 'Not now'/);
  assert.match(source, /text: 'Log In'[\s\S]*router\.push\('\/login'\)/);
  assert.match(source, /text: 'Create Demo Account'[\s\S]*router\.push\('\/register-entry'\)/);
  assert.ok(source.indexOf("text: 'Not now'") < source.indexOf("text: 'Log In'"));
  assert.ok(source.indexOf("text: 'Log In'") < source.indexOf("text: 'Create Demo Account'"));
  assert.match(source, /savePendingTradeAuthIntent\(intent\)/);
  assert.match(source, /const cancelTradeAuthPrompt = \(\) => \{[\s\S]*clearPendingTradeAuthIntent\(\)/);
  assert.match(source, /if \(tradeAuthPromptVisible\)[\s\S]*return true/);
  assert.match(source, /cancelable: true[\s\S]*onDismiss: cancelTradeAuthPrompt/);
  assert.match(source, /captureActiveBrokerSession\(\)/);
  assert.doesNotMatch(rootSource, /TradeAuthPromptHost/);
});

test('successful login or demo creation consumes the intent without auto-submitting a trade', () => {
  const login = readSource('app/login.tsx');
  const register = readSource('app/register.tsx');

  for (const source of [login, register]) {
    assert.match(source, /const pendingTradeIntent = consumePendingTradeAuthIntent\(\)/);
    assert.match(source, /pathname: '\/trade\/order-ticket'/);
    assert.match(source, /router\.replace\('\/\(tabs\)\/trade'\)/);
    assert.doesNotMatch(source, /pendingTradeIntent[\s\S]{0,300}placeMarketOrder/);
  }
});

test('primary trade entry points guard before navigation, prefetch, or execution', () => {
  const tabs = readSource('app/(tabs)/_layout.tsx');
  const tabPress = sourceBetween(tabs, 'const runTabPress', 'const handleTouchStart');
  assertGuardBefore(tabPress, 'showFastTabVisual');
  assert.match(tabPress, /routeName === 'trade'/);

  const sidebar = readSource('src/ui/components/SidebarDrawer.tsx');
  const sidebarNavigation = sourceBetween(
    sidebar,
    'const navigateSidebarRoute',
    'const openSupportEmail',
  );
  assertGuardBefore(sidebarNavigation, 'showFastTabVisualForSidebar');
  assert.match(sidebarNavigation, /route === '\/trade'/);

  const quotes = readSource('src/features/quotes/QuotesScreen.tsx');
  const quoteOrder = sourceBetween(
    quotes,
    'const openOrderTicketForSymbol',
    'const quoteTapActionSheetConfigs',
  );
  assertGuardBefore(quoteOrder, 'runQuoteSheetOption');
  assertGuardBefore(quoteOrder, 'prepareOrderTicketLaunch');

  const details = readSource('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx');
  const detailsTrade = sourceBetween(details, 'const handleTrade', 'const handleTradeNow');
  assertGuardBefore(detailsTrade, 'tradeTapLockRef.current');
  assertGuardBefore(detailsTrade, 'placeOrder(');
  const tradeNow = sourceBetween(details, 'const handleTradeNow', '\n\n  return (');
  assertGuardBefore(tradeNow, 'prefetchOrderTicketData');

  const chart = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const chartTrade = sourceBetween(chart, 'const executeTrade', 'const handleTrade');
  assertGuardBefore(chartTrade, 'getChartTradeAction');
  assertGuardBefore(chartTrade, 'showOrderTicketLaunch');
  assertGuardBefore(chartTrade, 'processNextQueuedTrade');
  assert.match(chart, /const chartTradeActionDisabled = isPublicDemoTradePrompt[\s\S]*\? false/);
  const chartButtons = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );
  assert.match(chartButtons, /const tradeBlocked = isPublicDemoTradePrompt[\s\S]*\? false/);
  assert.match(details, /disabled=\{isPending \|\| \(!isPublicDemoTradePrompt/);

  const webChart = readSource('src/features/chart/ChartScreen.web.tsx');
  const webTrade = sourceBetween(
    webChart,
    'const handleTrade',
    '// Micro-component: isolated 4fps render cycle',
  );
  assertGuardBefore(webTrade, 'getCurrentAvailability');
  assert.match(webChart, /disabled=\{isPending \|\| \(!isPublicDemoTradePrompt/);
});

test('order ticket and position mutations guard before validation or API calls', () => {
  const ticket = readSource('src/features/trade/OrderTicketScreen.tsx');
  const market = sourceBetween(ticket, 'const handlePlaceOrder', 'const queryClient');
  const pending = sourceBetween(ticket, 'const handlePlacePendingOrder', 'const rawSpreadPoints');
  assertGuardBefore(market, 'resolveCurrentQuoteAvailability');
  assertGuardBefore(market, 'ordersApi.placeMarketOrder');
  assertGuardBefore(pending, 'isPendingOrderTypeBackendLocked');
  assertGuardBefore(pending, 'ordersApi.placePendingOrder');

  const quickClose = readSource('src/features/trade/closePositionFlow.ts');
  const closeHandler = sourceBetween(quickClose, 'export function closePositionImmediately', '\n}');
  assertGuardBefore(closeHandler, 'resolveSessionQuoteActionAvailability');
  assertGuardBefore(closeHandler, 'positionsApi');

  const bulk = readSource('src/features/trade/BulkOperationScreen.tsx');
  const bulkHandler = sourceBetween(bulk, 'const handleExecute', '\n\n  if (!isScreenFocused)');
  assertGuardBefore(bulkHandler, 'resolveBulkQuoteBlock');
  assertGuardBefore(bulkHandler, 'positionsApi.closePosition');

  const closeScreen = readSource('src/features/trade/ClosePositionScreen.tsx');
  const closeSubmit = sourceBetween(
    closeScreen,
    'const handleClosePosition',
    '// Inactive retained layers',
  );
  assertGuardBefore(closeSubmit, 'getCurrentAvailability');
  assertGuardBefore(closeSubmit, 'positionsApi.closePosition');

  const modifyScreen = readSource('src/features/trade/ModifyPositionScreen.tsx');
  const modifySubmit = sourceBetween(
    modifyScreen,
    'const handleModify',
    '// Inactive retained layers',
  );
  assertGuardBefore(modifySubmit, 'getCurrentClosingMarketPrice');
  assertGuardBefore(modifySubmit, 'submitModifyPosition');

  const nativeChart = readSource('src/features/chart/ChartScreen.native.tsx');
  const chartModify = sourceBetween(
    nativeChart,
    'const commitChartPositionStopLevels',
    'const commitChartTradeSheetStopsForPosition',
  );
  assertGuardBefore(chartModify, 'submitModifyPosition');
  const chartPending = sourceBetween(
    nativeChart,
    'const handleSubmitPendingTradeFromSheet',
    'const handleToggleChartTradeSheetMode',
  );
  assertGuardBefore(chartPending, 'isPendingOrderTypeBackendLocked');
  assertGuardBefore(chartPending, 'ordersApi.placePendingOrder');
});
