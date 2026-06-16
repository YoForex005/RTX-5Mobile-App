import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

const source = readChartScreenSource();
const readProjectSource = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`${relativePath} was not found from the test working directory`);
  }
  return readFileSync(filePath, 'utf8');
};
const chartWebViewHtmlSource = readProjectSource('src/features/chart/rendering/ChartWebViewHtml.ts');
const chartWebSource = readProjectSource('src/features/chart/ChartScreen.web.tsx');
const chartConstantsSource = readProjectSource('src/features/chart/ChartScreen.constants.ts');
const chartTapRadialMenuSource = readProjectSource('src/features/chart/components/ChartTapRadialMenu.tsx');
const liveCandlesHookSource = readProjectSource('src/domain/candles/hooks/useLiveCandles.ts');
const liveCandleStreamManagerSource = readProjectSource('src/domain/candles/stream/liveCandleStream/manager.ts');

test('webview bridge: ChartScreen initializes chart only after WebView READY enables bridge', () => {
  assertSourceContains(source, /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/, 'READY must reset bridge state and enable WebView');
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*if \(!webViewRef\.current \|\| !webViewReady\) return/, 'sendInit must wait for WebView readiness');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*sendInit\(\);[\s\S]*\}, \[sanitizedCandles, sendInit\]\)/, 'sanitized candle arrival must trigger init after READY');
});

test('webview bridge: candles arriving before READY are retained and sent after readiness', () => {
  assertSourceContains(source, /const sanitizedBackendCandles = useMemo\([\s\S]*sanitizeCandlesForChart\(candles, \{ timeframe: chartTimeframe \}\)/, 'native host must sanitize backend candles only when the backend stream changes');
  assertSourceContains(source, /const sanitizedCandles = useMemo\([\s\S]*resolveLivePriceCoherentCandles\(sanitizedBackendCandles, chartTimeframe/, 'native host must merge live price after backend sanitization');
  assertSourceContains(source, /const overlayCandles = sanitizedBackendCandles\.length > 0 \? sanitizedBackendCandles : sanitizedCandles/, 'overlay rebuilds must stay tied to backend candles when backend history exists');
  assertSourceContains(source, /buildChartOverlayPayload\(\{[\s\S]*candles: overlayCandles/, 'chart overlays must not rebuild from every live quote tick');
  assertSourceContains(source, /const candlesRef = useRef\(sanitizedCandles\)/, 'sanitized candles must be retained outside render timing');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*candlesRef\.current = sanitizedCandles;[\s\S]*\}, \[[^\]]*sanitizedCandles[^\]]*\]\)/, 'latest sanitized candles must update the retained ref');
  assertSourceContains(source, /const data = candlesRef\.current[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\][\s\S]*initChart\(/, 'sendInit must initialize the chart shell even before candles arrive');
});

test('webview bridge: symbol switches do not paint cached candles before fresh history commits', () => {
  assertSourceContains(
    liveCandleStreamManagerSource,
    /historyCandles:\s*\[\][\s\S]*candles:\s*EMPTY_CANDLES as CandleParams\[\][\s\S]*runLoadHistory\(this, entry, DEFAULT_HISTORY_LIMIT\)/,
    'new candle streams must expose an empty UI series until the authoritative REST history load commits',
  );
  assert.doesNotMatch(
    liveCandlesHookSource,
    /engineCandles\.length\s*>\s*0\s*\?\s*engineCandles\s*:\s*safeCachedCandles/,
    'useLiveCandles must not fall back to cached candles during a symbol switch',
  );
});

test('webview bridge: zero-size WebView init is deferred and retried from rAF and ResizeObserver', () => {
  const initBody = extractFunctionBody(chartWebViewHtmlSource, 'initChart');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(initBody, /requestAnimationFrame\(function\(\)/, 'initChart must wait for layout frame before measuring');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*opts:[\s\S]*chartType:[\s\S]*data:/, 'zero-size init must preserve pending payload');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*initSignature: resolvedInitSignature,[\s\S]*configSig: resolvedConfigSig/, 'zero-size init must preserve host init signatures');
  assertSourceContains(chartWebViewHtmlSource, /new ResizeObserver\(function\(entries\)[\s\S]*if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'ResizeObserver must replay pending init');
});

test('webview bridge: exposes required bridge methods for updates and recovery', () => {
  [
    'initChart',
    'updateChartData',
    'updateTick',
    'setMarketPriceLines',
    'resizeChartViewport',
    'recoverChartSurface',
    'setChartOverlays',
    'setSerializedDrawings',
    'publishSerializedDrawings',
    'applyDrawingTextEdit',
    'cancelDrawingTextEdit',
  ].forEach((method) => {
    assertSourceContains(chartWebViewHtmlSource, new RegExp(`window\\.${method} = ${method}`), `${method} must be exposed on window`);
  });
});

test('webview bridge: objects navigation flushes current drawing records first', () => {
  assertSourceContains(
    chartWebViewHtmlSource,
    /function publishSerializedDrawings\(\)[\s\S]*window\._drawingManager\.publishDrawingsToHost\(\)/,
    'WebView must expose a host sync function that republishes manager drawings',
  );
  assertSourceContains(
    source,
    /const requestChartDrawingSyncForObjects = useCallback\(\(\) => \{[\s\S]*publishSerializedDrawings\(\)[\s\S]*DRAWINGS_SYNCED_FOR_OBJECTS[\s\S]*\}, \[chartCanvasReady, webViewReady\]\)/,
    'native chart must request current WebView drawings and wait for an ack before navigation',
  );
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_SYNCED_FOR_OBJECTS'[\s\S]*pendingObjectsDrawingSyncRef\.current[\s\S]*router\.push\('\/chart\/objects'\)/,
    'Objects screen navigation must happen after the WebView confirms drawing publication',
  );
});

test('webview bridge: updateChartData full reload reapplies overlays and market price lines', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(body, /lastRawSeriesData = sanitizeSeriesData\(data\)/, 'full reload must remember sanitized raw data for recovery');
  assertSourceContains(body, /clearMarketPriceLineRefs\(\)[\s\S]*series\.setData\(mapped\)/, 'full reload must remove tracked market price lines before setData can orphan them');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'full reload must replace the chart series');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full reload must clear stale overlay line refs');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full reload must reapply overlays after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'full reload must restore market lines after setData');
});

