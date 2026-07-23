import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();
const chartTradeFeatureSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartTradeFeature.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartTradeFeature.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error('ChartTradeFeature.tsx was not found from the test working directory');
  }
  return readFileSync(filePath, 'utf8');
})();
const chartTradeControlsSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartTradeControls.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartTradeControls.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error('ChartTradeControls.tsx was not found from the test working directory');
  }
  return readFileSync(filePath, 'utf8');
})();

const extractAssignedFunctionBody = (sourceText: string, functionName: string): string => {
  const functionStart = sourceText.indexOf(`var ${functionName} = function`);
  assert.notEqual(functionStart, -1, `assigned function ${functionName} was not found`);

  const openBrace = sourceText.indexOf('{', functionStart);
  assert.notEqual(openBrace, -1, `assigned function ${functionName} has no opening brace`);

  let depth = 0;
  for (let index = openBrace; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`assigned function ${functionName} body was not closed`);
};

test('SL and TP preview lines are draggable chart overlays', () => {
  const previewSource = source.slice(
    source.indexOf('const chartTradePreviewLines'),
    source.indexOf('const chartType = chartVisualType'),
  );

  assertSourceContains(previewSource, /const chartTradeSlDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*chartTradePositionStopTarget[\s\S]*: 'sl'/, 'SL preview must expose a drag key only when its broker capability is enabled');
  assertSourceContains(previewSource, /const chartTradeTpDragKey = chartProtectionBackendLocked\s*\? undefined\s*:\s*chartTradePositionStopTarget[\s\S]*: 'tp'/, 'TP preview must expose a drag key only when its broker capability is enabled');
  assertSourceContains(previewSource, /chartTradeSlEnabled[\s\S]*chartTradeSlPrice/, 'SL line must be driven by sheet state');
  assertSourceContains(previewSource, /chartTradeTpEnabled[\s\S]*chartTradeTpPrice/, 'TP line must be driven by sheet state');
  assertSourceContains(previewSource, /id: 'chart-trade-sl-preview'[\s\S]*labelPlacement: 'line'[\s\S]*dragKey: chartTradeSlDragKey/, 'SL preview must draw a full-width guide line');
  assertSourceContains(previewSource, /id: 'chart-trade-tp-preview'[\s\S]*labelPlacement: 'line'[\s\S]*dragKey: chartTradeTpDragKey/, 'TP preview must draw a full-width guide line');
});

test('drag messages from WebView reach chart trade preview state handler', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*handleChartTradePreviewDragMessage\(msg\)/,
    'WebView drag messages must be routed to React state',
  );
  assertSourceContains(
    source,
    /const handleChartTradePreviewDragMessage = useCallback[\s\S]*const dragKey = msg\?\.dragKey[\s\S]*applyChartTradePreviewDragPrice\(dragKey, nextPrice\)/,
    'drag handler must apply the dragged SL/TP price',
  );
  assertSourceContains(
    source,
    /if \(\(dragKey === 'sl' \|\| dragKey === 'tp'\) && chartProtectionBackendLocked\) \{\s*return;\s*\}/,
    'stale SL/TP preview drag messages must be ignored while the broker capability is locked',
  );
});

test('SL and TP drag updates React state during move, not only after release', () => {
  const handlerSource = source.slice(
    source.indexOf('const handleChartTradePreviewDragMessage = useCallback'),
    source.indexOf('const accountFreeMargin'),
  );

  assertSourceContains(handlerSource, /phase !== 'start' && phase !== 'move' && phase !== 'end'/, 'drag handler must accept move events');
  assertSourceContains(handlerSource, /applyChartTradePreviewDragPrice\(dragKey, nextPrice\)/, 'drag move must update sheet state');
  assertSourceContains(
    handlerSource,
    /scheduleChartTradeLineDragMove|phase !== 'move'/,
    'test guard requires the WebView move phase to remain wired',
  );
  if (/if \((?:msg\?\.)?phase !== 'end'\) \{\s*return;\s*\}/.test(handlerSource)) {
    throw new Error('drag handler must not wait until end before updating SL/TP price');
  }
});

