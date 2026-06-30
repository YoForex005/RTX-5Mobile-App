import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildChartOverlayPayload,
  type ChartOverlayCandle,
} from './chartOverlays';
import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

const nativeSource = readChartScreenSource();
const webViewHtmlSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
  'utf8',
);
const source = `${nativeSource}\n${webViewHtmlSource}`;
const chartTradeFeatureSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeFeature.tsx'),
  'utf8',
);
const chartTradeButtonsFeatureSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx'),
  'utf8',
);
const chartTradeHandlerSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts'),
  'utf8',
);
const chartTradeActionsSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/chartTradeActions.ts'),
  'utf8',
);

const chartSettingsScreenSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartSettingsScreen.tsx'),
  'utf8',
);
const chartShowOnChartSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/chartShowOnChart.ts'),
  'utf8',
);

const TEST_CHART_COLORS = {
  background: '#000000',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.04)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
} as const;

const candles: ChartOverlayCandle[] = Array.from({ length: 30 }, (_, index) => ({
  time: 1_700_000_000 + index * 60,
  open: 1.1 + index * 0.0001,
  high: 1.101 + index * 0.0001,
  low: 1.099 + index * 0.0001,
  close: 1.1005 + index * 0.0001,
  volume: 10 + index,
}));

test('overlay bridge: price lines are recreated after setData full reload', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'chart data reload must call setData');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale price-line refs must be cleared after setData');
  assertSourceContains(body, /_overlayMarkers = null/, 'stale marker refs must be cleared after setData');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlay payload must be recreated after setData');
});

test('overlay bridge: overlays reapply after chart init and CHART_READY', () => {
  const doInitBody = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(doInitBody, /applyOverlayPayload\(_overlayPayload\)/, 'chart init must apply cached overlays once series exists');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*setChartOverlays\(\$\{JSON\.stringify\(latestOverlay\)\}\)/, 'CHART_READY must immediately push latest overlay payload');
});

