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
const liveCandleHistoryFetchingSource = readProjectSource('src/domain/candles/stream/liveCandleStream/historyFetching.ts');
const enhancedDrawingToolsSource = readProjectSource('src/features/chart/plugins/enhancedDrawingToolsString.ts');

test('webview bridge: ChartScreen initializes chart only after WebView READY enables bridge', () => {
  assertSourceContains(source, /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/, 'READY must reset bridge state and enable WebView');
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*if \(!webViewRef\.current \|\| !webViewReady\) return/, 'sendInit must wait for WebView readiness');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*sendInit\(\);[\s\S]*\}, \[sanitizedCandles, sendInit\]\)/, 'sanitized candle arrival must trigger init after READY');
});

test('webview bridge: candles arriving before READY are retained and sent after readiness', () => {
  assertSourceContains(source, /const sanitizedBackendCandles = useMemo\([\s\S]*sanitizeCandlesForChart\(candles, \{ timeframe: chartTimeframe \}\)/, 'native host must sanitize backend candles only when the backend stream changes');
  assertSourceContains(source, /const sanitizedCandles = useMemo\([\s\S]*return sanitizedBackendCandles;[\s\S]*\[\s*sanitizedBackendCandles\s*\]/, 'native host must render backend candle data without live-quote candle synthesis');
  assert.doesNotMatch(source, /resolveLivePriceCoherentCandles/, 'native host must not build display candles from quote ticks');
  assertSourceContains(source, /const overlayCandles = sanitizedBackendCandles\.length > 0 \? sanitizedBackendCandles : sanitizedCandles/, 'overlay rebuilds must stay tied to backend candles when backend history exists');
  assertSourceContains(source, /buildChartOverlayPayload\(\{[\s\S]*candles: overlayCandles/, 'chart overlays must not rebuild from every live quote tick');
  assertSourceContains(source, /const candlesRef = useRef\(sanitizedCandles\)/, 'sanitized candles must be retained outside render timing');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*candlesRef\.current = sanitizedCandles;[\s\S]*\}, \[[^\]]*sanitizedCandles[^\]]*\]\)/, 'latest sanitized candles must update the retained ref');
  assertSourceContains(source, /const data = candlesRef\.current[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\][\s\S]*initChart\(/, 'sendInit must initialize the chart shell even before candles arrive');
});

