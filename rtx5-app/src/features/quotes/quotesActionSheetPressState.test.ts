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
    /<QuoteCard[\s\S]*onPressIn=\{\(\) => pauseQuoteSheetFeed\(\)\}[\s\S]*onPress=\{\(\) => handleSymbolTap\(sym\)\}[\s\S]*suppressPressFeedback[\s\S]*onLongPress=/,
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
  assert.match(tapConfigSource, /runActionAfterClose: true/);
  assert.match(longPressConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(longPressConfigSource, /title: fmt\.symbol\(sym\)/);
  assert.match(longPressConfigSource, /presentation: 'mt5Plain'/);
  assert.match(longPressConfigSource, /detent: 'auto'/);
  assert.match(longPressConfigSource, /instantOpen: true/);
  assert.match(longPressConfigSource, /runActionAfterClose: true/);
  assert.doesNotMatch(source, /const hideQuotesActionSheet = useUIState\(\(s\) => s\.hideQuotesActionSheet\)/);
  assert.match(source, /type QuoteSheetOptionOptions = \{[\s\S]*routeChange\?: boolean;[\s\S]*\}/);
  assert.match(source, /const \[quoteSheetRouteActionPending, setQuoteSheetRouteActionPending\] = useState\(false\)/);
  assert.match(source, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(source, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(source, /const QUOTE_SHEET_OPEN_FEED_PAUSE_MS = 15_000/);
  assert.doesNotMatch(source, /quotesSheetVisible/);
  assert.match(source, /const quoteCatalogActive = quoteRouteActive && !quoteSheetRouteActionPending/);
  assert.match(source, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(source, /const quoteRestFallbackActive = quoteCatalogActive/);
  assert.match(source, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/);
  assert.match(source, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(source, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}/);
  assert.match(source, /const pauseQuoteSheetFeed = useCallback\(\(durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS\) => \{/);
  assert.match(source, /quotesWsService\.deferReconnectForInteraction\?\.\(durationMs\)/);
  assert.match(source, /const releaseQuoteSheetFeedPause = useCallback\(\(\) => \{/);
  assert.doesNotMatch(source, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.match(source, /function scheduleQuoteSheetOptionAction\(action: \(\) => void, deferUntilNextFrame = false\) \{/);
  assert.match(source, /deferUntilNextFrame && typeof globalThis\.requestAnimationFrame === 'function'/);
  assert.match(source, /globalThis\.requestAnimationFrame\(\(\) => \{[\s\S]*globalThis\.requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(action, 0\)/);
  assert.match(
    source,
    /const runQuoteSheetOption = useCallback\(\(action: \(\) => void, options\?: QuoteSheetOptionOptions\) => \{[\s\S]*options\?\.routeChange === true[\s\S]*pauseQuoteSheetFeed\(routeChange \? QUOTE_SHEET_ROUTE_FEED_PAUSE_MS : QUOTE_SHEET_OPTION_FEED_PAUSE_MS\);[\s\S]*React\.startTransition\(\(\) => \{[\s\S]*setQuoteSheetRouteActionPending\(true\);[\s\S]*\}\);[\s\S]*scheduleQuoteSheetOptionAction\(action, routeChange\);/,
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
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\(\{ pathname: '\/trade\/order-ticket'/);
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\('\/\(tabs\)\/chart'\)/);
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\(\{ pathname: '\/quotes\/market-statistics'/);
  assert.match(tapConfigSource, /router\.push\(\{ pathname: '\/trade\/order-ticket'[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(tapConfigSource, /router\.push\('\/\(tabs\)\/chart'\);[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(tapConfigSource, /router\.push\(\{ pathname: '\/quotes\/market-statistics'[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(
    source,
    /const handleSymbolTap = useCallback[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.tap\.open'[\s\S]*pauseQuoteSheetFeed\(\);[\s\S]*showQuotesActionSheet\(config\)/,
  );
  assert.match(
    source,
    /const handleSymbolLongPress = useCallback[\s\S]*quoteLongPressActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.longPress\.open'[\s\S]*pauseQuoteSheetFeed\(\);[\s\S]*showQuotesActionSheet\(config\)/,
  );
  assert.match(source, /onLongPress=\{\(\) => handleSymbolLongPress\(sym\)\}/);
});

test('quote details opens the complete screen without a temporary shell', () => {
  const source = readSymbolDetailsSource();

  assert.match(source, /export function SymbolDetailsScreen\(\) \{[\s\S]*return <SymbolDetailsInteractiveContent \/>;[\s\S]*\}/);
  assert.doesNotMatch(source, /SymbolDetailsInitialShell/);
  assert.doesNotMatch(source, /useDeferredRouteContentReady/);
  assert.doesNotMatch(source, /SYMBOL_DETAILS_FULL_CONTENT_DELAY_MS/);
});

test('quote details specification shows point and account leverage', () => {
  const source = readSymbolDetailsSource();
  const contractSpecStart = source.indexOf('<Section title="Contract Specification"');
  const pricingFeesStart = source.indexOf('<Section title="Pricing & Fees"');
  const instrumentProfileStart = source.indexOf('<Section title="Instrument Profile"');
  assert.notEqual(contractSpecStart, -1, 'contract specification section must exist');
  assert.notEqual(pricingFeesStart, -1, 'pricing and fees section must exist');
  assert.notEqual(instrumentProfileStart, -1, 'instrument profile section must exist');

  const contractSpec = source.slice(contractSpecStart, pricingFeesStart);
  const pricingFees = source.slice(pricingFeesStart, instrumentProfileStart);
  assert.match(source, /import \{ useAccountSummary \} from '..\/..\/..\/query\/account'/);
  assert.match(source, /resolveTradingLoginString, useResolvedTradingLogin/);
  assert.doesNotMatch(source, /useSavedAccounts|activeSavedAccountLeverage|brokerId/);
  assert.match(source, /useAccountSummary\(accountLoginString, \{[\s\S]*enabled: isScreenFocused && !!accountLoginString/);
  assert.match(source, /base\.point = remoteMeta\.point \?\? base\.point/);
  assert.match(source, /const point = remoteMeta\?\.point \?\? q\.point \?\? q\.tickSize \?\? pip/);
  assert.match(source, /const resolvedLeverage = accountSummary\?\.leverage && accountSummary\.leverage > 0[\s\S]*\? accountSummary\.leverage[\s\S]*: undefined/);
  assert.match(source, /const leverageText = resolvedLeverage && resolvedLeverage > 0[\s\S]*\? `1:\$\{formatDetailNumber\(resolvedLeverage\)\}`[\s\S]*: '--'/);
  assert.match(contractSpec, /<Row label="Point" value=\{formatDetailNumber\(point\)\} \/>/);
  assert.match(pricingFees, /<Row label="Leverage" value=\{leverageText\} \/>/);
  assert.doesNotMatch(pricingFees, /onPress|ActionSheet|Select/);
});

test('quote details keeps real swap values visible', () => {
  const source = readSymbolDetailsSource();
  const pricingFeesStart = source.indexOf('<Section title="Pricing & Fees"');
  const instrumentProfileStart = source.indexOf('<Section title="Instrument Profile"');
  assert.notEqual(pricingFeesStart, -1, 'pricing and fees section must exist');
  assert.notEqual(instrumentProfileStart, -1, 'instrument profile section must exist');

  const pricingFees = source.slice(pricingFeesStart, instrumentProfileStart);
  assert.match(source, /const resolveDetailNumber = \(\.\.\.values: Array<number \| null \| undefined>\) =>/);
  assert.match(source, /const formatSwapValue = \(value: number \| null \| undefined\) => \{/);
  assert.match(source, /base\.swapLong = resolveDetailNumber\(remoteMeta\?\.swapLong, base\.swapLong, mock\.swapLong\) \?\? base\.swapLong/);
  assert.match(source, /base\.swapShort = resolveDetailNumber\(remoteMeta\?\.swapShort, base\.swapShort, mock\.swapShort\) \?\? base\.swapShort/);
  assert.match(source, /const swapLong = resolveDetailNumber\(remoteMeta\?\.swapLong, q\.swapLong\)/);
  assert.match(source, /const swapShort = resolveDetailNumber\(remoteMeta\?\.swapShort, q\.swapShort\)/);
  assert.match(pricingFees, /<Row label="Swap Long" value=\{formatSwapValue\(swapLong\)\}/);
  assert.match(pricingFees, /<Row label="Swap Short" value=\{formatSwapValue\(swapShort\)\}/);
  assert.doesNotMatch(pricingFees, /\(q\.swapLong \?\? 0\)\.toFixed\(2\)/);
  assert.doesNotMatch(pricingFees, /\(q\.swapShort \?\? 0\)\.toFixed\(2\)/);
});

test('market statistics opens the complete screen without a temporary shell', () => {
  const source = readMarketStatisticsSource();

  assert.match(source, /export function MarketStatisticsScreen\(\) \{[\s\S]*return <MarketStatisticsInteractiveContent \/>;[\s\S]*\}/);
  assert.doesNotMatch(source, /MarketStatisticsInitialShell/);
  assert.doesNotMatch(source, /useDeferredRouteContentReady/);
  assert.doesNotMatch(source, /MARKET_STATISTICS_FULL_CONTENT_DELAY_MS/);
});