test('webview bridge: updateChartData recenters when a full reload replaces the visible series', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(
    chartWebViewHtmlSource,
    /function shouldResetViewportForSeriesReplacement\(previousData, nextData\)[\s\S]*return nextData\.length < previousData\.length \|\| nextFirst !== previousFirst \|\| nextLast < previousLast/,
    'series replacement detection must catch shrinks and non-prepend range changes',
  );
  assertSourceContains(body, /var didReplaceVisibleSeries =[\s\S]*shouldResetViewportForSeriesReplacement\(previousRawSeriesData, lastRawSeriesData\)/, 'full reload must detect visible series replacement');
  assertSourceContains(body, /previousRawSeriesData\.length === 0 \|\| didReplaceVisibleSeries[\s\S]*applyRecentViewport\(mapped\.length\)/, 'replacement reloads must move the viewport to the latest data');
  assertSourceContains(body, /didReplaceVisibleSeries \? 'update_data_replace_series' : 'update_data'/, 'replacement reloads must use a distinct price-scale recovery reason');
  assertSourceContains(body, /didPrependHistory \|\| didReplaceVisibleSeries \? 5 : 1/, 'replacement reloads must retry price-scale recovery like history prepends');
});

test('webview bridge: updateTick uses an incremental requestAnimationFrame path', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateTick');
  const flushBody = extractFunctionBody(chartWebViewHtmlSource, 'flushPendingTick');

  assertSourceContains(body, /pendingTick = tick/, 'updateTick must coalesce the latest tick');
  assertSourceContains(body, /requestAnimationFrame\(flushPendingTick\)/, 'updateTick must paint incrementally on rAF');
  assertSourceContains(flushBody, /applyTickUpdate\(tick\)/, 'pending tick flush must update only the active candle');
});