test('SL and TP drag keeps touch ownership until release', () => {
  assertSourceContains(
    source,
    /var getClampedRelativePoint = function\(clientX, clientY\)/,
    'drag movement must clamp inside the chart instead of dropping when the finger reaches an edge',
  );
  assertSourceContains(
    source,
    /var getTradeLineDragPoint = function\(clientX, clientY\)[\s\S]*maxVerticalOverscroll[\s\S]*clientY - rect\.top/,
    'active line drag must keep an unclamped vertical coordinate so top/bottom edge movement does not freeze',
  );
  assertSourceContains(
    source,
    /beginTradeLineDrag[\s\S]*setPointerCapture\(event\.pointerId\)/,
    'drag start must capture the pointer so the chart pan handler cannot steal the gesture',
  );
  assertSourceContains(
    source,
    /resolveTradeLineDragHitFromEvent[\s\S]*getClampedRelativePoint\(pointFromEvent\.x, pointFromEvent\.y\)/,
    'drag start must tolerate touches on the price-scale edge',
  );
  assertSourceContains(
    source,
    /continueTradeLineDrag[\s\S]*getTradeLineDragPoint\(pointFromEvent\.x, pointFromEvent\.y\)/,
    'drag move must continue using the edge-safe drag coordinate',
  );
  assertSourceContains(
    source,
    /finishTradeLineDrag[\s\S]*releasePointerCapture\(drag\.pointerId\)/,
    'drag end must release pointer capture',
  );
  assertSourceContains(
    source,
    /var listenerOptions = \{ capture: true, passive: false \}/,
    'mobile chart listeners must be non-passive so preventDefault can stop competing scroll/pan work',
  );
  assertSourceContains(
    source,
    /window\.addEventListener\('touchmove', onWindowPointerMove, listenerOptions\)/,
    'touch fallback must keep drag move ownership even if the WebView target changes',
  );
  assertSourceContains(
    source,
    /window\.addEventListener\('pointermove', onWindowPointerMove, listenerOptions\)/,
    'pointer-event WebViews must keep drag move ownership when the finger crosses chart edges',
  );
  assertSourceContains(
    source,
    /window\.addEventListener\('pointerup', onWindowPointerUp, listenerOptions\)[\s\S]*window\.addEventListener\('pointercancel', onWindowPointerCancel, listenerOptions\)/,
    'pointer-event WebViews must finish active line drags even when release/cancel is missed by the chart element',
  );
  assertSourceContains(
    source,
    /window\.addEventListener\('touchend', onWindowPointerUp, listenerOptions\)[\s\S]*window\.addEventListener\('touchcancel', onWindowPointerCancel, listenerOptions\)/,
    'touch fallback must finish active line drags even when release/cancel is missed by the chart element',
  );
  assertSourceContains(
    source,
    /window\.removeEventListener\('touchmove', onWindowPointerMove, listenerOptions\)/,
    'touch fallback window listeners must be cleaned up with chart listeners',
  );
  assertSourceContains(
    source,
    /window\.removeEventListener\('pointermove', onWindowPointerMove, listenerOptions\)[\s\S]*window\.removeEventListener\('pointerup', onWindowPointerUp, listenerOptions\)[\s\S]*window\.removeEventListener\('pointercancel', onWindowPointerCancel, listenerOptions\)/,
    'pointer fallback window listeners must be cleaned up with chart listeners',
  );
});

test('SL and TP drag keeps moving at the top and bottom chart boundaries', () => {
  const resolveDragPriceBody = extractAssignedFunctionBody(source, 'resolveTradeLineDragPrice');
  const continueDragBody = extractAssignedFunctionBody(source, 'continueTradeLineDrag');

  assertSourceContains(
    resolveDragPriceBody,
    /series\.coordinateToPrice\(point\.y\)[\s\S]*activeTradeLineDrag && activeTradeLineDrag\.priceScaleRangeLock[\s\S]*lock\.to - normalizedY \* \(lock\.to - lock\.from\)/,
    'drag price resolution must fall back to the locked price range when edge coordinates stop producing chart prices',
  );
  assertSourceContains(
    continueDragBody,
    /var nextPrice = resolveTradeLineDragPrice\(point\)/,
    'drag movement must use the edge-safe price resolver instead of freezing on invalid edge coordinates',
  );
});

test('SL and TP drag keeps candles fixed while moving vertically', () => {
  const beginDragBody = extractAssignedFunctionBody(source, 'beginTradeLineDrag');
  const continueDragBody = extractAssignedFunctionBody(source, 'continueTradeLineDrag');
  const finishDragBody = extractAssignedFunctionBody(source, 'finishTradeLineDrag');
  const captureLockBody = extractAssignedFunctionBody(source, 'captureTradeLineDragPriceScaleLock');
  const keepLockBody = extractAssignedFunctionBody(source, 'keepTradeLineDragPriceScaleLocked');

  assertSourceContains(
    captureLockBody,
    /priceScaleApi\.getVisibleRange\(\)[\s\S]*priceScaleApi\.setAutoScale\(false\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: lock\.from, to: lock\.to \}\)/,
    'drag start must capture and pin the current price-scale range before SL/TP movement',
  );
  assertSourceContains(
    keepLockBody,
    /priceScaleApi\.setAutoScale\(false\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: lock\.from, to: lock\.to \}\)/,
    'drag move must be able to re-apply the same price-scale range so candles do not pan or rescale',
  );
  assertSourceContains(
    beginDragBody,
    /priceScaleRangeLock: captureTradeLineDragPriceScaleLock\(\)/,
    'active SL/TP drag state must store the captured chart price-scale range',
  );
  assertSourceContains(
    beginDragBody,
    /suspendChartTouchInteractions\(\)[\s\S]*vertPanState = null[\s\S]*vertPanPending = null/,
    'starting SL/TP drag must cancel custom candle vertical pan state',
  );
  assertSourceContains(
    continueDragBody,
    /updateDraggedOverlayLinePreview\(activeTradeLineDrag\.dragKey, nextPrice\)[\s\S]*keepTradeLineDragPriceScaleLocked\(activeTradeLineDrag\.priceScaleRangeLock\)[\s\S]*stopChartEvent\(event\)/,
    'SL/TP vertical movement must update only the line and then keep the candle scale fixed',
  );
  assertSourceContains(
    finishDragBody,
    /keepTradeLineDragPriceScaleLocked\(drag\.priceScaleRangeLock\)[\s\S]*postChartTradeLineDrag\('end', drag\.dragKey, roundOverlayDragPrice\(drag\.lastPrice\) \|\| drag\.lastPrice\)/,
    'SL/TP drag release must finish without allowing a final chart rescale',
  );
});

