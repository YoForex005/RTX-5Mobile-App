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
const webSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.web.tsx'),
  'utf8',
);
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
const orderTicketSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'),
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
  assertSourceContains(body, /_positionLinesArr\.length !== countOverlayNativePriceLines\(_overlayPayload\.priceLines\)/, 'resync must detect missing native price lines');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'resync must recreate missing overlays');
  assertSourceContains(
    source,
    /const resyncInterval = setInterval\(\(\) => \{[\s\S]*setChartOverlays\(\$\{JSON\.stringify\(payload\)\}\)[\s\S]*\}, 5000\)/,
    'native overlay bridge must periodically re-push overlays on the geometry path',
  );
});

test('overlay bridge: draggable SL and TP lines emit CHART_TRADE_LINE_DRAG', () => {
  const postDragBody = extractFunctionBody(source, 'postChartTradeLineDrag');
  const previewLinesSource = source.slice(source.indexOf('const chartTradePreviewLines'), source.indexOf('const chartType = chartVisualType'));

  assertSourceContains(postDragBody, /type: 'CHART_TRADE_LINE_DRAG'/, 'drag events must use the chart trade-line event type');
  assertSourceContains(postDragBody, /phase: phase/, 'drag events must include phase');
  assertSourceContains(postDragBody, /dragKey: dragKey/, 'drag events must include dragKey');
  assertSourceContains(previewLinesSource, /const chartTradeSlDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*previewPositionTarget[\s\S]*buildChartPositionStopDragKey\(previewPositionTarget\.id, 'sl'\)[\s\S]*: 'sl'/, 'SL preview must be non-draggable while its broker capability is locked');
  assertSourceContains(previewLinesSource, /const chartTradeTpDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*previewPositionTarget[\s\S]*buildChartPositionStopDragKey\(previewPositionTarget\.id, 'tp'\)[\s\S]*: 'tp'/, 'TP preview must be non-draggable while its broker capability is locked');
  assertSourceContains(
    previewLinesSource,
    /const previewPositionTarget = chartDirectProtectionActive\s*\? null\s*: chartTradePositionStopTarget[\s\S]*const positionHasSl =[\s\S]*Number\(previewPositionTarget\?\.sl\) > 0[\s\S]*const positionHasTp =[\s\S]*Number\(previewPositionTarget\?\.tp\) > 0/,
    'persisted SL and TP levels must suppress only their own matching draft',
  );
  assertSourceContains(
    previewLinesSource,
    /if \(!positionHasTp && chartTradeTpEnabled[\s\S]*id: 'chart-trade-tp-preview'/,
    'a selected position with no persisted TP must still render its TP draft',
  );
  assertSourceContains(
    previewLinesSource,
    /if \(!positionHasSl && chartTradeSlEnabled[\s\S]*id: 'chart-trade-sl-preview'/,
    'a selected position with no persisted SL must still render its SL draft',
  );
  assert.doesNotMatch(
    previewLinesSource,
    /renderPositionStopsFromOpenPosition/,
    'one persisted position level must not blanket-suppress both drafts',
  );
  assertSourceContains(previewLinesSource, /id: 'chart-trade-sl-preview'[\s\S]*labelPlacement: 'line'[\s\S]*dragKey: chartTradeSlDragKey/, 'SL preview line must draw to the right price scale');
  assertSourceContains(previewLinesSource, /id: 'chart-trade-tp-preview'[\s\S]*labelPlacement: 'line'[\s\S]*dragKey: chartTradeTpDragKey/, 'TP preview line must draw to the right price scale');
});

test('overlay bridge: dragged open-position SL/TP commits through the shared exact-ticket coordinator', () => {
  const sharedCommitStart = nativeSource.indexOf('const commitChartPositionStopLevels = useCallback');
  const commitStart = nativeSource.indexOf('const commitChartPositionStopDrag = useCallback');
  const sharedCommitEnd = nativeSource.indexOf('const commitChartTradeSheetStopsForPosition = useCallback', sharedCommitStart);
  const commitEnd = nativeSource.indexOf('const handleChartPositionStopDragMessage = useCallback', commitStart);
  const handlerEnd = nativeSource.indexOf('const handleChartTradePreviewDragMessage = useCallback', commitEnd);
  assert.notEqual(sharedCommitStart, -1, 'shared position stop commit callback must exist');
  assert.notEqual(sharedCommitEnd, -1, 'shared position stop commit callback boundary must exist');
  assert.notEqual(commitStart, -1, 'commitChartPositionStopDrag callback must exist');
  assert.notEqual(commitEnd, -1, 'handleChartPositionStopDragMessage callback must exist');
  assert.notEqual(handlerEnd, -1, 'chart trade preview drag callback must still exist');
  const sharedCommitSource = nativeSource.slice(sharedCommitStart, sharedCommitEnd);
  const commitSource = nativeSource.slice(commitStart, commitEnd);
  const handlerSource = nativeSource.slice(commitEnd, handlerEnd);

  assertSourceContains(
    handlerSource,
    /parseChartPositionStopDragKey\(msg\?\.dragKey\)[\s\S]*phase === 'end'[\s\S]*commitChartPositionStopDrag\(target, nextPrice\)/,
    'open-position SL/TP drag messages must parse the position key and commit only on release',
  );
  assertSourceContains(
    handlerSource,
    /if \(selectedChartPositionTicket !== target\.positionId\) \{\s*handleSelectChartPositionTicket\(target\.positionId\);\s*\}/,
    'dragging an already-selected draft must not rehydrate the ticket and disable its other local draft',
  );
  assertSourceContains(
    handlerSource,
    /if \(existingPositionModifyBackendLocked\) \{\s*return true;\s*\}/,
    'stale position drag messages must be consumed without local state changes while modification is locked',
  );
  assertSourceContains(
    commitSource,
    /const requestedSl = target\.kind === 'sl' \? nextPrice : previousSl[\s\S]*const requestedTp = target\.kind === 'tp' \? nextPrice : previousTp/,
    'dragging one stop level must preserve the other stop level',
  );
  assertSourceContains(
    commitSource,
    /commitChartPositionStopLevels\(\s*position\.id,\s*requestedSl,\s*requestedTp,\s*\(\) => clearChartPositionStopDragPreview\(dragKey, nextPrice\),\s*\)/,
    'drag release must hand the requested SL/TP values to the shared committer and retain the live draft until reconciliation settles',
  );
  assertSourceContains(
    sharedCommitSource,
    /submitModifyPosition\(\{\s*ticket: position\.id,\s*symbol: position\.symbol,\s*accountLogin: sessionCapture\.session\.accountLogin,\s*request: \{\s*price_sl: requestedSl,\s*price_tp: requestedTp,\s*\},\s*\}\)/,
    'shared stop commit must submit the exact position through the session coordinator',
  );
  assert.doesNotMatch(
    sharedCommitSource,
    /positionsApi\s*\.modifyPosition|applyLocalStopPatch|clientModifiedAt/,
    'chart must not bypass the coordinator or paint proposed SL/TP as confirmed state',
  );
  assertSourceContains(
    sharedCommitSource,
    /pointSize: chartProtectionTickSize \?\? 0/,
    'existing-position validation must not invent point or minimum-distance metadata',
  );
  assertSourceContains(
    nativeSource,
    /const handleToggleChartTradeStopLevel = useCallback[\s\S]*commitChartTradeSheetStopsForPosition\(positionTarget, nextPrice, currentTp\)[\s\S]*commitChartTradeSheetStopsForPosition\(positionTarget, currentSl, nextPrice\)/,
    'top chart SL/TP sheet toggles must save enabled stop levels through the position modify path',
  );
  assertSourceContains(
    nativeSource,
    /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*if \(!handleChartPositionStopDragMessage\(msg\)\) \{[\s\S]*handleChartTradePreviewDragMessage\(msg\)/,
    'position stop drags must be handled before falling back to the new-trade preview drag handler',
  );
  assertSourceContains(
    nativeSource,
    /allowPositionStopDragging: !existingPositionModifyBackendLocked/,
    'persisted position SL/TP lines must receive drag keys only when the active broker capability is enabled',
  );
});

test('chart modify selection stays ticket-durable and exposes coordinator reconciliation state', () => {
  assertSourceContains(
    nativeSource,
    /setSelectedChartPositionTicket\(String\(chartMatchingPositionCandidates\[0\]\.id\)\)/,
    'the sole same-symbol position must be materialized as an exact selected ticket',
  );
  const targetResolverStart = nativeSource.indexOf('const resolveSingleChartPositionStopTarget = useCallback');
  const targetResolverEnd = nativeSource.indexOf('const chartTradePositionStopTarget = useMemo', targetResolverStart);
  const targetResolverSource = nativeSource.slice(targetResolverStart, targetResolverEnd);
  assertSourceContains(
    targetResolverSource,
    /if \(selectedChartPosition\) \{\s*return selectedChartPosition;\s*\}[\s\S]*return null;/,
    'the resolver must use only the durable selected ticket',
  );
  assert.doesNotMatch(
    targetResolverSource,
    /chartMatchingPositionCandidates\[0\]/,
    'a same-symbol replacement must not silently become the selected ticket',
  );
  const missingTicketEffectStart = nativeSource.indexOf(
    '    if (!selectedChartPositionTicket) return;',
  );
  const missingTicketEffectEnd = nativeSource.indexOf(
    '  useEffect(() => {',
    missingTicketEffectStart + 1,
  );
  assert.notEqual(missingTicketEffectStart, -1, 'missing-ticket cleanup effect must exist');
  assert.notEqual(missingTicketEffectEnd, -1, 'missing-ticket cleanup effect boundary must exist');
  const missingTicketEffectSource = nativeSource.slice(
    missingTicketEffectStart,
    missingTicketEffectEnd,
  );
  assertSourceContains(
    missingTicketEffectSource,
    /setInvalidatedChartPositionSymbol\([\s\S]*chartMatchingPositionCandidates\.length > 0[\s\S]*normalizedChartPositionSymbol[\s\S]*: null[\s\S]*\)/,
    'a removed ticket must block same-symbol retargeting while another candidate remains',
  );
  assertSourceContains(
    missingTicketEffectSource,
    /setSelectedChartPositionTicket\(null\)[\s\S]*setChartTradeSlEnabled\(false\)[\s\S]*setChartTradeSlPrice\(0\)[\s\S]*setChartTradeTpEnabled\(false\)[\s\S]*setChartTradeTpPrice\(0\)[\s\S]*setChartStepperEditor\(null\)[\s\S]*setChartTradeSlLocked\(false\)[\s\S]*setChartTradeTpLocked\(false\)/,
    'SL/TP terminal removal must clear the selected ticket and every stale local chart draft',
  );
  assertSourceContains(
    nativeSource,
    /\}, \[activeChartSessionCacheNamespace, normalizedChartPositionSymbol\]\);/,
    'broker-session changes must clear chart SL/TP selection even when the symbol is unchanged',
  );
  assertSourceContains(
    nativeSource,
    /useModifyPositionTicketState\(\s*selectedChartPositionTicket,\s*\)/,
    'chart must subscribe to the same per-ticket coordinator state as the hosted screen',
  );
  assertSourceContains(
    nativeSource,
    /const hasChartExistingPositionProtectionContext =\s*chartMatchingPositionCandidates\.length > 0\s*\|\|\s*!!selectedChartPositionTicket\s*\|\|\s*invalidatedChartPositionSymbol === normalizedChartPositionSymbol;[\s\S]*const chartStopsTargetExistingPosition =\s*!chartDirectProtectionActive\s*&&\s*!isPendingChartOrderType\(chartTradeOrderType\)\s*&&\s*hasChartExistingPositionProtectionContext/,
    'direct Market Execution drafts must remain new-order protection even when same-symbol positions exist',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /modifyPhase === 'pending'[\s\S]*modifyPhase === 'reconciling'[\s\S]*modifyPhase === 'unknown'[\s\S]*modifyPhase === 'changed_elsewhere'/,
    'the chart sheet must visibly expose shared pending and reconciliation outcomes',
  );
  assert.doesNotMatch(
    chartTradeFeatureSource,
    /queuedLatestIntent|price_sl.*chartModifyTicketState|price_tp.*chartModifyTicketState/,
    'proposed coordinator intent must never be rendered as confirmed SL/TP',
  );
  assertSourceContains(
    nativeSource,
    /recordMarketDataEvent\('modify_position', \{\s*phase: 'chart_repaint_dispatched'[\s\S]*reconciliationSequence: modifyState\.latestEligibleSequence/,
    'eligible reconciled overlay injection must emit a chart repaint-dispatch timestamp',
  );
});

test('overlay bridge: draggable trade labels keep touch ownership through the full gesture', () => {
  assertSourceContains(source, /var getClampedRelativePoint = function\(clientX, clientY\)/, 'drag movement must clamp to the chart bounds instead of dropping updates');
  assertSourceContains(source, /beginTradeLineDragFromHit[\s\S]*return beginTradeLineDrag\(event, resolvedHit\.hit\)/, 'SL/TP line dragging must activate directly from the resolved pointer-down hit');
  assertSourceContains(source, /var onPointerDown = function\(event\)[\s\S]*resolveTradeLineDragHitFromEvent\(event\)[\s\S]*beginTradeLineDragFromHit\(event, tradeLineHit\)/, 'pointer-down must immediately start an SL/TP drag');
  assert.doesNotMatch(source, /CHART_TRADE_LINE_DRAG_HOLD_MS|pendingTradeLineHold/, 'SL/TP dragging must not retain the motion-cancelling hold gate');
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
    /if \(point && \(activeHorizontalScrollGesture \|\| vertPanPending\)\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;[\s\S]*scheduleOverlayDomRefresh\(\);/,
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
  assert.doesNotMatch(handlerSource, /Alert\.alert/);
  assertSourceContains(
    handlerSource,
    /if \(isPendingOrderTypeBackendLocked\(chartTradeOrderType\)\) \{\s*return;\s*\}/,
    'pending CTA must fail closed until backend readiness is explicitly enabled',
  );
  assertSourceContains(handlerSource, /ordersApi\.placePendingOrder\(payload\)/, 'pending CTA must submit to the pending-order API');
  assert.doesNotMatch(handlerSource, /Unsupported Order Type|not supported by the current trading API/);
  assertSourceContains(handlerSource, /price_sl: chartTradeSlPrice/, 'pending CTA must include enabled SL price');
  assertSourceContains(handlerSource, /price_tp: chartTradeTpPrice/, 'pending CTA must include enabled TP price');
  assertSourceContains(handlerSource, /stopLimitPrice: chartTradeStopLimitPrice/, 'pending CTA must include stop-limit price');
  assertSourceContains(handlerSource, /refetchOrders\(\)/, 'pending CTA must refresh orders so overlays can draw the new order');
  assertSourceContains(handlerSource, /snapTradeSheet\('collapsed'\)/, 'pending CTA must expose chart-side levels after submission');
  assert.doesNotMatch(handlerSource, /\|\|\s*isStopLimitChartOrder/);
});

test('chart market execution only submits SL and TP that target a new order', () => {
  const chartTradeResultSource = source.slice(
    source.indexOf('const handleChartTradeResult = useCallback'),
    source.indexOf('const [showSignalDetails', source.indexOf('const handleChartTradeResult = useCallback')),
  );
  const chartTradeExecutionResultSource = source.slice(
    source.indexOf('const handleChartTradeExecutionResult = useCallback'),
    source.indexOf('const isChartExpanded', source.indexOf('const handleChartTradeExecutionResult = useCallback')),
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /stopLossPrice=\{\s*!stopsTargetExistingPosition &&\s*!sheet\.newMarketOrderProtectionBackendLocked &&\s*sheet\.chartTradeSlEnabled\s*\? sheet\.chartTradeSlPrice\s*: undefined\s*\}/,
    'market buttons must receive SL only when the sheet levels target a new order and that capability is enabled',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /takeProfitPrice=\{\s*!stopsTargetExistingPosition &&\s*!sheet\.newMarketOrderProtectionBackendLocked &&\s*sheet\.chartTradeTpEnabled\s*\? sheet\.chartTradeTpPrice\s*: undefined\s*\}/,
    'market buttons must receive TP only when the sheet levels target a new order and that capability is enabled',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /pointSize=\{sheet\.chartProtectionTickSize \?\? 0\}/,
    'market protection validation must not receive a synthetic display point',
  );
  assertSourceContains(
    nativeSource,
    /const directMarketStopLossPrice =\s*chartDirectProtectionActive[\s\S]*const directMarketTakeProfitPrice =\s*chartDirectProtectionActive[\s\S]*<ChartTradeInlineFooter[\s\S]*stopLossPrice=\{directMarketStopLossPrice\}[\s\S]*takeProfitPrice=\{directMarketTakeProfitPrice\}[\s\S]*pointSize=\{chartProtectionTickSize \?\? 0\}/,
    'the normal Chart Market Execution footer must receive direct SL/TP guide prices while the sheet stays hidden',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /key=\{`chart-trade-footer-dock-\$\{sheet\.chartSymbol\}`\}[\s\S]*stopLossPrice=\{sheet\.directMarketStopLossPrice\}[\s\S]*takeProfitPrice=\{sheet\.directMarketTakeProfitPrice\}[\s\S]*pointSize=\{sheet\.chartProtectionTickSize \?\? 0\}/,
    'the floating Chart Market Execution dock must receive direct SL/TP guide prices',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /key=\{`chart-trade-inline-footer-\$\{chartSymbol\}`\}[\s\S]*stopLossPrice=\{stopLossPrice\}[\s\S]*takeProfitPrice=\{takeProfitPrice\}[\s\S]*pointSize=\{pointSize\}/,
    'the inline footer adapter must forward direct SL/TP guide prices to the execution buttons',
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
  assertSourceContains(
    chartTradeExecutionResultSource,
    /handleChartTradeResult\(feedback\)[\s\S]*feedback\.type !== 'success'[\s\S]*!chartDirectProtectionActive[\s\S]*!feedback\.protectionDraftId[\s\S]*applyChartProtectionDraftExecution\(\{[\s\S]*draftId: feedback\.protectionDraftId,[\s\S]*executionConfirmed: feedback\.executionConfirmed === true/,
    'market execution must retain drafts unless the exact draft receives broker-confirmed evidence or a reconcilable ticket',
  );
  assertSourceContains(
    nativeSource,
    /if \(event\.executionConfirmed\) \{\s*clearChartDirectProtectionDraft\(event\.draftId\);[\s\S]*if \(!event\.ticket\) \{\s*return;/,
    'confirmation-pending feedback without an exact ticket must not clear the chart draft',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /pathname: '\/trade\/order-ticket'[\s\S]*params: \{[\s\S]*\.\.\.\(protectionDraftId \? \{ protectionDraftId \} : \{\}\)/,
    'one-click-off navigation must carry the exact chart protection draft token into Order Ticket',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /queuedTrade\.protectionDraftId &&\s*!tryBeginChartProtectionDraftSubmission\(queuedTrade\.protectionDraftId\)[\s\S]*tradeQueueRef\.current\.push\(queuedTrade\)/,
    'one-click execution must admit only one submission for an exact protection draft',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /publishChartProtectionDraftSubmission\(queuedTrade\.protectionDraftId\);[\s\S]*placeOrder\(payload/,
    'one-click execution must snapshot ticket structure at the actual POST start',
  );
  assertSourceContains(
    chartTradeHandlerSource,
    /\['rejected', 'failed', 'error'\]\.includes\(responseStatus\)[\s\S]*releaseChartProtectionDraftSubmission\(queuedTrade\.protectionDraftId\)[\s\S]*return;/,
    'resolved broker rejections must release the protected draft instead of becoming confirmation-pending success',
  );
  assertSourceContains(
    orderTicketSource,
    /if \(!tryBeginChartProtectionDraftSubmission\(routeProtectionDraftId\)\)[\s\S]*publishChartProtectionDraftSubmission\(routeProtectionDraftId\);[\s\S]*const data = await ordersApi\.placeMarketOrder\(payload\)/,
    'Order Ticket must enforce single-flight and snapshot the chart draft immediately before its Market Execution POST',
  );
  assertSourceContains(
    nativeSource,
    /subscribeChartProtectionDraftSubmission\(captureChartProtectionDraftBaseline\)[\s\S]*const terminalTicketObserved = closedPositions\.some\([\s\S]*String\(position\.ticket\) === awaitingTicket[\s\S]*hasChartProtectionDraftReconciled\(\{[\s\S]*terminalTicketObserved/,
    'unconfirmed existing tickets must wait for changed structure or exact terminal history',
  );
  assertSourceContains(
    orderTicketSource,
    /publishChartProtectionDraftExecution\(\{[\s\S]*draftId: routeProtectionDraftId,[\s\S]*executionConfirmed: executionEvidence\.confirmed,[\s\S]*ticket: String\(positionTicket\)/,
    'Order Ticket must notify the originating chart draft after broker execution evidence is evaluated',
  );
  assert.doesNotMatch(chartTradeResultSource, /setChartTradeConfirmations/);
});

test('chart header: OHLC values use theme-aware neutral color plus fixed high low colors', () => {
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF'/,
    'OHLC open and close must stay white in dark theme',
  );
  assertSourceContains(
    nativeSource,
    /const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A'/,
    'OHLC open and close must use readable dark text in light theme',
  );
  assertSourceContains(
    nativeSource,
    /const chartMetaNeutralColor = isDark \? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR/,
    'native OHLC neutral color must switch with the app theme',
  );
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
    /\{ label: 'O', value: formatChartValue\(chartMetaLastCandle\?\.open\), color: chartMetaNeutralColor \}/,
    'O value must use the theme-aware neutral color',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'H', value: formatChartValue\(chartMetaLastCandle\?\.high\), color: CHART_OHLC_HIGH_COLOR \}/,
    'H value must stay green regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'L', value: formatChartValue\(chartMetaLastCandle\?\.low\), color: CHART_OHLC_LOW_COLOR \}/,
    'L value must stay red regardless of candle direction',
  );
  assertSourceContains(
    nativeSource,
    /\{ label: 'C', value: formatChartValue\(chartMetaLastCandle\?\.close\), color: chartMetaNeutralColor \}/,
    'C value must use the theme-aware neutral color',
  );
  assertSourceContains(
    nativeSource,
    /styles\.symbolOhlcValue, \{ color: item\.color,/,
    'OHLC value rendering must use the per-item color',
  );
  assert.doesNotMatch(nativeSource, /styles\.symbolOhlcValue, \{ color: chartMetaIsUp \?/);
  assert.doesNotMatch(nativeSource, /chartMetaDirectionColor/);
  assertSourceContains(
    webSource,
    /const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF'/,
    'web OHLC open and close must stay white in dark theme',
  );
  assertSourceContains(
    webSource,
    /const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A'/,
    'web OHLC open and close must use readable dark text in light theme',
  );
  assertSourceContains(
    webSource,
    /const chartMetaNeutralColor = isDark \? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR/,
    'web OHLC neutral color must switch with the app theme',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'O', value: formatChartValue\(chartMetaLastCandle\.open\), color: chartMetaNeutralColor \}/,
    'web O value must use the theme-aware neutral color',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'H', value: formatChartValue\(chartMetaLastCandle\.high\), color: CHART_OHLC_HIGH_COLOR \}/,
    'web H value must stay green too',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'L', value: formatChartValue\(chartMetaLastCandle\.low\), color: CHART_OHLC_LOW_COLOR \}/,
    'web L value must stay red too',
  );
  assertSourceContains(
    webSource,
    /\{ label: 'C', value: formatChartValue\(chartMetaLastCandle\.close\), color: chartMetaNeutralColor \}/,
    'web C value must use the theme-aware neutral color',
  );
  assertSourceContains(webSource, /\{ color: item\.color \}/, 'web OHLC value rendering must use the per-item color');
  assert.doesNotMatch(webSource, /chartMetaIsUp \? resolvedChartColors\.candlesUptrend/);
});
test('overlay bridge: repeated overlay sync clears previous lines before recreating', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const clearBody = extractFunctionBody(source, 'clearOverlayPriceLines');

  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'overlay apply must clear previous lines first');
  assertSourceContains(body, /shouldCreateOverlayNativePriceLine\(ln\)/, 'overlay apply must skip DOM-owned trade lines before native creation');
  assertSourceContains(body, /series\.createPriceLine/, 'overlay apply must recreate price lines from payload');
  assertSourceContains(body, /lineVisible: ln\.labelPlacement === 'line' \? false : true/, 'native overlay lines must keep the previous visibility contract');
  assertSourceContains(clearBody, /series\.removePriceLine\(_positionLinesArr\[i\]\)/, 'clear must remove every previous price-line ref');
  assertSourceContains(clearBody, /_overlayPriceLinesByDragKey = Object\.create\(null\)/, 'clear must reset drag-key lookup');
});

test('overlay bridge: trade labels follow their price coordinate off screen', () => {
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');
  const anchoredLineBody = extractFunctionBody(source, 'renderAnchoredTradeLine');
  const anchoredLeftsBody = extractFunctionBody(source, 'resolveAnchoredOverlayLabelLefts');
  const applyOverlayBody = extractFunctionBody(source, 'applyOverlayPayload');
  const shouldCreateNativeLineBody = extractFunctionBody(source, 'shouldCreateOverlayNativePriceLine');

  assert.doesNotMatch(
    source,
    /resolveAnchoredOverlayLabelBounds|resolveOverlayLabelBounds|OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING|OVERLAY_LABEL_TOP_SAFE_PADDING/,
    'trade labels must not keep stale top/bottom clamp helpers that pin off-screen prices inside the pane',
  );
  assertSourceContains(
    refreshBody,
    /anchoredLabels\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'line-anchored open-position labels must be sorted for stable draw order',
  );
  assertSourceContains(
    refreshBody,
    /var desiredTop = Math\.round\(floatingLabels\[j\]\.y - OVERLAY_LABEL_HEIGHT \/ 2\)[\s\S]*tops\[j\] = desiredTop/,
    'floating order labels must use their real price coordinate instead of being clamped into the visible pane',
  );
  assertSourceContains(
    refreshBody,
    /var anchoredDesiredTop = Math\.round\(anchoredLabels\[anchoredTopIndex\]\.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP\)[\s\S]*anchoredTops\[anchoredTopIndex\] = anchoredDesiredTop/,
    'MT5-style open-position labels must leave the chart when their price coordinate leaves the chart',
  );
  assertSourceContains(
    refreshBody,
    /var floatingTop = tops\[labelIndex\][\s\S]*renderLabel\(floatingItem, floatingTop, null/,
    'floating labels must render from the unclamped top value',
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
    /var renderLabel = function\(item, top, left, labelKey\)[\s\S]*var labelLeft = typeof left === 'number' && isFinite\(left\)[\s\S]*label\.style\.left = labelLeft \+ 'px'/,
    'label rendering must use the resolved horizontal lane without changing the fixed top coordinate',
  );
  assertSourceContains(
    refreshBody,
    /if \(isAnchoredTradeLabel\) \{[\s\S]*labelMaxWidth = Math\.min\(OVERLAY_ANCHORED_LABEL_LANE_WIDTH, labelMaxWidth\)/,
    'anchored trade labels must stay inside their horizontal lane when close entries are visible together',
  );
  assertSourceContains(
    refreshBody,
    /renderAnchoredTradeLine\(layer, anchoredItem, lineKey\)[\s\S]*renderLabel\(anchoredItem, anchoredTop, anchoredLefts\[anchoredIndex\]/,
    'line-anchored open-position labels must draw the owned dotted line and label from the same payload',
  );
  assertSourceContains(
    anchoredLineBody,
    /line\.style\.left = Math\.max\(0, Math\.round\(metrics\.leftAxisWidth \|\| 0\)\) \+ 'px'[\s\S]*line\.style\.width = paneWidth \+ 'px'/,
    'owned open-position dotted lines must draw as normal full-width horizontal chart lines',
  );
  assertSourceContains(
    applyOverlayBody,
    /if \(!shouldCreateOverlayNativePriceLine\(ln\)\) continue;/,
    'line-placement open trades must skip native price-line creation before the DOM overlay draws them',
  );
  assertSourceContains(
    shouldCreateNativeLineBody,
    /isTradeOverlayScaleLine\(line\)[\s\S]*return false;/,
    'account trade, order, SL/TP, and chart-trade preview lines must stay out of native price-line autoscale',
  );
  assertSourceContains(
    shouldCreateNativeLineBody,
    /line\.labelPlacement === 'line'[\s\S]*typeof line\.dragKey === 'string' && line\.dragKey[\s\S]*return false;/,
    'line-placement and draggable preview trades must not create hidden native price lines that can flatten candle autoscale',
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
    /renderAnchoredTradeLine\(layer, anchoredItem, lineKey\)[\s\S]*renderLabel\(anchoredItem, anchoredTop, anchoredLefts\[anchoredIndex\]/,
    'line-anchored open-position labels must draw the full-width line and live P/L label from the same fixed price coordinate',
  );
  assertSourceContains(
    refreshBody,
    /upsertOverlayDomNode\(layer, key[\s\S]*pruneOverlayDomNodes\(liveOverlayKeys\)/,
    'overlay DOM labels must update in place and never wipe the whole layer on quote ticks',
  );
  assert.doesNotMatch(
    refreshBody,
    /clearOverlayDomLabels\(\);\s*\n\s*if \(!series\)/,
    'overlay refresh must not blank the trade-line layer before painting when the series is healthy',
  );
  assert.doesNotMatch(refreshBody, /anchoredInitialBackIndex/);
  assert.doesNotMatch(refreshBody, /anchoredBounds|bounds\.minTop|bounds\.maxTop/);
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
    /var desiredBoxTop = Math\.round\(ry - POSITION_BOX_HEIGHT \/ 2\)[\s\S]*top: desiredBoxTop/,
    'right-axis trade boxes must start from the exact price coordinate',
  );
  assertSourceContains(
    refreshBody,
    /var nextBoxTop = positionBoxes\[boxLayoutIndex\]\.desiredTop[\s\S]*positionBoxes\[boxLayoutIndex\]\.top = nextBoxTop/,
    'right-axis trade boxes must not clamp off-screen trade prices back inside the chart',
  );
  assertSourceContains(
    refreshBody,
    /boxEl\.style\.left = \(positionBoxMetrics \? positionBoxMetrics\.axisLeft[\s\S]*boxEl\.style\.width = \(positionBoxMetrics \? positionBoxMetrics\.axisWidth[\s\S]*boxEl\.style\.textAlign = 'right'[\s\S]*boxEl\.style\.zIndex = '16'/,
    'right-axis trade boxes must stay pinned inside the measured price-scale strip during chart movement',
  );
  assert.doesNotMatch(refreshBody, /positionBoxMinTop|positionBoxMaxTop|Math\.max\(positionBoxMinTop/);
  assert.doesNotMatch(refreshBody, /boxEl\.style\.right = '2px'/);
  assert.doesNotMatch(refreshBody, /levelScale \* 1e-4/);
});
test('overlay bridge: trade overlays stay out of price-scale autoscale', () => {
  const autoscaleBody = extractFunctionBody(source, 'buildOverlayAwareAutoscaleInfo');
  const visibleRangeBody = extractFunctionBody(source, 'resolvePriceRangeFromVisibleData');
  const healthBody = extractFunctionBody(source, 'healCollapsedPriceScaleRange');
  const setOverlayBody = extractFunctionBody(source, 'setChartOverlays');

  assertSourceContains(
    autoscaleBody,
    /resolveVisibleCandleDataPriceRange\(\)[\s\S]*isValidPriceRange\(visibleCandleRange\)[\s\S]*expandPriceRangeForMarketPriceBadges\(baseRange\)/,
    'series autoscale must start from visible backend candles and only add market price badges',
  );
  assert.doesNotMatch(autoscaleBody, /expandPriceRangeForTradeOverlays/);
  assertSourceContains(
    source,
    /var PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE = 6/,
    'candle compression health recovery needs a mobile-visible span threshold for XAUUSD-style scale stretching',
  );
  assertSourceContains(
    source,
    /\^\(open-\|order-entry-\|order-stop-limit-\|order-sl-\|order-tp-\|sl-\|tp-\|chart-trade-\)/,
    'account trade overlays and draggable chart-trade preview lines must be recognized before native price-line creation',
  );
  assertSourceContains(
    visibleRangeBody,
    /expandPriceRangeForMarketPriceBadges\(robustRange\)/,
    'visible price range recovery should keep market badges visible without adding trade overlays',
  );
  assert.doesNotMatch(visibleRangeBody, /expandPriceRangeForTradeOverlays/);
  assert.doesNotMatch(healthBody, /tradeOverlaysOutOfRange|rangeContainsTradeOverlays/);
  assertSourceContains(
    healthBody,
    /var candleSpan = getPriceRangeSpan\(candleDataRange\)[\s\S]*scaleSpan > candleSpan \* PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE[\s\S]*candleScaleTooWide/,
    'price-scale health recovery must reset a wide axis when candle bodies are visibly compressed by far XAUUSD levels',
  );
  const manualPanResetBody = source.match(
    /function shouldResetManualVerticalPanForHealth\(reason\) \{[\s\S]*?\n      \}/,
  )?.[0] ?? '';
  assertSourceContains(
    manualPanResetBody,
    /reason === 'update_data_replace_series'[\s\S]*reason === 'recover_data'[\s\S]*reason === 'recover_surface'/,
    'series replacement and surface recovery may clear a manual vertical pan range',
  );
  assert.doesNotMatch(
    manualPanResetBody,
    /overlay_update|overlay_resync/,
    'live overlay updates must NOT clear a user-owned vertical pan range (they fire on every tick and would snap the pan back ~1s after finger-up)',
  );
  assertSourceContains(
    setOverlayBody,
    /applyOverlayPayload\(_overlayPayload\)[\s\S]*schedulePriceScaleHealthCheck\('overlay_update', false, 1\)/,
    'live overlay updates must apply trade lines without re-fitting the candle scale (full recovery caused horizontal blink)',
  );
  assert.doesNotMatch(
    setOverlayBody,
    /scheduleOverlayVisibleCandleScaleRecovery\('overlay_update'\)/,
    'routine setChartOverlays must not re-center the visible candle scale on every trade/P-L push',
  );
  assertSourceContains(
    source,
    /function recoverOverlayVisibleCandleScale\(reason\)[\s\S]*isManualVerticalPanRangePreserved\(\) \|\|[\s\S]*isManualVerticalPanRangeLocked\(\)[\s\S]*resolveVisibleCandleDataPriceRange\(\)[\s\S]*expandPriceRangeForMarketPriceBadges\(candleRange\)[\s\S]*setRecoveredRightPriceRange\(visibleRange\)/,
    'overlay scale recovery must respect a user-owned vertical pan lock and derive the visible range from backend candles without including trade overlays',
  );
  assertSourceContains(
    source,
    /autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo/,
    'every chart series type must use the overlay-aware autoscale provider',
  );
});

test('chart preferences exposes persistent show-on-chart filters', () => {
  // The "Show on chart" section exposes buy/sell visibility, while the chart display
  // trade-level toggle owns the same persisted SL/TP visibility flag.
  assert.match(chartSettingsScreenSource, /CHART_TRADE_VISIBILITY_ITEMS = CHART_SHOW_ON_CHART_ITEMS\.filter/);
  assert.match(chartSettingsScreenSource, /item\.key !== 'slTpLevels'/);
  assert.match(chartSettingsScreenSource, /CHART_TRADE_VISIBILITY_ITEMS\.map/);
  assert.match(chartSettingsScreenSource, /showTradeLevels: 'slTpLevels'/);
  assert.match(chartSettingsScreenSource, /setChartShowOnChartItem\(linkedShowOnChartKey, value\)/);
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
