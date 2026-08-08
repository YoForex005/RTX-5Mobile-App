import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readQuotesSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/quotes/QuotesScreen.tsx'), 'utf8');

const readSymbolDetailsSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx'), 'utf8');

const readMarketStatisticsSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/quotes/MarketStatisticsScreen/MarketStatisticsScreen.tsx'), 'utf8');

test('quote symbol action sheets open on confirmed taps without leaving the tapped symbol visually held', () => {
  const source = readQuotesSource();
  const quoteCardSource = source.slice(
    source.indexOf('const QuoteCard = React.memo'),
    source.indexOf('function EditQuoteRow'),
  );

  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(source, /suppressPressFeedback = false/);
  assert.match(source, /suppressPressFeedback\?: boolean;/);
  assert.match(source, /pressed && !suppressPressFeedback && sc\.cardPressed/);
  assert.doesNotMatch(quoteCardSource, /activateOnPressIn/);
  assert.doesNotMatch(quoteCardSource, /activateOnTouchStart/);
  assert.match(
    source,
    /<QuoteCard[\s\S]*onPressIn=\{\(event\) => handleSymbolPressIn\(sym, event\)\}[\s\S]*onPressOut=\{\(\) => handleSymbolPressOut\(sym\)\}[\s\S]*onTouchMove=\{handleSymbolPressMove\}[\s\S]*onPress=\{\(event\) => handleSymbolTap\(sym, event\)\}[\s\S]*suppressPressFeedback[\s\S]*onLongPress=/,
  );
  assert.doesNotMatch(source, /onPressIn=\{\(\) => handleSymbolTap\(sym\)\}/);

  const tapConfigsStart = source.indexOf('const quoteTapActionSheetConfigs = useMemo');
  const longPressConfigsStart = source.indexOf('const quoteLongPressActionSheetConfigs = useMemo');
  const tapHandlerStart = source.indexOf('const handleSymbolTap = useCallback');
  assert.notEqual(tapConfigsStart, -1);
  assert.notEqual(longPressConfigsStart, -1);
  assert.notEqual(tapHandlerStart, -1);

  const tapConfigSource = source.slice(tapConfigsStart, longPressConfigsStart);
  const longPressConfigSource = source.slice(longPressConfigsStart, tapHandlerStart);

  assert.match(tapConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(tapConfigSource, /describeMarketSymbol\(sym\)/);
  assert.match(tapConfigSource, /presentation: 'mt5Plain'/);
  assert.match(tapConfigSource, /detent: 'auto'/);
  assert.match(tapConfigSource, /instantOpen: true/);
  assert.match(tapConfigSource, /presentation: 'mt5Plain'/);
  assert.match(tapConfigSource, /entryMotion: 'mt5Slide'/);
  assert.doesNotMatch(tapConfigSource, /keepMt5HostComposited/);
  // Route actions commit only a light preview (or the fast-tab flip), so they
  // run in the press frame instead of waiting behind the close animation.
  assert.match(tapConfigSource, /runActionAfterClose: false/);
  assert.match(longPressConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(longPressConfigSource, /title: fmt\.symbol\(sym\)/);
  assert.match(longPressConfigSource, /presentation: 'mt5Plain'/);
  assert.match(longPressConfigSource, /detent: 'auto'/);
  assert.match(longPressConfigSource, /instantOpen: true/);
  assert.match(longPressConfigSource, /entryMotion: 'mt5Slide'/);
  assert.doesNotMatch(longPressConfigSource, /keepMt5HostComposited/);
  assert.match(longPressConfigSource, /runActionAfterClose: false/);
  assert.doesNotMatch(source, /const hideQuotesActionSheet = useUIState\(\(s\) => s\.hideQuotesActionSheet\)/);
  assert.match(source, /type QuoteSheetOptionOptions = \{[\s\S]*routeChange\?: boolean;[\s\S]*\}/);
  assert.doesNotMatch(source, /quoteSheetRouteActionPending|setQuoteSheetRouteActionPending/);
  assert.match(source, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(source, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(source, /const QUOTE_SHEET_OPEN_FEED_PAUSE_MS = 15_000/);
  assert.match(source, /const QUOTE_SHEET_DESTINATION_PREP_DELAY_MS = 300/);
  assert.doesNotMatch(source, /quotesSheetVisible/);
  assert.match(source, /const quoteCatalogActive = quoteRouteActive/);
  assert.match(source, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(source, /const quoteRestFallbackActive = quoteCatalogActive/);
  assert.match(source, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/);
  assert.match(source, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(source, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}/);
  assert.match(source, /const pauseQuoteSheetFeed = useCallback\(\(durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS\) => \{/);
  assert.match(source, /quotesWsService\.deferReconnectForInteraction\?\.\(durationMs\)/);
  assert.match(source, /QUOTE_SHEET_PRESS_CANCEL_MOVE_PX = 10/);
  assert.match(source, /QUOTE_SHEET_PRESS_OUT_CANCEL_DELAY_MS = 160/);
  assert.match(source, /const hasQuoteSheetPressMovedBeyondThreshold = [\s\S]*dx \* dx \+ dy \* dy[\s\S]*QUOTE_SHEET_PRESS_CANCEL_MOVE_PX \* QUOTE_SHEET_PRESS_CANCEL_MOVE_PX/);
  assert.match(source, /parkRetainedActionSheetHostForConfigSwap/);
  assert.doesNotMatch(
    source,
    /requestRetainedActionSheetPreview|commitRetainedActionSheetPreview|cancelRetainedActionSheetPreview|scheduleAfterFirstFrame/,
    'Quotes must not depend on Chart/retained-preview reveal ownership',
  );
  const pressInStart = source.indexOf('const handleSymbolPressIn = useCallback');
  const pressMoveStart = source.indexOf('const handleSymbolPressMove = useCallback');
  const pressInSource = source.slice(pressInStart, pressMoveStart);
  assert.notEqual(pressInStart, -1);
  assert.notEqual(pressMoveStart, -1);
  assert.match(
    pressInSource,
    /start: getQuoteSheetPressPoint\(event\)[\s\S]*accepted: false[\s\S]*cancelled: false[\s\S]*pauseQuoteSheetFeed\(\)/,
    'press-in records only gesture state and pauses feed work',
  );
  assert.doesNotMatch(
    pressInSource,
    /showQuotesActionSheet|showScopedActionSheet|preloadQuotesActionSheet|ensureQuoteSheetConfigMounted|scheduleQuoteSheetConfigPaint/,
    'press-in must not publish sheet state before React confirms onPress',
  );
  assert.match(
    source,
    /const ensureQuoteSheetConfigMounted = useCallback[\s\S]*const preparedVisualKey = quoteSheetPreparedVisualKeyRef\.current[\s\S]*preparedVisualKey && preparedVisualKey !== visualKey[\s\S]*parkedOutgoingHost = parkRetainedActionSheetHostForConfigSwap\(preparedVisualKey\)[\s\S]*!parkedOutgoingHost[\s\S]*mountedVisualKey !== preparedVisualKey[\s\S]*parkRetainedActionSheetHostForConfigSwap\(mountedVisualKey\)[\s\S]*quoteSheetPreparedVisualKeyRef\.current = null;[\s\S]*if \(!quotesOwnMountedConfig\) \{[\s\S]*preloadQuotesActionSheet\(config\)/,
    'Quotes must park the actually painted outgoing host before publishing replacement rows',
  );
  assert.match(source, /const handleSymbolPressMove = useCallback[\s\S]*hasQuoteSheetPressMovedBeyondThreshold[\s\S]*cancelSymbolSheetPreview\(gesture\.sequence\)/);
  assert.match(source, /const handleSymbolPressOut = useCallback[\s\S]*setTimeout\(\(\) => \{[\s\S]*cancelSymbolSheetPreview\(sequence\);[\s\S]*\}, QUOTE_SHEET_PRESS_OUT_CANCEL_DELAY_MS\)/);
  assert.doesNotMatch(source, /const armQuoteSheetRetainedPreview|retainedPreviewRevision/);
  assert.match(
    source,
    /const cancelSymbolSheetPreview = useCallback[\s\S]*gesture\.cancelled = true;[\s\S]*gesture\.start = null;[\s\S]*releaseQuoteSheetFeedPause\(\)/,
    'drag and cancelled presses must release the temporary feed pause',
  );
  assert.match(source, /onScrollBeginDrag=\{\(\) => cancelSymbolSheetPreview\(\)\}/);
  assert.match(source, /onMomentumScrollBegin=\{\(\) => cancelSymbolSheetPreview\(\)\}/);
  assert.match(source, /const releaseQuoteSheetFeedPause = useCallback\(\(\) => \{/);
  assert.match(source, /quotesWsService\.resumeReconnectAfterInteraction\?\.\(\)/);
  assert.match(source, /if \(isScreenFocused\) \{[\s\S]*releaseQuoteSheetFeedPause\(\);/);
  assert.doesNotMatch(source, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.doesNotMatch(source, /scheduleQuoteSheetOptionAction/);
  assert.doesNotMatch(source, /requestAnimationFrame\([\s\S]*requestAnimationFrame\([\s\S]*setTimeout\(action, 0\)/);
  assert.match(
    source,
    /const runQuoteSheetOption = useCallback\(\(action: \(\) => void, options\?: QuoteSheetOptionOptions\) => \{[\s\S]*options\?\.routeChange === true[\s\S]*pauseQuoteSheetFeed\(routeChange \? QUOTE_SHEET_ROUTE_FEED_PAUSE_MS : QUOTE_SHEET_OPTION_FEED_PAUSE_MS\);[\s\S]*quoteSheetOptionCloseExpectedRef\.current = true;[\s\S]*try \{[\s\S]*action\(\);[\s\S]*finally \{[\s\S]*setTimeout\(\(\) => \{[\s\S]*quoteSheetOptionCloseExpectedRef\.current = false;/,
  );
  assert.match(tapConfigSource, /label: t\('New Order'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /label: t\('Chart'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /label: t\('Properties'\),[\s\S]*activateOnPressIn: true/);
  // Depth of Market was a disabled, dead option backed by hardcoded data — removed.
  assert.doesNotMatch(tapConfigSource, /Depth Of Market/);
  assert.match(tapConfigSource, /label: t\('Market Statistics'\),[\s\S]*activateOnPressIn: true/);
  // Both view modes are listed; the active one is marked `selected` so the
  // shared ActionSheet renders it disabled. viewMode === 'table' is the simple view.
  assert.match(tapConfigSource, /label: t\('Simple view mode'\),[\s\S]*selected: quoteViewMode === 'table'[\s\S]*label: t\('Advanced view mode'\),[\s\S]*selected: quoteViewMode === 'list'/);
  assert.match(longPressConfigSource, /label: t\('Properties'\), activateOnPressIn: true, onPress: \(\) => goDetail\(sym\)/);
  assert.match(longPressConfigSource, /label: t\('Hide'\),[\s\S]*danger: true/);
  assert.match(tapConfigSource, /label: t\('New Order'\),[\s\S]*onPress: \(\) => openOrderTicketForSymbol\(sym\)/);
  // The Chart option still uses the retained fast-tab path, but it must commit
  // the target symbol before revealing that retained scene.
  assert.match(tapConfigSource, /label: t\('Chart'\),[\s\S]*onPress: \(\) => openChartTabForSymbol\(sym\)/);
  assert.match(tapConfigSource, /label: t\('Market Statistics'\),[\s\S]*onPress: \(\) => openMarketStatisticsForSymbol\(sym\)/);
  assert.match(
    source,
    /const openQuoteInfoForSymbol = useCallback\([\s\S]*prepareQuoteInfoLaunch\(sym\);[\s\S]*showQuoteInfoLaunch\(destination, sym\);[\s\S]*scheduleQuoteInfoLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*pathname: '\/quotes\/details'[\s\S]*pathname: '\/quotes\/market-statistics'[\s\S]*hideQuoteInfoLaunch\(launchRevision\)[\s\S]*\}, \{ routeChange: true \}\);/,
  );
  assert.match(
    source,
    /const openOrderTicketForSymbol = useCallback\(\(sym: string\) => \{[\s\S]*runQuoteSheetOption\(\(\) => \{[\s\S]*prepareOrderTicketLaunch\(sym, 'quotes'\);[\s\S]*const launchRevision = showOrderTicketLaunch\(sym, 'quotes'\);[\s\S]*scheduleOrderTicketLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*router\.push\(\{ pathname: '\/trade\/order-ticket', params: \{ symbol: sym, origin: 'quotes' \} \}\);[\s\S]*\}, \{ routeChange: true \}\);/,
  );
  assert.match(
    source,
    /const openChartTabForSymbol = useCallback\(\(sym: string\) => \{[\s\S]*const chartTimeframe = prepareChartSymbol\(sym\);[\s\S]*prefetchChartSelectionHistory\(sym, chartTimeframe\);[\s\S]*const revealRequestedChart = \(\) => \{[\s\S]*const visualRevision = showFastTabVisual\('chart'\);[\s\S]*navigateMountedSidebarTab\('\/chart'\)[\s\S]*router\.push\('\/\(tabs\)\/chart'\)[\s\S]*scheduleQuoteSheetVisualBoundary\(revealRequestedChart\);[\s\S]*\}, \{ routeChange: true \}\);/,
    'the previous-symbol Chart surface must stay hidden until the target symbol reaches the retained tree',
  );
  assert.match(
    source,
    /const handleSymbolTap = useCallback[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*hasQuoteSheetPressMovedBeyondThreshold[\s\S]*gesture\.accepted = true[\s\S]*openQuoteSheetWhenConfigIsReady\(\s*config,\s*'quotes\.symbolSheet\.tap\.open',\s*sym,/,
  );
  assert.match(
    source,
    /const openQuoteSheetWhenConfigIsReady = useCallback[\s\S]*const openSheet = \(\) => \{[\s\S]*runImmediateAction\(actionName, \(\) => \{[\s\S]*showQuotesActionSheet\(config\);[\s\S]*actionName === 'quotes\.symbolSheet\.tap\.open'[\s\S]*const \{ chartTimeframe \} = useUserPreferences\.getState\(\);[\s\S]*prefetchChartSelectionHistory\(sym, chartTimeframe\);[\s\S]*prepareSymbolDestinationShellsAfterSheetSettle\(sym\);[\s\S]*scheduleQuoteSheetConfigPaint\(config, openSheet\)/,
    'an exact config must open directly through the Quotes-owned immediate action path',
  );
  assert.match(
    source,
    /if \(ensureQuoteSheetConfigMounted\(config\)\) \{\s*openSheet\(\);\s*return;\s*\}[\s\S]*scheduleQuoteSheetConfigPaint\(config, openSheet\)/,
    'already-painted Quotes configs must retain the zero-extra-frame fast path',
  );
  assert.match(
    source,
    /currentGesture\.sequence === gestureSequence[\s\S]*currentGesture\.symbol === sym[\s\S]*currentGesture\.accepted[\s\S]*!currentGesture\.cancelled/,
    'a delayed stale gesture must never open over a newer row interaction',
  );
  assert.match(
    source,
    /QUOTE_SHEET_VISUAL_BOUNDARY_FALLBACK_MS = 34[\s\S]*const scheduleQuoteSheetVisualBoundary = \(work: \(\) => void\) => \{[\s\S]*fallbackTask = setTimeout\(run, QUOTE_SHEET_VISUAL_BOUNDARY_FALLBACK_MS\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*frameTask = setTimeout\(run, 0\)/,
    'config swaps must cross a bounded paint boundary without waiting on a throttled Android rAF',
  );
  assert.match(
    source,
    /const exactQuotesConfigIsMounted =[\s\S]*actionSheetScope === 'quotes'[\s\S]*preloadedScopedActionSheets\.quotes === config[\s\S]*if \(exactQuotesConfigIsMounted && config\.visualKey\) \{[\s\S]*quoteSheetPreparedVisualKeyRef\.current = config\.visualKey;[\s\S]*onPaint\?\.\(\)/,
    'deferred visibility may run only for the exact mounted Quotes config',
  );
  const preparationStart = source.indexOf('const prepareSymbolDestinationShellsAfterSheetSettle');
  const preparationEnd = source.indexOf('const openQuoteSheetWhenConfigIsReady', preparationStart);
  const preparationSource = source.slice(preparationStart, preparationEnd);
  assert.match(
    preparationSource,
    /cancelPendingQuoteSheetDestinationPreparation\(\)[\s\S]*const startSettleDelay[\s\S]*setTimeout\(\s*prepareDestinationShells,\s*QUOTE_SHEET_DESTINATION_PREP_DELAY_MS[\s\S]*requestAnimationFrame\(startSettleDelay\)/,
    'lightweight destination shells must wait until one paint plus the local settle delay',
  );
  assert.match(
    preparationSource,
    /prepareOrderTicketLaunch\(sym, 'quotes'\);[\s\S]*prepareQuoteInfoLaunch\(sym\)/,
  );
  assert.doesNotMatch(
    preparationSource,
    /\bprefetch[A-Z]\w*\(|router\.(?:prefetch|push)|prepareChartSymbol\(|liveCandlesEngine\.prefetchHistory\(|preloadDeferredRouteModule\(|getCandleHistory\(/,
    'the delayed shell preparation remains lightweight; exact candle warming is owned explicitly by the accepted row tap',
  );
  assert.match(
    source,
    /previousState\.scopedActionSheets\.quotes !== null[\s\S]*state\.scopedActionSheets\.quotes === null[\s\S]*cancelPendingQuoteSheetDestinationPreparation\(\)[\s\S]*quoteSheetOptionCloseExpectedRef\.current[\s\S]*releaseQuoteSheetFeedPause\(\)/,
    'backdrop and Back dismissal must cancel delayed preparation and resume live Quotes',
  );
  assert.match(
    source,
    /const prepareChartSymbol = \(symbol: string\) => \{[\s\S]*useUserPreferences\.getState\(\)[\s\S]*preferences\.chartSymbol !== symbol[\s\S]*preferences\.setChartSymbol\(symbol\)[\s\S]*return preferences\.chartTimeframe/,
  );
  assert.match(
    source,
    /const handleSymbolLongPress = useCallback[\s\S]*quoteLongPressActionSheetConfigs\.get\(sym\)[\s\S]*gesture\.accepted = true[\s\S]*openQuoteSheetWhenConfigIsReady\(\s*config,\s*'quotes\.symbolSheet\.longPress\.open',\s*sym,/,
    'long-press configs must use the same Quotes-local protected swap path',
  );
  assert.match(source, /onLongPress=\{\(\) => handleSymbolLongPress\(sym\)\}/);
  assert.doesNotMatch(
    source,
    /openChartActionSheetSmoothly|handleOpenMoreMenu|from ['"]\.\.\/chart\/ChartScreen/,
    'Quotes must own its opener and config instead of importing Chart feature behavior',
  );
});

test('quote details paints an exact shell before mounting its focused heavy body', () => {
  const source = readSymbolDetailsSource();
  const backControlStart = source.indexOf('<Pressable\n            onPress={onBack}');
  const backControlEnd = source.indexOf('</Pressable>', backControlStart);
  const backControlSource = source.slice(backControlStart, backControlEnd);

  assert.match(source, /export function SymbolDetailsScreen\(\) \{[\s\S]*launchCovers[\s\S]*useDeferredRouteContentReady\(0, isScreenFocused\)[\s\S]*bodyMountedRef[\s\S]*if \(!contentReady\) \{[\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="properties"[\s\S]*return <SymbolDetailsInteractiveContent onBack=\{handleBack\} \/>/);
  assert.match(source, /markQuoteInfoLaunchCovered\('properties'\)/);
  assert.match(source, /completeQuoteInfoLaunch\('properties'\)/);
  assert.match(source, /backNavigationStartedRef\.current = true;[\s\S]*beginQuoteInfoBackCover\('properties', symbol\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/quotes'\);[\s\S]*scheduleQuoteInfoBackCoverRemoval\(coverRevision\)/);
  assert.notEqual(backControlStart, -1);
  assert.notEqual(backControlEnd, -1);
  assert.match(backControlSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quoteInfo\.properties\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.doesNotMatch(backControlSource, /activateOnTouchStart/);
  assert.doesNotMatch(source, /SYMBOL_DETAILS_FULL_CONTENT_DELAY_MS/);
});

test('quote details specification shows point and account leverage', () => {
  const source = readSymbolDetailsSource();
  const contractSpecStart = source.indexOf("<Section title={t('Contract Specification')}");
  const pricingFeesStart = source.indexOf("<Section title={t('Pricing & Fees')}");
  const instrumentProfileStart = source.indexOf("<Section title={t('Instrument Profile')}");
  assert.notEqual(contractSpecStart, -1, 'contract specification section must exist');
  assert.notEqual(pricingFeesStart, -1, 'pricing and fees section must exist');
  assert.notEqual(instrumentProfileStart, -1, 'instrument profile section must exist');

  const contractSpec = source.slice(contractSpecStart, pricingFeesStart);
  const pricingFees = source.slice(pricingFeesStart, instrumentProfileStart);
  assert.match(source, /import \{ useAccountSummary \} from '..\/..\/..\/query\/account'/);
  assert.match(source, /resolveTradingLoginString, useResolvedTradingLogin/);
  assert.doesNotMatch(source, /useSavedAccounts|activeSavedAccountLeverage|brokerId/);
  assert.match(source, /useAccountSummary\(accountLoginString, \{[\s\S]*enabled: active && !!accountLoginString/);
  assert.match(source, /base\.point = remoteMeta\.point \?\? base\.point/);
  assert.match(source, /const point = remoteMeta\?\.point \?\? q\.point \?\? q\.tickSize \?\? pip/);
  assert.match(source, /const resolvedLeverage = accountSummary\?\.leverage && accountSummary\.leverage > 0[\s\S]*\? accountSummary\.leverage[\s\S]*: undefined/);
  assert.match(source, /const leverageText = resolvedLeverage && resolvedLeverage > 0[\s\S]*\? `1:\$\{formatDetailNumber\(resolvedLeverage\)\}`[\s\S]*: '--'/);
  assert.match(contractSpec, /<Row label=\{t\('Point'\)\} value=\{formatDetailNumber\(point\)\} \/>/);
  assert.match(pricingFees, /<Row label=\{t\('Leverage'\)\} value=\{leverageText\} \/>/);
  assert.doesNotMatch(pricingFees, /onPress|ActionSheet|Select/);
});

test('quote details keeps real swap values visible', () => {
  const source = readSymbolDetailsSource();
  const pricingFeesStart = source.indexOf("<Section title={t('Pricing & Fees')}");
  const instrumentProfileStart = source.indexOf("<Section title={t('Instrument Profile')}");
  assert.notEqual(pricingFeesStart, -1, 'pricing and fees section must exist');
  assert.notEqual(instrumentProfileStart, -1, 'instrument profile section must exist');

  const pricingFees = source.slice(pricingFeesStart, instrumentProfileStart);
  assert.match(source, /const resolveDetailNumber = \(\.\.\.values: Array<number \| null \| undefined>\) =>/);
  assert.match(source, /const formatSwapValue = \(value: number \| null \| undefined\) => \{/);
  assert.match(source, /base\.swapLong = resolveDetailNumber\(remoteMeta\?\.swapLong, base\.swapLong\) \?\? Number\.NaN/);
  assert.match(source, /base\.swapShort = resolveDetailNumber\(remoteMeta\?\.swapShort, base\.swapShort\) \?\? Number\.NaN/);
  assert.doesNotMatch(source, /mock\.swapLong|mock\.swapShort/);
  assert.match(source, /const swapLong = resolveDetailNumber\(remoteMeta\?\.swapLong, q\.swapLong\)/);
  assert.match(source, /const swapShort = resolveDetailNumber\(remoteMeta\?\.swapShort, q\.swapShort\)/);
  assert.match(pricingFees, /<Row label=\{t\('Swap Long'\)\} value=\{formatSwapValue\(swapLong\)\}/);
  assert.match(pricingFees, /<Row label=\{t\('Swap Short'\)\} value=\{formatSwapValue\(swapShort\)\}/);
  assert.doesNotMatch(pricingFees, /\(q\.swapLong \?\? 0\)\.toFixed\(2\)/);
  assert.doesNotMatch(pricingFees, /\(q\.swapShort \?\? 0\)\.toFixed\(2\)/);
});

test('market statistics paints an exact shell before mounting its focused heavy body', () => {
  const source = readMarketStatisticsSource();
  const backControlStart = source.indexOf('<Pressable\n            onPress={onBack}');
  const backControlEnd = source.indexOf('</Pressable>', backControlStart);
  const backControlSource = source.slice(backControlStart, backControlEnd);

  assert.match(source, /export function MarketStatisticsScreen\(\) \{[\s\S]*launchCovers[\s\S]*useDeferredRouteContentReady\(0, isScreenFocused\)[\s\S]*bodyMountedRef[\s\S]*if \(!contentReady\) \{[\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="market-statistics"[\s\S]*return <MarketStatisticsInteractiveContent onBack=\{handleBack\} \/>/);
  assert.match(source, /markQuoteInfoLaunchCovered\('market-statistics'\)/);
  assert.match(source, /completeQuoteInfoLaunch\('market-statistics'\)/);
  assert.match(source, /backNavigationStartedRef\.current = true;[\s\S]*beginQuoteInfoBackCover\('market-statistics', symbol\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/quotes'\);[\s\S]*scheduleQuoteInfoBackCoverRemoval\(coverRevision\)/);
  assert.notEqual(backControlStart, -1);
  assert.notEqual(backControlEnd, -1);
  assert.match(backControlSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quoteInfo\.marketStatistics\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.doesNotMatch(backControlSource, /activateOnTouchStart/);
  assert.doesNotMatch(source, /MARKET_STATISTICS_FULL_CONTENT_DELAY_MS/);
});