test('SL and TP drag coalesces native move messages for smooth WebView movement', () => {
  const scheduleMoveBody = extractFunctionBody(source, 'scheduleChartTradeLineDragMove');
  const flushMoveBody = extractFunctionBody(source, 'flushChartTradeLineDragMove');
  const continueDragBody = extractAssignedFunctionBody(source, 'continueTradeLineDrag');

  assertSourceContains(
    source,
    /var CHART_TRADE_LINE_DRAG_NATIVE_MOVE_INTERVAL_MS = 96/,
    'drag move bridge updates must be rate limited well below local WebView movement',
  );
  assertSourceContains(
    scheduleMoveBody,
    /pendingChartTradeLineDragMove = \{ dragKey: dragKey, price: price \}/,
    'drag move must keep only the latest pending native update',
  );
  assertSourceContains(
    scheduleMoveBody,
    /requestAnimationFrame\(flushChartTradeLineDragMove\)/,
    'drag move must coalesce native bridge posts on animation frames',
  );
  assertSourceContains(
    flushMoveBody,
    /postChartTradeLineDrag\('move', pending\.dragKey, pending\.price\)/,
    'coalesced move flush must still update React state during drag',
  );
  assertSourceContains(
    continueDragBody,
    /updateDraggedOverlayLinePreview\(activeTradeLineDrag\.dragKey, nextPrice\)[\s\S]*var nativeMovePrice = roundOverlayDragPrice\(nextPrice\)[\s\S]*scheduleChartTradeLineDragMove\(activeTradeLineDrag\.dragKey, nativeMovePrice\)/,
    'local WebView line movement must use the raw coordinate price while native state sync receives the rounded price',
  );
});

test('SL and TP drag throttles label redraw separately from the local line movement', () => {
  const updatePreviewBody = extractFunctionBody(source, 'updateDraggedOverlayLinePreview');
  const continueDragStart = source.indexOf('var continueTradeLineDrag = function');
  const continueDragEnd = source.indexOf('var finishTradeLineDrag = function');
  assert.notEqual(continueDragStart, -1, 'continueTradeLineDrag assignment must exist');
  assert.notEqual(continueDragEnd, -1, 'finishTradeLineDrag assignment must exist');
  const continueDragBody = source.slice(continueDragStart, continueDragEnd);
  const domRefreshBody = extractFunctionBody(source, 'scheduleTradeLineDragDomRefresh');

  assertSourceContains(
    source,
    /var CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS = 16/,
    'drag label redraws must be throttled separately from price-line movement',
  );
  assertSourceContains(
    updatePreviewBody,
    /entry\.api\.applyOptions\(\{[\s\S]*price: price[\s\S]*\}\)[\s\S]*scheduleTradeLineDragDomRefresh\(\)/,
    'local price-line preview must move immediately and defer label redraw work',
  );
  assert.doesNotMatch(
    continueDragBody,
    /scheduleOverlayDomRefresh\(\)/,
    'pointermove must not rebuild all overlay DOM labels on every drag event',
  );
  assertSourceContains(
    domRefreshBody,
    /CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS - \(now - lastChartTradeLineDragDomRefreshAt\)/,
    'drag label redraws must be time-throttled while the finger is moving',
  );
});

test('SL and TP drag moves the line while keeping right-axis badges hidden', () => {
  const updatePreviewBody = extractFunctionBody(source, 'updateDraggedOverlayLinePreview');

  assertSourceContains(
    updatePreviewBody,
    /entry\.api\.applyOptions\(\{\s*price: price,\s*axisLabelVisible: false,\s*title: '',\s*\}\)/,
    'local SL/TP drag preview must move the price line without painting a right-axis badge',
  );
});

test('SL and TP drag preserves the active WebView price while native overlays resync', () => {
  const setOverlayBody = extractFunctionBody(source, 'setChartOverlays');
  const updatePreviewBody = extractFunctionBody(source, 'updateDraggedOverlayLinePreview');

  assertSourceContains(
    source,
    /function preserveActiveTradeLineDragPayload\(payload\)[\s\S]*price: activeTradeLineDrag\.lastPrice/,
    'incoming overlay payloads during drag must keep the local finger price',
  );
  assertSourceContains(
    setOverlayBody,
    /nextOverlayPayload = preserveActiveTradeLineDragPayload\(nextOverlayPayload\)/,
    'setChartOverlays must preserve active drag price before caching payload',
  );
  assertSourceContains(
    updatePreviewBody,
    /syncOverlayPayloadDragLinePrice\(dragKey, price\)[\s\S]*entry\.api\.applyOptions\(\{[\s\S]*price: price[\s\S]*\}\)/,
    'local WebView preview must update the cached label payload and price line without recreating overlays',
  );
});

