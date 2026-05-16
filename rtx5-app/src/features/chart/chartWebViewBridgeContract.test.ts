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
const chartWebViewHtmlSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/rendering/ChartWebViewHtml.ts'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error('ChartWebViewHtml.ts was not found from the test working directory');
  }
  return readFileSync(filePath, 'utf8');
})();

test('webview bridge: ChartScreen initializes chart only after WebView READY enables bridge', () => {
  assertSourceContains(source, /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/, 'READY must reset bridge state and enable WebView');
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*if \(!webViewRef\.current \|\| !webViewReady\) return/, 'sendInit must wait for WebView readiness');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*sendInit\(\);[\s\S]*\}, \[sanitizedCandles, sendInit\]\)/, 'sanitized candle arrival must trigger init after READY');
});

test('webview bridge: candles arriving before READY are retained and sent after readiness', () => {
  assertSourceContains(source, /const sanitizedCandles = useMemo\([\s\S]*sanitizeCandlesForChart\(candles, \{ timeframe: chartTimeframe \}\)/, 'native host must sanitize candles once per render');
  assertSourceContains(source, /const candlesRef = useRef\(sanitizedCandles\)/, 'sanitized candles must be retained outside render timing');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*candlesRef\.current = sanitizedCandles;[\s\S]*\}, \[[^\]]*sanitizedCandles[^\]]*\]\)/, 'latest sanitized candles must update the retained ref');
  assertSourceContains(source, /const data = candlesRef\.current[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\][\s\S]*initChart\(/, 'sendInit must initialize the chart shell even before candles arrive');
});

test('webview bridge: zero-size WebView init is deferred and retried from rAF and ResizeObserver', () => {
  const initBody = extractFunctionBody(chartWebViewHtmlSource, 'initChart');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(initBody, /requestAnimationFrame\(function\(\)/, 'initChart must wait for layout frame before measuring');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*opts:[\s\S]*chartType:[\s\S]*data:/, 'zero-size init must preserve pending payload');
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
  ].forEach((method) => {
    assertSourceContains(chartWebViewHtmlSource, new RegExp(`window\\.${method} = ${method}`), `${method} must be exposed on window`);
  });
});

test('webview bridge: updateChartData full reload reapplies overlays and market price lines', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(body, /lastRawSeriesData = sanitizeSeriesData\(data\)/, 'full reload must remember sanitized raw data for recovery');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'full reload must replace the chart series');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full reload must clear stale overlay line refs');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full reload must reapply overlays after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'full reload must restore market lines after setData');
});

test('webview bridge: updateTick uses an incremental requestAnimationFrame path', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateTick');
  const flushBody = extractFunctionBody(chartWebViewHtmlSource, 'flushPendingTick');

  assertSourceContains(body, /pendingTick = tick/, 'updateTick must coalesce the latest tick');
  assertSourceContains(body, /requestAnimationFrame\(flushPendingTick\)/, 'updateTick must paint incrementally on rAF');
  assertSourceContains(flushBody, /applyTickUpdate\(tick\)/, 'pending tick flush must update only the active candle');
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

test('webview bridge: setMarketPriceLines updates market lines without mutating candle geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'setMarketPriceLines');
  const marketLineOptionsBody = extractFunctionBody(chartWebViewHtmlSource, 'makeMarketPriceLineOptions');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');

  assertSourceContains(body, /lastBidPrice = hasBid \? bid : null/, 'market line state must be cached for recovery');
  assertSourceContains(body, /setBidPriceLine\(bid, false\)/, 'bid line must update through price-line API');
  assertSourceContains(body, /setAskPriceLine\(ask, false\)/, 'ask line must update through price-line API');
  assertSourceContains(marketLineOptionsBody, /lineVisible: true/, 'market price lines must explicitly keep their chart guide visible');
  assertSourceContains(marketLineOptionsBody, /axisLabelVisible: false/, 'market bid/ask lines must not paint right-axis highlight badges');
  assertSourceContains(marketLineOptionsBody, /title: ''/, 'market bid/ask price lines must stay text-free');
  assert.doesNotMatch(refreshBody, /renderMarketPriceBadges\(layer\)/, 'market bid/ask lines must not render filled price-scale badges');
  assertSourceContains(source, /Quotes move market price lines only; candle geometry comes from the[\s\S]*canonical REST history plus backend live-candle stream/, 'native quote bridge must not create a second OHLC path');
});

test('webview bridge: resizeChartViewport replays pending init and updates geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending zero-size init');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize the active chart');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must report chart geometry');
});

test('webview bridge: recoverChartSurface restores data overlays market lines and geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');

  assertSourceContains(body, /lastRawSeriesData[\s\S]*series\.setData\(mapped\)/, 'surface recovery must restore the last raw series');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'surface recovery must reapply overlays');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'surface recovery must reapply market price lines');
  assertSourceContains(body, /postChartGeometry\(\)/, 'surface recovery must republish geometry');
});

test('webview bridge: native handler accepts CHART_READY geometry drag and errors', () => {
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*chartInitializedRef\.current = true[\s\S]*setChartCanvasReady\(true\)/, 'CHART_READY must mark canvas ready');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyCandles = candlesRef\.current[\s\S]*const readySnapshot = buildChartSeriesSnapshot\(readyCandles\)/, 'CHART_READY must read the retained sanitized candles');
  assertSourceContains(source, /getChartSnapshotSignature\(pendingInitSnapshotRef\.current\) === getChartSnapshotSignature\(readySnapshot\)[\s\S]*renderedSeriesSnapshotRef\.current = readySnapshot[\s\S]*updateChartData\(\$\{JSON\.stringify\(mapped\)\}\)/, 'CHART_READY must skip duplicate full-history paint when init already seeded the same series');
  assertSourceContains(source, /msg\.type === 'CHART_GEOMETRY'[\s\S]*setChartPlotArea/, 'CHART_GEOMETRY must update plot area');
  assertSourceContains(source, /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*handleChartTradePreviewDragMessage\(msg\)/, 'trade-line drag messages must reach React state');
  assertSourceContains(source, /msg\.type === 'ERROR'[\s\S]*console\.warn\('\[CHART WEBVIEW ERROR\]'/, 'WebView errors must be logged without blocking recovery');
});

test('webview bridge: watchdog keeps re-sending initChart until CHART_READY', () => {
  assertSourceContains(source, /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*!chartInitializedRef\.current[\s\S]*webViewReady[\s\S]*sendInit\(true\)/, 'watchdog must retry init while chart is not confirmed');
  assertSourceContains(source, /setChartReadyEpoch\(\(c\) => c \+ 1\)/, 'CHART_READY must bump epoch for dependent bridge effects');
});

test('webview bridge: recent viewport does not reserve a blank future-bar gap', () => {
  assertSourceContains(
    source,
    /rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET/,
    'native chart must use the shared time-scale right-offset constant',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var lastVisibleBar = Math\.max\(0\.5, dataLength - 0\.5\)[\s\S]*to: lastVisibleBar/,
    'recent viewport must end at the last candle instead of adding future bars',
  );
});

test('webview bridge: WebView process reload resets bridge and reloads chart', () => {
  assertSourceContains(source, /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'iOS process termination must reload');
  assertSourceContains(source, /onRenderProcessGone=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/, 'Android render process loss must reload');
});
