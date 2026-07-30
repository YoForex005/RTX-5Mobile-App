import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hidden tab screens gate heavy work while a visited chart keeps one atomic live-paint bridge warm', () => {
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
  const registerSource = readSource('app/register.tsx');
  const registerEntrySource = readSource('app/register-entry.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const publicDemoSource = readSource('src/query/publicDemo.ts');
  const liveCandlesSource = readSource('src/domain/candles/hooks/useLiveCandles.ts');
  const chartLiveHeadersSource = readSource('src/features/chart/components/ChartLiveHeaders.tsx');
  const chartTradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');

  assert.match(quotesSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(quotesSource, /import \{ useRouter \} from 'expo-router'/);
  assert.match(quotesSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.doesNotMatch(quotesSource, /import \{[^}]*usePathname[^}]*\} from 'expo-router'/);
  assert.doesNotMatch(quotesSource, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(quotesSource, /const QuotesScreenInner = React\.memo\(function QuotesScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(quotesSource, /export function QuotesScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <QuotesScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(quotesSource, /const quoteRouteActive = isScreenFocused/);
  assert.match(quotesSource, /const quoteCatalogActive = quoteRouteActive/);
  assert.doesNotMatch(quotesSource, /quoteSheetRouteActionPending|setQuoteSheetRouteActionPending/);
  assert.match(quotesSource, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /useMarketSymbols\(quoteCatalogActive\)/);
  assert.match(quotesSource, /useWatchlistQuery\(quoteWatchlistActive\)/);
  assert.match(quotesSource, /const quoteStickyFeedActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /const quoteRestFallbackActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(quotesSource, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(quotesSource, /const pauseQuoteSheetFeed = useCallback\(\(durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS\) => \{/);
  assert.doesNotMatch(quotesSource, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.match(quotesSource, /quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  // The socket service is the single owner of accepted-tick feed-health
  // reduction. A retained Quotes screen must not report every tick a second
  // time while another tab is active.
  assert.doesNotMatch(quotesSource, /reportFeedLocalTick|quotesWsService\.addTickListener/);
  assert.match(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/);
  assert.match(quotesSource, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(
    quotesSource,
    /const observedLiveItem = useLiveQuoteSnapshot\(liveSymbol, liveUpdatesActive\);[\s\S]*\(!liveUpdatesActive \? getCurrentLiveQuoteSnapshot\(liveSymbol\) : undefined\)/,
    'inactive quote rows must retain session-scoped display values without subscribing',
  );
  assert.match(quotesSource, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}/);
  assert.doesNotMatch(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, true\)/);

  assert.match(marketDataSource, /export function useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketDataSource, /const isActive = active && isLoggedIn/);
  assert.match(marketDataSource, /if \(!isActive \|\| normalizedSymbols\.length === 0\) return EMPTY_LIVE_QUOTES/);
  assert.match(marketDataSource, /if \(!isActive \|\| transportSymbols\.length === 0\) return/);
  assert.match(marketDataSource, /useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /export function useLiveSymbolQuote\([\s\S]*symbol: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS/);
  assert.match(marketDataSource, /const LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(marketDataSource, /const activeSession = useActiveBrokerQuerySession\(\)/);
  assert.match(marketDataSource, /const isActive = active && isLoggedIn && Boolean\(activeSession\)/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs === 0\) \{[\s\S]*commit\(\);[\s\S]*return;[\s\S]*\}/);
  assert.match(marketDataSource, /safeCommitIntervalMs <= 16[\s\S]*globalThis\.requestAnimationFrame/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs <= 16\) \{[\s\S]*updateLiveQuote\(\);[\s\S]*\} else \{[\s\S]*React\.startTransition\(updateLiveQuote\)/);
  assert.match(marketDataSource, /if \(!isActive \|\| !activeSession \|\| !normalizedSymbol\)/);
  assert.doesNotMatch(marketDataSource, /skipAuth: true/);
  assert.match(marketSymbolsSource, /useActiveBrokerQuerySession/);
  assert.match(marketSymbolsSource, /const cacheNamespace = getSessionQueryCacheNamespace\(session\)/);
  assert.match(marketSymbolsSource, /const isEnabled = enabled && Boolean\(session\)/);
  assert.match(marketSymbolsSource, /queryKey: \['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'\]/);
  assert.doesNotMatch(marketSymbolsSource, /skipAuth: true/);
  assert.match(marketSymbolsSource, /enabled: isEnabled/);
  assert.match(marketSymbolsSource, /commitApiJson\(result, cacheNamespace,/);
  assert.match(instrumentsSource, /const cacheNamespace = getSessionQueryCacheNamespace\(session\)/);
  assert.match(instrumentsSource, /const isEnabled = enabled && Boolean\(session\) && !!normalizedSymbol/);
  assert.match(instrumentsSource, /queryKey: \['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol\]/);
  assert.match(instrumentsSource, /enabled: isEnabled/);
  assert.match(alertsSource, /const enabled = Boolean\(session\) && \(options\.enabled \?\? true\) && isLoggedIn/);
  assert.match(marketStatusSource, /const isEnabled = enabled && isLoggedIn && Boolean\(session\) && !!symbol/);
  assert.match(marketStatusSource, /refetchInterval: isEnabled \? 30_000 : false/);
  assert.match(registerSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(registerSource, /const registerDataActive = useDeferredActiveFlag\(\s*isScreenFocused && firstPaintReady,\s*REGISTER_ROUTE_DATA_DELAY_MS,\s*\)/);
  assert.match(registerSource, /useOrrnnDemoStatus\(registerDataActive\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(registerDataActive && isDemoServiceReady\)/);
  assert.match(registerSource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*return \(/);
  assert.match(registerEntrySource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*return \(/);
  assert.match(brokerDetailSource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*if \(!contentReady\)/);
  assert.match(publicDemoSource, /export function useOrrnnDemoStatus\(enabled = true\)/);
  assert.match(publicDemoSource, /refetchInterval: enabled \? 30 \* 1000 : false/);

  assert.match(liveCandlesSource, /export function useLiveCandles\([\s\S]*symbol: string,[\s\S]*timeframe: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = 0/);
  assert.match(liveCandlesSource, /const isLiveActive = active && isLoggedIn/);
  assert.match(liveCandlesSource, /const safeCommitIntervalMs = Math\.max\(0, Math\.floor\(commitIntervalMs\)\)/);
  assert.match(liveCandlesSource, /scheduleReactNotification[\s\S]*safeCommitIntervalMs - elapsedMs[\s\S]*setTimeout\(notifyReact, delayMs\)/);
  assert.match(liveCandlesSource, /if \(!isLiveActive \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/);
  assert.doesNotMatch(liveCandlesSource, /hasAuthenticatedCandleSession/);
  assert.match(liveCandlesSource, /export function useLiveTick\(symbol: string, _timeframe\?: string, active = true\)/);
  assert.match(liveCandlesSource, /useMarketData\(symbol \? \[symbol\] : \[\], active\)/);
  assert.doesNotMatch(rootLayoutSource, /prefetchChartCandles/);

  assert.match(chartSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(chartSource, /import \{ router, useFocusEffect \} from 'expo-router'/);
  assert.match(chartSource, /import \{ useLatchedFlag \} from '\.\.\/\.\.\/hooks\/useLatchedFlag'/);
  assert.match(chartSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.doesNotMatch(chartSource, /import \{[^}]*usePathname[^}]*\} from 'expo-router'/);
  assert.match(chartSource, /const ChartScreenInner = React\.memo\(function ChartScreenInner\(\{ isChartRouteActive \}: \{ isChartRouteActive: boolean \}\)/);
  assert.match(chartSource, /export function ChartScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <ChartScreenInner isChartRouteActive=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(chartSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(chartSource, /import \{ scheduleAfterFirstFrame, scheduleIdleWork \} from '\.\.\/\.\.\/utils\/startupScheduler'/);
  assert.match(chartSource, /const CHART_RUNTIME_ACTIVE_DELAY_MS = 0/);
  assert.match(chartSource, /const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 400/);
  assert.match(chartSource, /const CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS = 400/);
  assert.match(chartSource, /const CHART_FOCUS_WORK_DELAY_MS = 120/);
  assert.match(chartSource, /const CHART_SURFACE_MOUNT_DELAY_MS = 0/);
  assert.match(chartSource, /const chartRuntimeActive = useDeferredActiveFlag\(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS\)/);
  // Never boot-prewarm the WebView behind Quotes. Mount it only after the first
  // real Chart focus, retain that initialized surface for instant returns, and
  // keep only its selected-symbol candle+Bid bridge and an imperative
  // display-price ref warm without waking React in the hidden footer.
  assert.match(chartSource, /const chartSurfaceActivated = useDeferredActiveFlag\(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS\)/);
  assert.match(chartSource, /const chartSurfaceReady = useLatchedFlag\(chartSurfaceActivated\)/);
  assert.doesNotMatch(chartSource, /chartSurfacePrewarmed|setChartSurfacePrewarmed/);
  assert.doesNotMatch(chartSource, /CHART_SURFACE_PREWARM_DELAY_MS|CHART_STARTUP_HISTORY_PREWARM_DELAY_MS/);
  assert.doesNotMatch(chartSource, /const chartSurfaceReady = useDeferredActiveFlag\(/);
  assert.match(chartSource, /useLiveSymbolQuote\(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.doesNotMatch(chartLiveHeadersSource, /useMarketData|useLiveTick/);
  assert.match(chartTradeButtonsSource, /const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(chartTradeButtonsSource, /useLiveSymbolQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.match(
    chartTradeButtonsSource,
    /const displayQuoteScopeKey =[\s\S]*activeSession\?\.cacheNamespace[\s\S]*props\.symbol\.trim\(\)\.toUpperCase\(\)[\s\S]*key=\{displayQuoteScopeKey\}[\s\S]*const retainedDisplayQuoteRef = React\.useRef/,
    'the footer must retain display prices only inside the current session and symbol scope',
  );
  assert.match(
    chartTradeButtonsSource,
    /Visual continuity only:[\s\S]*const displayBid =[\s\S]*retainedDisplayQuote\?\.bid \?\? 0[\s\S]*const displayAsk =[\s\S]*retainedDisplayQuote\?\.ask \?\? 0/,
    'inactive footer renders must preserve numeric text without keeping hidden tick subscriptions active',
  );
  assert.match(chartSource, /useMarketSymbols\(chartRuntimeActive\)/);
  assert.match(chartSource, /useInstrumentMeta\(chartSymbol, chartRuntimeActive\)/);
  assert.match(chartSource, /useLiveCandles\(\s*chartSymbol,\s*chartTimeframe,\s*chartDataActive,\s*CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS,?\s*\)/);
  assert.match(chartSource, /const activeChartSessionCacheNamespace = activeChartSession\?\.cacheNamespace \?\? ''/);
  assert.match(
    chartSource,
    /Fast retained live-paint path[\s\S]*if \([\s\S]*!chartSurfaceReady[\s\S]*!activeChartSessionCacheNamespace[\s\S]*const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*updateLiveTick\([\s\S]*const releaseCandleConsumer = liveCandlesEngine\.subscribe\([\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*paintCanonicalLiveTick,[\s\S]*const retainLatestChartTradeDisplayQuote = \(tick: QuoteTickEvent\) => \{[\s\S]*retainedChartTradeDisplayQuoteRef\.current = \{[\s\S]*const releaseQuoteDemand = quotesWsService\.subscribeToSymbol\([\s\S]*chartSymbol,[\s\S]*retainLatestChartTradeDisplayQuote,[\s\S]*releaseQuoteDemand\(\);[\s\S]*releaseCandleConsumer\(\);/,
  );
  const retainedLivePaintSource = chartSource.slice(
    chartSource.indexOf('// Fast retained live-paint path.'),
    chartSource.indexOf('// Effect 2'),
  );
  assert.doesNotMatch(
    retainedLivePaintSource,
    /chartRuntimeActive|chartDataActive/,
    'the selected-symbol candle+Bid bridge must continue atomically while Chart is hidden',
  );
  assert.match(
    retainedLivePaintSource,
    /updateMode !== 'full_reload'[\s\S]*updateChartData\([\s\S]*preserveVisibleLogicalSpan: true[\s\S]*updateLiveTick\(/,
    'a rare hidden full-series replacement must catch up before the retained Chart can be revealed',
  );
  assert.doesNotMatch(
    chartSource,
    /const chartLiveQuote = useLiveSymbolQuote\(chartSymbol, chartSurfaceReady,/,
    'the large Chart host quote hook must stay route-gated while hidden',
  );
  assert.match(
    chartSource,
    /const chartTradeDisplayQuoteScopeKey =[\s\S]*activeChartSessionCacheNamespace[\s\S]*chartSymbol\.trim\(\)\.toUpperCase\(\)[\s\S]*const retainedChartTradeDisplayQuoteRef = useRef<RetainedChartTradeDisplayQuote \| null>\(null\)/,
    'retained footer prices must be scoped to the active session and symbol',
  );
  assert.match(
    chartSource,
    /const chartTradeFooterFallbackBid =[\s\S]*retainedChartTradeDisplayQuote\?\.bid \?\? 0[\s\S]*const chartTradeFooterFallbackAsk =[\s\S]*retainedChartTradeDisplayQuote\?\.ask \?\? 0/,
    'inactive footers must render retained numeric prices without authorizing execution',
  );
  assert.doesNotMatch(
    chartSource,
    /const chartTradeFooterFallback(?:Bid|Ask) =[\s\S]{0,160}Number\.isFinite\(chart(?:Bid|Ask)\)/,
    'a quote from the previous hook render must not migrate into a new session or symbol scope',
  );
  assert.match(chartSource, /const refreshShowOnChartSources = useCallback\(\(\) => \{[\s\S]*if \(!chartRuntimeActive\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(chartSource, /scheduleIdleWork\([\s\S]*refreshShowOnChartSources\(\);[\s\S]*requestChartViewportRecovery\(3\);[\s\S]*delayMs: CHART_FOCUS_WORK_DELAY_MS/);
  assert.match(chartSource, /const hasPaintedCurrentChartContext =[\s\S]*lastPaintedChartDataContextSig === chartDataContextSig/);
  assert.match(chartSource, /const hasUsableRetainedChart =[\s\S]*hasPaintedCurrentChartContext && webViewReady && chartCanvasReady/);
  assert.match(chartSource, /const shouldShowChartLoadingOverlay =[\s\S]*!hasUsableRetainedChart &&[\s\S]*!hasChartDataError &&[\s\S]*\(!chartSurfaceReady \|\| isLoading \|\| candlesAvailable\)/);
  assert.match(chartSource, /\{shouldShowChartLoadingOverlay && \(/);
  assert.match(chartSource, /\{chartSurfaceReady \? \(\s*<WebView/);
  assert.match(chartSource, /<LiveQuotePairHeader[\s\S]*bid=\{chartBid\}[\s\S]*ask=\{chartAsk\}/);
  const retainedChartTradeFooters =
    chartSource.match(/<ChartTradeInlineFooter[\s\S]*?\/>/g) ?? [];
  assert.equal(retainedChartTradeFooters.length, 3);
  retainedChartTradeFooters.forEach((footerSource) => {
    assert.match(
      footerSource,
      /active=\{chartRuntimeActive\}/,
      'each Buy/Sell footer must stop React quote commits while Chart is hidden',
    );
    assert.match(
      footerSource,
      /fallbackBid=\{chartTradeFooterFallbackBid\}[\s\S]*fallbackAsk=\{chartTradeFooterFallbackAsk\}/,
      'each inactive Buy/Sell footer must retain display-only numeric prices',
    );
  });
  assert.match(
    chartSource,
    /<ChartTradeButtons[\s\S]*?variant='mt5-market'[\s\S]*?active=\{chartRuntimeActive\}[\s\S]*?fallbackBid=\{chartTradeFooterFallbackBid\}[\s\S]*?fallbackAsk=\{chartTradeFooterFallbackAsk\}/,
    'the hidden legacy trade-sheet button must remain route-gated and session-scoped',
  );
  // Host instances mount outside any navigator screen, where useIsFocused()
  // is always true — hosted instances must trust only hostedActive.
  assert.match(priceAlertsSource, /const isScreenFocused = hosted \? hostedActive : navigationFocused/);
  assert.match(priceAlertsSource, /useAlertsQuery\(\{[\s\S]*enabled: isScreenFocused/);
  assert.match(chartSpecificationSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(chartSpecificationSource, /useInstrumentMeta\(currentSymbol, isScreenFocused\)/);
  assert.match(chartSpecificationSource, /useMarketStatus\(currentSymbol, isScreenFocused\)/);
});

test('settings, trade, and history screens pause work when another screen is focused', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const tradePositionRowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const calendarSource = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');
  const healthSource = readSource('src/query/health.ts');
  const mt5Source = readSource('src/query/mt5.ts');
  const accountsQuerySource = readSource('src/query/accounts.ts');

  assert.match(accountsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(accountsSource, /const ACCOUNTS_SCREEN_DATA_DELAY_MS = 650/);
  assert.match(accountsSource, /const \[firstPaintReady, setFirstPaintReady\] = React\.useState\(false\)/);
  assert.match(accountsSource, /const focusDataActive = useDeferredActiveFlag\(\s*isLoggedIn && isScreenFocused && firstPaintReady,\s*ACCOUNTS_SCREEN_DATA_DELAY_MS,\s*\)/);
  // A BOUNDED boot prewarm window may fill the caches once while hidden so the
  // first open shows real content; it must switch itself off so focus remains
  // the only long-lived activator of these queries.
  assert.match(accountsSource, /const ACCOUNTS_DATA_PREWARM_WINDOW_MS = 15000/);
  assert.match(accountsSource, /setDataPrewarmWindowActive\(false\),?\s*\)?,?\s*ACCOUNTS_DATA_PREWARM_DELAY_MS \+ ACCOUNTS_DATA_PREWARM_WINDOW_MS/);
  assert.match(accountsSource, /const screenDataActive = focusDataActive \|\| \(isLoggedIn && dataPrewarmWindowActive\)/);
  assert.match(accountsSource, /useAccounts\(screenDataActive\)/);
  assert.match(accountsSource, /useBrokerConfig\(brokerId, screenDataActive\)/);
  assert.match(accountsSource, /useAccountDetails\(activeLogin, screenDataActive && !!activeLogin\)/);
  assert.match(accountsSource, /useHealth\(screenDataActive\)/);
  assert.match(accountsSource, /useMt5Status\(screenDataActive\)/);
  assert.match(accountsSource, /const focusedBodyReady = isScreenFocused && hostBodyReady;/);
  assert.match(accountsSource, /\{focusedBodyReady \? \(\s*<FlatList/);
  assert.match(accountsSource, /useUIState\.getState\(\)\.hideAccountsActionSheet\(\)/);
  assert.match(accountsSource, /\{isScreenFocused \? <AccountsActionSheetHost \/> : null\}/);

  assert.match(settingsSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(settingsSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(settingsSource, /const SettingsScreenInner = memo\(function SettingsScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(settingsSource, /export function SettingsScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <SettingsScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(settingsSource, /const SETTINGS_SCREEN_DATA_DELAY_MS = 8000/);
  assert.doesNotMatch(settingsSource, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(settingsSource, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(settingsSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.doesNotMatch(settingsSource, /sidebarOpen = useUIState/);
  assert.match(settingsSource, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.doesNotMatch(settingsSource, /useAccounts\(settingsDataActive\)/);
  assert.match(settingsSource, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(settingsSource, /const settingsDataActive = isAccountConnected && isScreenFocused/);

  assert.match(tradeSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(tradeSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(tradeSource, /const TradeScreenInner = React\.memo\(function TradeScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(tradeSource, /export function TradeScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <TradeScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(tradeSource, /const TRADE_INITIAL_POSITION_RENDER_COUNT = 5/);
  assert.match(tradeSource, /const TRADE_POSITION_RENDER_BATCH_SIZE = 5/);
  assert.match(tradeSource, /const TRADE_SCREEN_FETCH_DELAY_MS = 0/);
  assert.match(tradeSource, /const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000/);
  assert.match(tradeSource, /const TRADE_BODY_PREWARM_DELAY_MS = 600/);
  assert.match(tradeSource, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : TRADE_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.doesNotMatch(tradeSource, /useDeferredRouteContentReady\([^)]*, isScreenFocused\)/);
  assert.match(tradeSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.doesNotMatch(tradeSource, /sidebarOpen = useUIState/);
  // Live quote subscriptions activate immediately on the focused Trade tab;
  // the heavier backend ledger refresh still waits until after first paint.
  assert.match(tradeSource, /const tradeLiveActive = isScreenFocused/);
  assert.match(tradeSource, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  // A retained hidden Trade tab must not follow feed-health or ledger mutations.
  // It keeps the last focused render snapshots and reconnects on real focus.
  assert.match(tradeSource, /const retainedFeedHealthRef = useRef\(getFeedHealthRenderSnapshot\(\)\)/);
  assert.match(tradeSource, /const subscribeFocusedFeedHealth = useCallback\([\s\S]*isScreenFocused \? subscribeFeedHealth\(listener\) : \(\) => undefined/);
  assert.match(tradeSource, /const getFocusedFeedHealthSnapshot = useCallback\([\s\S]*isScreenFocused \? getFeedHealthRenderSnapshot\(\) : retainedFeedHealthRef\.current/);
  assert.match(tradeSource, /React\.useSyncExternalStore\(\s*subscribeFocusedFeedHealth,\s*getFocusedFeedHealthSnapshot,\s*getFocusedFeedHealthSnapshot,?\s*\)/);
  assert.doesNotMatch(tradeSource, /React\.useSyncExternalStore\(\s*subscribeFeedHealth/);
  assert.match(tradeSource, /const retainedTradeLedgerRef = useRef<RetainedTradeLedger \| null>\(null\)/);
  assert.match(tradeSource, /const tradeLedger = usePositionsState\([\s\S]*isScreenFocused\s*\?[\s\S]*positions: state\.positions[\s\S]*: retainedTradeLedgerRef\.current as RetainedTradeLedger/);
  assert.match(tradeSource, /if \(isScreenFocused\) \{\s*retainedTradeLedgerRef\.current = tradeLedger;\s*\}/);
  assert.match(tradeSource, /const refreshPositions = usePositionsState\(\(state\) => state\.refreshPositions\)/);
  assert.match(tradeSource, /const hydrateCachedPositions = usePositionsState\(\(state\) => state\.hydrateCachedPositions\)/);
  assert.match(tradeSource, /const primePositionSnapshot = usePositionsState\(\(state\) => state\.primePositionSnapshot\)/);
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

  assert.match(historySource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(historySource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(historySource, /const HistoryScreenInner = memo\(function HistoryScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(historySource, /export function HistoryScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <HistoryScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(historySource, /const historyDataActive = useDeferredActiveFlag\(isScreenFocused\)/);
  assert.match(historySource, /usePositionHistoryQuery\(accountLogin, \{\s*enabled: historyDataActive/);
  assert.match(historySource, /useAccountDealsQuery\(\{[\s\S]*enabled: historyDataActive/);
  assert.match(historySource, /useOrdersByLoginQuery\(accountLogin, \{\s*enabled: historyDataActive/);

  assert.match(calendarSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(calendarSource, /getInitialEconomicCalendarData/);
  assert.match(calendarSource, /const initialEvents = useMemo\(\(\) => getInitialEconomicCalendarData\(\), \[\]\)/);
  assert.match(calendarSource, /const \[dataEvents, setDataEvents\] = useState<EconomicEvent\[\]>\(initialEvents\)/);
  assert.match(calendarSource, /if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(calendarSource, /CALENDAR_INITIAL_DATA_DELAY_MS|calendarDataReady/);
  assert.match(calendarSource, /const ECON_CALENDAR_BODY_PREWARM_DELAY_MS = 0/);
  assert.match(calendarSource, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : ECON_CALENDAR_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.doesNotMatch(calendarSource, /const focusedBodyReady = isScreenFocused && routeBodyReady;/);
  assert.match(calendarSource, /\{routeBodyReady \? <>/);
  // One bounded idle prewarm is the only work the hidden calendar shell may do:
  // it fills the event cache once, well after boot, so the FIRST sidebar visit
  // reveals real rows (MT5 parity) instead of fetching on focus.
  assert.match(calendarSource, /const ECON_CALENDAR_IDLE_PREWARM_DELAY_MS = 6000/);
  assert.match(calendarSource, /const prewarmTimer = setTimeout\(\(\) => \{\s*fetchEconomicCalendarData\(\)/);
  assert.match(calendarSource, /\}, ECON_CALENDAR_IDLE_PREWARM_DELAY_MS\);\s*return \(\) => clearTimeout\(prewarmTimer\);/);

  assert.match(healthSource, /export function useHealth\(enabled = true\)/);
  assert.match(healthSource, /const isEnabled = enabled && Boolean\(session\)/);
  assert.match(healthSource, /refetchInterval: isEnabled \? 30000 : false/);
  assert.match(mt5Source, /export function useMt5Status\(enabled = true\)/);
  assert.match(mt5Source, /const isEnabled = enabled && Boolean\(session\)/);
  assert.match(mt5Source, /refetchInterval: isEnabled \? 30000 : false/);
  assert.match(accountsQuerySource, /const isEnabled = Boolean\(session\) && \(enabled \?\? true\)/);
  assert.match(accountsQuerySource, /refetchInterval: isEnabled \? 10 \* 1000 : false/);
  assert.match(accountsQuerySource, /refetchInterval: isEnabled \? 30 \* 1000 : false/);
});

test('high-volume diagnostics are disabled unless explicitly requested', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const accountsApiSource = readSource('src/api/accounts.ts');
  const quotesWsSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const apiLatencySource = readSource('src/utils/apiLatency.ts');
  const positionsApiSource = readSource('src/api/positions/index.ts');
  const closedHistorySource = readSource('src/api/positions/closedHistory.ts');
  const positionsStateSource = readSource('src/state/positionsState.ts');
  const accountWsSource = readSource('src/api/ws/accountSocket.ts');

  assert.doesNotMatch(accountsSource, /logAccountsScreenDiagnostic/);
  assert.doesNotMatch(accountsSource, /console\.log\('\[AccountsScreen\]/);
  assert.doesNotMatch(accountsSource, /EXPO_PUBLIC_DEBUG_ACCOUNTS_SCREEN/);

  assert.match(accountsApiSource, /EXPO_PUBLIC_DEBUG_ACCOUNTS_API === 'true'/);
  assert.match(
    accountsApiSource,
    /if \(DEBUG_ACCOUNTS_API\) \{[\s\S]*Accounts response received[\s\S]*accountCount: mapped\.length/,
  );
  assert.doesNotMatch(accountsApiSource, /Raw backend response:|Mapped accounts:/);

  assert.match(quotesWsSource, /EXPO_PUBLIC_DEBUG_CANDLE_FEED === 'true'/);
  assert.doesNotMatch(quotesWsSource, /typeof __DEV__ === 'undefined' \|\| __DEV__/);

  assert.match(apiLatencySource, /EXPO_PUBLIC_DEBUG_API_LATENCY === 'true'/);
  assert.match(apiLatencySource, /severity !== 'ok' \|\| API_LATENCY_LOG_OK_RESPONSES/);
  assert.match(apiLatencySource, /if \(shouldLogApiLatency\(severity\)\) \{/);

  assert.match(positionsApiSource, /EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true'/);
  assert.match(positionsApiSource, /logPositionsApiDiagnostic\('\[PositionsAPI\] GET'/);
  assert.doesNotMatch(positionsApiSource, /console\.log\('\[PositionsAPI\]/);
  assert.doesNotMatch(closedHistorySource, /Response json:|Parsed rows length:|JSON\.stringify\(json\)/);
  assert.match(positionsStateSource, /EXPO_PUBLIC_DEBUG_POSITIONS_STATE === 'true'/);
  assert.match(positionsStateSource, /positionsRateLimitUntilByNamespace/);
  assert.match(positionsStateSource, /positionsRefreshInFlightByLogin/);
  assert.match(positionsStateSource, /pendingPositionsRefreshLogins/);
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