test('pending chart CTA submits the pending order and then exposes chart-side levels', () => {
  const handlerSource = source.slice(
    source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback'),
    source.indexOf('const handleToggleChartTradeSheetMode', source.indexOf('const handleSubmitPendingTradeFromSheet = useCallback')),
  );

  assertSourceContains(
    handlerSource,
    /if \(isPendingOrderTypeBackendLocked\(chartTradeOrderType\)\) \{\s*return;\s*\}/,
    'pending CTA must fail closed until backend readiness is explicitly enabled',
  );
  assertSourceContains(
    handlerSource,
    /ordersApi\.placePendingOrder\(payload\)/,
    'pending CTA must submit to the pending-order API',
  );
  assertSourceContains(
    handlerSource,
    /price_sl: chartTradeSlPrice/,
    'pending CTA must include enabled SL price',
  );
  assertSourceContains(
    handlerSource,
    /price_tp: chartTradeTpPrice/,
    'pending CTA must include enabled TP price',
  );
  assertSourceContains(
    handlerSource,
    /refetchOrders\(\)/,
    'pending CTA must refresh order overlays after success',
  );
  assertSourceContains(
    handlerSource,
    /snapTradeSheet\('collapsed'\)/,
    'pending CTA must expose chart-side draggable levels after submission',
  );
  if (/Pending Order Preview|Chart-side pending submission is still preview-only in this build|Alert\.alert/.test(handlerSource)) {
    throw new Error('pending CTA must not show the old preview-only blocking alert');
  }
});

test('collapsed SL/TP sheet keeps full frame height and translateY so header tabs stay visible', () => {
  assertSourceContains(
    source,
    /const chartTradeSheetCollapsedHeight = 186/,
    'collapsed SL/TP height must fit handle + symbol header + order-type tabs',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /sheet\.chartTradeSheetAnimatedStyle,/,
    'SL/TP sheet must always apply translateY (including collapsed mode)',
  );
  assert.doesNotMatch(
    chartTradeFeatureSource,
    /chartTradeSheetMode !== 'collapsed' && sheet\.chartTradeSheetAnimatedStyle/,
    'must not disable translateY while the SL/TP sheet is collapsed',
  );
});

test('collapsed SL/TP sheet drag gesture covers the pinned header surface', () => {
  const visibleSheetStart = chartTradeFeatureSource.indexOf('{mountTradeSheet ? (');
  const visibleSheetBodyStart = chartTradeFeatureSource.indexOf('{showSheetBody ? (', visibleSheetStart);
  assert.notEqual(visibleSheetStart, -1, 'visible chart trade sheet branch was not found');
  assert.notEqual(visibleSheetBodyStart, -1, 'visible chart trade sheet body branch was not found');

  const visibleSheetHeaderSource = chartTradeFeatureSource.slice(visibleSheetStart, visibleSheetBodyStart);
  assertSourceContains(
    visibleSheetHeaderSource,
    /<GestureDetector gesture=\{sheet\.chartTradeSheetDragGesture\}>[\s\S]*<ChartTradeSheetDragHeader[\s\S]*<ChartTradeSheetPinnedHeader/,
    'SL/TP sheet drag gesture must cover the visible pinned header, not only the tiny handle',
  );

  const dragDetectorCount =
    visibleSheetHeaderSource.match(/<GestureDetector gesture=\{sheet\.chartTradeSheetDragGesture\}>/g)?.length ?? 0;
  assert.equal(dragDetectorCount, 1, 'visible sheet header should use one gesture detector around handle and header');
  assertSourceContains(
    chartTradeFeatureSource,
    /const mountTradeSheet = !!\(sheet\.mountChartTradeSheet \|\| sheet\.showChartTradeSheet\)/,
    'trade sheet layer must support pre-mount while Chart is focused',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /pointerEvents=\{sheet\.showChartTradeSheet \? 'box-none' : 'none'\}/,
    'pre-mounted SL/TP sheet must not intercept touches while hidden',
  );
});

