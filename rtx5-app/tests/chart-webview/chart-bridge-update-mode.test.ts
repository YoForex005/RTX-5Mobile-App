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

test('symbol timeframe chart type and theme changes invalidate init signature', () => {
  assertSourceContains(
    source,
    /const currentSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)[\s\S]*chartType[\s\S]*chartColorsSignature/,
    'init signature must include symbol, normalized timeframe, chart type, and colors',
  );
  assertSourceContains(
    source,
    /if \(lastInitSigRef\.current !== currentSig\)[\s\S]*chartInitializedRef\.current = false/,
    'signature changes must mark the WebView chart as not initialized',
  );
});

test('ChartScreen routes full reload and incremental update to the correct bridge functions', () => {
  const syncEffectStart = source.indexOf('const nextSnapshot = buildChartSeriesSnapshot');
  assert.notEqual(syncEffectStart, -1, 'series sync effect was not found');
  const syncEffect = source.slice(syncEffectStart, source.indexOf('useEffect(() => {', syncEffectStart + 1));

  assertSourceContains(syncEffect, /updateMode === 'full_reload'[\s\S]*updateChartData\(/, 'full reload must call updateChartData');
  assertSourceContains(syncEffect, /else \{[\s\S]*updateTick\(/, 'incremental mode must call updateTick');
});

test('WebView full data reload restores overlays and market price lines after setData', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /sanitizeSeriesData\(data\)/, 'full reload must sanitize and dedupe candle data before setData');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'updateChartData must call setData');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale overlay refs must be cleared');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlays must be reapplied after setData');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'market lines must be restored after setData');
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

test('native WebView uses the native candlestick renderer for candle modes', () => {
  assertSourceContains(
    source,
    /Always use the native lightweight-charts CandlestickSeries/,
    'native chart must document the native candlestick renderer contract',
  );
  assertSourceContains(
    source,
    /series = chart\.addSeries\(LightweightCharts\.CandlestickSeries,[\s\S]*upColor: colors\.bodyUp[\s\S]*downColor: colors\.bodyDown/,
    'candlestick and hollow charts must use the native Lightweight Charts candlestick series',
  );
});

test('quote updates never patch candle geometry inside the WebView', () => {
  assert.doesNotMatch(
    source,
    /liveQuoteCandleStateRef/,
    'native chart must not keep a separate quote-built candle projection',
  );

  const quoteBridgeStart = source.indexOf('Quotes move market price lines only');
  assert.notEqual(quoteBridgeStart, -1, 'quote bridge contract comment was not found');
  const quoteBridgeEnd = source.indexOf('// Watchdog', quoteBridgeStart);
  assert.notEqual(quoteBridgeEnd, -1, 'quote bridge effect end was not found');
  const quoteBridge = source.slice(quoteBridgeStart, quoteBridgeEnd);

  assertSourceContains(quoteBridge, /setMarketPriceLines\(/, 'quote bridge must still move market price lines');
  assert.doesNotMatch(quoteBridge, /updateTick\(/, 'quote bridge must not mutate candle OHLC');
  assert.doesNotMatch(quoteBridge, /buildChartTickPayload/, 'quote bridge must not synthesize candle payloads');
});

test('horizontal zoom and pan keeps price autoscale attached to visible bars', () => {
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(\) \{[\s\S]*scheduleOverlayPriceScaleLock\(true\)[\s\S]*refreshOverlayDomLabels/,
    'visible logical range changes must re-enable price autoscale before refreshing overlays',
  );
  assertSourceContains(
    source,
    /handleScale: \{[\s\S]*pinch: true[\s\S]*axisPressedMouseMove: false/,
    'mobile pinch zoom must stay enabled while price-axis drag scaling remains disabled',
  );
});

test('vertical candle drag can own the price range without autoscale fighting it', () => {
  assertSourceContains(
    source,
    /function resolveVerticalPanStartPriceRange\(\)[\s\S]*getVisibleRange\(\)[\s\S]*resolvePriceRangeFromVisibleData\(\)/,
    'vertical pan must fall back to visible candle data when autoscale has no explicit range',
  );
  assertSourceContains(
    source,
    /var beginVerticalPan = function\(clientY\)[\s\S]*manualPriceScaleRangeActive = true[\s\S]*setAutoScale\(false\)[\s\S]*setVisibleRange\(\{ from: range\.from, to: range\.to \}\)/,
    'vertical pan start must pin the current price range before movement',
  );
  assertSourceContains(
    source,
    /var continueVerticalPan = function\(clientY\)[\s\S]*setAutoScale\(false\)[\s\S]*priceScaleApi\.setVisibleRange\(\{/,
    'vertical pan moves candles by manually shifting the visible price range',
  );
  assertSourceContains(
    source,
    /verticalPricePanGestureActive \|\| \(manualPriceScaleRangeActive && forceAutoScale !== true\)/,
    'autoscale refresh must not override an active manual vertical price range',
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