test('overlay bridge: overlay resync timer repairs missed injection', () => {
  const body = extractFunctionBody(source, 'startOverlayResync');

  assertSourceContains(body, /setInterval\(function\(\)/, 'WebView overlay resync must run on an interval');
  assertSourceContains(body, /_positionLinesArr\.length !== _overlayPayload\.priceLines\.length/, 'resync must detect missing price lines');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'resync must recreate missing overlays');
  assertSourceContains(source, /const resyncInterval = setInterval\(\(\) => \{[\s\S]*webViewRef\.current\.injectJavaScript\(js\)/, 'native overlay bridge must periodically re-push overlays');
});

test('overlay bridge: draggable SL and TP lines emit CHART_TRADE_LINE_DRAG', () => {
  const postDragBody = extractFunctionBody(source, 'postChartTradeLineDrag');
  const previewLinesSource = source.slice(source.indexOf('const chartTradePreviewLines'), source.indexOf('const chartType = chartVisualType'));

  assertSourceContains(postDragBody, /type: 'CHART_TRADE_LINE_DRAG'/, 'drag events must use the chart trade-line event type');
  assertSourceContains(postDragBody, /phase: phase/, 'drag events must include phase');
  assertSourceContains(postDragBody, /dragKey: dragKey/, 'drag events must include dragKey');
  assertSourceContains(previewLinesSource, /dragKey: 'sl'/, 'SL preview line must be draggable');
  assertSourceContains(previewLinesSource, /dragKey: 'tp'/, 'TP preview line must be draggable');
});

test('overlay bridge: draggable trade labels keep touch ownership through the full gesture', () => {
  assertSourceContains(source, /var getClampedRelativePoint = function\(clientX, clientY\)/, 'drag movement must clamp to the chart bounds instead of dropping updates');
  assertSourceContains(source, /beginTradeLineDrag[\s\S]*setPointerCapture\(event\.pointerId\)/, 'drag start must capture the active pointer');
  assertSourceContains(source, /beginTradeLineDrag[\s\S]*el\.style\.touchAction = 'none'/, 'drag start must disable competing touch panning');
  assertSourceContains(source, /continueTradeLineDrag[\s\S]*getTradeLineDragPoint\(pointFromEvent\.x, pointFromEvent\.y\)/, 'drag move must keep updating after the finger reaches chart edges');
  assertSourceContains(source, /finishTradeLineDrag[\s\S]*releasePointerCapture\(drag\.pointerId\)/, 'drag end must release the captured pointer');
  assertSourceContains(source, /var listenerOptions = \{ capture: true, passive: false \}/, 'chart touch listeners must be non-passive so preventDefault works on mobile');
});

test('overlay bridge: chart movement keeps DOM overlay rebuilds off the hot path', () => {
  const touchBody = extractFunctionBody(source, 'bindChartTapListeners');

  assertSourceContains(
    touchBody,
    /var renderVerticalPanRange = function\(nextRange\)[\s\S]*priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*refreshVerticalGestureOverlayPositions\(\)[\s\S]*var applyVerticalPanAt = function\(clientY\)[\s\S]*vertPanState\.latestRange = nextRange[\s\S]*renderVerticalPanRange\(nextRange\)/,
    'vertical chart movement must set the target price range during the active move while keeping trade labels and right-axis boxes attached',
  );
  assertSourceContains(
    touchBody,
    /var chartHeight =[\s\S]*pricePerPixel: rangeSpan \/ chartHeight/,
    'vertical chart movement must cache the pane price-per-pixel value at gesture start',
  );
  assert.doesNotMatch(
    touchBody,
    /VerticalPanVisualTransform|verticalPanVisualNodes/,
    'vertical chart movement must not use canvas transforms that can desync or blank the candle pane',
  );
  assertSourceContains(
    touchBody,
    /var continueVerticalPan = function\(clientY\)[\s\S]*Android WebView can postpone requestAnimationFrame callbacks[\s\S]*applyVerticalPanAt\(clientY\)/,
    'vertical chart movement must write the price range directly from touchmove so it follows the finger',
  );
  assert.doesNotMatch(
    touchBody,
    /VERT_PAN_SMOOTHING|stepVerticalPanAnimation|targetRange|verticalPanMoveFrame|pendingVerticalPanClientY/,
    'vertical chart movement must not use delayed smoothing or RAF batching that hides short MT5-style drags',
  );
  assertSourceContains(
    touchBody,
    /if \(dy > VERT_PAN_THRESHOLD && dy > dx \* 1\.2\) \{[\s\S]*beginVerticalPan\(vertPanPending\.startY\)[\s\S]*continueVerticalPan\(point\.y\)[\s\S]*stopChartEvent\(event\)/,
    'dominant vertical movement must keep ownership of the custom price-range pan',
  );
  assertSourceContains(
    touchBody,
    /isScaleGestureEvent\(event\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*return;/,
    'pinch and scale movement must stay on the lightweight right-scale refresh path',
  );
  assertSourceContains(
    touchBody,
    /if \(point && \(activeHorizontalScrollGesture \|\| vertPanPending\)\) \{[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*return;[\s\S]*scheduleOverlayDomRefresh\(\);/,
    'horizontal movement must defer the full DOM overlay rebuild until idle/release',
  );
  assertSourceContains(
    touchBody,
    /var endVerticalPan = function\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'vertical chart movement must still settle full overlays when the finger lifts',
  );
  assertSourceContains(
    source,
    /var GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS = 16[\s\S]*function scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS - \(now - lastGestureRightPriceScaleFallbackAt\)/,
    'gesture right-scale label refreshes must run at frame cadence after label DOM reuse',
  );
  assertSourceContains(
    source,
    /var rightPriceScaleFallbackLabelNodes = \[\][\s\S]*function renderFallbackRightPriceScaleLabels\(\)[\s\S]*var label = rightPriceScaleFallbackLabelNodes\[i\][\s\S]*rightPriceScaleFallbackLabelNodes\[i\] = label[\s\S]*unusedIndex = ticks\.length/,
    'right-scale fallback labels must be reused during vertical movement instead of rebuilt',
  );
  assertSourceContains(
    source,
    /function scheduleActiveScrollPriceScaleRecovery\(reason\)[\s\S]*if \(activeHorizontalScrollGesture\) \{[\s\S]*post-gesture grace\/idle window[\s\S]*return;/,
    'horizontal price-scale recovery must defer while the finger is actively scrolling',
  );
  assertSourceContains(
    source,
    /function scheduleMovingVerticalGridUpdate\(preferTransformOnly\)[\s\S]*if \(transformOnly && updateMovingVerticalGridTransformOnly\(\)\) \{[\s\S]*return;[\s\S]*updateMovingVerticalGrid\(\);/,
    'horizontal movement must use the transform-only grid path before falling back to full grid recalculation',
  );
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\)[\s\S]*var isActiveHorizontalGesture = activeHorizontalScrollGesture === true;[\s\S]*scheduleMovingVerticalGridUpdate\(isActiveHorizontalGesture\)[\s\S]*if \(isActiveHorizontalGesture\) \{[\s\S]*visibleRangeIdlePendingAfterGesture = true;[\s\S]*return;[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_active'\)/,
    'active horizontal visible-range changes must skip recovery, overlays, and history until release',
  );
  assertSourceContains(
    source,
    /function finishHorizontalScrollGesture\(\)[\s\S]*visibleRangeIdlePendingAfterGesture[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_release'\)[\s\S]*scheduleVisibleRangeIdleWork\(\)[\s\S]*requestHistoryPaginationForVisibleRange\(getVisibleLogicalRangeSnapshot\(\)\)/,
    'horizontal gesture release must settle the deferred grid, price-scale, overlay, and history work',
  );
});

test('chart pending CTA submits the pending order and then exposes chart-side levels', () => {
  const handlerSource = source.slice(
    source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback'),
    source.indexOf('const handleToggleChartTradeSheetMode', source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback')),
  );

  assert.doesNotMatch(source, /Pending Order Preview/);
  assert.doesNotMatch(source, /Chart-side pending submission is still preview-only in this build/);
  assert.doesNotMatch(source, /Alert\.alert/);
  assertSourceContains(handlerSource, /ordersApi\.placePendingOrder\(payload\)/, 'pending CTA must submit to the pending-order API');
  assertSourceContains(handlerSource, /price_sl: chartTradeSlPrice/, 'pending CTA must include enabled SL price');
  assertSourceContains(handlerSource, /price_tp: chartTradeTpPrice/, 'pending CTA must include enabled TP price');
  assertSourceContains(handlerSource, /refetchOrders\(\)/, 'pending CTA must refresh orders so overlays can draw the new order');
  assertSourceContains(handlerSource, /snapTradeSheet\('collapsed'\)/, 'pending CTA must expose chart-side levels after submission');
});

test('chart market execution submits selected sheet SL and TP levels', () => {
  const chartTradeResultSource = source.slice(
    source.indexOf('const handleChartTradeResult = useCallback'),
    source.indexOf('const [showSignalDetails', source.indexOf('const handleChartTradeResult = useCallback')),
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /stopLossPrice=\{sheet\.chartTradeSlEnabled \? sheet\.chartTradeSlPrice : undefined\}/,
    'market buttons must receive enabled sheet SL price',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /takeProfitPrice=\{sheet\.chartTradeTpEnabled \? sheet\.chartTradeTpPrice : undefined\}/,
    'market buttons must receive enabled sheet TP price',
  );
  assertSourceContains(
    chartTradeButtonsFeatureSource,
    /useTradeHandler\(\{[\s\S]*stopLossPrice,[\s\S]*takeProfitPrice,[\s\S]*pointSize,/,
    'market button hook must receive SL/TP inputs',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /validateChartTradeProtectionLevels\(\{[\s\S]*side: action\.side,[\s\S]*entryPrice: action\.side === 'buy' \? latestAsk : latestBid/,
    'market submit must validate MT5-style SL/TP direction before sending',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /buildChartMarketOrderPayload\(\{[\s\S]*stopLossPrice: queuedTrade\.stopLossPrice,[\s\S]*takeProfitPrice: queuedTrade\.takeProfitPrice/,
    'queued one-click market submit must include selected SL/TP prices',
  );
  assertSourceContains(
    chartTradeActionsSource,
    /price_sl: stopLossPrice[\s\S]*price_tp: takeProfitPrice/,
    'market payload builder must map selected levels to API price_sl and price_tp fields',
  );
  assertSourceContains(
    chartTradeResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}/,
    'chart rejected market submit must keep the detailed error feedback modal',
  );
  assertSourceContains(
    chartTradeResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}[\s\S]*setTradeFeedback\(feedback\);[\s\S]*refreshPositions\(String\(accountLogin\)\)[\s\S]*refetchOrders\(\)[\s\S]*refetchAccountSummary\(\)/,
    'chart one-click success must show the shared feedback popup and refresh trade data for live overlay labels',
  );
  assert.doesNotMatch(chartTradeResultSource, /setChartTradeConfirmations/);
});

test('chart header: OHLC high and low use fixed market colors', () => {
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_HIGH_COLOR = '#089981'/,
    'OHLC high must use the fixed green market color',
  );
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_LOW_COLOR = '#F23645'/,
    'OHLC low must use the fixed red market color',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'H', value: formatChartValue\(chartMetaLastCandle\.high\), color: CHART_OHLC_HIGH_COLOR \}/,
    'H value must stay green regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'L', value: formatChartValue\(chartMetaLastCandle\.low\), color: CHART_OHLC_LOW_COLOR \}/,
    'L value must stay red regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /styles\.symbolOhlcValue, \{ color: item\.color,/,
    'OHLC value rendering must use the per-item color',
  );
  assert.doesNotMatch(nativeSource, /styles\.symbolOhlcValue, \{ color: chartMetaIsUp \?/);
});
test('overlay bridge: repeated overlay sync clears previous lines before recreating', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const clearBody = extractFunctionBody(source, 'clearOverlayPriceLines');

  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'overlay apply must clear previous lines first');
  assertSourceContains(body, /series\.createPriceLine/, 'overlay apply must recreate price lines from payload');
  assertSourceContains(body, /lineVisible:\s*true/, 'overlay apply must explicitly keep recreated price lines visible');
  assertSourceContains(clearBody, /series\.removePriceLine\(_positionLinesArr\[i\]\)/, 'clear must remove every previous price-line ref');
  assertSourceContains(clearBody, /_overlayPriceLinesByDragKey = Object\.create\(null\)/, 'clear must reset drag-key lookup');
});

test('overlay bridge: anchored trade labels stay below the chart header', () => {
  const boundsBody = extractFunctionBody(source, 'resolveAnchoredOverlayLabelBounds');
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');
  const anchoredLineBody = extractFunctionBody(source, 'renderAnchoredTradeLine');
  const anchoredLeftsBody = extractFunctionBody(source, 'resolveAnchoredOverlayLabelLefts');
  const applyOverlayBody = extractFunctionBody(source, 'applyOverlayPayload');

  assertSourceContains(
    boundsBody,
    /var minTop = Math\.max\(OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING, plotTop \+ 2\)/,
    'line-anchored open-position labels must clamp only to the chart edge so their price line stays glued to the real coordinate',
  );
  assertSourceContains(
    refreshBody,
    /anchoredLabels\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'line-anchored open-position labels must be sorted for stable draw order',
  );
  assertSourceContains(
    refreshBody,
    /var anchoredDesiredTop = Math\.round\(anchoredLabels\[anchoredTopIndex\]\.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP\)[\s\S]*anchoredTops\[anchoredTopIndex\] = Math\.max\(anchoredBounds\.minTop, Math\.min\(anchoredBounds\.maxTop, anchoredDesiredTop\)\)/,
    'MT5-style open-position labels must stay fixed to their own trade price line instead of floating away from nearby lines',
  );
  assertSourceContains(
    refreshBody,
    /var anchoredLefts = resolveAnchoredOverlayLabelLefts\(anchoredLabels, anchoredTops, layer\)/,
    'close line-anchored labels must resolve sideways lanes after their fixed price tops are known',
  );
  assertSourceContains(
    anchoredLeftsBody,
    /candidateLeft = OVERLAY_ANCHORED_LABEL_LEFT[\s\S]*candidateLeft <= maxLeft[\s\S]*candidateLeft \+= laneWidth/,
    'line-anchored open-position label collision handling must search horizontal lanes instead of changing price-based tops',
  );
  assertSourceContains(
    anchoredLeftsBody,
    /doOverlayLabelBoxesOverlap\(candidateBox, placedBoxes\[boxIndex\]\)/,
    'line-anchored open-position labels must only move sideways when their text boxes overlap',
  );
  assertSourceContains(
    anchoredLeftsBody,
    /lefts\[i\] = chosenLeft/,
    'line-anchored open-position labels must return the resolved left lane for each fixed-top label',
  );
  assertSourceContains(
    refreshBody,
    /var renderLabel = function\(item, top, left\)[\s\S]*var labelLeft = typeof left === 'number' && isFinite\(left\)[\s\S]*label\.style\.left = labelLeft \+ 'px'/,
    'label rendering must use the resolved horizontal lane without changing the fixed top coordinate',
  );
  assertSourceContains(
    refreshBody,
    /if \(isAnchoredTradeLabel\) \{[\s\S]*labelMaxWidth = Math\.min\(OVERLAY_ANCHORED_LABEL_LANE_WIDTH, labelMaxWidth\)/,
    'anchored trade labels must stay inside their horizontal lane when close entries are visible together',
  );
  assertSourceContains(
    refreshBody,
    /renderAnchoredTradeLine\(layer, anchoredItem\)[\s\S]*renderLabel\(anchoredItem, anchoredTop, anchoredLefts\[anchoredIndex\]\)/,
    'line-anchored open-position labels must draw the owned dotted line and label from the same payload',
  );
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.left = Math\.max\(0, Math\.round\(metrics\.leftAxisWidth \|\| 0\)\) \+ 'px'[\s\S]*line\.style\.width = paneWidth \+ 'px'/,
    'owned open-position dotted lines must draw as normal full-width horizontal chart lines',
  );
  assertSourceContains(
    applyOverlayBody,
    /lineVisible: ln\.labelPlacement === 'line' \? false : true/,
    'line-placement open trades must not also create a full-width canvas price line under the plain label',
  );
  assertSourceContains(
    refreshBody,
    /drawAnchoredTradeLine: ln\.labelPlacement === 'line'[\s\S]*lineStyle: typeof ln\.lineStyle === 'number' \? ln\.lineStyle : 0[\s\S]*lineWidth: typeof ln\.lineWidth === 'number' \? ln\.lineWidth : 1/,
    'only line-placement trade labels should draw the extra fixed dotted DOM line',
  );
  assertSourceContains(
    refreshBody,
    /label\.style\.textShadow = 'none'/,
    'line-anchored open-position labels must render without text shadow',
  );
  assertSourceContains(
    refreshBody,
    /renderAnchoredTradeLine\(layer, anchoredItem\)[\s\S]*renderLabel\(anchoredItem, anchoredTop, anchoredLefts\[anchoredIndex\]\)/,
    'line-anchored open-position labels must draw the full-width line and live P/L label from the same fixed price coordinate',
  );
  assert.doesNotMatch(refreshBody, /anchoredInitialBackIndex/);
  assert.doesNotMatch(refreshBody, /nudgeAnchoredLabelsAwayFrom/);
  assert.doesNotMatch(refreshBody, /label\.style\.textShadow = '0 1px 1px/);
  assert.doesNotMatch(refreshBody, /label\.style\.background/);
  assert.doesNotMatch(refreshBody, /label\.style\.boxShadow/);
});

test('overlay bridge: right-axis trade price boxes keep close entries visible', () => {
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');

  assertSourceContains(
    refreshBody,
    /var seenBoxLevels = Object\.create\(null\)/,
    'right-axis trade boxes must track exact displayed price keys instead of broad tolerance levels',
  );
  assertSourceContains(
    refreshBody,
    /var boxKey = Number\(pln\.price\)\.toFixed\(boxDecimals\)[\s\S]*if \(seenBoxLevels\[boxKey\]\) continue[\s\S]*seenBoxLevels\[boxKey\] = true/,
    'right-axis trade boxes must dedupe only by exact displayed price text',
  );
  assertSourceContains(
    refreshBody,
    /positionBoxes\.sort\(function\(left, right\) \{ return left\.desiredTop - right\.desiredTop; \}\)[\s\S]*var positionBoxStep = POSITION_BOX_HEIGHT \+ resolvePositionBoxGap\(positionBoxes\.length\)[\s\S]*positionBoxes\[boxLayoutIndex\]\.top/,
    'right-axis trade boxes must use a wider dense-trade gap so nearby entry markers do not cover each other',
  );
  assertSourceContains(
    refreshBody,
    /boxEl\.style\.left = \(positionBoxMetrics \? positionBoxMetrics\.axisLeft[\s\S]*boxEl\.style\.width = \(positionBoxMetrics \? positionBoxMetrics\.axisWidth[\s\S]*boxEl\.style\.textAlign = 'right'[\s\S]*boxEl\.style\.zIndex = '16'/,
    'right-axis trade boxes must stay pinned inside the measured price-scale strip during chart movement',
  );
  assert.doesNotMatch(refreshBody, /boxEl\.style\.right = '2px'/);
  assert.doesNotMatch(refreshBody, /levelScale \* 1e-4/);
});
test('overlay bridge: trade overlays participate in price-scale autoscale', () => {
  const autoscaleBody = extractFunctionBody(source, 'buildOverlayAwareAutoscaleInfo');
  const expandTradeOverlayBody = extractFunctionBody(source, 'expandPriceRangeForTradeOverlays');
  const visibleRangeBody = extractFunctionBody(source, 'resolvePriceRangeFromVisibleData');
  const healthBody = extractFunctionBody(source, 'healCollapsedPriceScaleRange');
  const setOverlayBody = extractFunctionBody(source, 'setChartOverlays');

  assertSourceContains(
    autoscaleBody,
    /expandPriceRangeForTradeOverlays\(baseRange\)[\s\S]*expandPriceRangeForMarketPriceBadges\(expandedRange\)/,
    'series autoscale must include visible trade overlay prices before market badges are applied',
  );
  assertSourceContains(
    expandTradeOverlayBody,
    /overlayNearEdge[\s\S]*makeTradeOverlayPaddedPriceRange\(minPrice, maxPrice, overlayPrices\.length\)/,
    'trade overlay autoscale must add extra edge padding when old or clustered entries sit near a chart edge',
  );
  assertSourceContains(
    visibleRangeBody,
    /return expandPriceRangeForTradeOverlays\(expandedRange\)/,
    'visible price range recovery must keep old open trade levels in range',
  );
  assertSourceContains(
    healthBody,
    /var tradeOverlaysOutOfRange = !rangeContainsTradeOverlays\(currentRange\)[\s\S]*tradeOverlaysOutOfRange/,
    'price-scale health recovery must treat missing trade overlays as an unhealthy range',
  );
  assertSourceContains(
    setOverlayBody,
    /scheduleOverlayPriceScaleLock\(false\)[\s\S]*applyOverlayPayload\(_overlayPayload\)/,
    'live overlay updates must recalculate the right price scale without resetting the user-owned vertical range',
  );
  assertSourceContains(
    source,
    /autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo/,
    'every chart series type must use the overlay-aware autoscale provider',
  );
});

test('chart preferences exposes persistent show-on-chart filters', () => {
  // The "Show on chart" section exposes buy/sell trade visibility and MT5-style SL/TP level visibility.
  assert.match(chartSettingsScreenSource, /CHART_SHOW_ON_CHART_ITEMS\.map/);
  assert.match(chartSettingsScreenSource, /setChartShowOnChartItem\(key, value\)/);
  assert.match(chartSettingsScreenSource, /SHOW ON CHART/);
  assert.match(chartSettingsScreenSource, /buyTrade: 'trending-up-outline'/);
  assert.match(chartSettingsScreenSource, /sellTrade: 'trending-down-outline'/);
  assert.match(chartSettingsScreenSource, /slTpLevels: 'shield-checkmark-outline'/);
  assert.match(chartShowOnChartSource, /SL\/TP levels/);
  assert.match(chartShowOnChartSource, /Show Stop Loss and Take Profit values on the chart/);
  assert.match(chartSettingsScreenSource, /pointerEvents="none"/);
});

test('chart preferences exposes MT5 one-click panel bottom placement toggle', () => {
  assert.match(chartSettingsScreenSource, /chartOneClickPanelAtBottom/);
  assert.match(chartSettingsScreenSource, /setChartOneClickPanelAtBottom/);
  assert.match(chartSettingsScreenSource, /One Click panel at the bottom/);
  assert.match(chartSettingsScreenSource, /Show one click trading panel at the bottom of the chart/);
});

test('chart preferences left swipe returns to the chart screen without stealing vertical scroll', () => {
  assert.match(chartSettingsScreenSource, /PanResponder\.create/);
  assert.match(chartSettingsScreenSource, /CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_DISTANCE/);
  assert.match(
    chartSettingsScreenSource,
    /dx < 0[\s\S]*horizontalDistance >= CHART_SETTINGS_LEFT_SWIPE_CLAIM_DISTANCE[\s\S]*horizontalDistance > verticalDistance \* CHART_SETTINGS_HORIZONTAL_SWIPE_RATIO/,
  );
  assert.match(chartSettingsScreenSource, /safeRouterBack\(router, '\/\(tabs\)\/chart'\)/);
  assert.match(chartSettingsScreenSource, /\{\.\.\.chartReturnSwipePanResponder\.panHandlers\}/);
});

test('overlay payload: duplicate position inputs produce unique line ids', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: 'same-ticket',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.105,
        currentPrice: 1.107,
        pnl: 2,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.1,
        tp: 1.11,
      },
      {
        id: 'same-ticket',
        symbol: 'EURUSDm',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.105,
        currentPrice: 1.107,
        pnl: 2,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.1,
        tp: 1.11,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: true, sellTrade: true, slTpLevels: true },
  });

  const ids = payload.priceLines.map((line: any) => line.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), ['open-same-ticket', 'sl-same-ticket', 'tp-same-ticket'].sort());
});
