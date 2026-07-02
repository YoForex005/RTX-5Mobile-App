import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChartSeriesSnapshot,
  getChartSeriesUpdateMode,
} from '../../src/features/chart/liveChartSync';
import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';
import { makeCandle } from '../support/candleTestUtils';

const source = readChartScreenSource();

test('active candle changes use incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.25, high: 1.25 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('new candle appended cleanly uses incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('older history correction forces updateChartData full reload', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.22, high: 1.22 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'full_reload');
});

test('symbol timeframe switches repaint data while visual shell changes reinit', () => {
  assertSourceContains(
    source,
    /const currentSig = useMemo\([\s\S]*chartType[\s\S]*chartColorsSignature/,
    'init signature must keep visual shell settings',
  );
  assertSourceContains(
    source,
    /const chartDataContextSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)/,
    'symbol and timeframe must be tracked as a data context',
  );
  assertSourceContains(
    source,
    /if \(lastInitSigRef\.current !== currentSig\)[\s\S]*chartInitializedRef\.current = false/,
    'visual shell signature changes must mark the WebView chart as not initialized',
  );
  assertSourceContains(
    source,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*const updateMode = contextChanged[\s\S]*\? 'full_reload'/,
    'symbol/timeframe changes must repaint with updateChartData instead of reinitializing the WebView',
  );
});