test('tap menu is suppressed while lot input or picker interaction is active', () => {
  assertSourceContains(
    source,
    /shouldSuppressChartTapMenu\(\{[\s\S]*footerLotEditorFocused[\s\S]*footerLotEditorOpening[\s\S]*footerLotPickerOpen: footerLotPickerMode !== null[\s\S]*suppressUntil: chartTapMenuSuppressUntilRef\.current/,
    'chart tap menu must not fight active lot editing interactions',
  );
});

test('toolbar SL/TP shows a disabled lock until backend readiness while preserving the sheet', () => {
  const openHandlerStart = source.indexOf('const handleOpenChartTradeSheet = useCallback');
  const openHandlerEnd = source.indexOf('const scrollChartTradeTypeTabsToOrderType', openHandlerStart);
  assert.notEqual(openHandlerStart, -1, 'SL/TP toolbar open handler was not found');
  assert.notEqual(openHandlerEnd, -1, 'SL/TP toolbar open handler end was not found');

  const openHandlerSource = source.slice(openHandlerStart, openHandlerEnd);
  assertSourceContains(
    openHandlerSource,
    /runImmediateAction\('chart\.tradeSheet\.open'[\s\S]*if \(isChartTradeProtectionBackendLocked\(\)\) \{\s*return;\s*\}[\s\S]*openChartTradeSheet\(\);/,
    'SL/TP toolbar handler must use the order-type-specific broker capability before opening',
  );
  assert.doesNotMatch(openHandlerSource, /Alert\.alert/);
  assert.doesNotMatch(
    openHandlerSource,
    /requestAnimationFrame/,
    'SL/TP toolbar action must not defer opening until a later frame',
  );
  // Visual snap first; panel resets may wait one frame so they cannot block open.
  const openSheetStart = source.indexOf('const openChartTradeSheet = useCallback');
  const openSheetEnd = source.indexOf('const handleOpenChartTradeSheet', openSheetStart);
  const openSheetSource = source.slice(openSheetStart, openSheetEnd);
  assertSourceContains(
    openSheetSource,
    /snapTradeSheet\('expanded'\);[\s\S]*resetChartTradePanelLevels/,
    'SL/TP must snap expanded (scrollable body + trade actions) into view before panel level resets',
  );
  assertSourceContains(
    source,
    /mountChartTradeSheet: isScreenFocused && !isChartExpanded/,
    'SL/TP sheet must stay pre-mounted while Chart is focused',
  );
  assertSourceContains(
    source,
    /accessibilityLabel=\{chartSlTpBackendLocked \? 'SL\/TP locked' : 'SL\/TP'\}[\s\S]*accessibilityState=\{\{ disabled: chartSlTpBackendLocked \}\}[\s\S]*disabled=\{chartSlTpBackendLocked\}[\s\S]*styles\.toolbarTradeButtonLocked[\s\S]*onPressIn=\{handleOpenChartTradeSheet\}[\s\S]*<Ionicons name="lock-closed" size=\{10\}/,
    'SL/TP toolbar must visibly lock and disable interaction while the backend is unavailable',
  );

  const stylesPath = (() => {
    const candidates = [
      resolve(process.cwd(), 'src/features/chart/ChartScreen.styles.ts'),
      resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.styles.ts'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  })();
  assert.ok(stylesPath, 'ChartScreen.styles.ts was not found from the test working directory');
  const stylesSource = readFileSync(stylesPath, 'utf8');

  assertSourceContains(
    stylesSource,
    /toolbarTradeButton: \{[\s\S]*width: '100%'[\s\S]*minHeight: 44[\s\S]*flexDirection: 'row'[\s\S]*gap: 2/,
    'SL/TP toolbar touch target must fill its slot with a reliable mobile tap height',
  );
  assertSourceContains(
    stylesSource,
    /toolbarTradeButtonLocked: \{[\s\S]*opacity: 0\.58/,
    'locked SL/TP toolbar styling must communicate its unavailable state',
  );
});

test('chart trade sheet keeps Market Execution available and locks pending order tabs', () => {
  const selectHandlerStart = source.indexOf('const handleChartTradeOrderTypeSelect = useCallback');
  const selectHandlerEnd = source.indexOf('useEffect(() => {', selectHandlerStart);
  assert.notEqual(selectHandlerStart, -1, 'chart order type handler was not found');
  assert.notEqual(selectHandlerEnd, -1, 'chart order type handler boundary was not found');

  const selectHandlerSource = source.slice(selectHandlerStart, selectHandlerEnd);
  assertSourceContains(
    selectHandlerSource,
    /if \(isPendingOrderTypeBackendLocked\(orderType\)\) \{\s*return;\s*\}[\s\S]*setChartTradeOrderType\(orderType\)/,
    'pending order type must not change selection before backend readiness',
  );
  assert.equal(
    chartTradeFeatureSource.match(/const isBackendLocked = isPendingOrderTypeBackendLocked\(option\)/g)?.length,
    2,
    'both chart order-tab render paths must resolve the backend lock',
  );
  assert.equal(
    chartTradeFeatureSource.match(/disabled=\{isBackendLocked\}/g)?.length,
    2,
    'both chart order-tab render paths must disable locked pending tabs',
  );
  assert.equal(
    chartTradeFeatureSource.match(/<Ionicons name="lock-closed" size=\{13\}/g)?.length,
    2,
    'both chart order-tab render paths must show a lock icon',
  );
});

test('expanded SL/TP sheet maximum height keeps only a small gap below the compact chart toolbar', () => {
  assertSourceContains(
    source,
    /CHART_TRADE_COMPACT_SHEET_TOP_GAP/,
    'compact SL/TP sheet must use the compact top-gap constant',
  );
  assertSourceContains(
    source,
    /const chartTradeSheetToolbarBottomInset =[\s\S]*: isChartExpanded[\s\S]*\? fullscreenChartTradeSheetTopInset[\s\S]*: 0;/,
    'normal chart SL/TP sheet host already starts below the compact toolbar, so it must not subtract the header height again',
  );
  assertSourceContains(
    source,
    /const chartTradeSheetTopGap = isChartExpanded[\s\S]*\? CHART_TRADE_SHEET_TOP_GAP[\s\S]*: CHART_TRADE_COMPACT_SHEET_TOP_GAP;/,
    'normal chart SL/TP sheet must keep only a small visual gap below the compact toolbar',
  );
  assertSourceContains(
    source,
    /const \[chartTradeSheetHostTopOffset, setChartTradeSheetHostTopOffset\] = useState\(0\);/,
    'normal chart SL/TP sheet must track where the overlay host starts relative to the compact toolbar',
  );
  assertSourceContains(
    source,
    /const chartTradeSheetTopInset = resolveChartTradeSheetTopInset\(\{[\s\S]*compactHeaderHeight: chartTradeCompactHeaderHeight,[\s\S]*hostTopOffset: chartTradeSheetHostTopOffset,[\s\S]*\}\);/,
    'normal chart SL/TP sheet must compensate if the host overlaps the timeframe-to-more toolbar',
  );
  assertSourceContains(
    source,
    /chartTradeHostRef\.current\.measureInWindow\(\(_x, y, _width, height\) => \{[\s\S]*const nextTopOffset = Math\.max\(0, Math\.round\(y\)\);[\s\S]*setChartTradeSheetHostTopOffset/,
    'chart trade host window measurement must keep its top offset fresh for the expanded sheet cap',
  );
  assertSourceContains(
    source,
    /isChartExpanded && chartTradeTopToolbarBottomOffset > 0/,
    'compact chart SL/TP sheet must not apply fullscreen toolbar offsets in normal mode',
  );
  const constantsPath = (() => {
    const candidates = [
      resolve(process.cwd(), 'src/features/chart/ChartScreen.constants.ts'),
      resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.constants.ts'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  })();
  assert.ok(constantsPath, 'ChartScreen.constants.ts was not found from the test working directory');
  const constantsSource = readFileSync(constantsPath, 'utf8');
  assertSourceContains(
    constantsSource,
    /CHART_TRADE_COMPACT_SHEET_TOP_GAP = 4/,
    'compact chart SL/TP sheet must leave only a small 4px gap under the top toolbar',
  );
});

test('trade sheet volume lot value is manually editable without opening only the stepper', () => {
  assertSourceContains(
    source,
    /const \[chartTradeVolumeDraft, setChartTradeVolumeDraft\] = useState/,
    'trade sheet volume must keep a typed lot draft',
  );
  assertSourceContains(
    source,
    /<TextInput[\s\S]*value=\{chartTradeVolumeInputFocused \? chartTradeVolumeDraft : chartTradeVolumePrimaryDisplay\}[\s\S]*onFocus=\{handleFocusChartTradeVolumeInput\}[\s\S]*onChangeText=\{handleChartTradeVolumeDraftChange\}[\s\S]*keyboardType="decimal-pad"/,
    'chart screen trade sheet volume must render an editable numeric input',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /<TextInput[\s\S]*value=\{sheet\.chartTradeVolumeInputFocused \? sheet\.chartTradeVolumeDraft : sheet\.chartTradeVolumePrimaryDisplay\}[\s\S]*onFocus=\{handlers\.onFocusTradeVolumeInput\}[\s\S]*onChangeText=\{handlers\.onChangeTradeVolumeDraft\}[\s\S]*keyboardType="decimal-pad"/,
    'extracted trade sheet volume must render an editable numeric input',
  );
  if (/<Pressable[\s\S]*styles\.chartTradeVolumeCard[\s\S]*onPress=\{handleOpenChartTradeVolumeStepper\}/.test(source)) {
    throw new Error('chart screen volume card must not be a Pressable that steals manual lot editing');
  }
  if (/<Pressable[\s\S]*styles\.chartTradeVolumeCard[\s\S]*onPress=\{handlers\.onOpenVolumeStepper\}/.test(chartTradeFeatureSource)) {
    throw new Error('extracted volume card must not be a Pressable that steals manual lot editing');
  }
});

test('volume stepper modal center value is manually editable', () => {
  assertSourceContains(
    chartTradeControlsSource,
    /editable = false[\s\S]*const \[draft, setDraft\] = React\.useState/,
    'stepper modal must keep a typed draft for editable numeric values',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /<TextInput[\s\S]*value=\{draft\}[\s\S]*onChangeText=\{handleDraftChange\}[\s\S]*keyboardType="decimal-pad"[\s\S]*selectTextOnFocus/,
    'editable stepper modal value must be a decimal-pad TextInput',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /const commitValue = \(\) => \{[\s\S]*const nextValue = editable \? commitDraft\(\) : value[\s\S]*onCommit\(nextValue\)/,
    'editable stepper modal OK action must commit the typed value',
  );
  assertSourceContains(
    source,
    /<ChartStepperModal[\s\S]*editable=\{chartStepperEditor\?\.kind === 'volume'\}/,
    'only the volume chart stepper should enable manual modal input',
  );
});

test('SL/TP sheet volume slider keeps local drag smooth and coalesces volume commits', () => {
  assertSourceContains(
    chartTradeControlsSource,
    /import \{ Gesture, GestureDetector \} from 'react-native-gesture-handler'[\s\S]*useAnimatedStyle[\s\S]*useSharedValue/,
    'volume slider must use the native gesture/Reanimated path for smooth local movement',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /const sliderValueShared = useSharedValue\(value\)[\s\S]*const trackWidthShared = useSharedValue\(0\)|const trackWidthShared = useSharedValue\(0\)[\s\S]*const sliderValueShared = useSharedValue\(value\)/,
    'volume slider must keep the in-flight drag value on the UI thread',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /const flushPendingCommit = React\.useCallback\(\(\) => \{[\s\S]*onChangeRef\.current\(nextValue\)/,
    'volume slider must commit the latest pending value through a stable callback',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /commitFrameRef\.current = requestAnimationFrame\(flushPendingCommit\)/,
    'volume slider move commits must be coalesced on animation frames',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /Gesture\.Pan\(\)[\s\S]*\.minDistance\(0\)[\s\S]*\.onUpdate\(\(event\) => \{[\s\S]*sliderValueShared\.value = nextValue[\s\S]*runOnJS\(scheduleCommit\)\(nextValue, false\)/,
    'volume slider must move the thumb locally during drag and coalesce JS commits',
  );
  assertSourceContains(
    chartTradeControlsSource,
    /<GestureDetector gesture=\{sliderGesture\}>[\s\S]*<Animated\.View style=\{\[styles\.chartTradeSliderFill, animatedFillStyle\]\} \/>[\s\S]*<Animated\.View[\s\S]*styles\.chartTradeSliderThumb[\s\S]*animatedThumbStyle/,
    'volume slider fill and thumb must render from animated UI-thread styles',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /handlers\.onOpenVolumeStepper\(\);[\s\S]*unstable_pressDelay=\{0\}[\s\S]*activateOnPressIn/,
    'extracted volume stepper launcher must open from press-in for a fast picker response',
  );
  assertSourceContains(
    source,
    /runImmediateAction\('chart\.tradeSheet\.stepper\.volume'[\s\S]*unstable_pressDelay=\{0\}[\s\S]*activateOnPressIn/,
    'native volume stepper launcher must keep the same fast press-in behavior',
  );
});

test('SL/TP sheet volume input keeps numeric value vertically unclipped', () => {
  const stylesPath = (() => {
    const candidates = [
      resolve(process.cwd(), 'src/features/chart/ChartScreen.styles.ts'),
      resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.styles.ts'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  })();
  assert.ok(stylesPath, 'ChartScreen.styles.ts was not found from the test working directory');
  const stylesSource = readFileSync(stylesPath, 'utf8');

  assertSourceContains(
    stylesSource,
    /chartTradeVolumeInput: \{[\s\S]*paddingVertical: 0[\s\S]*textAlignVertical: 'center'[\s\S]*lineHeight: 20/,
    'SL/TP volume TextInput must explicitly center numeric text without Android default vertical padding',
  );
  assertSourceContains(
    stylesSource,
    /chartTradeVolumeInputPending: \{[\s\S]*height: 42[\s\S]*lineHeight: 22/,
    'expanded SL/TP volume TextInput must be tall enough for the bold lot value',
  );
});

test('SL/TP sheet comment editor accepts typing immediately and applies cleanly', () => {
  assertSourceContains(
    source,
    /const handleSubmitChartTradeComment = useCallback\(\(\) => \{[\s\S]*setChartTradeCommentFocused\(false\);[\s\S]*Keyboard\.dismiss\(\);/,
    'comment apply must leave edit mode and dismiss the keyboard',
  );
  assertSourceContains(
    source,
    /const handleBlurChartTradeComment = useCallback\(\(\) => \{[\s\S]*Platform\.OS === 'android' && showChartTradeSheet[\s\S]*chartTradeCommentInputRef\.current\?\.focus\(\);[\s\S]*return;[\s\S]*setChartTradeCommentFocused\(false\);[\s\S]*\}, \[showChartTradeSheet\]\);/,
    'Android comment blur while the keyboard is visible must refocus instead of closing the editor during typing',
  );
  assertSourceContains(
    source,
    /<TextInput[\s\S]*ref=\{chartTradeCommentInputRef\}[\s\S]*autoFocus[\s\S]*showSoftInputOnFocus[\s\S]*value=\{chartTradeComment\}[\s\S]*onChangeText=\{\(text\) => setChartTradeComment\(text\.slice\(0, 50\)\)\}/,
    'native inline comment editor must focus immediately so first typed characters enter the field',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /<TextInput[\s\S]*ref=\{sheet\.chartTradeCommentInputRef\}[\s\S]*autoFocus[\s\S]*showSoftInputOnFocus[\s\S]*value=\{sheet\.chartTradeComment\}[\s\S]*onChangeText=\{handlers\.onChangeComment\}/,
    'extracted inline comment editor must keep the same immediate focus behavior',
  );
});

test('compact footer lot editing does not add an Android pre-keyboard lift gap', () => {
  assertSourceContains(
    chartTradeFeatureSource,
    /const resolvedTradeFooterDockBottom = resolveFooterTradeDockBottom\(\{[\s\S]*platform: Platform\.OS,[\s\S]*androidFocusedLotEditorBottomGap: FOOTER_TRADE_DOCK_ANDROID_BOTTOM_SAFE_GAP/,
    'footer lot editing must not jump upward on Android before keyboard layout settles',
  );
  assertSourceContains(
    source,
    /floatingFooterTradeReserveHeight\.value = withTiming\([\s\S]*isFloatingFooterTradeRowVisible \? CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT : 0/,
    'footer reserve must use the shared compact footer height and only animate upward when the floating dock is actually visible',
  );
  assertSourceContains(
    source,
    /hideInlineTradeRow=\{Platform\.OS === 'android' && isFloatingFooterTradeRowVisible\}/,
    'Android must keep the inline editable lot row in place until keyboard metrics are available',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /const isAndroidFloatingFooterLotEditor =[\s\S]*Platform\.OS === 'android'[\s\S]*footer\.footerLotEditorFocused[\s\S]*footer\.showFloatingFooterTradeRow/,
    'Android compact lot editing must have a dedicated floating dock positioning branch',
  );
  assertSourceContains(
    chartTradeFeatureSource,
    /const fallbackTradeFooterDockBottom = isAndroidFloatingFooterLotEditor[\s\S]*\? FOOTER_TRADE_DOCK_ANDROID_BOTTOM_SAFE_GAP[\s\S]*: footer\.footerTradeRowKeyboardOffset/,
    'Android compact lot editing must not apply the first keyboard offset as an extra dock lift',
  );
});

test('SL and TP drag starts only after a short deliberate hold', () => {
  assertSourceContains(
    source,
    /var CHART_TRADE_LINE_DRAG_HOLD_MS = 300/,
    'SL/TP drag must require a short hold before moving the line',
  );
  assertSourceContains(
    source,
    /shouldDelayTradeLineDragForHold[\s\S]*dragKey === 'sl'[\s\S]*dragKey === 'tp'[\s\S]*\^position-stop:\(sl\|tp\):/,
    'new-trade and open-position SL/TP lines must be hold-gated',
  );
  assertSourceContains(
    source,
    /scheduleTradeLineDragHold[\s\S]*setTimeout\(function\(\)[\s\S]*beginTradeLineDrag\(pending\.event, pending\.hit\)[\s\S]*CHART_TRADE_LINE_DRAG_HOLD_MS/,
    'line drag must start from the hold timer instead of pointer-down',
  );
  assertSourceContains(
    source,
    /cancelPendingTradeLineHoldIfMoved[\s\S]*TRADE_LINE_HOLD_MOVE_CANCEL_PX/,
    'moving before the hold completes must cancel the pending SL/TP drag',
  );
  assertSourceContains(
    source,
    /var onPointerDown = function\(event\)[\s\S]*resolveTradeLineDragHitFromEvent\(event\)[\s\S]*scheduleTradeLineDragHold\(event, tradeLineHit\)/,
    'pointer-down must schedule the hold gate for SL/TP lines',
  );
});

test('compact footer lot editing keeps the chart viewport from shrinking under Android keyboard resize', () => {
  assertSourceContains(
    source,
    /const shouldFreezeFooterLotChartViewport =[\s\S]*!showChartTradeSheet[\s\S]*footerLotEditorFocused \|\| footerLotEditorOpening \|\| keyboardVisibleHeight > 0/,
    'footer lot editing must request chart viewport freeze during keyboard resize',
  );
  assertSourceContains(
    source,
    /const frozenFooterLotChartViewportStyle =[\s\S]*shouldFreezeFooterLotChartViewport && chartTapMenuBounds\.height > 0[\s\S]*\{ minHeight: chartTapMenuBounds\.height \}/,
    'chart viewport must keep its previous height while compact lot editing is active',
  );
  assertSourceContains(
    source,
    /const freezeViewportResize =[\s\S]*shouldFreezeChartViewportResize[\s\S]*height < lastChartViewportSizeRef\.current\.height/,
    'WebView resize injection must ignore keyboard-shrink layouts during lot editing',
  );
});

test('trade footer dock keeps a stable keyboard clearance via static paddingBottom', () => {
  // The Sell/Lot/Buy row sits at `bottom: 0` while the lot editor is focused
  // on Android (Android `adjustResize` lifts the dock above the keyboard).
  // To prevent the row from sitting flush against the keyboard top we keep a
  // small static `paddingBottom` inside the dock style itself. Static padding
  // is the stable solution: it is identical whether the keyboard is open or
  // closed, so tapping the lot input mid-cell can never produce a vertical
  // jump as the focus event flips state.
  const stylesPath = (() => {
    const candidates = [
      resolve(process.cwd(), 'src/features/chart/ChartScreen.styles.ts'),
      resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.styles.ts'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  })();
  assert.ok(stylesPath, 'ChartScreen.styles.ts was not found from the test working directory');
  const stylesSource = readFileSync(stylesPath, 'utf8');
  const constantsPath = (() => {
    const candidates = [
      resolve(process.cwd(), 'src/features/chart/ChartScreen.constants.ts'),
      resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.constants.ts'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  })();
  assert.ok(constantsPath, 'ChartScreen.constants.ts was not found from the test working directory');
  const constantsSource = readFileSync(constantsPath, 'utf8');

  assertSourceContains(
    stylesSource,
    /footerTradeDock: \{[\s\S]*paddingBottom: 2[0-9]/,
    'footerTradeDock must keep a static paddingBottom (>=20) so the trade row clears the keyboard',
  );
  assertSourceContains(
    constantsSource,
    /CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT = 72/,
    'footer fallback/reserve height must cover the fixed 40px trade row plus dock top/bottom clearance',
  );
  // Negative pin: the dock must not regress to flush-against-keyboard.
  if (/footerTradeDock: \{[\s\S]*paddingBottom: 0[\s,]/.test(stylesSource)) {
    throw new Error(
      'footerTradeDock paddingBottom must not be 0 — that lets the trade row sit flush against the keyboard top.',
    );
  }
});

test('opening SL/TP sheet closes lot picker and lot editor state', () => {
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(showChartTradeSheet\)[\s\S]*setFooterLotPickerMode\(null\)[\s\S]*setFooterLotEditorFocused\(false\)[\s\S]*setFooterLotEditorOpening\(false\)/,
    'SL/TP sheet must clear footer lot editing state',
  );
});
