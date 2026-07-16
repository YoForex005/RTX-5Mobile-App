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
  assert.match(tapConfigSource, /entryMotion: 'mt5Slide'/);
  // Route actions commit only a light preview (or the fast-tab flip), so they
  // run in the press frame instead of waiting behind the close animation.
  assert.match(tapConfigSource, /runActionAfterClose: false/);
  assert.match(longPressConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(longPressConfigSource, /title: fmt\.symbol\(sym\)/);
  assert.match(longPressConfigSource, /presentation: 'mt5Plain'/);
  assert.match(longPressConfigSource, /detent: 'auto'/);
  assert.match(longPressConfigSource, /instantOpen: true/);
  assert.match(longPressConfigSource, /entryMotion: 'mt5Slide'/);
  assert.match(longPressConfigSource, /runActionAfterClose: false/);
  assert.doesNotMatch(source, /const hideQuotesActionSheet = useUIState\(\(s\) => s\.hideQuotesActionSheet\)/);
  assert.match(source, /type QuoteSheetOptionOptions = \{[\s\S]*routeChange\?: boolean;[\s\S]*\}/);
  assert.doesNotMatch(source, /quoteSheetRouteActionPending|setQuoteSheetRouteActionPending/);
  assert.match(source, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(source, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(source, /const QUOTE_SHEET_OPEN_FEED_PAUSE_MS = 15_000/);
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
  assert.match(source, /const hasQuoteSheetPressMovedBeyondThreshold = [\s\S]*dx \* dx \+ dy \* dy[\s\S]*QUOTE_SHEET_PRESS_CANCEL_MOVE_PX \* QUOTE_SHEET_PRESS_CANCEL_MOVE_PX/);
  assert.match(source, /requestRetainedActionSheetPreview/);
  assert.match(source, /commitRetainedActionSheetPreview/);
  assert.match(source, /cancelRetainedActionSheetPreview/);
  assert.doesNotMatch(source, /scheduleRetainedActionSheetReactAdoption/);
  assert.match(source, /const handleSymbolPressIn = useCallback\(\(sym: string, event: GestureResponderEvent\) => \{[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*preloadedQuoteTapConfigRef\.current !== config[\s\S]*preloadQuotesActionSheet\(config\)[\s\S]*requestRetainedActionSheetPreview\(config\.visualKey\)[\s\S]*start: getQuoteSheetPressPoint\(event\)[\s\S]*pauseQuoteSheetFeed\(\)/);
  assert.match(source, /const handleSymbolPressMove = useCallback[\s\S]*hasQuoteSheetPressMovedBeyondThreshold[\s\S]*cancelSymbolSheetPreview\(gesture\.sequence\)/);
  assert.match(source, /const handleSymbolPressOut = useCallback[\s\S]*setTimeout\(\(\) => \{[\s\S]*cancelSymbolSheetPreview\(sequence\);[\s\S]*\}, 0\)/);
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
    /const runQuoteSheetOption = useCallback\(\(action: \(\) => void, options\?: QuoteSheetOptionOptions\) => \{[\s\S]*options\?\.routeChange === true[\s\S]*pauseQuoteSheetFeed\(routeChange \? QUOTE_SHEET_ROUTE_FEED_PAUSE_MS : QUOTE_SHEET_OPTION_FEED_PAUSE_MS\);[\s\S]*if \(routeChange\) \{[\s\S]*action\(\);[\s\S]*return;[\s\S]*action\(\);/,
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
  // The Chart option rides the same optimistic fast-tab flip as a bottom-bar
  // tap instead of paying a router.push commit inside the sheet action.
  assert.match(tapConfigSource, /label: t\('Chart'\),[\s\S]*onPress: \(\) => openChartTabForSymbol\(sym\)/);
  assert.match(tapConfigSource, /label: t\('Market Statistics'\),[\s\S]*onPress: \(\) => openMarketStatisticsForSymbol\(sym\)/);
  assert.match(
    source,
    /const openQuoteInfoForSymbol = useCallback\([\s\S]*showQuoteInfoLaunch\(destination, sym\);[\s\S]*scheduleQuoteInfoLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*pathname: '\/quotes\/details'[\s\S]*pathname: '\/quotes\/market-statistics'[\s\S]*hideQuoteInfoLaunch\(launchRevision\)[\s\S]*\}, \{ routeChange: true \}\);/,
  );
  assert.match(
    source,
    /const openOrderTicketForSymbol = useCallback\(\(sym: string\) => \{[\s\S]*runQuoteSheetOption\(\(\) => \{[\s\S]*const launchRevision = showOrderTicketLaunch\(sym, 'quotes'\);[\s\S]*scheduleOrderTicketLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*router\.push\(\{ pathname: '\/trade\/order-ticket', params: \{ symbol: sym, origin: 'quotes' \} \}\);[\s\S]*\}, \{ routeChange: true \}\);/,
  );
  assert.match(
    source,
    /const openChartTabForSymbol = useCallback\(\(sym: string\) => \{[\s\S]*const visualRevision = showFastTabVisual\('chart'\);[\s\S]*navigateMountedSidebarTab\('\/chart'\)[\s\S]*router\.push\('\/\(tabs\)\/chart'\)[\s\S]*const chartTimeframe = prepareChartSymbol\(sym\);[\s\S]*liveCandlesEngine\.prefetchHistory\(sym, chartTimeframe\);[\s\S]*\}, \{ routeChange: true \}\);/,
  );
  assert.match(
    source,
    /const handleSymbolTap = useCallback[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*hasQuoteSheetPressMovedBeyondThreshold[\s\S]*gesture\.accepted = true[\s\S]*commitRetainedActionSheetPreview[\s\S]*runImmediateAction\('quotes\.symbolSheet\.tap\.open'[\s\S]*const adoptRetainedSheet[\s\S]*showQuotesActionSheet\(config\);[\s\S]*prepareSymbolDestinationsAfterSheetPaint\(sym\)[\s\S]*if \(retainedRevealRevision !== null\) \{[\s\S]*adoptRetainedSheet\(\);/,
  );
  const tapHandlerEnd = source.indexOf('\n\n  /**', tapHandlerStart);
  const tapHandlerSource = source.slice(tapHandlerStart, tapHandlerEnd);
  const tapShowIndex = tapHandlerSource.indexOf('showQuotesActionSheet(config)');
  assert.notEqual(tapShowIndex, -1);
  assert.doesNotMatch(
    tapHandlerSource.slice(0, tapShowIndex),
    /pauseQuoteSheetFeed|prepareOrderTicketLaunch|prepareQuoteInfoLaunch|prefetch|router\.|await|InteractionManager|setTimeout|requestAnimationFrame/,
    'nothing may compete with the accepted tap before sheet visibility is published',
  );
  assert.match(
    source,
    /const prepareSymbolDestinationsAfterSheetPaint = useCallback\(\(sym: string\) => \{[\s\S]*prepareOrderTicketLaunch\(sym, 'quotes'\);[\s\S]*prepareQuoteInfoLaunch\(sym\);[\s\S]*const chartTimeframe = prepareChartSymbol\(sym\);[\s\S]*liveCandlesEngine\.prefetchHistory\(sym, chartTimeframe\);[\s\S]*prefetchOrderTicketData\(resolveTradingLoginString\(\), sym\);[\s\S]*prefetchQuoteDetails\(sym\);[\s\S]*preloadDeferredRouteModule\(\s*SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY,\s*loadSymbolDetailsScreenRoute,[\s\S]*preloadDeferredRouteModule\(\s*MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY,\s*loadMarketStatisticsScreenRoute,[\s\S]*pathname: '\/trade\/order-ticket'[\s\S]*pathname: '\/quotes\/details'[\s\S]*pathname: '\/quotes\/market-statistics'[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(prepareDestinations, 0\)/,
  );
  assert.match(
    source,
    /const prepareChartSymbol = \(symbol: string\) => \{[\s\S]*useUserPreferences\.getState\(\)[\s\S]*preferences\.chartSymbol !== symbol[\s\S]*preferences\.setChartSymbol\(symbol\)[\s\S]*return preferences\.chartTimeframe/,
  );
  assert.match(
    source,
    /const handleSymbolLongPress = useCallback[\s\S]*quoteLongPressActionSheetConfigs\.get\(sym\)[\s\S]*gesture\.accepted = true[\s\S]*cancelRetainedActionSheetPreview\(gesture\.previewRevision\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.longPress\.open'[\s\S]*showQuotesActionSheet\(config\);[\s\S]*prepareSymbolDestinationsAfterSheetPaint\(sym\)/,
  );
  assert.match(source, /onLongPress=\{\(\) => handleSymbolLongPress\(sym\)\}/);
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
  assert.match(backControlSource, /onPress=\{onBack\}[\s\S]*latencyLabel="quoteInfo\.properties\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.doesNotMatch(backControlSource, /activateOnPressIn|activateOnTouchStart/);
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
  assert.match(source, /base\.swapLong = resolveDetailNumber\(remoteMeta\?\.swapLong, base\.swapLong, mock\.swapLong\) \?\? base\.swapLong/);
  assert.match(source, /base\.swapShort = resolveDetailNumber\(remoteMeta\?\.swapShort, base\.swapShort, mock\.swapShort\) \?\? base\.swapShort/);
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
  assert.match(backControlSource, /onPress=\{onBack\}[\s\S]*latencyLabel="quoteInfo\.marketStatistics\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.doesNotMatch(backControlSource, /activateOnPressIn|activateOnTouchStart/);
  assert.doesNotMatch(source, /MARKET_STATISTICS_FULL_CONTENT_DELAY_MS/);
});
