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
  assert.doesNotMatch(quotesSource, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(quotesSource, /const quoteRouteActive =[\s\S]*isScreenFocused[\s\S]*pathname === '\/quotes'[\s\S]*pathname\.startsWith\('\/quotes\/'\)[\s\S]*pathname === '\/\(tabs\)\/quotes'[\s\S]*pathname\.startsWith\('\/\(tabs\)\/quotes\/'\)/);
  assert.match(quotesSource, /const quoteCatalogActive = quoteRouteActive && !quoteSheetRouteActionPending/);
  assert.match(quotesSource, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /useMarketSymbols\(quoteCatalogActive\)/);
  assert.match(quotesSource, /useWatchlistQuery\(quoteWatchlistActive\)/);
  assert.match(quotesSource, /const quoteStickyFeedActive = quoteCatalogActive/);
  assert.match(quotesSource, /const quoteRestFallbackActive = quoteCatalogActive/);
  assert.match(quotesSource, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(quotesSource, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(quotesSource, /const pauseQuoteSheetFeed = useCallback\(\(durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS\) => \{/);
  assert.doesNotMatch(quotesSource, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.match(quotesSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  assert.match(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/);
  assert.match(quotesSource, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(quotesSource, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}/);
  assert.doesNotMatch(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, true\)/);

  assert.match(marketDataSource, /export function useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.doesNotMatch(marketDataSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketDataSource, /const isActive = active/);
  assert.match(marketDataSource, /if \(!isActive \|\| normalizedSymbols\.length === 0\) return EMPTY_LIVE_QUOTES/);
  assert.match(marketDataSource, /if \(!isActive \|\| transportSymbols\.length === 0\) return/);
  assert.match(marketDataSource, /useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /export function useLiveSymbolQuote\([\s\S]*symbol: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS/);
  assert.match(marketDataSource, /const LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs === 0\) \{[\s\S]*commit\(\);[\s\S]*return;[\s\S]*\}/);
  assert.match(marketDataSource, /safeCommitIntervalMs <= 16[\s\S]*globalThis\.requestAnimationFrame/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs <= 16\) \{[\s\S]*updateLiveQuote\(\);[\s\S]*\} else \{[\s\S]*React\.startTransition\(updateLiveQuote\)/);
  assert.match(marketDataSource, /if \(!isActive \|\| !normalizedSymbol\)/);
  assert.match(marketDataSource, /isLoggedIn \? \{\} : \{ skipAuth: true, skipRefresh: true \}/);
  assert.match(marketSymbolsSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketSymbolsSource, /const accountScope = isLoggedIn \? accountId : 'public'/);
  assert.match(marketSymbolsSource, /const isEnabled = enabled/);
  assert.match(marketSymbolsSource, /isLoggedIn \? \{\} : \{ skipAuth: true, skipRefresh: true \}/);
  assert.match(marketSymbolsSource, /enabled: isEnabled/);
  assert.match(marketSymbolsSource, /placeholderData: \(previousData\) => previousData/);
  assert.match(instrumentsSource, /const isEnabled = enabled && isLoggedIn && !!normalizedSymbol/);
  assert.match(instrumentsSource, /enabled: isEnabled/);
  assert.match(alertsSource, /const enabled = \(options\.enabled \?\? true\) && isLoggedIn/);
  assert.match(marketStatusSource, /const isEnabled = enabled && isLoggedIn && !!symbol/);
  assert.match(marketStatusSource, /refetchInterval: isEnabled \? 30_000 : false/);
  assert.match(registerSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(registerSource, /const registerDataActive = useDeferredActiveFlag\(\s*isScreenFocused && firstPaintReady,\s*REGISTER_ROUTE_DATA_DELAY_MS,\s*\)/);
  assert.match(registerSource, /useOrrnnDemoStatus\(registerDataActive\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(registerDataActive && isDemoServiceReady\)/);
  assert.match(publicDemoSource, /export function useOrrnnDemoStatus\(enabled = true\)/);
  assert.match(publicDemoSource, /refetchInterval: enabled \? 30 \* 1000 : false/);

  assert.match(liveCandlesSource, /export function useLiveCandles\(symbol: string, timeframe: string, active = true\)/);
  assert.match(liveCandlesSource, /if \(!active \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/);
  assert.doesNotMatch(liveCandlesSource, /hasAuthenticatedCandleSession/);
  assert.match(liveCandlesSource, /export function useLiveTick\(symbol: string, _timeframe\?: string, active = true\)/);
  assert.match(liveCandlesSource, /useMarketData\(symbol \? \[symbol\] : \[\], active\)/);
  assert.doesNotMatch(rootLayoutSource, /prefetchChartCandles/);

  assert.match(chartSource, /import \{ router, useFocusEffect, usePathname \} from 'expo-router'/);
  assert.match(chartSource, /const pathname = usePathname\(\)/);
  assert.match(chartSource, /const isChartRouteActive =[\s\S]*pathname === '\/chart'[\s\S]*pathname\.startsWith\('\/chart\/'\)/);
  assert.match(chartSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(chartSource, /import \{ scheduleIdleWork \} from '\.\.\/\.\.\/utils\/startupScheduler'/);
  assert.match(chartSource, /const CHART_RUNTIME_ACTIVE_DELAY_MS = 0/);
  assert.match(chartSource, /const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 0/);
  assert.match(chartSource, /const CHART_FOCUS_WORK_DELAY_MS = 650/);
  assert.match(chartSource, /const CHART_SURFACE_MOUNT_DELAY_MS = 650/);
  assert.match(chartSource, /const chartRuntimeActive = useDeferredActiveFlag\(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS\)/);
  // Mount-once keep-alive + pre-warm: the chart surface mounts in the background
  // shortly after the screen mounts (prefetched tab) or on first focus, then must
  // stay mounted across tab switches (latched) so the WebView never reloads on
  // refocus. Hidden-tab work is paused via chartRuntimeActive instead.
  assert.match(chartSource, /import \{ useLatchedFlag \} from '\.\.\/\.\.\/hooks\/useLatchedFlag'/);
  assert.match(chartSource, /const CHART_SURFACE_PREWARM_DELAY_MS = 3000/);
  assert.match(chartSource, /const chartSurfaceActivated = useDeferredActiveFlag\(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS\)/);
  assert.match(chartSource, /const \[chartSurfacePrewarmed, setChartSurfacePrewarmed\] = useState\(false\)/);
  assert.match(chartSource, /scheduleIdleWork\(\(\) => setChartSurfacePrewarmed\(true\), \{\s*delayMs: CHART_SURFACE_PREWARM_DELAY_MS/);
  assert.match(chartSource, /const chartSurfaceReady = useLatchedFlag\(chartSurfaceActivated \|\| chartSurfacePrewarmed\)/);
  assert.doesNotMatch(chartSource, /const chartSurfaceReady = useDeferredActiveFlag\(/);
  assert.match(chartSource, /useLiveSymbolQuote\(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.doesNotMatch(chartLiveHeadersSource, /useMarketData|useLiveTick/);
  assert.match(chartTradeButtonsSource, /const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 0/);
  assert.match(chartTradeButtonsSource, /useLiveSymbolQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.match(chartSource, /useMarketSymbols\(chartRuntimeActive\)/);
  assert.match(chartSource, /useInstrumentMeta\(chartSymbol, chartRuntimeActive\)/);
  assert.match(chartSource, /useLiveCandles\(chartSymbol, chartTimeframe, chartDataActive\)/);
  assert.match(chartSource, /const refreshShowOnChartSources = useCallback\(\(\) => \{[\s\S]*if \(!chartRuntimeActive\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(chartSource, /scheduleIdleWork\([\s\S]*refreshShowOnChartSources\(\);[\s\S]*requestChartViewportRecovery\(3\);[\s\S]*delayMs: CHART_FOCUS_WORK_DELAY_MS/);
  assert.match(chartSource, /const shouldShowChartLoadingOverlay = !hasPaintedChartOnce && \(!chartSurfaceReady \|\| isLoading\)/);
  assert.match(chartSource, /\{shouldShowChartLoadingOverlay && \(/);
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
  const tradePositionRowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const calendarSource = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');
  const healthSource = readSource('src/query/health.ts');
  const mt5Source = readSource('src/query/mt5.ts');
  const accountsQuerySource = readSource('src/query/accounts.ts');

  assert.match(accountsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(accountsSource, /const ACCOUNTS_SCREEN_DATA_DELAY_MS = 650/);
  assert.match(accountsSource, /const \[firstPaintReady, setFirstPaintReady\] = React\.useState\(false\)/);
  assert.match(accountsSource, /const screenDataActive = useDeferredActiveFlag\(\s*isLoggedIn && isScreenFocused && firstPaintReady,\s*ACCOUNTS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.match(accountsSource, /useAccounts\(screenDataActive\)/);
  assert.match(accountsSource, /useBrokerConfig\(brokerId, screenDataActive\)/);
  assert.match(accountsSource, /useAccountDetails\(activeLogin, screenDataActive && !!activeLogin\)/);
  assert.match(accountsSource, /useHealth\(screenDataActive\)/);
  assert.match(accountsSource, /useMt5Status\(screenDataActive\)/);

  assert.match(settingsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(settingsSource, /const SETTINGS_SCREEN_DATA_DELAY_MS = 8000/);
  assert.match(settingsSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(settingsSource, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(settingsSource, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady && !sidebarOpen,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.doesNotMatch(settingsSource, /useAccounts\(settingsDataActive\)/);
  assert.match(settingsSource, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(settingsSource, /const settingsDataActive = isAccountConnected && isScreenFocused/);

  assert.match(tradeSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(tradeSource, /const TRADE_INITIAL_POSITION_RENDER_COUNT = 5/);
  assert.match(tradeSource, /const TRADE_POSITION_RENDER_BATCH_SIZE = 5/);
  assert.match(tradeSource, /const TRADE_SCREEN_FETCH_DELAY_MS = 0/);
  assert.match(tradeSource, /const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000/);
  assert.match(tradeSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(tradeSource, /const sidebarOpen = useUIState\(\(st\) => st\.sidebarOpen\)/);
  // Live quote subscriptions activate immediately on the focused Trade tab;
  // the heavier backend ledger refresh still waits until after first paint.
  assert.match(tradeSource, /const tradeLiveActive = isScreenFocused && !sidebarOpen/);
  assert.match(tradeSource, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady && !sidebarOpen, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  assert.match(tradeSource, /hydrateCachedPositions: state\.hydrateCachedPositions/);
  assert.match(tradeSource, /void hydrateCachedPositions\(String\(resolvedLogin\)\)/);
  assert.match(tradeSource, /if \(!tradeFetchActive \|\| !resolvedLogin\) \{/);
  assert.match(tradeSource, /refreshVisibleTradeLedger\(\);[\s\S]*setInterval\(refreshVisibleTradeLedger, TRADE_SCREEN_REFRESH_INTERVAL_MS\)/);
  assert.match(tradeSource, /clearInterval\(refreshIntervalId\)/);
  assert.match(tradeSource, /const positionRowsActive = tradeLiveActive/);
  assert.doesNotMatch(tradeSource, /const liveQuotes = useLiveSymbolQuotes\(liveQuoteSymbols, tradeLiveActive, 0\)/);
  assert.doesNotMatch(tradeSource, /quotesWsService\.setSubscriptions/);
  assert.doesNotMatch(tradeSource, /if \(isScreenFocused && resolvedLogin\) \{/);
  assert.doesNotMatch(tradeSource, /liveQuotePositions=\{livePositionRows\}/);
  assert.match(tradeSource, /<TradeSummaryHeader[\s\S]*active=\{tradeLiveActive\}/);
  assert.doesNotMatch(tradeSource, /<TradeSummaryHeader[\s\S]*liveQuotes=\{liveQuotes\}/);
  assert.match(tradeSource, /<TradePositionRow[\s\S]*active=\{rowActive\}/);
  assert.doesNotMatch(tradeSource, /<TradePositionRow[\s\S]*liveQuote=\{resolveTradeRowLiveQuote\(liveQuotes, item\.symbol\)\}/);
  assert.match(tradeSource, /initialNumToRender=\{TRADE_INITIAL_POSITION_RENDER_COUNT\}/);
  assert.match(tradeSource, /maxToRenderPerBatch=\{TRADE_POSITION_RENDER_BATCH_SIZE\}/);
  assert.match(tradeSource, /onViewableItemsChanged=\{handleViewablePositionRowsChanged\}/);
  assert.match(tradeSource, /extraData=\{flatListExtraData\}/);
  assert.doesNotMatch(tradeSource, /const rowExtraData = useMemo/);
  assert.match(tradePositionRowSource, /active = true/);
  assert.match(tradePositionRowSource, /active\?: boolean/);
  assert.doesNotMatch(tradePositionRowSource, /liveQuote\?: Partial<QuoteItem>|liveQuoteOverride/);
  assert.match(tradePositionRowSource, /const liveQuote = useLiveSymbolQuote\(item\.symbol, active, 0\)/);
  assert.match(tradePositionRowSource, /function resolveLivePnlDecimals\(value: number\): number/);
  assert.match(tradePositionRowSource, /absValue < 1\) \{[\s\S]*return 5/);
  assert.match(tradePositionRowSource, /formatLiveRowPnl\(displayPnl\)/);
  assert.doesNotMatch(tradePositionRowSource, /fmt\.pnlPrecise\(displayPnl\)/);
  assert.doesNotMatch(tradePositionRowSource, /useLiveSymbolQuote\(item\.symbol\)/);
  assert.doesNotMatch(tradePositionRowSource, /tickFlash|pnlFlashStyle|interpolateColor/);
  assert.match(tradeSummarySource, /active: boolean/);
  assert.doesNotMatch(tradeSummarySource, /liveQuotePositions\?: PositionItem\[\]/);
  assert.match(tradeSummarySource, /positions\.map\(\(position\) => position\.symbol\)/);
  // Rows and summary subscribe directly to the per-symbol websocket listener so
  // TradeScreen itself does not re-render the FlatList on every quote tick.
  assert.match(tradeSummarySource, /useLiveSymbolQuotes\(liveQuoteSymbols, active, 0\)/);
  assert.match(readSource('src/api/ws/quotesSocket/flushPipeline.ts'), /const QUOTE_STORE_FLUSH_INTERVAL_MS = 16/);
  assert.doesNotMatch(tradeSummarySource, /pulseAnim|Animated\.loop|Animated\.Text/);
  assert.match(calendarSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(calendarSource, /getInitialEconomicCalendarData/);
  assert.match(calendarSource, /const initialEvents = useMemo\(\(\) => getInitialEconomicCalendarData\(\), \[\]\)/);
  assert.match(calendarSource, /const \[dataEvents, setDataEvents\] = useState<EconomicEvent\[\]>\(initialEvents\)/);
  assert.match(calendarSource, /if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(calendarSource, /CALENDAR_INITIAL_DATA_DELAY_MS|calendarDataReady|useDeferredRouteContentReady/);

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