test('webview bridge: symbol switches do not paint cached candles before fresh history commits', () => {
  assertSourceContains(
    liveCandleStreamManagerSource,
    /historyCandles:\s*\[\][\s\S]*candles:\s*EMPTY_CANDLES as CandleParams\[\][\s\S]*runLoadHistory\(this, entry, INITIAL_HISTORY_LIMIT\)/,
    'new candle streams must expose an empty UI series until the authoritative REST history load commits',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /entry\.listeners\.add\(listener\)[\s\S]*entry\.consumers \+= 1[\s\S]*this\.reloadEmptyIdleHistory\(entry\)/,
    're-subscribing to an existing empty symbol/timeframe stream must restart history loading',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /public refreshHistoryForContext\(symbol: string, timeframe: string\): void[\s\S]*this\.isHistoryRequestActive\(entry\)[\s\S]*this\.loadFreshHistory\(entry\)/,
    'chart switches must be able to refresh an existing target stream without creating duplicate first-load requests',
  );
  assert.doesNotMatch(
    liveCandlesHookSource,
    /engineCandles\.length\s*>\s*0\s*\?\s*engineCandles\s*:\s*safeCachedCandles/,
    'useLiveCandles must not fall back to cached candles during a symbol switch',
  );
  assertSourceContains(
    liveCandlesHookSource,
    /const hasCommittedHistoryCandles = \(candles: readonly CandleParams\[\]\): boolean =>[\s\S]*candle\.source === 'history' \|\| candle\.source === 'rest' \|\| candle\.closed === true[\s\S]*const hasHistoryCandles = useMemo\(\(\) => hasCommittedHistoryCandles\(engineCandles\), \[engineCandles\]\)/,
    'useLiveCandles must expose whether the current series contains committed REST history',
  );
  assertSourceContains(
    liveCandlesHookSource,
    /if \(!active \|\| !normalizedSymbol \|\| !normalizedTimeframe\)[\s\S]*liveCandlesEngine\.prefetchHistory\(normalizedSymbol, normalizedTimeframe\)/,
    'useLiveCandles must allow chart data loading without a frontend login gate',
  );
  assertSourceContains(
    source,
    /const chartDataActive = chartRuntimeActive[\s\S]*const \{ candles, paginate \} = useLiveCandles\(chartSymbol, chartTimeframe, chartDataActive\)[\s\S]*candles\.length > 0[\s\S]*sanitizeCandlesForChart\(candles, \{ timeframe: chartTimeframe \}\)[\s\S]*EMPTY_DISPLAY_CANDLES/,
    'native chart may paint live candle ticks before slow REST history finishes',
  );
  assert.doesNotMatch(source, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
  assertSourceContains(
    chartWebSource,
    /const chartDataActive = isScreenFocused[\s\S]*const \{ candles \} = useLiveCandles\(chartSymbol, chartTimeframe, chartDataActive\)/,
    'web chart must also load chart data without a frontend login gate',
  );
  assert.doesNotMatch(chartWebSource, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
});

test('live candle stream: startup prefetch seeds first chart render before REST refresh', () => {
  assertSourceContains(
    liveCandleHistoryFetchingSource,
    /candleMemoryCache\.set\(normalizedSymbol, normalizedTimeframe, candles\)/,
    'startup prefetch must store fetched REST history in the in-memory candle cache',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /const memoryCachedCandles = candleMemoryCache\.get\(symbol, timeframe\)[\s\S]*this\.hydrateFromCache\(symbol, timeframe, memoryCachedCandles as CandleParams\[\]\)[\s\S]*runLoadHistory\(this, entry, INITIAL_HISTORY_LIMIT\)/,
    'new chart subscriptions must synchronously paint memory-prefetched candles before starting the REST refresh',
  );
});

test('webview bridge: symbol switches reject stale drawing bridge updates', () => {
  assertSourceContains(
    source,
    /const scopedChartDrawingRecords = useMemo\([\s\S]*filterChartDrawingRecordsForCurrentChart\(persistedChartDrawingRecords, chartSymbol, chartTimeframe\)/,
    'drawing records must be scoped to the active symbol and timeframe before replay',
  );
  assertSourceContains(
    source,
    /LEGACY_UNSCOPED_DRAWING_KINDS = new Set<PersistedChartDrawing\['kind'\]>\(\['fib', 'measure'\]\)[\s\S]*LEGACY_UNSCOPED_DRAWING_KINDS\.has\(drawing\.kind\) && \(!drawing\.symbol \|\| !drawing\.timeframe\)[\s\S]*return false/,
    'legacy fib and measure drawings without chart identity must not be replayed into symbol switches',
  );
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_CHANGED'[\s\S]*!chartInitializedRef\.current[\s\S]*!chartCanvasReady[\s\S]*lastInitSigRef\.current !== currentSig[\s\S]*return/,
    'native host must ignore drawing updates until the current chart init is active',
  );
  assertSourceContains(
    source,
    /filterChartDrawingRecordsForCurrentChart\([\s\S]*sanitizePersistedChartDrawings\(msg\.drawings\)[\s\S]*chartSymbol[\s\S]*chartTimeframe[\s\S]*sanitizedBackendCandles/,
    'drawing updates from WebView must be filtered against the active chart and backend candle range',
  );
  assertSourceContains(
    source,
    /const drawingsToReplay = chartDrawingRecords[\s\S]*if \(webViewRef\.current\)[\s\S]*const drawingReplaySignature = chartDrawingSignature[\s\S]*setSerializedDrawings\(\$\{JSON\.stringify\(drawingsToReplay\)\}\)/,
    'CHART_READY drawing replay must use the current render-scoped drawing records, including an empty list to clear stale overlays',
  );
  assertSourceContains(
    enhancedDrawingToolsSource,
    /currentSymbol = this\._crosshairConfig[\s\S]*symbol:[\s\S]*currentSymbol \|\| undefined[\s\S]*timeframe:[\s\S]*currentTimeframe \|\| undefined/,
    'drawing plugin must stamp new drawing records with the active chart symbol and timeframe',
  );
  assertSourceContains(
    enhancedDrawingToolsSource,
    /setSerializedDrawings = function \(drawings\)[\s\S]*this\._crosshairLocked = false[\s\S]*this\._pendingCrosshairState = null[\s\S]*this\._hideCrosshairOverlay\(\)/,
    'drawing replay must clear stale locked crosshair overlays from the previous chart',
  );
});

test('webview bridge: native live candles use fresh quotes while precision stays guarded', () => {
  assertSourceContains(
    source,
    /const hasCoherentLiveChartQuote = useMemo\([\s\S]*sanitizedBackendCandles\[sanitizedBackendCandles\.length - 1\][\s\S]*quotePrices\.every\(\(price\) => isPriceCoherentWithCandle\(latestBackendCandle, price\)\)/,
    'native chart must still check quote/candle coherence before trusting backend quote precision metadata',
  );
  assertSourceContains(
    source,
    /liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'incoherent quotes must not influence display precision',
  );
  assert.doesNotMatch(source, /const liveChartPrice = useMemo/, 'native chart must not compute a quote price for candle synthesis');
  assert.doesNotMatch(source, /price: liveChartPrice/, 'native candle display must not receive quote prices');
  assertSourceContains(
    source,
    /liveBid: hasLiveChartQuote \? chartLiveQuote\?\.bid : undefined[\s\S]*liveAsk: hasLiveChartQuote \? chartLiveQuote\?\.ask : undefined/,
    'native trade bid and ask prices must follow fresh quote ticks instead of waiting for backend candle coherence',
  );
  assert.doesNotMatch(
    source,
    /liveBid: hasCoherentLiveChartQuote \? chartLiveQuote\?\.bid : undefined[\s\S]*liveAsk: hasCoherentLiveChartQuote \? chartLiveQuote\?\.ask : undefined/,
    'native trade bid and ask prices must not be gated by the candle-coherence precision guard',
  );
  assertSourceContains(
    source,
    /const overlayLiveBid = useMemo\([\s\S]*hasLiveChartQuote &&[\s\S]*chartLiveQuote\?\.bid[\s\S]*return Number\.isFinite\(chartBid\) && chartBid > 0 \? chartBid : null;[\s\S]*const overlayLiveAsk = useMemo\([\s\S]*hasLiveChartQuote &&[\s\S]*chartLiveQuote\?\.ask[\s\S]*return Number\.isFinite\(chartAsk\) && chartAsk > 0 \? chartAsk : null;/,
    'open-position overlay P/L must use fresh quote ticks while falling back to chart bid/ask',
  );
});

test('webview bridge: OHLC header follows the latest live candle', () => {
  assertSourceContains(
    source,
    /const chartMetaLiveLastCandle = sanitizedCandles\.length > 0 \? sanitizedCandles\[sanitizedCandles\.length - 1\] : null;[\s\S]*const chartMetaLastCandle = chartMetaLiveLastCandle;/,
    'O/H/L/C header must read the latest backend live candle, not a filtered chart-window candle',
  );
  assertSourceContains(
    source,
    /label: 'O', value: formatChartValue\(chartMetaLastCandle\.open\)[\s\S]*label: 'H', value: formatChartValue\(chartMetaLastCandle\.high\)[\s\S]*label: 'L', value: formatChartValue\(chartMetaLastCandle\.low\)[\s\S]*label: 'C', value: formatChartValue\(chartMetaLastCandle\.close\)/,
    'O/H/L/C values must stay connected to the selected latest candle fields',
  );
  assert.doesNotMatch(
    source,
    /const \[chartCrosshairCandle, setChartCrosshairCandle\]/,
    'crosshair candles must not pin the O/H/L/C header to an older inspected candle',
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
    'setVerticalScrollingLocked',
    'setChartAutoScaleEnabled',
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

test('webview bridge: updateChartData resets symbol switches while fresh loads use the recent viewport', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(
    chartWebViewHtmlSource,
    /function shouldResetViewportForSeriesReplacement\(previousData, nextData\)[\s\S]*return nextData\.length < previousData\.length \|\| nextFirst !== previousFirst \|\| nextLast < previousLast/,
    'series replacement detection must catch shrinks and non-prepend range changes',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resetVisiblePriceScaleForFreshSeries\(reason\)[\s\S]*clearManualPriceScaleState\(\)[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*scheduleOverlayPriceScaleLock\(true\)[\s\S]*schedulePriceScaleHealthCheck\(reason \|\| 'fresh_series', true, 5\)/,
    'fresh symbol/timeframe data must clear stale manual price-scale state and force autoscale recovery',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function centerVisiblePriceScaleForFreshSeries\(reason, forceRecompute\)[\s\S]*resolvePriceRangeFromVisibleData\(true\)[\s\S]*getBarPriceCenter\(lastRawSeriesData\[lastRawSeriesData\.length - 1\]\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: centeredRange\.from, to: centeredRange\.to \}\)[\s\S]*syntheticRightPriceScaleFallbackRange = centeredRange/,
    'fresh symbol/timeframe data must center the first visible price range around the latest candle value',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function lockVisiblePriceScaleRange\(forceAutoScale, attempt\)[\s\S]*forceAutoScale !== true && centerVisiblePriceScaleForFreshSeries\('overlay_lock', false\)/,
    'overlay refreshes must preserve the initial fresh-series center until the user interacts',
  );
  assertSourceContains(
    doInitBody,
    /lastPostedChartTouchActive = false;[\s\S]*clearManualPriceScaleState\(\)[\s\S]*chart = LightweightCharts\.createChart/,
    'chart init must clear stale manual price-scale state before creating the new symbol chart',
  );
  assertSourceContains(
    doInitBody,
    /applyRecentViewport\(currentSeriesLength\)[\s\S]*scheduleOverlayPriceScaleLock\(true\)[\s\S]*scheduleFreshSeriesVerticalCenter\('init_data', true\)/,
    'initial chart data must center vertically after the recent horizontal viewport is applied',
  );
  assertSourceContains(body, /var didReplaceVisibleSeries =[\s\S]*resetVisibleRange \|\| shouldResetViewportForSeriesReplacement\(previousRawSeriesData, lastRawSeriesData\)/, 'full reload must force visible series replacement for new chart contexts');
  assertSourceContains(chartWebViewHtmlSource, /function updateChartData\(data, options\)/, 'full reload must accept bridge options for stable symbol/timeframe switches');
  assertSourceContains(body, /var resetVisibleRange = updateOptions\.resetVisibleRange === true/, 'context switches must be able to request a fresh first viewport');
  assertSourceContains(chartWebViewHtmlSource, /function resetVisiblePriceScaleForStableReplacement\(reason\)[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*enableRightPriceAutoScale\(\)/, 'stable replacement reset must avoid delayed fresh-series recenter work');
  assertSourceContains(body, /if \(restoredStableReplacementViewport\) \{[\s\S]*resetVisiblePriceScaleForStableReplacement\(priceScaleReason\)[\s\S]*\} else \{[\s\S]*resetVisiblePriceScaleForFreshSeries\(priceScaleReason\)/, 'stable replacement reloads must force the right price scale back without scheduling a delayed fresh reset');
  assertSourceContains(body, /preserveVisibleLogicalSpan[\s\S]*didReplaceVisibleSeries[\s\S]*followLiveRightEdge\(previousVisibleLogicalRange, mapped\.length\)/, 'stable replacement reloads can still keep the same visible logical span when explicitly requested');
  assertSourceContains(body, /if \(restoredStableReplacementViewport\) \{[\s\S]*healCollapsedPriceScaleRange\(priceScaleReason, true\)/, 'stable replacement reloads must run price-scale recovery before the next paint');
  assertSourceContains(body, /if \(!restoredStableReplacementViewport\) \{[\s\S]*schedulePriceScaleHealthCheck\(/, 'stable replacement reloads must skip delayed price-scale health passes after the synchronous heal');
  assertSourceContains(body, /!restoredStableReplacementViewport[\s\S]*applyRecentViewport\(mapped\.length\)[\s\S]*scheduleFreshSeriesVerticalCenter\(priceScaleReason, true\)/, 'first loads and non-stable replacements must still move to the recent viewport and center the first visible price range');
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
    chartWebViewHtmlSource,
    /function refreshOverlayDomLabels\(payload\)[\s\S]*refreshMarketPriceScaleDom\(\)[\s\S]*renderMoveDirectionOverlayBadge\(layer\)/,
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

test('webview bridge: open-position labels separate trade side color from live PnL color', () => {
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');

  assertSourceContains(
    refreshBody,
    /labelSideColor: typeof ln\.labelSideColor === 'string'[\s\S]*labelSideText: typeof ln\.labelSideText === 'string'[\s\S]*labelValueColor: typeof ln\.labelValueColor === 'string'[\s\S]*labelValueText: typeof ln\.labelValueText === 'string'/,
    'open-position label records must carry separate side and live PnL fields',
  );
  assertSourceContains(
    refreshBody,
    /var hasSplitTradeLabel = !!\(item\.labelSideText && item\.labelValueText\)[\s\S]*sideSpan\.textContent = item\.labelSideText[\s\S]*separatorSpan\.textContent = ', '[\s\S]*valueSpan\.textContent = item\.labelValueText[\s\S]*valueSpan\.style\.color = item\.labelValueColor \|\| item\.color/,
    'open-position labels must render BUY/SELL volume and live USD value as separately colored text spans',
  );
  assertSourceContains(
    refreshBody,
    /label\.style\.color = item\.labelSideColor \|\| item\.color/,
    'split labels must keep the fallback label color aligned to the trade side',
  );
});

test('webview bridge: open-position trade labels stay attached to their price line while vertical panning', () => {
  assertSourceContains(
    chartWebViewHtmlSource,
    /var OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING = 2/,
    'anchored trade labels must not be forced below the chart header while their price line stays at the real coordinate',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveAnchoredOverlayLabelBounds\(layer\)[\s\S]*var minTop = Math\.max\(OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING, plotTop \+ 2\)/,
    'anchored trade labels must clamp only to the chart edge so top-of-chart trades remain glued to their line',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*refreshVerticalGestureOverlayPositions\(\)[\s\S]*return true/,
    'vertical price panning must move the native price range and repaint trade labels on the same touchmove',
  );
});

test('webview bridge: horizontal chart panning defers custom DOM rebuilds until release', () => {
  const markHorizontalBody = extractFunctionBody(chartWebViewHtmlSource, 'markHorizontalScrollGestureActive');
  const finishHorizontalBody = extractFunctionBody(chartWebViewHtmlSource, 'finishHorizontalScrollGesture');
  const deferDomWorkBody = extractFunctionBody(chartWebViewHtmlSource, 'deferHorizontalGestureDomWork');
  const scheduleOverlayRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleOverlayDomRefresh');
  const setChartOverlaysBody = extractFunctionBody(chartWebViewHtmlSource, 'setChartOverlays');

  assertSourceContains(
    deferDomWorkBody,
    /visibleRangeIdlePendingAfterGesture = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*cancelGestureRightPriceScaleFallbackRefresh\(\)/,
    'horizontal pan must cancel pending overlay and right-axis fallback refresh work while the finger is down',
  );
  assertSourceContains(
    markHorizontalBody,
    /deferHorizontalGestureDomWork\(\)[\s\S]*activeHorizontalScrollGesture = true/,
    'committing to horizontal pan must switch the WebView into deferred DOM-work mode',
  );
  assertSourceContains(
    scheduleOverlayRefreshBody,
    /if \(activeHorizontalScrollGesture\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'overlay refresh requests must not repaint custom DOM during active horizontal panning',
  );
  assertSourceContains(
    setChartOverlaysBody,
    /if \(activeHorizontalScrollGesture\) \{[\s\S]*pendingHorizontalOverlayApply = true[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'live overlay payloads must be cached instead of rebuilding price lines during active horizontal panning',
  );
  assertSourceContains(
    finishHorizontalBody,
    /visibleRangeIdlePendingAfterGesture \|\| pendingHorizontalOverlayApply[\s\S]*activeHorizontalScrollGesture = false[\s\S]*applyDeferredHorizontalOverlayPayload\(\)[\s\S]*scheduleVisibleRangeIdleWork\(\)/,
    'release must apply deferred overlay payloads and then run the normal settle work',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /dx > VERT_PAN_THRESHOLD && dx > dy \* 1\.2[\s\S]*ensureRightPriceAutoScaleForHorizontalPan\(\)[\s\S]*markHorizontalScrollGestureActive\(\)/,
    'horizontal-pan start must avoid a full price-scale reset unless manual vertical state needs clearing',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /if \(point && \(activeHorizontalScrollGesture \|\| vertPanPending\)\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'pending and active horizontal moves must leave movement to Lightweight Charts without right-axis fallback repaint',
  );
});

test('webview bridge: vertical chart panning defers price-line rebuilds while moving trade labels', () => {
  const deferDomWorkBody = extractFunctionBody(chartWebViewHtmlSource, 'deferVerticalGestureDomWork');
  const refreshVerticalOverlayBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshVerticalGestureOverlayPositions');
  const gestureRightScaleRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'flushGestureRightPriceScaleFallbackRefresh');
  const scheduleOverlayRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleOverlayDomRefresh');
  const refreshWhenIdleBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabelsWhenIdle');
  const applyOverlayPayloadBody = extractFunctionBody(chartWebViewHtmlSource, 'applyOverlayPayload');
  const setChartOverlaysBody = extractFunctionBody(chartWebViewHtmlSource, 'setChartOverlays');

  assertSourceContains(
    deferDomWorkBody,
    /verticalGestureDomWorkPending = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)/,
    'vertical pan must defer heavy custom overlays while keeping the right price scale refreshing under the finger',
  );
  assertSourceContains(
    refreshVerticalOverlayBody,
    /verticalGestureDomWorkPending = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*cancelGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*refreshOverlayDomLabels\(_appliedOverlayPayload \|\| _overlayPayload\)/,
    'vertical pan frames must refresh the already-applied trade labels and right-axis boxes without applying a new overlay payload',
  );
  assertSourceContains(
    gestureRightScaleRefreshBody,
    /renderFallbackRightPriceScaleLabels\(\)[\s\S]*refreshMarketPriceScaleDom\(\)/,
    'vertical gesture frames must keep bid/ask badges attached to their market price lines like MT5',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /handleScroll\.vertTouchDrag = false/,
    'RTX5 must own chart-body vertical panning so the final user price range stays stable',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var VERT_PAN_PRICE_DELTA_MULTIPLIER = 1/,
    'vertical pan must map finger movement to the price range at MT5-style 1:1 speed',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var verticalScrollingLocked = false[\s\S]*function setVerticalScrollingLocked\(locked\) \{[\s\S]*verticalScrollingLocked = locked === true/,
    'native more-menu lock must bridge into the WebView vertical scrolling guard',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var chartAutoScaleEnabled = false[\s\S]*function setChartAutoScaleEnabled\(enabled\) \{[\s\S]*chartAutoScaleEnabled = enabled === true[\s\S]*resetChartVerticalScale\(\)/,
    'MT5-style auto-scale must bridge into the WebView and reset the visible vertical scale when enabled',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resetChartVerticalScale\(\) \{[\s\S]*clearManualPriceScaleState\(\)[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*scheduleOverlayPriceScaleLock\(true\)/,
    'reset vertical scale must clear manual price-axis movement and fit the visible range',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginVerticalPan = function\(clientY\) \{[\s\S]*if \(isVerticalChartMovementBlocked\(\)\) return false/,
    'body vertical panning must not start while vertical scrolling is locked or auto-scale is active',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginVerticalPan = function\(clientY\) \{[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*verticalPricePanGestureActive = true[\s\S]*deferVerticalGestureDomWork\(\)/,
    'committing to vertical pan must cancel bootstrap centering and enter deferred DOM-work mode',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /dy > VERT_PAN_THRESHOLD && dy > dx \* 1\.2[\s\S]*beginVerticalPan\(vertPanPending\.startY\)[\s\S]*continueVerticalPan\(point\.y\)[\s\S]*stopChartEvent\(event\)/,
    'chart-body vertical movement must apply the visible price range directly while keeping trade labels attached',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /isRightPriceScaleGesturePoint\(point\.x, point\.y\)[\s\S]*verticalPricePanGestureActive = true[\s\S]*deferVerticalGestureDomWork\(\)/,
    'right price-axis vertical movement must also enter deferred DOM-work mode',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /isRightPriceScaleGesturePoint\(point\.x, point\.y\)\) \{[\s\S]*if \(isVerticalChartMovementBlocked\(\)\) \{[\s\S]*vertPanPending = null[\s\S]*stopChartEvent\(event\)[\s\S]*return;/,
    'right price-axis vertical movement must also be blocked while vertical scrolling is locked or auto-scale is active',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /if \(rightPriceScaleGestureActive\) \{[\s\S]*manualPriceScaleRangeActive = true[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'right price-axis move frames must keep the lightweight right-scale refresh path active without rebuilding custom overlays',
  );
  assertSourceContains(
    scheduleOverlayRefreshBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'overlay refresh requests must not repaint custom DOM during active vertical panning',
  );
  assertSourceContains(
    refreshWhenIdleBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'tick-driven overlay label refreshes must defer during active vertical panning',
  );
  assertSourceContains(
    applyOverlayPayloadBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*pendingVerticalOverlayApply = true[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'direct overlay payload rebuilds must be cached during active vertical panning',
  );
  assertSourceContains(
    setChartOverlaysBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*pendingVerticalOverlayApply = true[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'live overlay payloads must be cached instead of rebuilding price lines during active vertical panning',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var endVerticalPan = function\(\) \{[\s\S]*verticalPricePanGestureActive = false[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*applyDeferredVerticalOverlayPayload\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'release must apply deferred vertical overlay payloads and then settle right-axis and trade label DOM',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var finishRightPriceScaleGesture = function\(\) \{[\s\S]*resolveVerticalPanStartPriceRange\(\)[\s\S]*rightPriceScaleGestureActive = false[\s\S]*verticalPricePanGestureActive = false[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*settleVerticalPriceGestureDomWork\(\)/,
    'right price-axis release must lock the final visible price range and settle deferred DOM work',
  );
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
  assertSourceContains(refreshBody, /refreshMarketPriceScaleDom\(\)/, 'overlay refresh must render custom market price-scale DOM');
  assertSourceContains(chartWebViewHtmlSource, /function refreshMarketPriceScaleDom\(\)[\s\S]*renderMarketPriceScaleExtensions\(layer\)[\s\S]*renderMarketPriceScaleBadges\(layer\)/, 'overlay refresh must render MT5-style custom market price-scale badges after the line accents');
  assertSourceContains(source, /Quote ticks move only market price lines\.[\s\S]*Candle bodies stay tied to[\s\S]*backend OHLC history\/live candle messages\./, 'native quote bridge must not mutate candle bodies from live quotes');
  assertSourceContains(source, /const clearRenderedMarketPriceLines = useCallback[\s\S]*setMarketPriceLines\(null, null\)[\s\S]*renderedDataContextSigRef\.current = '';[\s\S]*clearRenderedMarketPriceLines\(\)/, 'symbol/timeframe changes must clear stale bid ask lines before fresh quotes arrive');
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
    /const startupChartPrefetchKeyRef = useRef\(''\)[\s\S]*scheduleIdleWork\(\(\) => \{[\s\S]*prefetchChartTimeframeHistory\(chartSymbol, normalizedTimeframe\)[\s\S]*delayMs: CHART_STARTUP_HISTORY_PREWARM_DELAY_MS/,
    'native chart must warm saved candle history during app startup before the first chart tab visit',
  );
  assertSourceContains(
    source,
    /const shouldShowImmediateHistoryLoading = !candlesAvailable[\s\S]*const isLoading =[\s\S]*shouldShowImmediateHistoryLoading \|\| loadingDelayPassed/,
    'fresh symbol switches with no committed history must show loading immediately instead of a blank grid',
  );
  assertSourceContains(
    source,
    /setLoadingFallback\(false\);[\s\S]*if \(!chartRuntimeActive\) \{[\s\S]*return undefined;[\s\S]*const fallbackTmr = setTimeout\(\(\) => setLoadingFallback\(true\), 10000\)[\s\S]*\}, \[chartRuntimeActive, chartSymbol, chartTimeframe, chartType\]\)/,
    'hidden hot tabs must not age into the no-data fallback before Chart is opened',
  );
  assertSourceContains(
    source,
    /const shouldShowChartLoadingOverlay = !hasPaintedChartOnce && \(!chartSurfaceReady \|\| isLoading\)/,
    'startup loading overlay must stay visible until the first real candle paint',
  );
  assertSourceContains(
    source,
    /\{shouldShowChartLoadingOverlay && \(\s*<View pointerEvents="none" style=\{styles\.chartOverlay\}>/,
    'loading overlay must not reappear over the retained chart after normal tab navigation',
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
  const ticksBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackTicks');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const recoveryBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleRightPriceScaleLayoutRecovery');

  assertSourceContains(
    ticksBody,
    /var labelTop = plotTop \+ RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*var labelBottom = plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*var topPrice = invertScale \? range\.from : range\.to[\s\S]*var bottomPrice = invertScale \? range\.to : range\.from[\s\S]*appendInterpolatedTick/,
    'custom right-axis labels must interpolate the full visible range through a fixed MT5-style price-scale strip',
  );
  assertSourceContains(
    renderBody,
    /!series \|\| !lastRawSeriesData \|\| lastRawSeriesData\.length === 0[\s\S]*ensureRightPriceScaleFallbackLayer\(\)[\s\S]*axisBackground\.className = 'rtx5-right-price-scale-fallback-axis'[\s\S]*axisBackground\.style\.background = lastChartAxisBackgroundColor \|\| lastChartBackgroundColor \|\| '#FFFFFF'[\s\S]*className = 'rtx5-right-price-scale-fallback-label'/,
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
    /var RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS = 7[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS = 30[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX = 60/,
    'custom right-axis label density must stay bounded for phone/tablet chart heights',
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
    /lastRawSeriesData[\s\S]*resolveRightPriceScaleFallbackLabelCount\(metrics\)[\s\S]*var intervals = Math\.max\(1, labelCount - 1\)[\s\S]*topPrice \+ \(bottomPrice - topPrice\) \* ratio[\s\S]*labelTop \+ \(labelBottom - labelTop\) \* ratio[\s\S]*roundRightPriceScaleFallbackPrice\(price, decimals\)/,
    'custom axis ticks must be derived from backend data, visible-range interpolation, fixed y positions, and configured symbol precision',
  );
  assertSourceContains(
    ticksBody,
    /for \(var scaleIndex = 0; scaleIndex <= intervals[\s\S]*ticks\.length < RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS[\s\S]*appendInterpolatedTick[\s\S]*ticks\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'custom axis ticks must update the full right-scale range instead of changing only edge labels',
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
    chartWebViewHtmlSource,
    /\.rtx5-right-price-scale-fallback-label \{[\s\S]*height: 17px;[\s\S]*font-size: 12px;[\s\S]*font-weight: 500;/,
    'custom right-axis labels must be large enough to read on phone screens',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT = 17[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE = 12[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT = '500'[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY = '1'[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR = '#E2E8F0'/,
    'custom right-axis label readability constants must stay explicit',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function getCanvasPerceivedBrightness\(rgb\)[\s\S]*return \(rgb\.r \* 299 \+ rgb\.g \* 587 \+ rgb\.b \* 114\) \/ 1000/,
    'custom right-axis labels must be able to compare foreground and axis brightness',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveReadableRightPriceScaleFallbackTextColor\(textColor\)[\s\S]*lastChartAxisBackgroundColor \|\| lastChartBackgroundColor \|\| '#FFFFFF'[\s\S]*axisBrightness < 80[\s\S]*textBrightness === null \|\| textBrightness < 190[\s\S]*return RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR/,
    'custom right-axis labels must brighten muted text on the dark axis strip',
  );
  assertSourceContains(
    renderBody,
    /var textColor = resolveRightPriceScaleFallbackTextColor\(\)[\s\S]*label\.style\.fontSize = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE \+ 'px'[\s\S]*label\.style\.lineHeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \+ 'px'[\s\S]*label\.style\.fontWeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT[\s\S]*label\.style\.opacity = RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY/,
    'custom right-axis labels must apply the balanced readable style at render time',
  );
  assertSourceContains(
    refreshBody,
    /renderFallbackRightPriceScaleLabels\(\)[\s\S]*refreshMarketPriceScaleDom\(\)/,
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
    'visual shell re-init must clear stale fallback DOM and refresh label theme colors',
  );
  assert.doesNotMatch(
    renderBody,
    /postMessage/,
    'custom right-axis labels must not add a new public WebView bridge message',
  );
});

test('webview bridge: native chart uses the GitHub resolved chart background', () => {
  const initBody = extractFunctionBody(chartWebViewHtmlSource, 'initChart');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');
  const paneBackgroundBody = extractFunctionBody(chartWebViewHtmlSource, 'updateChartPaneBackgroundLayer');

  assertSourceContains(source, /layout: \{[\s\S]*background: \{ color: resolvedChartColors\.background \}/, 'native chart canvas must use the resolved chart background');
  assertSourceContains(source, /style=\{\{ flex: 1, backgroundColor: resolvedChartColors\.background \}\}/, 'native WebView host must use the resolved chart background');
  assertSourceContains(source, /customColors: \{[\s\S]*grid: chartDisplay\.showGrid \? chartGridColor : 'transparent',[\s\S]*axisDivider: chartAxisBorderColor/, 'native chart custom colors must keep only the GitHub axis divider override');
  assertSourceContains(source, /chartAxisBorderColor\}-\$\{chartColorsSignature\}/, 'chart config signature must use the GitHub color signature shape');
  assert.doesNotMatch(source, /CHART_DARK_CANVAS_BACKGROUND_COLOR|chartAxisBackgroundColor|axisBackground:/);
  assertSourceContains(chartWebViewHtmlSource, /<div id="chart"><\/div>[\s\S]*<svg id="rtx5-moving-vertical-grid" aria-hidden="true"><\/svg>/, 'GitHub moving grid SVG must remain a chart sibling');
  assertSourceContains(initBody, /document\.body\.style\.background = bg[\s\S]*document\.getElementById\('chart'\)\.style\.background = 'transparent'/, 'early WebView paint must keep #chart transparent so the grid can show');
  assertSourceContains(doInitBody, /document\.body\.style\.background = chartBackgroundColor[\s\S]*el\.style\.background = 'transparent'/, 'chart init must keep #chart transparent after layout is resolved');
  assertSourceContains(paneBackgroundBody, /clearChartPaneBackgroundLayer\(\)[\s\S]*return false/, 'pane background updater must clear itself instead of covering the GitHub grid');
  assert.doesNotMatch(paneBackgroundBody, /ensureChartPaneBackgroundLayer\(\)|layer\.style\.background = lastChartBackgroundColor/, 'pane background updater must not recreate a layer above the moving grid');
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
  assertSourceContains(body, /updateChartPaneBackgroundLayer\(\)/, 'resize must clear any stale pane background so the grid stays visible');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must report chart geometry');
});

test('webview bridge: recoverChartSurface restores data overlays market lines and geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');

  assertSourceContains(chartWebViewHtmlSource, /var requestHostOptions = cloneSerializableValue\(opts \|\| \{\}, \{\}\)[\s\S]*lastInitHostOptions = requestHostOptions/, 'init must cache an immutable copy of host chart options');
  assertSourceContains(chartWebViewHtmlSource, /var safeOpts = applyChartLayout\(cloneSerializableValue\(opts \|\| \{\}, \{\}\)\)/, 'WebView chart creation must mutate only a throwaway options copy');
  assertSourceContains(chartWebViewHtmlSource, /var customCols = safeOpts\.customColors[\s\S]*applyMovingVerticalGridColor\(customCols && customCols\.grid\)[\s\S]*delete safeOpts\.customColors/, 'chart creation must read grid colors before removing customColors from LightweightCharts options');
  assertSourceContains(body, /chart\.resize\(w, h\)[\s\S]*updateChartPaneBackgroundLayer\(\)/, 'surface recovery must clear any stale pane background so the grid stays visible');
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
  assert.doesNotMatch(source, /setChartCanvasReady\(true\);\s*setHasPaintedChartOnce\(true\)/, 'empty CHART_READY must not hide the startup loader before candles arrive');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyCandles = candlesRef\.current[\s\S]*const readySnapshot = buildChartSeriesSnapshot\(readyCandles\)/, 'CHART_READY must read the retained sanitized candles');
  assertSourceContains(source, /if \(readyCandles\.length > 0 && webViewRef\.current\) \{[\s\S]*setHasPaintedChartOnce\(true\)/, 'CHART_READY may latch first paint only when retained candles are non-empty');
  assertSourceContains(source, /if \(didInject\) \{[\s\S]*renderedSeriesSnapshotRef\.current = nextSnapshot;[\s\S]*setHasPaintedChartOnce\(true\)/, 'updateChartData must latch first paint when the first candle batch arrives after empty READY');
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
