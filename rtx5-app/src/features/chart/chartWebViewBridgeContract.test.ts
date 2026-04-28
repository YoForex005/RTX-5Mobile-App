import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

const source = readChartScreenSource();

test('webview bridge: ChartScreen initializes chart only after WebView READY enables bridge', () => {
  assertSourceContains(source, /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/, 'READY must reset bridge state and enable WebView');
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*if \(!webViewRef\.current \|\| !webViewReady\) return/, 'sendInit must wait for WebView readiness');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*sendInit\(\);[\s\S]*\}, \[candles, sendInit\]\)/, 'candle arrival must trigger init after READY');
});

test('webview bridge: candles arriving before READY are retained and sent after readiness', () => {
  assertSourceContains(source, /const candlesRef = useRef\(candles\)/, 'candles must be retained outside render timing');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*candlesRef\.current = candles;[\s\S]*\}, \[[^\]]*candles[^\]]*\]\)/, 'latest candles must update the retained ref');
  assertSourceContains(source, /const data = candlesRef\.current[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\][\s\S]*initChart\(/, 'sendInit must initialize the chart shell even before candles arrive');
});

test('webview bridge: zero-size WebView init is deferred and retried from rAF and ResizeObserver', () => {
  const initBody = extractFunctionBody(source, 'initChart');
  const doInitBody = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(initBody, /requestAnimationFrame\(function\(\)/, 'initChart must wait for layout frame before measuring');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*opts:[\s\S]*chartType:[\s\S]*data:/, 'zero-size init must preserve pending payload');
  assertSourceContains(source, /new ResizeObserver\(function\(entries\)[\s\S]*if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'ResizeObserver must replay pending init');
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
  ].forEach((method) => {
    assertSourceContains(source, new RegExp(`window\\.${method} = ${method}`), `${method} must be exposed on window`);
  });
});

test('webview bridge: updateChartData full reload reapplies overlays and market price lines', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /lastRawSeriesData = Array\.isArray\(data\) \? data\.slice\(\) : \[\]/, 'full reload must remember raw data for recovery');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'full reload must replace the chart series');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full reload must clear stale overlay line refs');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full reload must reapply overlays after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'full reload must restore market lines after setData');
});

test('webview bridge: updateTick uses an incremental requestAnimationFrame path', () => {
  const body = extractFunctionBody(source, 'updateTick');
  const flushBody = extractFunctionBody(source, 'flushPendingTick');

  assertSourceContains(body, /pendingTick = tick/, 'updateTick must coalesce the latest tick');
  assertSourceContains(body, /requestAnimationFrame\(flushPendingTick\)/, 'updateTick must paint incrementally on rAF');
  assertSourceContains(flushBody, /applyTickUpdate\(tick\)/, 'pending tick flush must update only the active candle');
});

test('webview bridge: setMarketPriceLines updates market lines without mutating candle geometry', () => {
  const body = extractFunctionBody(source, 'setMarketPriceLines');

  assertSourceContains(body, /lastBidPrice = hasBid \? bid : null/, 'market line state must be cached for recovery');
  assertSourceContains(body, /setBidPriceLine\(bid\)/, 'bid line must update through price-line API');
  assertSourceContains(body, /setAskPriceLine\(ask\)/, 'ask line must update through price-line API');
  assertSourceContains(source, /lineVisible: true/, 'market price lines must explicitly keep their chart guide visible');
  assertSourceContains(source, /renderMarketPriceBadges\(layer\)/, 'market bid\/ask lines must be mirrored into the DOM overlay');
  assertSourceContains(source, /Candle geometry must come from the canonical live-candle engine only/, 'native quote bridge must not create a second OHLC path');
});

test('webview bridge: resizeChartViewport replays pending init and updates geometry', () => {
  const body = extractFunctionBody(source, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending zero-size init');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize the active chart');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must report chart geometry');
});

test('webview bridge: recoverChartSurface restores data overlays market lines and geometry', () => {
  const body = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(body, /lastRawSeriesData[\s\S]*series\.setData\(mapped\)/, 'surface recovery must restore the last raw series');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'surface recovery must reapply overlays');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'surface recovery must reapply market price lines');
  assertSourceContains(body, /postChartGeometry\(\)/, 'surface recovery must republish geometry');
});

test('webview bridge: native handler accepts CHART_READY geometry drag and errors', () => {
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*chartInitializedRef\.current = true[\s\S]*setChartCanvasReady\(true\)/, 'CHART_READY must mark canvas ready');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyCandles = sanitizeCandlesForChart\(candlesRef\.current\)[\s\S]*updateChartData\(\$\{JSON\.stringify\(mapped\)\}\)/, 'CHART_READY must force-paint retained candles into the WebView');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*renderedSeriesSnapshotRef\.current = buildChartSeriesSnapshot\(readyCandles\)/, 'CHART_READY retained-candle paint must update the rendered snapshot');
  assertSourceContains(source, /msg\.type === 'CHART_GEOMETRY'[\s\S]*setChartPlotArea/, 'CHART_GEOMETRY must update plot area');
  assertSourceContains(source, /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*handleChartTradePreviewDragMessage\(msg\)/, 'trade-line drag messages must reach React state');
  assertSourceContains(source, /msg\.type === 'ERROR'[\s\S]*console\.warn\('\[CHART WEBVIEW ERROR\]'/, 'WebView errors must be logged without blocking recovery');
});

test('webview bridge: watchdog keeps re-sending initChart until CHART_READY', () => {
  assertSourceContains(source, /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*!chartInitializedRef\.current[\s\S]*webViewReady[\s\S]*sendInit\(\)/, 'watchdog must retry init while chart is not confirmed');
  assertSourceContains(source, /setChartReadyEpoch\(\(c\) => c \+ 1\)/, 'CHART_READY must bump epoch for dependent bridge effects');
});

test('webview bridge: WebView process reload resets bridge and reloads chart', () => {
  assertSourceContains(source, /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'iOS process termination must reload');
  assertSourceContains(source, /onRenderProcessGone=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'Android render process loss must reload');
});