test('webview bridge: lower move bars show the current amount without a separate volume price scale', () => {
  const mapMoveBarsBody = extractFunctionBody(chartWebViewHtmlSource, 'mapMoveBarsData');
  const optionsBody = extractFunctionBody(chartWebViewHtmlSource, 'makeMoveDirectionPriceLineOptions');
  const ensureBody = extractFunctionBody(chartWebViewHtmlSource, 'ensureMoveDirectionPriceLine');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshMoveDirectionPriceLine');
  const ensureMoveBarsBody = extractFunctionBody(chartWebViewHtmlSource, 'ensureMoveBarsSeries');
  const moveBadgeBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMoveDirectionOverlayBadge');
  const moveBadgeLabelBody = extractFunctionBody(chartWebViewHtmlSource, 'formatMoveDirectionOverlayBadgeLabel');
  const overlayRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');

  assertSourceContains(
    mapMoveBarsBody,
    /value: Math\.abs\(close - open\)[\s\S]*color: up \? moveUpColor : moveDownColor/,
    'lower bars must keep plotting the candle move magnitude and direction color',
  );
  assertSourceContains(
    optionsBody,
    /price: pickLiveMoveValue\(\)[\s\S]*axisLabelVisible: false[\s\S]*title: ''/,
    'lower move direction line must not show a native volume price-scale badge',
  );
  assertSourceContains(
    ensureMoveBarsBody,
    /chart\.priceScale\('move'\)\.applyOptions\(\{[\s\S]*visible: false,[\s\S]*ticksVisible: false,[\s\S]*borderVisible: false,[\s\S]*entireTextOnly: false/,
    'lower move price scale must stay hidden so the chart keeps one visible symbol price scale',
  );
  assertSourceContains(
    ensureBody,
    /moveBarsSeries\.createPriceLine\(makeMoveDirectionPriceLineOptions\(\)\)/,
    'lower move guide line must still be created on the move-bars series',
  );
  assertSourceContains(
    refreshBody,
    /moveDirectionPriceLine\.applyOptions\(makeMoveDirectionPriceLineOptions\(\)\)/,
    'live ticks must refresh the lower move guide line without rebuilding the histogram series',
  );
  assertSourceContains(
    moveBadgeBody,
    /var value = pickLiveSignedMoveValue\(\)[\s\S]*moveBarsSeries\.priceToCoordinate\(pickLiveMoveValue\(\)\)[\s\S]*className = 'rtx5-move-overlay-badge'[\s\S]*left = axisMetrics\.axisLeft \+ 'px'[\s\S]*width = axisMetrics\.axisWidth[\s\S]*background = pickLivePriceColor\(\)/,
    'custom lower move badge must highlight the live volume bar amount on the right price-scale axis',
  );
  assertSourceContains(
    moveBadgeLabelBody,
    /if \(value > 0\)[\s\S]*return '\+' \+ rounded/,
    'custom lower move badge must show signed up/down movement',
  );
  assert.doesNotMatch(
    moveBadgeBody,
    /rtx5-move-price-scale-badge|data-rtx5-role', 'move-price-scale'/,
    'lower move amount must stay a custom overlay badge, never a second native price scale',
  );
  assertSourceContains(
    overlayRefreshBody,
    /renderMarketPriceScaleBadges\(layer\)[\s\S]*renderMoveDirectionOverlayBadge\(layer\)/,
    'overlay refresh must repaint the custom lower move amount without adding a price-scale badge',
  );
});

test('webview bridge: renders backend candle timestamps directly', () => {
  assertSourceContains(
    source,
    /const cleaned = sourceCandles[\s\S]*time: c\.time[\s\S]*value: c\.close[\s\S]*time: c\.time/,
    'native host must pass backend candle timestamps to the WebView',
  );
  assert.doesNotMatch(source, /setIndexToRealTimeMap|appendIndexToRealTimeEntry|replaceLastIndexToRealTimeEntry/);
  assert.doesNotMatch(chartWebViewHtmlSource, /_rtxIndexToRealTime|setIndexToRealTimeMap|appendIndexToRealTimeEntry|replaceLastIndexToRealTimeEntry/);
});

test('webview bridge: preserves backend OHLC candles without price-continuity pruning', () => {
  const sanitizerBody = extractFunctionBody(chartWebViewHtmlSource, 'sanitizeSeriesData');
  const normalizerBody = extractFunctionBody(chartWebViewHtmlSource, 'normalizeRawSeriesDatum');

  assertSourceContains(
    sanitizerBody,
    /return Object\.keys\(byTime\)[\s\S]*\.sort\(function\(left, right\) \{ return left\.time - right\.time; \}\);/,
    'WebView candle sanitizer should only dedupe and sort finite backend candles before rendering',
  );
  assert.doesNotMatch(
    sanitizerBody,
    /filterRawSeriesDataByPriceContinuity/,
    'WebView must not drop valid backend candles using a price-continuity heuristic',
  );
  assert.doesNotMatch(
    normalizerBody,
    /isRawSeriesDatumInternallyCoherent/,
    'WebView must not drop a finite backend OHLC candle because its wick is large',
  );
});

test('webview bridge: formats candle timestamps in UTC broker time', () => {
  const tickFormatterBody = extractFunctionBody(chartWebViewHtmlSource, 'formatChartTickMark');

  assertSourceContains(tickFormatterBody, /getUTCDate\(\)/, 'x-axis day labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCMonth\(\)/, 'x-axis month labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCHours\(\)/, 'x-axis hour labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCMinutes\(\)/, 'x-axis minute labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCFullYear\(\)/, 'x-axis year labels must use UTC');
  assertSourceContains(chartWebViewHtmlSource, /new Date\(Date\.UTC\(time\.year, time\.month - 1, time\.day\)\)/, 'Business-day dates must be interpreted as UTC');
  assertSourceContains(chartWebViewHtmlSource, /new Date\(Date\.UTC\(time\.businessDay\.year, time\.businessDay\.month - 1, time\.businessDay\.day\)\)/, 'Business-day wrapper dates must be interpreted as UTC');
  assert.doesNotMatch(tickFormatterBody, /getDate\(\)|getMonth\(\)|getHours\(\)|getMinutes\(\)|getFullYear\(\)/);
});

test('webview bridge: setMarketPriceLines hides native market badges and paints custom price-scale badges', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'setMarketPriceLines');
  const marketLineOptionsBody = extractFunctionBody(chartWebViewHtmlSource, 'makeMarketPriceLineOptions');
  const visibleRangeBody = extractFunctionBody(chartWebViewHtmlSource, 'resolvePriceRangeFromVisibleData');
  const healPriceScaleBody = extractFunctionBody(chartWebViewHtmlSource, 'healCollapsedPriceScaleRange');
  const renderMarketPriceScaleExtensionBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleExtension');
  const renderMarketPriceScaleExtensionsBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleExtensions');
  const renderMarketPriceScaleBadgeBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleBadge');
  const renderMarketPriceScaleBadgesBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleBadges');
  const axisMetricsBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveMarketPriceScaleAxisMetrics');
  const badgeFormatterBody = extractFunctionBody(chartWebViewHtmlSource, 'formatMarketPriceScaleBadgeLabel');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');
  const marketPriceRangeBody = extractFunctionBody(chartWebViewHtmlSource, 'rangeContainsMarketPriceBadges');
  const marketPriceNormalizerBody = extractFunctionBody(chartWebViewHtmlSource, 'normalizeMarketPriceLinePrice');

  assertSourceContains(body, /var normalizedBid = normalizeMarketPriceLinePrice\(bid\)[\s\S]*var normalizedAsk = normalizeMarketPriceLinePrice\(ask\)/, 'market line updates must normalize bid and ask before repainting');
  assertSourceContains(body, /lastBidPrice = normalizedBid[\s\S]*lastAskPrice = normalizedAsk/, 'market line state must cache normalized bid/ask values for recovery');
  assertSourceContains(body, /clearMarketPriceLineRefs\(\)/, 'market line updates must clear stale right-axis price-line refs before repainting');
  assertSourceContains(body, /setBidPriceLine\(normalizedBid, false\)/, 'bid guide line must update through the price-line API');
  assertSourceContains(body, /setAskPriceLine\(normalizedAsk, false\)/, 'ask guide line must update through the price-line API');
  assertSourceContains(body, /ensureMarketPriceBadgesVisible\(\)/, 'market line updates must keep both bid and ask guide lines inside the visible price scale');
  assertSourceContains(marketPriceNormalizerBody, /resolveRightPriceScaleFallbackConfiguredDecimals\(\)[\s\S]*resolveOverlayDisplayDecimals\(\)[\s\S]*toFixed\(safeDecimals\)/, 'market bid/ask lines must snap to configured display precision before rendering');
  assertSourceContains(marketLineOptionsBody, /lineVisible: true/, 'market price lines must explicitly keep their chart guide visible');
  assertSourceContains(marketLineOptionsBody, /axisLabelVisible: false/, 'market price lines must hide lightweight-charts native right-axis badges');
  assert.doesNotMatch(marketLineOptionsBody, /axisLabelColor: color/, 'market bid/ask must not configure hidden native badge fill colors');
  assert.doesNotMatch(marketLineOptionsBody, /axisLabelTextColor: '#FFFFFF'/, 'market bid/ask must not configure hidden native badge text colors');
  assertSourceContains(marketLineOptionsBody, /title: ''/, 'market bid/ask price lines must stay text-free');
  assertSourceContains(chartWebViewHtmlSource, /var MARKET_PRICE_SCALE_EXTENSION_HEIGHT = 1/, 'custom market price-scale extensions must stay a one-pixel MT5-like accent');
  assertSourceContains(chartWebViewHtmlSource, /var MARKET_PRICE_SCALE_BADGE_HEIGHT = 22[\s\S]*var MARKET_PRICE_SCALE_BADGE_MIN_WIDTH = 56/, 'custom market price-scale badges must use compact phone-safe dimensions');
  assertSourceContains(renderMarketPriceScaleExtensionBody, /className = 'rtx5-market-price-scale-extension'[\s\S]*style\.left = axisLeft \+ 'px'[\s\S]*style\.width = Math\.min\(axisWidth/, 'custom market price-scale extension must render only over the right price scale');
  assertSourceContains(renderMarketPriceScaleExtensionsBody, /clearMarketPriceScaleExtensions\(layer\)[\s\S]*renderMarketPriceScaleExtension\(layer, lastBidPrice, marketBidColor\)[\s\S]*renderMarketPriceScaleExtension\(layer, lastAskPrice, marketAskColor\)/, 'overlay refresh must repaint custom bid and ask price-scale extensions');
  assertSourceContains(axisMetricsBody, /resolveRightPriceScaleFallbackAxisMetrics\(Object\.assign[\s\S]*MARKET_PRICE_SCALE_BADGE_MIN_WIDTH[\s\S]*axisLeft \+ axisWidth > chartWidth/, 'custom market price badges must occupy the owned right price-scale strip without overflowing the chart');
  assertSourceContains(badgeFormatterBody, /resolveOverlayDisplayDecimals\(\)[\s\S]*Number\(price\)\.toFixed\(decimals\)/, 'custom market price badges must use the same configured display precision as the overlay');
  assertSourceContains(renderMarketPriceScaleBadgeBody, /className = 'rtx5-market-price-scale-badge rtx5-market-price-scale-badge-' \+ badge\.role[\s\S]*textContent = formatMarketPriceScaleBadgeLabel\(badge\.price\)[\s\S]*style\.left = axisMetrics\.axisLeft \+ 'px'[\s\S]*style\.width = axisMetrics\.axisWidth \+ 'px'[\s\S]*style\.background = badge\.color[\s\S]*style\.color = '#FFFFFF'[\s\S]*style\.textAlign = 'right'/, 'custom market price-scale badge must render as a colored right-axis price box');
  assertSourceContains(renderMarketPriceScaleBadgesBody, /clearMarketPriceScaleBadges\(layer\)[\s\S]*collectMarketPriceScaleBadge\(layer, axisMetrics, lastBidPrice, marketBidColor, 'bid'\)[\s\S]*collectMarketPriceScaleBadge\(layer, axisMetrics, lastAskPrice, marketAskColor, 'ask'\)[\s\S]*badges\.sort[\s\S]*MARKET_PRICE_SCALE_BADGE_GAP[\s\S]*renderMarketPriceScaleBadge\(layer, badges\[badgeIndex\], axisMetrics\)/, 'overlay refresh must repaint and stack custom bid and ask price-scale badges');
  assertSourceContains(visibleRangeBody, /includeMarketPriceBadges === false[\s\S]*expandPriceRangeForMarketPriceBadges\(robustRange\)/, 'visible price-scale recovery must be able to ignore far live bid/ask badges during horizontal navigation');
  assertSourceContains(
    chartWebViewHtmlSource,
    /function expandPriceRangeForMarketPriceBadges\(range\)[\s\S]*var maxQuoteDistance = span \* 4[\s\S]*return expanded \? makePaddedPriceRange/,
    'market bid/ask badge expansion must stay local to the visible candle range',
  );
  assertSourceContains(marketPriceRangeBody, /resolveMarketPriceBadgeRecoveryBuffer\(reference \|\| normalized\)/, 'market badge containment must keep a small stability buffer before forcing axis recovery');
  assertSourceContains(healPriceScaleBody, /marketPriceBadgesOutOfRange[\s\S]*rangeContainsMarketPriceBadges\(currentRange, candleDataRange\)[\s\S]*setRecoveredRightPriceRange\(dataRange\)/, 'price-scale healing must recover only for near bid/ask badges outside the visible axis range');
  assertSourceContains(refreshBody, /renderMarketPriceScaleExtensions\(layer\)/, 'overlay refresh must render custom market price-scale extensions');
  assertSourceContains(refreshBody, /renderMarketPriceScaleExtensions\(layer\)[\s\S]*renderMarketPriceScaleBadges\(layer\)/, 'overlay refresh must render MT5-style custom market price-scale badges after the line accents');
  assertSourceContains(source, /The display candle has already folded in the same live quote used here,[\s\S]*so the candle close and market price lines move from one tick source/, 'native quote bridge must keep candle close and market price lines synchronized to one live quote source');
});

test('webview bridge: native web and WebView creation reserve the right price scale', () => {
  const applyLayoutBody = extractFunctionBody(chartWebViewHtmlSource, 'applyChartLayout');
  const setScaleMarginsBody = extractFunctionBody(chartWebViewHtmlSource, 'setPrimaryPriceScaleMargins');

  assertSourceContains(
    chartConstantsSource,
    /export const CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH = 62;/,
    'right price-scale minimum width must be centralized',
  );
  assertSourceContains(
    source,
    /rightPriceScale: \{[\s\S]*visible: true,[\s\S]*minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH/,
    'native host chart options must explicitly reserve and show the right price scale',
  );
  assertSourceContains(
    chartWebSource,
    /rightPriceScale: \{[\s\S]*visible: true,[\s\S]*minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH/,
    'web chart creation must use the shared right price-scale reservation',
  );
  assertSourceContains(
    applyLayoutBody,
    /opts\.rightPriceScale = Object\.assign\(\{\}, opts\.rightPriceScale \|\| \{\}, \{[\s\S]*visible: true,[\s\S]*entireTextOnly: false,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'WebView chart creation must enforce the visible right price-scale reservation with Android-safe label layout',
  );
  assertSourceContains(
    setScaleMarginsBody,
    /chart\.priceScale\('right'\)\.applyOptions\(\{[\s\S]*visible: true,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'WebView price-scale margin updates must preserve the right price-scale reservation',
  );
  assertSourceContains(
    setScaleMarginsBody,
    /entireTextOnly: false/,
    'WebView price-scale margin updates must not collapse Android axis labels to entire-text-only layout',
  );
  assert.doesNotMatch(
    setScaleMarginsBody,
    /entireTextOnly: true/,
    'primary right price-scale margin updates must preserve entireTextOnly=false',
  );
});

test('native chart status overlays do not block symbol recovery controls', () => {
  assertSourceContains(
    source,
    /\{\(!chartSurfaceReady \|\| isLoading\) && \(\s*<View pointerEvents="none" style=\{styles\.chartOverlay\}>/,
    'loading overlay must not block the symbol picker or toolbar while chart data is pending',
  );
  assertSourceContains(
    source,
    /\{chartSurfaceReady && isError && !isLoading && \(\s*<View pointerEvents="none" style=\{styles\.chartOverlay\}>/,
    'error overlay must not block the symbol picker or toolbar while users recover',
  );
  assertSourceContains(
    source,
    /\{chartSurfaceReady && isNoMarketData && !isError && \(\s*<View pointerEvents="none" style=\{styles\.chartOverlay\}>/,
    'no-data overlay must not block the symbol picker so unavailable symbols can be skipped',
  );
});

test('native chart tap radial menu toggles closed on the next chart tap', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_TAP'[\s\S]*const nextAnchor = \{[\s\S]*syncChartViewportFrame\(\(\) => \{[\s\S]*setChartTapMenuAnchor\(\(currentAnchor\) => \([\s\S]*currentAnchor \? null : nextAnchor[\s\S]*\)\)/,
    'valid chart body taps must alternate the MT5-like radial menu open and closed instead of only re-anchoring it',
  );
});

test('native chart tap radial menu opens with a native-driven smooth entrance', () => {
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_SCALE_FROM = 0\.58/,
    'the radial menu entrance must start from a visibly smaller MT5-like ring scale',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const computeAnchorPosition = React\.useCallback\(\(\) => \(\s*resolveMenuPosition\(anchor\.x, anchor\.y\)\s*\)/,
    'the radial menu must open around the actual chart tap point instead of screen-centering every open',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /Animated\.parallel\(\[[\s\S]*Animated\.timing\(entranceOpacity,[\s\S]*Easing\.out\(Easing\.cubic\)[\s\S]*useNativeDriver: true[\s\S]*Animated\.spring\(entranceScale,[\s\S]*useNativeDriver: true/,
    'the MT5-like radial menu must use the native animation driver',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /<Animated\.View[\s\S]*opacity: entranceOpacity[\s\S]*transform: \[\{ scale: entranceScale \}\]/,
    'the entrance animation must apply directly to the radial menu content',
  );
});

test('webview bridge: right price-scale layout recovery gates chart ready and resize/data updates', () => {
  const layoutOptionsBody = extractFunctionBody(chartWebViewHtmlSource, 'applyRightPriceScaleLayoutOptions');
  const layoutHealthyBody = extractFunctionBody(chartWebViewHtmlSource, 'isRightPriceScaleLayoutHealthy');
  const recoverLayoutBody = extractFunctionBody(chartWebViewHtmlSource, 'recoverRightPriceScaleLayout');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');
  const resizeBody = extractFunctionBody(chartWebViewHtmlSource, 'resizeChartViewport');
  const recoverSurfaceBody = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');
  const updateDataBody = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(
    layoutOptionsBody,
    /visible: true,[\s\S]*entireTextOnly: false,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'right-axis recovery must force visible reserved layout with entireTextOnly disabled',
  );
  assertSourceContains(
    layoutOptionsBody,
    /chart\.applyOptions\(\{ rightPriceScale: layoutOptions \}\)[\s\S]*priceScaleApi\.applyOptions\(layoutOptions\)/,
    'right-axis recovery must apply options through chart and price-scale APIs',
  );
  assertSourceContains(
    layoutHealthyBody,
    /metrics\.rightAxisWidth < \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\} - 2[\s\S]*priceScaleOptions && priceScaleOptions\.entireTextOnly === true[\s\S]*return true/,
    'right-axis health must reject invalid geometry/options while leaving label painting to the custom axis layer',
  );
  assertSourceContains(
    recoverLayoutBody,
    /applyRightPriceScaleLayoutOptions\(\)[\s\S]*chart\.resize\(size\.width, size\.height\)[\s\S]*postChartGeometry\(\)/,
    'right-axis recovery must force options, resize the current container, and repost geometry',
  );
  assertSourceContains(
    readyGateBody,
    /if \(isRightPriceScaleLayoutHealthy\(\)\)[\s\S]*lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartReady\(initSignature, configSig\)[\s\S]*recoverRightPriceScaleLayout\(reason \|\| 'chart_ready'\)[\s\S]*currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS[\s\S]*scheduleRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleRightPriceScaleLayoutRecovery\(reason \|\| 'chart_ready', 2\)[\s\S]*postChartReady\(initSignature, configSig\)[\s\S]*requestAnimationFrame\(function\(\)[\s\S]*postChartReadyWhenPriceScaleHealthy\(reason, currentAttempt \+ 1, generation, initSignature, configSig\)/,
    'CHART_READY must prefer valid right-axis geometry plus custom labels but stay bounded on slow iOS WebView layout',
  );
  assertSourceContains(
    doInitBody,
    /chartReadyPostGeneration \+= 1[\s\S]*var readyGeneration = chartReadyPostGeneration[\s\S]*var readyInitSignature = lastInitSignature[\s\S]*var readyConfigSig = lastInitConfigSig[\s\S]*postChartGeometry\(\)[\s\S]*postChartReadyWhenPriceScaleHealthy\('init_ready', 0, readyGeneration, readyInitSignature, readyConfigSig\)/,
    'initial chart ready must be gated by right-axis recovery and stale-generation protection',
  );
  assertSourceContains(
    resizeBody,
    /scheduleRightPriceScaleLayoutRecovery\('resize', 4\)/,
    'explicit native viewport resize must retry right-axis layout recovery',
  );
  assertSourceContains(
    recoverSurfaceBody,
    /scheduleRightPriceScaleLayoutRecovery\('recover_surface', RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS\)/,
    'surface recovery must also retry right-axis layout recovery',
  );
  assertSourceContains(
    updateDataBody,
    /scheduleRightPriceScaleLayoutRecovery\([\s\S]*priceScaleReason,[\s\S]*RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS/,
    'data reloads must retry right-axis layout recovery with the same replacement/prepend reason',
  );
});

test('webview bridge: right price-scale DOM health ignores RTX5 numeric overlays', () => {
  const customOverlayPredicateBody = extractFunctionBody(chartWebViewHtmlSource, 'isCustomRightPriceScaleOverlayNode');
  const nativeLabelStatusBody = extractFunctionBody(chartWebViewHtmlSource, 'getRightPriceScaleNativeDomLabelStatus');
  const collapsedLabelBody = extractFunctionBody(chartWebViewHtmlSource, 'hasCollapsedRightPriceScaleDomLabels');
  const layoutHealthyBody = extractFunctionBody(chartWebViewHtmlSource, 'isRightPriceScaleLayoutHealthy');

  assertSourceContains(
    customOverlayPredicateBody,
    /_overlayLabelLayer[\s\S]*rightPriceScaleFallbackLayer[\s\S]*node\.closest\('\.rtx5-overlay-label-layer'\)[\s\S]*node\.closest\('\.rtx5-position-price-scale-box'\)[\s\S]*node\.closest\('\.rtx5-market-price-scale-extension'\)[\s\S]*node\.closest\('\.rtx5-market-price-scale-badge'\)[\s\S]*node\.closest\('\.rtx5-right-price-scale-fallback'\)/,
    'right-axis DOM probe must explicitly exclude custom RTX5 overlay and fallback nodes',
  );
  assertSourceContains(
    nativeLabelStatusBody,
    /chartElement\.querySelectorAll\('span, div'\)[\s\S]*isCustomRightPriceScaleOverlayNode\(node\)[\s\S]*labelCount \+= 1/,
    'native right-axis label status must not count generic numeric overlay descendants as axis labels',
  );
  assertSourceContains(
    collapsedLabelBody,
    /var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus\(metrics\)[\s\S]*nativeLabelStatus\.labelCount >= 2[\s\S]*nativeLabelStatus\.healthyCount === 0[\s\S]*nativeLabelStatus\.collapsedCount >= nativeLabelStatus\.labelCount/,
    'collapsed right-axis detection must be driven by native-label status only',
  );
  assert.doesNotMatch(
    layoutHealthyBody,
    /getRightPriceScaleNativeDomLabelStatus|getRightPriceScaleNativeCanvasLabelStatus|hasCollapsedRightPriceScaleDomLabels/,
    'layout health must not suppress the custom right-axis layer based on transient native label probes',
  );
});

test('webview bridge: custom right price-scale labels do not depend on native label health', () => {
  const renderBody = extractFunctionBody(chartWebViewHtmlSource, 'renderFallbackRightPriceScaleLabels');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const recoveryBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleRightPriceScaleLayoutRecovery');

  assertSourceContains(
    chartWebViewHtmlSource,
    /var RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS = \[1, 2, 2\.5, 5, 10\]/,
    'custom right-axis labels must use standard nice price steps',
  );
  assertSourceContains(
    renderBody,
    /!series \|\| !lastRawSeriesData \|\| lastRawSeriesData\.length === 0[\s\S]*ensureRightPriceScaleFallbackLayer\(\)[\s\S]*axisBackground\.className = 'rtx5-right-price-scale-fallback-axis'[\s\S]*axisBackground\.style\.background = lastChartBackgroundColor \|\| '#FFFFFF'[\s\S]*className = 'rtx5-right-price-scale-fallback-label'/,
    'custom labels must render an owned right-axis strip whenever backend candle data is present',
  );
  assert.doesNotMatch(
    renderBody,
    /resolveRightPriceScaleFallbackDecision|hasHealthyRightPriceScaleNativeLabels|getRightPriceScaleNativeLabelHealth/,
    'custom label rendering must not clear itself because transient native-label probes look healthy',
  );
  assertSourceContains(
    readyGateBody,
    /lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartReady\(initSignature, configSig\)[\s\S]*currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS[\s\S]*scheduleRightPriceScaleFallbackRefresh\(\)[\s\S]*postChartReady\(initSignature, configSig\)/,
    'CHART_READY must allow no-data symbols, prefer custom labels when backend candles exist, and stay bounded on transient label-render misses',
  );
  assert.doesNotMatch(
    readyGateBody,
    /hasHealthyRightPriceScaleNativeLabels|getRightPriceScaleNativeLabelHealth/,
    'CHART_READY must not bypass custom label rendering because native labels briefly look healthy',
  );
  assertSourceContains(
    recoveryBody,
    /if \(isRightPriceScaleLayoutHealthy\(\)\) \{[\s\S]*renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartGeometry\(\)/,
    'layout recovery completion must refresh the owned custom right-axis layer',
  );
});

test('webview bridge: custom right price-scale labels are backend-data-driven and ready-gated', () => {
  const rangeBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackRange');
  const ticksBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackTicks');
  const renderBody = extractFunctionBody(chartWebViewHtmlSource, 'renderFallbackRightPriceScaleLabels');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(
    chartWebViewHtmlSource,
    /var RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS = 7[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS = 30[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX = 60[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS = \[1, 2, 2\.5, 5, 10\]/,
    'custom right-axis label density and step choices must be bounded for phone/tablet chart heights',
  );
  assertSourceContains(
    rangeBody,
    /resolveRightPriceScaleCoordinateRange\(\)[\s\S]*isValidPriceRange\(coordinateRange\)[\s\S]*resolveRightPriceScaleVisibleRange\(\)[\s\S]*resolvePriceRangeFromVisibleData\(true\)/,
    'custom axis labels must prefer chart coordinates before visible right-scale fallback so top and bottom labels fill the plot height',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleCoordinateRange\(\)[\s\S]*series\.coordinateToPrice\(plotTop \+ RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2\)[\s\S]*series\.coordinateToPrice\(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2\)[\s\S]*normalizePriceRange/,
    'custom axis fallback must read the visible top and bottom prices from chart coordinates when the price-scale API has no visible range',
  );
  assertSourceContains(
    ticksBody,
    /lastRawSeriesData[\s\S]*resolveRightPriceScaleFallbackLabelCount\(metrics\)[\s\S]*resolveRightPriceScaleFallbackNiceStep\(span, Math\.max\(1, labelCount - 1\)\)[\s\S]*resolveRightPriceScaleFallbackStepDecimals\(step\)[\s\S]*appendTick[\s\S]*series\.priceToCoordinate\(price\)[\s\S]*formatRightPriceScaleFallbackLabel\(price, decimals\)[\s\S]*roundRightPriceScaleFallbackPrice\(priceTick, decimals\)/,
    'custom axis ticks must be derived from backend data, nice step spacing, chart coordinates, and configured symbol precision',
  );
  assertSourceContains(
    ticksBody,
    /appendTick\([\s\S]*plotTop \+ RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*appendTick\([\s\S]*plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*ticks\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'custom axis ticks must include top and bottom edge labels to avoid empty right-scale whitespace',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleFallbackDecimals\(minimumDecimals\)[\s\S]*resolveRightPriceScaleFallbackConfiguredDecimals\(\)[\s\S]*if \(configuredDecimals !== null\) \{[\s\S]*return configuredDecimals[\s\S]*resolveRightPriceScaleFallbackDataDecimals\(\)/,
    'custom right-axis precision must not let raw OHLC decimal noise override configured display metadata',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleFallbackStepDecimals\(step\)[\s\S]*resolveRightPriceScaleFallbackConfiguredDecimals\(\)[\s\S]*if \(configuredDecimals !== null\) \{[\s\S]*return configuredDecimals[\s\S]*countRightPriceScaleFallbackDecimalPlaces\(step\)/,
    'custom right-axis tick spacing precision must also stay locked to configured display metadata when present',
  );
  assertSourceContains(
    renderBody,
    /clearRightPriceScaleFallbackLabels\(\)[\s\S]*ensureRightPriceScaleFallbackLayer\(\)[\s\S]*resolveRightPriceScaleFallbackAxisMetrics\(metrics\)[\s\S]*layer\.style\.zIndex = '30'[\s\S]*className = 'rtx5-right-price-scale-fallback-axis'[\s\S]*axisBackground\.style\.top = Math\.max\(0, Math\.round\(metrics\.plotTop \|\| 0\)\) \+ 'px'[\s\S]*axisBackground\.style\.height = Math\.max\(0, Math\.round\(metrics\.plotHeight \|\| metrics\.paneHeight \|\| 0\)\) \+ 'px'[\s\S]*className = 'rtx5-right-price-scale-fallback-label'[\s\S]*label\.textContent = tick\.text/,
    'custom labels must render inside an owned reserved right price-scale strip',
  );
  assertSourceContains(
    renderBody,
    /label\.style\.textAlign = 'right'[\s\S]*label\.style\.fontVariantNumeric = 'tabular-nums'[\s\S]*label\.style\.fontFeatureSettings = '"tnum" 1, "lnum" 1'/,
    'custom right-axis labels must keep right-aligned tabular numerals for stable price reading',
  );
  assertSourceContains(
    refreshBody,
    /renderFallbackRightPriceScaleLabels\(\)[\s\S]*renderMarketPriceScaleExtensions\(layer\)[\s\S]*renderMarketPriceScaleBadges\(layer\)/,
    'overlay refresh must repaint fallback axis labels before custom market/position overlays',
  );
  assertSourceContains(
    readyGateBody,
    /lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartGeometry\(\)[\s\S]*postChartReady\(initSignature, configSig\)/,
    'CHART_READY must not post before custom right-axis labels are rendered when backend candles exist',
  );
  assertSourceContains(
    doInitBody,
    /clearRightPriceScaleFallbackLayer\(\)[\s\S]*lastChartTextColor = resolveChartTextColor\(safeOpts\)/,
    'symbol/timeframe re-init must clear stale fallback DOM and refresh label theme colors',
  );
  assert.doesNotMatch(
    renderBody,
    /postMessage/,
    'custom right-axis labels must not add a new public WebView bridge message',
  );
});

test('web chart: precision overlays and crosshair stay parity-safe', () => {
  assertSourceContains(
    chartWebSource,
    /resolveChartDisplayDecimals\(\{[\s\S]*instrumentDigits: chartInstrumentMeta\?\.digits,[\s\S]*instrumentPoint: chartInstrumentMeta\?\.point,[\s\S]*instrumentTickSize: chartInstrumentMeta\?\.tickSize,[\s\S]*liveQuoteDigits: chartLiveQuote\?\.digits,[\s\S]*liveQuoteDigitsFromBackend: hasLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'web display precision must use instrument precision metadata and backend-gated quote digits',
  );
  assert.doesNotMatch(
    chartWebSource,
    /baseSymbol\.includes\('JPY'\) \? 3/,
    'web display precision must not fall back to symbol-family hardcoding',
  );
  assertSourceContains(
    chartWebSource,
    /const overlayLiveBid = useMemo\([\s\S]*const overlayLiveAsk = useMemo\([\s\S]*liveBid: overlayLiveBid,[\s\S]*liveAsk: overlayLiveAsk/,
    'web overlays must pass quote-driven bid and ask prices for live open-position PnL',
  );
  assertSourceContains(
    chartWebSource,
    /crosshair: \{[\s\S]*mode: CrosshairMode\.Hidden,[\s\S]*visible: false,[\s\S]*labelVisible: false,[\s\S]*color: 'transparent',[\s\S]*labelBackgroundColor: 'transparent'/,
    'web chart crosshair must stay hidden with invisible labels',
  );
  assertSourceContains(chartWebSource, /crosshairMarkerVisible: false/, 'web line chart crosshair marker must stay hidden');
});

test('webview bridge: resizeChartViewport replays pending init and updates geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending zero-size init');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize the active chart');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must report chart geometry');
});

test('webview bridge: recoverChartSurface restores data overlays market lines and geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');

  assertSourceContains(chartWebViewHtmlSource, /var requestHostOptions = cloneSerializableValue\(opts \|\| \{\}, \{\}\)[\s\S]*lastInitHostOptions = requestHostOptions/, 'init must cache an immutable copy of host chart options');
  assertSourceContains(chartWebViewHtmlSource, /var safeOpts = applyChartLayout\(cloneSerializableValue\(opts \|\| \{\}, \{\}\)\)/, 'WebView chart creation must mutate only a throwaway options copy');
  assertSourceContains(chartWebViewHtmlSource, /var customCols = safeOpts\.customColors[\s\S]*applyMovingVerticalGridColor\(customCols && customCols\.grid\)[\s\S]*delete safeOpts\.customColors/, 'chart creation must read grid colors before removing customColors from LightweightCharts options');
  assertSourceContains(body, /lastRawSeriesData[\s\S]*series\.setData\(mapped\)/, 'surface recovery must restore the last raw series');
  assertSourceContains(body, /cloneSerializableValue\(lastInitHostOptions, \{\}\)[\s\S]*lastInitChartType/, 'surface recovery must recreate missing charts from preserved host options');
  assertSourceContains(body, /clearMarketPriceLineRefs\(\)[\s\S]*series\.setData\(mapped\)/, 'surface recovery must remove tracked market price lines before setData can orphan them');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'surface recovery must reapply overlays');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'surface recovery must reapply market price lines');
  assertSourceContains(body, /postChartGeometry\(\)/, 'surface recovery must republish geometry');
});

test('webview bridge: native handler accepts CHART_READY geometry drag and errors', () => {
  assertSourceContains(source, /const initAttemptSig = `\$\{currentSig\}:\$\{getChartSnapshotSignature\(initSnapshot\)\}`;[\s\S]*initChart\([\s\S]*JSON\.stringify\(initAttemptSig\)[\s\S]*JSON\.stringify\(currentSig\)/, 'native init must tag WebView init with latest attempt and config signatures');
  assertSourceContains(chartWebViewHtmlSource, /function postChartReady\(initSignature, configSig\)[\s\S]*type: 'CHART_READY'[\s\S]*initSignature: initSignature \|\| ''[\s\S]*configSig: configSig \|\| ''/, 'WebView CHART_READY must echo the init signatures');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyInitSignature = typeof msg\.initSignature === 'string' \? msg\.initSignature : ''[\s\S]*readyInitSignature !== latestInitDispatch\.signature[\s\S]*readyConfigSig !== currentSig[\s\S]*return/, 'native handler must ignore stale CHART_READY signatures');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*chartInitializedRef\.current = true[\s\S]*setChartCanvasReady\(true\)/, 'CHART_READY must mark canvas ready');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyCandles = candlesRef\.current[\s\S]*const readySnapshot = buildChartSeriesSnapshot\(readyCandles\)/, 'CHART_READY must read the retained sanitized candles');
  assertSourceContains(source, /getChartSnapshotSignature\(pendingInitSnapshotRef\.current\) === getChartSnapshotSignature\(readySnapshot\)[\s\S]*renderedSeriesSnapshotRef\.current = readySnapshot[\s\S]*updateChartData\(\$\{JSON\.stringify\(mapped\)\}\)/, 'CHART_READY must skip duplicate full-history paint when init already seeded the same series');
  assertSourceContains(source, /msg\.type === 'CHART_GEOMETRY'[\s\S]*setChartPlotArea/, 'CHART_GEOMETRY must update plot area');
  assertSourceContains(source, /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*handleChartTradePreviewDragMessage\(msg\)/, 'trade-line drag messages must reach React state');
  assertSourceContains(source, /msg\.type === 'ERROR'[\s\S]*console\.warn\('\[CHART WEBVIEW ERROR\]'/, 'WebView errors must be logged without blocking recovery');
});

test('webview bridge: watchdog keeps re-sending initChart until CHART_READY', () => {
  assertSourceContains(source, /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*!chartInitializedRef\.current[\s\S]*webViewReady[\s\S]*sendInit\(true\)/, 'watchdog must retry init while chart is not confirmed');
  assertSourceContains(source, /\}, CHART_WATCHDOG_INTERVAL_MS\);/, 'watchdog must use the shared chart startup retry cadence');
  assertSourceContains(
    source,
    /const recentInitInFlight =[\s\S]*!chartInitializedRef\.current &&[\s\S]*lastInitDispatchRef\.current\.configSig === currentSig &&[\s\S]*now - lastInitDispatchRef\.current\.at < CHART_INIT_RETRY_MIN_MS;[\s\S]*if \(recentInitInFlight\) return;[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\];/,
    'pending init retries must be throttled before remapping and injecting full history',
  );
  assertSourceContains(source, /setChartReadyEpoch\(\(c\) => c \+ 1\)/, 'CHART_READY must bump epoch for dependent bridge effects');
});

test('webview bridge: recent viewport reserves a bounded live-edge gap before the price scale', () => {
  const recentViewportBody = extractFunctionBody(chartWebViewHtmlSource, 'applyRecentViewport');
  const shouldFollowLiveRightEdgeBody = extractFunctionBody(chartWebViewHtmlSource, 'shouldFollowLiveRightEdge');
  const followLiveRightEdgeBody = extractFunctionBody(chartWebViewHtmlSource, 'followLiveRightEdge');
  const applyTickUpdateBody = extractFunctionBody(chartWebViewHtmlSource, 'applyTickUpdate');
  const logicalRangeBranchEnd = recentViewportBody.indexOf('} else {');
  const logicalRangeBranch =
    logicalRangeBranchEnd >= 0 ? recentViewportBody.slice(0, logicalRangeBranchEnd) : recentViewportBody;

  assertSourceContains(
    source,
    /rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET/,
    'native chart must use the shared time-scale right-offset constant',
  );
  assertSourceContains(
    chartConstantsSource,
    /export const CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 7;/,
    'right-offset must keep the MT5-style professional gap between the live candle and the price scale',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function getBoundedLiveRightEdge\(lengthOverride\)[\s\S]*Math\.max\(0\.5, dataLength - 0\.5\) \+ \$\{CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET\}[\s\S]*var lastVisibleBar = getBoundedLiveRightEdge\(dataLength\)[\s\S]*from: Math\.max\(-0\.5, lastVisibleBar - visibleBars\)[\s\S]*to: lastVisibleBar/,
    'recent viewport must keep a bounded right-offset gap between the latest candle and price scale',
  );
  assert.doesNotMatch(
    logicalRangeBranch,
    /scrollToRealTime\(\)/,
    'recent logical viewport must not immediately scroll flush to the newest candle after applying the bounded gap',
  );
  assertSourceContains(
    recentViewportBody,
    /\} else \{[\s\S]*fitContent\(\)[\s\S]*scrollToRealTime\(\)/,
    'legacy fallback may still use scrollToRealTime when logical range APIs are unavailable',
  );
  assertSourceContains(
    shouldFollowLiveRightEdgeBody,
    /activeHorizontalScrollGesture \|\| Date\.now\(\) <= activeHorizontalScrollGestureUntil[\s\S]*var previousMaxRight = getBoundedLiveRightEdge\(lengthOverride\)[\s\S]*return range\.to >= previousMaxRight - followTolerance/,
    'live-edge follow must only engage when the user was already viewing the live edge and is not actively scrolling',
  );
  assertSourceContains(
    followLiveRightEdgeBody,
    /var span = Math\.max\(1, previousRange\.to - previousRange\.from\)[\s\S]*var nextFrom = nextRight - span[\s\S]*chart\.timeScale\(\)\.setVisibleLogicalRange\(\{[\s\S]*from: nextFrom,[\s\S]*to: nextRight/,
    'live-edge follow must preserve the existing viewport width while advancing the right edge',
  );
  assertSourceContains(
    applyTickUpdateBody,
    /var previousSeriesLength = currentSeriesLength[\s\S]*var previousVisibleRange = getVisibleLogicalRangeSnapshot\(\)[\s\S]*var appendedNewBar = currentSeriesLength === 0 \|\| normalizedTick\.time > lastBarTime[\s\S]*var shouldFollowLiveEdge = appendedNewBar && shouldFollowLiveRightEdge\(previousVisibleRange, previousSeriesLength\)[\s\S]*currentSeriesLength = lastRawSeriesData\.length[\s\S]*if \(shouldFollowLiveEdge\) \{[\s\S]*followLiveRightEdge\(previousVisibleRange, currentSeriesLength\)/,
    'appended live candles must advance the viewport right edge instead of drifting left behind empty future space',
  );
});

test('webview bridge: WebView process reload resets bridge and reloads chart', () => {
  assertSourceContains(source, /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'iOS process termination must reload');
  assertSourceContains(source, /onRenderProcessGone=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'Android render process loss must reload');
});
