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
    /<QuoteCard[\s\S]*onPress=\{\(\) => handleSymbolTap\(sym\)\}[\s\S]*suppressPressFeedback[\s\S]*onLongPress=/,
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
  assert.match(tapConfigSource, /detent: 'auto'/);
  assert.match(tapConfigSource, /instantOpen: true/);
  assert.match(longPressConfigSource, /quoteSymbols\.forEach\(\(sym\) => \{/);
  assert.match(longPressConfigSource, /title: fmt\.symbol\(sym\)/);
  assert.match(longPressConfigSource, /detent: 'auto'/);
  assert.match(longPressConfigSource, /instantOpen: true/);
  assert.match(source, /const hideQuotesActionSheet = useUIState\(\(s\) => s\.hideQuotesActionSheet\)/);
  assert.match(source, /const quotesActionSheetOpen = useUIState\(\(s\) => s\.scopedActionSheets\.quotes !== null\)/);
  assert.match(source, /type QuoteSheetOptionOptions = \{[\s\S]*routeChange\?: boolean;[\s\S]*\}/);
  assert.match(source, /const \[quoteSheetRouteActionPending, setQuoteSheetRouteActionPending\] = useState\(false\)/);
  assert.match(source, /const quoteCatalogActive = quoteRouteActive && !quoteSheetRouteActionPending/);
  assert.match(source, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(source, /function useSidebarQuoteFeedPaused\(\)/);
  assert.match(source, /useUIState\.subscribe\(\(state, previousState\) => \{/);
  assert.match(source, /const sidebarQuoteFeedPaused = useSidebarQuoteFeedPaused\(\)/);
  assert.match(source, /const quoteFeedActive =[\s\S]*quoteStickyFeedActive[\s\S]*!sidebarQuoteFeedPaused[\s\S]*!quotesActionSheetOpen[\s\S]*!quoteSheetRouteActionPending/);
  assert.match(source, /function scheduleQuoteSheetOptionAction\(action: \(\) => void\) \{/);
  assert.match(
    source,
    /const runQuoteSheetOption = useCallback\(\(action: \(\) => void, options\?: QuoteSheetOptionOptions\) => \{[\s\S]*options\?\.routeChange === true[\s\S]*setQuoteSheetRouteActionPending\(true\);[\s\S]*hideQuotesActionSheet\(\);[\s\S]*scheduleQuoteSheetOptionAction\(action\);/,
  );
  assert.match(tapConfigSource, /label: t\('New Order'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /label: t\('Chart'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /label: t\('Symbol Details'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /label: t\('Market Statistics'\),[\s\S]*activateOnPressIn: true/);
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\(\{ pathname: '\/trade\/order-ticket'/);
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\('\/\(tabs\)\/chart'\)/);
  assert.match(tapConfigSource, /runQuoteSheetOption\(\(\) => \{[\s\S]*router\.push\(\{ pathname: '\/quotes\/market-statistics'/);
  assert.match(tapConfigSource, /router\.push\(\{ pathname: '\/trade\/order-ticket'[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(tapConfigSource, /router\.push\('\/\(tabs\)\/chart'\);[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(tapConfigSource, /router\.push\(\{ pathname: '\/quotes\/market-statistics'[\s\S]*\}, \{ routeChange: true \}/);
  assert.match(
    source,
    /const handleSymbolTap = useCallback[\s\S]*quoteTapActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.tap\.open'[\s\S]*showQuotesActionSheet\(config\)/,
  );
  assert.match(
    source,
    /const handleSymbolLongPress = useCallback[\s\S]*quoteLongPressActionSheetConfigs\.get\(sym\)[\s\S]*runImmediateAction\('quotes\.symbolSheet\.longPress\.open'[\s\S]*showQuotesActionSheet\(config\)/,
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

test('market statistics opens the complete screen without a temporary shell', () => {
  const source = readMarketStatisticsSource();

  assert.match(source, /export function MarketStatisticsScreen\(\) \{[\s\S]*return <MarketStatisticsInteractiveContent \/>;[\s\S]*\}/);
  assert.doesNotMatch(source, /MarketStatisticsInitialShell/);
  assert.doesNotMatch(source, /useDeferredRouteContentReady/);
  assert.doesNotMatch(source, /MARKET_STATISTICS_FULL_CONTENT_DELAY_MS/);
});
