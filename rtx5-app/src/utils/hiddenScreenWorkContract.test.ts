import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hidden tab screens do not keep live feed subscriptions active over stack routes', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const marketDataSource = readSource('src/query/websocket.ts');
  const marketSymbolsSource = readSource('src/query/market.ts');
  const instrumentsSource = readSource('src/query/instruments.ts');
  const alertsSource = readSource('src/query/alerts.ts');
  const marketStatusSource = readSource('src/query/marketStatus.ts');
  const priceAlertsSource = readSource('src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx');
  const chartSpecificationSource = readSource('src/features/chart/ChartSpecificationScreen.tsx');
  const newsSource = readSource('src/features/settings/NewsScreen.tsx');
  const registerSource = readSource('app/register.tsx');
  const publicDemoSource = readSource('src/query/publicDemo.ts');
  const liveCandlesSource = readSource('src/domain/candles/hooks/useLiveCandles.ts');
  const chartLiveHeadersSource = readSource('src/features/chart/components/ChartLiveHeaders.tsx');
  const chartTradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');

  assert.match(quotesSource, /import \{ usePathname, useRouter \} from 'expo-router'/);
  assert.match(quotesSource, /const pathname = usePathname\(\)/);
  assert.match(quotesSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(quotesSource, /const quoteServerDataActive = useDeferredActiveFlag\(isScreenFocused && isLoggedIn\)/);
  assert.match(quotesSource, /useMarketSymbols\(quoteServerDataActive\)/);
  assert.match(quotesSource, /useWatchlistQuery\(quoteServerDataActive\)/);
  assert.match(quotesSource, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(quotesSource, /const quoteRouteActive =[\s\S]*isScreenFocused[\s\S]*pathname === '\/quotes'[\s\S]*pathname\.startsWith\('\/quotes\/'\)[\s\S]*pathname === '\/\(tabs\)\/quotes'[\s\S]*pathname\.startsWith\('\/\(tabs\)\/quotes\/'\)/);
  assert.match(quotesSource, /const quoteStickyFeedActive = quoteRouteActive/);
  assert.match(quotesSource, /const quoteFeedActive = quoteStickyFeedActive && !sidebarOpen/);
  assert.match(quotesSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  assert.match(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteFeedActive\)/);
  assert.match(quotesSource, /<TickCounter[\s\S]*active=\{quoteFeedActive\}/);
  assert.doesNotMatch(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, true\)/);

  assert.match(marketDataSource, /export function useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.doesNotMatch(marketDataSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketDataSource, /const isActive = active/);
  assert.match(marketDataSource, /if \(!isActive \|\| normalizedSymbols\.length === 0\) return EMPTY_LIVE_QUOTES/);
  assert.match(marketDataSource, /if \(!isActive \|\| transportSymbols\.length === 0\) return/);
  assert.match(marketDataSource, /useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /export function useLiveSymbolQuote\([\s\S]*symbol: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS/);
  assert.match(marketDataSource, /if \(!isActive \|\| !normalizedSymbol\)/);
  assert.match(marketSymbolsSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketSymbolsSource, /const isEnabled = enabled && isLoggedIn/);
  assert.match(marketSymbolsSource, /enabled: isEnabled/);
  assert.match(instrumentsSource, /const isEnabled = enabled && isLoggedIn && !!normalizedSymbol/);
  assert.match(instrumentsSource, /enabled: isEnabled/);
  assert.match(alertsSource, /const enabled = \(options\.enabled \?\? true\) && isLoggedIn/);
  assert.match(marketStatusSource, /const isEnabled = enabled && isLoggedIn && !!symbol/);
  assert.match(marketStatusSource, /refetchInterval: isEnabled \? 30_000 : false/);
  assert.match(registerSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(registerSource, /useOrrnnDemoStatus\(isScreenFocused\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(isScreenFocused && isDemoServiceReady\)/);
  assert.match(publicDemoSource, /export function useOrrnnDemoStatus\(enabled = true\)/);
  assert.match(publicDemoSource, /refetchInterval: enabled \? 30 \* 1000 : false/);

  assert.match(liveCandlesSource, /export function useLiveCandles\(symbol: string, timeframe: string, active = true\)/);
  assert.match(liveCandlesSource, /if \(!active \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/);
  assert.match(liveCandlesSource, /export function useLiveTick\(symbol: string, _timeframe\?: string, active = true\)/);
  assert.match(liveCandlesSource, /useMarketData\(symbol \? \[symbol\] : \[\], active\)/);
  assert.doesNotMatch(rootLayoutSource, /prefetchChartCandles/);

  assert.match(chartSource, /import \{ router, useFocusEffect, usePathname \} from 'expo-router'/);
  assert.match(chartSource, /const pathname = usePathname\(\)/);
  assert.match(chartSource, /const isChartRouteActive =[\s\S]*pathname === '\/chart'[\s\S]*pathname\.startsWith\('\/chart\/'\)/);
  assert.match(chartSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(chartSource, /import \{ scheduleIdleWork \} from '\.\.\/\.\.\/utils\/startupScheduler'/);
  assert.match(chartSource, /const CHART_RUNTIME_ACTIVE_DELAY_MS = 650/);
  assert.match(chartSource, /const CHART_FOCUS_WORK_DELAY_MS = 650/);
  assert.match(chartSource, /const CHART_SURFACE_MOUNT_DELAY_MS = 650/);
  assert.match(chartSource, /const chartRuntimeActive = useDeferredActiveFlag\(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS\)/);
  assert.match(chartSource, /const chartSurfaceReady = useDeferredActiveFlag\(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS\)/);
  assert.match(chartSource, /useLiveSymbolQuote\(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.doesNotMatch(chartLiveHeadersSource, /useMarketData|useLiveTick/);
  assert.match(chartTradeButtonsSource, /useLiveSymbolQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.match(chartSource, /useMarketSymbols\(chartRuntimeActive\)/);
  assert.match(chartSource, /useInstrumentMeta\(chartSymbol, chartRuntimeActive\)/);
  assert.match(chartSource, /useLiveCandles\(chartSymbol, chartTimeframe, chartRuntimeActive\)/);
  assert.match(chartSource, /const refreshShowOnChartSources = useCallback\(\(\) => \{[\s\S]*if \(!chartRuntimeActive\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(chartSource, /scheduleIdleWork\([\s\S]*refreshShowOnChartSources\(\);[\s\S]*requestChartViewportRecovery\(3\);[\s\S]*delayMs: CHART_FOCUS_WORK_DELAY_MS/);
  assert.match(chartSource, /\{\(!chartSurfaceReady \|\| isLoading\) && \(/);
  assert.match(chartSource, /\{chartSurfaceReady \? \(\s*<WebView/);
  assert.match(chartSource, /<LiveQuotePairHeader[\s\S]*bid=\{chartBid\}[\s\S]*ask=\{chartAsk\}/);
  assert.match(chartSource, /<ChartTradeButtons[\s\S]*active=\{chartRuntimeActive\}/);
  assert.match(priceAlertsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(priceAlertsSource, /useAlertsQuery\(\{[\s\S]*enabled: isScreenFocused/);
  assert.match(chartSpecificationSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(chartSpecificationSource, /useInstrumentMeta\(currentSymbol, isScreenFocused\)/);
  assert.match(chartSpecificationSource, /useMarketStatus\(currentSymbol, isScreenFocused\)/);
  assert.match(newsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(newsSource, /useMarketSymbols\(isScreenFocused\)/);
});

test('settings and trade screens pause polling when another stack screen is focused', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const calendarSource = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');
  const healthSource = readSource('src/query/health.ts');
  const mt5Source = readSource('src/query/mt5.ts');
  const accountsQuerySource = readSource('src/query/accounts.ts');

  assert.match(accountsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(accountsSource, /const screenDataActive = isLoggedIn && isScreenFocused/);
  assert.match(accountsSource, /useAccounts\(screenDataActive\)/);
  assert.match(accountsSource, /useBrokerConfig\(brokerId, isScreenFocused\)/);
  assert.match(accountsSource, /useAccountDetails\(activeLogin, screenDataActive && !!activeLogin\)/);
  assert.match(accountsSource, /useHealth\(isScreenFocused\)/);
  assert.match(accountsSource, /useMt5Status\(isScreenFocused\)/);

  assert.match(settingsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(settingsSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(settingsSource, /const settingsDataActive = useDeferredActiveFlag\(isLoggedIn && isScreenFocused\)/);
  assert.match(settingsSource, /useAccounts\(settingsDataActive\)/);
  assert.match(settingsSource, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);

  assert.match(tradeSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(tradeSource, /const TRADE_FOCUS_WORK_DELAY_MS = 650/);
  assert.match(tradeSource, /const \[focusWorkReady, setFocusWorkReady\] = useState\(false\)/);
  assert.match(tradeSource, /scheduleTradeFocusWork/);
  assert.match(tradeSource, /setFocusWorkReady\(true\)/);
  assert.match(tradeSource, /if \(focusWorkReady && resolvedLogin\) \{/);
  assert.match(tradeSource, /if \(!focusWorkReady\) \{/);
  assert.match(tradeSource, /<AppHeader title=\{t\('Trade'\)\} noBorder \/>[\s\S]*\+0\.00 \{pnlCurrency\}/);
  assert.match(tradeSource, /<TradeSummaryHeader[\s\S]*active=\{focusWorkReady\}/);
  assert.match(tradeSummarySource, /active: boolean/);
  assert.match(tradeSummarySource, /useMarketData\(liveQuoteSymbols, active\)/);
  assert.match(tradeSummarySource, /if \(!active\) \{[\s\S]*pulseAnim\.setValue\(1\);[\s\S]*return;[\s\S]*\}/);
  assert.match(calendarSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(calendarSource, /const CALENDAR_INITIAL_DATA_DELAY_MS = 120/);
  assert.match(calendarSource, /const calendarDataReady = useDeferredRouteContentReady\(CALENDAR_INITIAL_DATA_DELAY_MS\)/);
  assert.match(calendarSource, /if \(!isScreenFocused \|\| !calendarDataReady\) \{[\s\S]*return;[\s\S]*\}/);

  assert.match(healthSource, /export function useHealth\(enabled = true\)/);
  assert.match(healthSource, /refetchInterval: enabled \? 30000 : false/);
  assert.match(mt5Source, /export function useMt5Status\(enabled = true\)/);
  assert.match(mt5Source, /refetchInterval: enabled \? 30000 : false/);
  assert.match(accountsQuerySource, /const isEnabled = enabled \?\? true/);
  assert.match(accountsQuerySource, /refetchInterval: isEnabled \? 10 \* 1000 : false/);
  assert.match(accountsQuerySource, /refetchInterval: isEnabled \? 30 \* 1000 : false/);
});

test('high-volume diagnostics are disabled unless explicitly requested', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const accountsApiSource = readSource('src/api/accounts.ts');
  const quotesWsSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const apiLatencySource = readSource('src/utils/apiLatency.ts');
  const positionsApiSource = readSource('src/api/positions/index.ts');
  const positionsStateSource = readSource('src/state/positionsState.ts');
  const accountWsSource = readSource('src/api/ws/accountSocket.ts');

  assert.match(accountsSource, /EXPO_PUBLIC_DEBUG_ACCOUNTS_SCREEN === 'true'/);
  assert.match(accountsSource, /logAccountsScreenDiagnostic\('\[AccountsScreen\] activeAccount:'/);
  assert.match(accountsSource, /logAccountsScreenDiagnostic\('\[AccountsScreen\] live WS metrics:'/);
  assert.match(accountsSource, /logAccountsScreenDiagnostic\('\[AccountsScreen\] display values:'/);
  assert.doesNotMatch(accountsSource, /console\.log\('\[AccountsScreen\]/);

  assert.match(accountsApiSource, /EXPO_PUBLIC_DEBUG_ACCOUNTS_API === 'true'/);
  assert.match(accountsApiSource, /if \(DEBUG_ACCOUNTS_API\) \{[\s\S]*Raw backend response:[\s\S]*Mapped accounts:/);

  assert.match(quotesWsSource, /EXPO_PUBLIC_DEBUG_CANDLE_FEED === 'true'/);
  assert.doesNotMatch(quotesWsSource, /typeof __DEV__ === 'undefined' \|\| __DEV__/);

  assert.match(apiLatencySource, /EXPO_PUBLIC_DEBUG_API_LATENCY === 'true'/);
  assert.match(apiLatencySource, /severity !== 'ok' \|\| API_LATENCY_LOG_OK_RESPONSES/);
  assert.match(apiLatencySource, /if \(shouldLogApiLatency\(severity\)\) \{/);

  assert.match(positionsApiSource, /EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true'/);
  assert.match(positionsApiSource, /logPositionsApiDiagnostic\('\[PositionsAPI\] GET'/);
  assert.doesNotMatch(positionsApiSource, /console\.log\('\[PositionsAPI\]/);
  assert.match(positionsStateSource, /EXPO_PUBLIC_DEBUG_POSITIONS_STATE === 'true'/);
  assert.match(positionsStateSource, /positionsRateLimitUntilByLogin/);
  assert.match(positionsStateSource, /state\.isLoading && state\.lastFetchLogin === accountLogin/);
  assert.match(accountWsSource, /EXPO_PUBLIC_DEBUG_ACCOUNT_WS === 'true'/);
  assert.match(accountWsSource, /logAccountWsDiagnostic\('\[Account WS\] Connected'\)/);
  assert.doesNotMatch(accountWsSource, /console\.log\('\[Account WS\]/);
});

test('shared fast press uses the native responder press recognizer', () => {
  const fastPressSource = readSource('src/ui/components/FastPressable.tsx');

  assert.match(fastPressSource, /from 'react-native'/);
  assert.match(fastPressSource, /type GestureResponderEvent/);
  assert.match(fastPressSource, /type FastPressEvent = GestureResponderEvent/);
  assert.match(fastPressSource, /const normalizePressEvent = \(event: FastPressEvent\) => \{/);
  assert.match(fastPressSource, /eventWithResponderControls\.stopPropagation \?\?= \(\) => undefined/);
  assert.doesNotMatch(fastPressSource, /react-native-gesture-handler/);
});