test('ChartScreen routes full reload and incremental update to the correct bridge functions', () => {
  const syncEffectStart = source.indexOf('const nextSnapshot = buildChartSeriesSnapshot');
  assert.notEqual(syncEffectStart, -1, 'series sync effect was not found');
  const syncEffect = source.slice(syncEffectStart, source.indexOf('useEffect(() => {', syncEffectStart + 1));

  assertSourceContains(syncEffect, /updateMode === 'full_reload'[\s\S]*updateChartData\(/, 'full reload must call updateChartData');
  assertSourceContains(syncEffect, /else \{[\s\S]*updateTick\(/, 'incremental mode must call updateTick');
  assertSourceContains(
    source,
    /const renderableCandles = sanitizedCandles/,
    'incremental mode must use the same memoized sanitized OHLC series as full reload',
  );
});

test('display precision updates on the existing WebView chart surface', () => {
  const setDisplayDecimalsBody = extractFunctionBody(source, 'setDisplayDecimals');

  assertSourceContains(
    setDisplayDecimalsBody,
    /lastRequestedDisplayDecimals = decimals[\s\S]*lastDisplayDecimals = decimals[\s\S]*makePriceFormat\(decimals\)/,
    'display precision updates must reuse the WebView price format helper',
  );
  assertSourceContains(
    setDisplayDecimalsBody,
    /series\.applyOptions\(\{ priceFormat: priceFormat \}\)/,
    'main series precision must update without recreating the chart',
  );
  assertSourceContains(
    source,
    /window\.setDisplayDecimals = setDisplayDecimals/,
    'setDisplayDecimals must be exposed on the WebView bridge',
  );
});

test('WebView full data reload restores overlays and market price lines after setData', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(source, /function updateChartData\(data, options\)/, 'full reloads must accept bridge options for stable context switches');
  assertSourceContains(body, /sanitizeSeriesData\(data\)/, 'full reload must sanitize and dedupe candle data before setData');
  assertSourceContains(body, /var updateOptions = options && typeof options === 'object' \? options : \{\}/, 'bridge options must be normalized before reload work');
  assertSourceContains(body, /var resetVisibleRange = updateOptions\.resetVisibleRange === true/, 'context switches must be able to request a fresh first viewport');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'updateChartData must call setData');
  assertSourceContains(body, /previousRawSeriesData = lastRawSeriesData[\s\S]*getVisibleLogicalRangeSnapshot\(\)/, 'full reload must capture the current viewport before replacing data');
  assertSourceContains(body, /restorePrependedHistoryViewport\([\s\S]*previousRawSeriesData[\s\S]*lastRawSeriesData[\s\S]*previousVisibleLogicalRange[\s\S]*\)/, 'older-history prepends must restore the prior visible viewport after setData');
  assertSourceContains(body, /resetVisibleRange \|\| shouldResetViewportForSeriesReplacement\(previousRawSeriesData, lastRawSeriesData\)/, 'symbol/timeframe replacement reloads must force a fresh viewport even when timestamps match');
  assertSourceContains(source, /function resetVisiblePriceScaleForStableReplacement\(reason\)[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*enableRightPriceAutoScale\(\)/, 'stable replacement reset must avoid delayed fresh-series recenter work');
  assertSourceContains(body, /if \(restoredStableReplacementViewport\) \{[\s\S]*resetVisiblePriceScaleForStableReplacement\(priceScaleReason\)[\s\S]*\} else \{[\s\S]*resetVisiblePriceScaleForFreshSeries\(priceScaleReason\)/, 'stable replacement reloads must use the stable reset while first loads keep the fresh reset');
  assertSourceContains(body, /if \(restoredStableReplacementViewport\) \{[\s\S]*healCollapsedPriceScaleRange\(priceScaleReason, true\)/, 'stable replacement reloads must heal price scale synchronously before the next paint');
  assertSourceContains(body, /if \(!restoredStableReplacementViewport\) \{[\s\S]*schedulePriceScaleHealthCheck\(/, 'stable replacement reloads must skip delayed price-scale health passes after the synchronous heal');
  assertSourceContains(body, /!restoredStableReplacementViewport[\s\S]*applyRecentViewport\(mapped\.length\)/, 'recent viewport spacing must be recalculated for fresh context replacements');
  assertSourceContains(body, /previousRawSeriesData\.length === 0[\s\S]*applyRecentViewport\(mapped\.length\)/, 'first data load after an empty chart shell must show only the recent viewport');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale overlay refs must be cleared');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlays must be reapplied after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'market lines must be restored after setData');
});

test('WebView preserves scroll position when older history is prepended', () => {
  assertSourceContains(
    source,
    /function restorePrependedHistoryViewport\(previousData, nextData, previousRange\)[\s\S]*nextFirst < previousFirst[\s\S]*previousVisibleFromIndex = clampSeriesIndex\(Math\.floor\(previousRange\.from\), previousData\.length\)[\s\S]*shiftedBy = nextVisibleFromIndex - previousVisibleFromIndex[\s\S]*setVisibleLogicalRange\(\{[\s\S]*from: previousRange\.from \+ shiftedBy[\s\S]*to: previousRange\.to \+ shiftedBy/,
    'older-history setData reloads must shift the logical range by the number of prepended candles',
  );
});

test('WebView prefetches older history before the hard left edge', () => {
  assertSourceContains(
    source,
    /function shouldPaginateForVisibleLogicalRange\(range\)[\s\S]*HISTORY_PAGINATION_VIEWPORT_MULTIPLIER[\s\S]*return range\.from <= leftPrefetchBars/,
    'left-scroll pagination must be based on visible viewport span instead of waiting for a hard-coded edge',
  );
  assertSourceContains(
    source,
    /shouldPaginateForVisibleLogicalRange\(range\)[\s\S]*now - lastPaginateTime > HISTORY_PAGINATION_DEBOUNCE_MS[\s\S]*ON_PAGINATE_HISTORY/,
    'visible-range subscription must request pagination through the debounced early-prefetch helper',
  );
});

test('WebView incremental candle updates keep the raw visible series in sync', () => {
  const body = extractFunctionBody(source, 'applyTickUpdate');

  assertSourceContains(body, /upsertRawSeriesDatum\(tick\)/, 'incremental candle updates must update the raw data buffer');
  assertSourceContains(body, /currentSeriesLength = lastRawSeriesData\.length/, 'series length must come from the raw candle buffer');
  assertSourceContains(
    source,
    /function upsertRawSeriesDatum\(tick\)[\s\S]*lastRawSeriesData\[lastIndex\] = normalized[\s\S]*lastRawSeriesData\.push\(normalized\)/,
    'raw data buffer must replace the active candle or append a new one',
  );
});

test('native WebView uses the RTX5 custom candlestick renderer for candle modes', () => {
  assertSourceContains(
    source,
    /Use the RTX5 custom candle renderer on mobile/,
    'native chart must document the custom candlestick renderer contract',
  );
  assertSourceContains(
    source,
    /series = window\.addRTX5CustomCandlestickSeries\(chart,[\s\S]*bodyUpColor: colors\.bodyUp[\s\S]*bodyDownColor: colors\.bodyDown/,
    'candlestick and hollow charts must use the RTX5 custom candlestick series',
  );
});

test('quote updates move price lines without mutating candle OHLC', () => {
  assert.doesNotMatch(
    source,
    /liveQuoteCandleStateRef/,
    'native chart must not keep a separate quote-built candle projection',
  );
  assert.doesNotMatch(source, /resolveLivePriceCoherentCandles/, 'native chart must not fold live quotes into sanitizedCandles');
  assert.doesNotMatch(source, /price: liveChartPrice/, 'native chart must not pass quote prices to candle synthesis');

  const quoteBridgeStart = source.indexOf('Quote ticks move only market price lines.');
  assert.notEqual(quoteBridgeStart, -1, 'quote bridge contract comment was not found');
  const quoteBridgeEnd = source.indexOf('// Watchdog', quoteBridgeStart);
  assert.notEqual(quoteBridgeEnd, -1, 'quote bridge effect end was not found');
  const quoteBridge = source.slice(quoteBridgeStart, quoteBridgeEnd);

  assertSourceContains(quoteBridge, /setMarketPriceLines\(/, 'quote bridge must still move market price lines');
  assert.doesNotMatch(quoteBridge, /updateTick\(/, 'quote bridge must leave candle OHLC updates in the candle sync effect');
  assert.doesNotMatch(quoteBridge, /buildChartTickPayload/, 'quote bridge must not create a second candle payload path');
});

test('horizontal zoom and pan keeps price autoscale attached to visible bars', () => {
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\) \{[\s\S]*scheduleMovingVerticalGridUpdate\(\)[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_active'\)[\s\S]*scheduleVisibleRangeIdleWork\(\)/,
    'visible logical range changes must run a throttled active-scroll price-scale recovery before deferred overlay maintenance',
  );
  assertSourceContains(
    source,
    /ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS = 48[\s\S]*ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE = 8/,
    'active-scroll recovery must be fast enough for 60 FPS scroll while staying throttled off every frame',
  );
  assertSourceContains(
    source,
    /function scheduleActiveScrollPriceScaleRecovery\(reason\)[\s\S]*activeScrollPriceScaleRaf[\s\S]*isChartScaleGestureSuppressed\(\) \|\| !isHorizontalScrollGesturePriceScaleRecoveryEligible\(\)[\s\S]*Date\.now\(\)[\s\S]*ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS[\s\S]*requestAnimationFrame\(function\(\) \{[\s\S]*!isChartScaleGestureSuppressed\(\)[\s\S]*healVisiblePriceScaleDuringActiveScroll\(reason \|\| 'visible_range_active'\)/,
    'active-scroll recovery must be RAF based, throttled, tied to one-finger horizontal pan, and suppressed during scale gestures',
  );
  assertSourceContains(
    source,
    /function healVisiblePriceScaleDuringActiveScroll\(reason\)[\s\S]*manualPriceScaleRangeActive \|\|[\s\S]*isChartScaleGestureSuppressed\(\) \|\|[\s\S]*!isHorizontalScrollGesturePriceScaleRecoveryEligible\(\)[\s\S]*resolvePriceRangeFromVisibleData\(false\)[\s\S]*scaleSpan > dataSpan \* ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*setRecoveredRightPriceRange\(candleDataRange\)/,
    'active horizontal scroll must heal stale price ranges from visible candles only without fighting manual vertical scaling',
  );
  assertSourceContains(
    source,
    /function isChartScaleGestureSuppressed\(\)[\s\S]*Date\.now\(\) <= suppressChartTapUntil/,
    'active-scroll price recovery must share the existing pinch/scale suppression window',
  );
  assertSourceContains(
    source,
    /dx > VERT_PAN_THRESHOLD && dx > dy \* 1\.2[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*markHorizontalScrollGestureActive\(\)[\s\S]*scheduleActiveScrollPriceScaleRecovery\('horizontal_pan_active'\)/,
    'active-scroll recovery must be armed only after the gesture is classified as horizontal pan',
  );
  assertSourceContains(
    source,
    /function clearActiveScrollPriceScaleRecovery\(\)[\s\S]*cancelAnimationFrame\(activeScrollPriceScaleRaf\)[\s\S]*lastActiveScrollPriceScaleCheckAt = 0[\s\S]*activeHorizontalScrollGesture = false[\s\S]*activeHorizontalScrollGestureUntil = 0/,
    'chart teardown/reinit must cancel pending active-scroll price recovery work',
  );
  assertSourceContains(
    source,
    /if \(priceScaleHealthRaf\)[\s\S]*priceScaleHealthRaf = 0[\s\S]*clearActiveScrollPriceScaleRecovery\(\)[\s\S]*if \(visibleRangeIdleTimer !== null\)/,
    'chart reinitialization must clear active-scroll recovery before the old chart is removed',
  );
  assertSourceContains(
    source,
    /function scheduleVisibleRangeIdleWork\(\)[\s\S]*clearTimeout\(visibleRangeIdleTimer\)[\s\S]*scheduleOverlayPriceScaleLock\(false\)[\s\S]*schedulePriceScaleHealthCheck\('visible_range_change', true\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'visible range idle work must refresh overlays and price-scale recovery after scroll settles',
  );
  assertSourceContains(
    source,
    /function healCollapsedPriceScaleRange\(reason, allowManualReset\)[\s\S]*scaleSpan > dataSpan \* PRICE_SCALE_HEALTH_SPAN_MULTIPLE[\s\S]*enableRightPriceAutoScale\(\)/,
    'stale price-scale ranges must self-heal when normal candles collapse into a line',
  );
  assertSourceContains(
    source,
    /function getPriceRangeOverlapRatio\(currentRange, dataRange\)[\s\S]*overlapSpan \/ dataSpan/,
    'price-scale health checks must measure whether the visible candle range still overlaps the right scale',
  );
  assertSourceContains(
    source,
    /dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO[\s\S]*enableRightPriceAutoScale\(\)/,
    'horizontal navigation must heal stale shifted ranges even when their span is similar to the visible data',
  );
  assertSourceContains(
    source,
    /function setRecoveredRightPriceRange\(range\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: recoveredRange\.from, to: recoveredRange\.to \}\)/,
    'price-scale recovery must directly apply the current visible candle range when autoscale stays stale',
  );
  assertSourceContains(
    source,
    /function resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO[\s\S]*rawSpan > clusterSpan \* PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE/,
    'left-scroll autoscale must ignore tiny extreme clusters that would compress normal visible candles into a line',
  );
  assertSourceContains(
    source,
    /PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS = 4[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO = 0\.55[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE = 0\.006[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE = 5/,
    'visible price-range clustering must be tight enough to split isolated BTC M1 live/history price regimes instead of autoscaling across both',
  );
  assertSourceContains(
    source,
    /PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS = 1[\s\S]*PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE = 0\.006[\s\S]*PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE = 3/,
    'right-edge live scroll recovery must be able to prefer the visible candle cluster anchored around the current bid or ask',
  );
  assertSourceContains(
    source,
    /function resolveMarketAnchoredVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*getMarketPriceBadgeValues\(\)[\s\S]*Math\.abs\(center - marketPrice\) <= tolerance[\s\S]*rawSpan > marketSpan \* PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE/,
    'right-edge live scroll recovery must ignore detached far-price history when visible candles exist around the live market price',
  );
  assertSourceContains(
    source,
    /function resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*var marketAnchoredRange = resolveMarketAnchoredVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*if \(marketAnchoredRange\) \{[\s\S]*return marketAnchoredRange/,
    'visible price-range recovery must try the live-market anchored cluster before falling back to majority clustering',
  );
  assertSourceContains(
    source,
    /function resolveTrimmedPriceRangeFromBars\(bars\)[\s\S]*PRICE_SCALE_ROBUST_TRIM_RATIO[\s\S]*makePaddedPriceRange\(minPrice, maxPrice\)/,
    'visible price-range recovery must trim isolated high/low outlier values before autoscale recovery',
  );
  assertSourceContains(
    source,
    /trimmedRange[\s\S]*rawSpan > trimmedSpan \* PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE[\s\S]*return trimmedRange/,
    'left-scroll recovery must prefer the trimmed visible range when isolated outlier values flatten normal candles',
  );
  assertSourceContains(
    source,
    /function resolvePriceRangePixelCompression\(range\)[\s\S]*series\.priceToCoordinate\(normalized\.from\)[\s\S]*PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO[\s\S]*collapsed: pixelSpan < minPixelSpan/,
    'price-scale health checks must detect the actual on-screen pixel collapse of the visible candle range',
  );
  assertSourceContains(
    source,
    /function sanitizeSeriesData\(data\)[\s\S]*var sorted = Object\.keys\(byTime\)[\s\S]*sort\(function\(left, right\) \{ return left\.time - right\.time; \}\)[\s\S]*return filterRawSeriesDataByPriceContinuity\(sorted\)/,
    'WebView setData sanitization must drop contiguous split-regime candle fragments before they can flatten historical scroll frames',
  );
  assertSourceContains(
    source,
    /dataVisuallyCollapsed[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*setRecoveredRightPriceRange\(dataRange\)/,
    'left-scroll navigation must recover the right price scale when visible candles are compressed into a tiny pixel band',
  );
  assertSourceContains(
    source,
    /var rawRange = resolvePriceRangeFromBars\(visibleBars\)[\s\S]*var robustRange = resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*includeMarketPriceBadges === false/,
    'visible price-range recovery must use the robust viewport range and allow horizontal pan to ignore far live price badges',
  );
  assertSourceContains(
    source,
    /rightPriceScale: \{[\s\S]*autoScale: true/,
    'host chart options must start the right price scale in autoscale mode',
  );
  assertSourceContains(
    source,
    /function scheduleVisibleRangeIdleWork\(\)[\s\S]*schedulePriceScaleHealthCheck\('visible_range_change', true\)/,
    'horizontal navigation must be allowed to clear a stale manual price range after scroll settles',
  );
  assertSourceContains(
    source,
    /var priceScaleReason = didPrependHistory[\s\S]*'update_data_prepend_history'[\s\S]*schedulePriceScaleHealthCheck\([\s\S]*priceScaleReason[\s\S]*didPrependHistory \|\| didReplaceVisibleSeries[\s\S]*didPrependHistory \|\| didReplaceVisibleSeries \? 5 : 1/,
    'older-history full reloads must run repeated price-scale recovery passes and clear stale manual ranges',
  );
  assertSourceContains(
    source,
    /function schedulePriceScaleHealthCheck\(reason, allowManualReset, attempts\)[\s\S]*remainingAttempts[\s\S]*schedulePriceScaleHealthCheck\(reason, allowManualReset, remainingAttempts - 1\)/,
    'price-scale health checks must be able to re-run after chart autoscale settles',
  );
  assertSourceContains(
    source,
    /handleScale: \{[\s\S]*pinch: true[\s\S]*axisPressedMouseMove: true/,
    'mobile pinch zoom and price-axis scaling must stay enabled in the host chart options',
  );
  assertSourceContains(
    source,
    /handleScroll: \{[\s\S]*horzTouchDrag: true[\s\S]*vertTouchDrag: false/,
    'host chart options must leave horizontal touch drag enabled while custom WebView code owns body vertical panning',
  );
  assertSourceContains(
    source,
    /function resolveChartTouchInteractionOptions\(enabled\)[\s\S]*handleScroll\.vertTouchDrag = false/,
    'WebView touch interaction restore must keep library vertical touch drag disabled',
  );
});

test('vertical candle drag can own the price range without autoscale fighting it', () => {
  assertSourceContains(
    source,
    /function resolveVerticalPanStartPriceRange\(\)[\s\S]*getVisibleRange\(\)[\s\S]*resolvePriceRangeFromVisibleData\(false\)/,
    'vertical pan must fall back to visible candle data when autoscale has no explicit range',
  );
  assertSourceContains(
    source,
    /var beginVerticalPan = function\(clientY\)[\s\S]*rememberManualVerticalPanRange\(range\)[\s\S]*setAutoScale\(false\)[\s\S]*setVisibleRange\(\{ from: range\.from, to: range\.to \}\)/,
    'vertical pan start must pin the current price range before movement',
  );
  assertSourceContains(
    source,
    /var renderVerticalPanRange = function\(nextRange\)[\s\S]*rememberManualVerticalPanRange\(nextRange\)[\s\S]*priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'vertical pan moves candles by manually shifting the visible price range and refreshing overlays',
  );
  assertSourceContains(
    source,
    /var VERT_PAN_PRICE_DELTA_MULTIPLIER = 0\.35[\s\S]*var applyVerticalPanAt = function\(clientY\)[\s\S]*priceDelta = deltaPixels \* vertPanState\.pricePerPixel \* VERT_PAN_PRICE_DELTA_MULTIPLIER/,
    'body vertical pan must use the MT5-like sensitivity multiplier instead of full-range jumps',
  );
  assertSourceContains(
    source,
    /function lockVisiblePriceScaleRange\(forceAutoScale, attempt\)[\s\S]*isManualVerticalPanRangeLocked\(\) && forceAutoScale !== true[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*verticalPricePanGestureActive \|\| \(manualPriceScaleRangeActive && forceAutoScale !== true\)/,
    'autoscale refresh must not override an active manual vertical price range',
  );
  const endVerticalPanStart = source.indexOf('var endVerticalPan = function()');
  assert.notEqual(endVerticalPanStart, -1, 'endVerticalPan handler was not found');
  const endVerticalPan = source.slice(endVerticalPanStart, source.indexOf('var resetAutoScale', endVerticalPanStart));
  assertSourceContains(
    endVerticalPan,
    /var finalRange[\s\S]*renderVerticalPanRange\(finalRange\)[\s\S]*verticalPricePanGestureActive = false[\s\S]*rememberManualVerticalPanRange\(finalRange\)[\s\S]*syntheticRightPriceScaleFallbackRange = \{[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)/,
    'vertical pan release must keep and reapply the exact final manual range',
  );
  assert.doesNotMatch(
    endVerticalPan,
    /syntheticRightPriceScaleFallbackRange = null/,
    'vertical pan release must not clear the fallback right-scale range and drift after finger-up',
  );
  assertSourceContains(
    source,
    /var manualVerticalPanRangeActive = false[\s\S]*var manualVerticalPanLockedRange = null[\s\S]*function rememberManualVerticalPanRange\(range\)[\s\S]*manualVerticalPanRangeActive = true[\s\S]*manualVerticalPanLockedRange = \{[\s\S]*from: normalizedRange\.from[\s\S]*to: normalizedRange\.to/,
    'vertical pan must keep the manual price range as persistent chart state',
  );
  assertSourceContains(
    source,
    /function healCollapsedPriceScaleRange\(reason, allowManualReset\)[\s\S]*isManualVerticalPanRangeLocked\(\)[\s\S]*shouldResetManualVerticalPanForHealth\(reason\)[\s\S]*return;[\s\S]*manualPriceScaleRangeActive && allowManualReset !== true/,
    'idle price-scale health checks must not snap back a user-locked vertical pan',
  );
  assertSourceContains(
    source,
    /var beginVerticalPan = function\(clientY\)[\s\S]*rememberManualVerticalPanRange\(range\)[\s\S]*if \(priceScaleHealthRaf\) \{[\s\S]*cancelAnimationFrame\(priceScaleHealthRaf\)[\s\S]*priceScaleHealthRaf = 0/,
    'vertical pan start must cancel pending price-scale health work that could race the gesture',
  );
  assertSourceContains(
    source,
    /var endVerticalPan = function\(\)[\s\S]*var finalRange[\s\S]*verticalPricePanGestureActive = false[\s\S]*rememberManualVerticalPanRange\(finalRange\)[\s\S]*vertPanState = null/,
    'vertical pan release must preserve the final manual range after the active flag drops',
  );
  assertSourceContains(
    source,
    /var onPointerUp = function\(event\)[\s\S]*releasePointer\(event\);\s*rightPriceScaleGestureActive = false;[\s\S]*if \(vertPanState\) \{[\s\S]*endVerticalPan\(\)[\s\S]*return;[\s\S]*finishHorizontalScrollGesture\(\);/,
    'vertical pan release must finish before horizontal-scroll idle recovery is allowed to run',
  );
  assertSourceContains(
    source,
    /function setChartOverlays\(payload\)[\s\S]*scheduleOverlayPriceScaleLock\(false\)[\s\S]*applyOverlayPayload\(_overlayPayload\)/,
    'live trade and overlay refreshes must not force autoscale over the user-owned vertical range',
  );
});

test('right price scale drag is routed separately from body vertical pan', () => {
  assertSourceContains(
    source,
    /var isRightPriceScaleGesturePoint = function\(clientX, clientY\)[\s\S]*axisLeft[\s\S]*axisRight[\s\S]*point\.x >= axisLeft - 6/,
    'right price-scale hit testing must recognize the reserved axis strip',
  );
  assertSourceContains(
    source,
    /if \(isRightPriceScaleGesturePoint\(point\.x, point\.y\)\) \{[\s\S]*rightPriceScaleGestureActive = true[\s\S]*vertPanPending = null[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*return;/,
    'right-axis touches must not enter chart-body vertical pan tracking',
  );
  assertSourceContains(
    source,
    /if \(rightPriceScaleGestureActive\) \{[\s\S]*manualPriceScaleRangeActive = true[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)[\s\S]*return;/,
    'right-axis drag must refresh custom right-scale and trade overlays during movement',
  );
});

test('pinch and zoom gestures suppress chart tap radial menu events', () => {
  const body = extractFunctionBody(source, 'bindChartTapListeners');

  assertSourceContains(
    body,
    /CHART_SCALE_TAP_SUPPRESSION_MS/,
    'chart tap listener must keep a suppression window for scale gestures',
  );
  assertSourceContains(
    body,
    /isScaleGestureEvent\(event\)[\s\S]*suppressChartTapAfterScale/,
    'multi-touch scale gestures must cancel pending tap emission',
  );
  assertSourceContains(
    body,
    /Date\.now\(\) <= suppressNextChartClickUntil \|\| Date\.now\(\) <= suppressChartTapUntil/,
    'native click fallback must also be suppressed after zoom',
  );
});
