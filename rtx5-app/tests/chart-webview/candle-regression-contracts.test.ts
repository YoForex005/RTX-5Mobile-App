import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

// Reads either a single .ts module file or concatenates every .ts file in a
// module folder of the same name. Tests grep across the
// concatenation so contract assertions survive future internal splits.
const readModuleSource = (relativePath: string): string => {
  const filePath = join(process.cwd(), `${relativePath}.ts`);
  const folderPath = join(process.cwd(), relativePath);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8');
  }
  if (existsSync(folderPath) && statSync(folderPath).isDirectory()) {
    return readdirSync(folderPath)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => readFileSync(join(folderPath, entry), 'utf8'))
      .join('\n');
  }
  throw new Error(`module source not found: ${relativePath}`);
};

const chartSource = readChartScreenSource();
const streamSource = readModuleSource('src/domain/candles/stream/liveCandleStream');
const socketSource = readModuleSource('src/domain/candles/ws/candlesSocket');
const socketServiceSource = readFileSync(
  join(process.cwd(), 'src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts'),
  'utf8',
);
const apiSource = readModuleSource('src/domain/candles/api/candles');
const customCandleRendererSource = readModuleSource('src/domain/candles/rendering/customCandlestickSeries');
const customCandleWebViewRendererSource = readModuleSource('src/domain/candles/rendering/customCandlestickSeriesWebView');

test('radial menu timeframe switch uses stable chart pipeline', () => {
  assertSourceContains(
    chartSource,
    /<ChartTapRadialMenu[\s\S]*onSelectTimeframe=\{handleTimeframeSelect\}/,
    'radial menu must dispatch into the same timeframe handler as the normal picker',
  );
  assertSourceContains(
    chartSource,
    /const handleTimeframeSelect = useCallback[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*warmChartContextAndCommit\(chartSymbol, nextTimeframe\)/,
    'timeframe handler must reset date range and commit through the warmed chart context',
  );
});

test('does not permanently blank chart after rapid switching', () => {
  assertSourceContains(
    chartSource,
    /const chartDataContextSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)/,
    'symbol/timeframe switches must be tracked separately from WebView shell init',
  );
  assertSourceContains(
    chartSource,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*\? 'full_reload'[\s\S]*: getChartSeriesUpdateMode/,
    'rapid symbol/timeframe switches must repaint data without waiting for CHART_READY reinit',
  );
  assertSourceContains(
    chartSource,
    /msg\.type === 'CHART_READY'[\s\S]*const readyCandles = candlesRef\.current[\s\S]*getChartSnapshotSignature\(pendingInitSnapshotRef\.current\) === getChartSnapshotSignature\(readySnapshot\)[\s\S]*updateChartData\(\$\{JSON\.stringify\(mapped\)\}\)/,
    'CHART_READY must paint retained candles only when initChart did not already seed the same series',
  );
});

test('empty history and empty live data surfaces a no-market-data state', () => {
  assertSourceContains(
    chartSource,
    /const hasChartDataError = Boolean\(chartDataError && !candlesAvailable\)[\s\S]*const isLoading =[\s\S]*!hasChartDataError[\s\S]*\(!chartCanvasReady \|\| !candlesAvailable \|\| chartDataLoading\)[\s\S]*!loadingFallback/,
    'native chart must keep loading visible before candles arrive while allowing real history errors through',
  );
  assertSourceContains(
    chartSource,
    /const isNoMarketData = sanitizedCandles\.length === 0 && !isLoading && !isError && loadingFallback/,
    'native chart must stop showing only a blank shell after history/live both remain empty',
  );
  assertSourceContains(
    chartSource,
    /No market data available/,
    'native chart must show an explicit no-data state when no backend candles are available',
  );
});

test('ignores stale symbol response', () => {
  assertSourceContains(
    streamSource,
    /entry\.requestId \+= 1[\s\S]*const requestId = entry\.requestId[\s\S]*entry\.abortController\?\.abort\(\)/,
    'new symbol/timeframe history loads must advance request id and abort older requests',
  );
  assertSourceContains(
    streamSource,
    /const symbol = entry\.symbol[\s\S]*const timeframe = entry\.timeframe[\s\S]*if \(!live \|\| live\.requestId !== requestId \|\| controller\.signal\.aborted\) \{[\s\S]*return/,
    'late history responses must be ignored by request id before touching active candles',
  );
  assertSourceContains(
    streamSource,
    /if \(event\.candle\.symbol && normalizeSymbol\(event\.candle\.symbol\) !== entry\.symbol\) \{[\s\S]*continue/,
    'live candles with an old symbol must be ignored before merge',
  );
});

test('ignores stale timeframe response', () => {
  assertSourceContains(
    streamSource,
    /entry\.requestId \+= 1[\s\S]*const requestId = entry\.requestId/,
    'timeframe reloads must carry a unique request id',
  );
  assertSourceContains(
    streamSource,
    /const candleTimeframe = normalizeTimeframeStrict\(event\.candle\.timeframe\)[\s\S]*if \(!candleTimeframe \|\| candleTimeframe !== entry\.timeframe\) \{[\s\S]*continue/,
    'live candles with an old timeframe must be ignored before merge',
  );
});

test('candle gateway history can run without a frontend login gate', () => {
  assertSourceContains(apiSource, /const hasStoredAccessToken = Boolean\(getStoredAccessToken\(\)\)/, 'API must detect auth without requiring it');
  assertSourceContains(
    apiSource,
    /skipAuth: !hasStoredAccessToken/,
    'gateway history can be attempted without a frontend login gate',
  );
  assertSourceContains(
    apiSource,
    /const pathSymbol = encodeURIComponent\(requestedSymbol\)[\s\S]*\/\$\{route\.pathPrefix\}\/\$\{pathSymbol\}/,
    'candle gateway routes must include an encoded symbol path segment',
  );
  assert.doesNotMatch(apiSource, /PUBLIC_API_V1_BASE_URL|fetchPublicCandleHistory|HISTORY_API_KEY|\/history\/candles/);
});

test('candle websocket stays public and routes by selected broker identity', () => {
  // Public /ws/v2 candle channels reject arbitrary account JWTs on current
  // broker backends. Candle routing is broker-scoped through broker_id while
  // account/trade sockets keep the authenticated realtime contract.
  assert.doesNotMatch(
    socketServiceSource,
    /getStoredAccessToken/,
    'candle WS must not attach account JWTs to public candle channels',
  );
  assertSourceContains(
    socketServiceSource,
    // Path may be `./candlesSocketProtocol` or `../candlesSocketProtocol`,
    // depending on whether the service lives in a sibling file or folder.
    /import \{[\s\S]*appendCandleWsBrokerId[\s\S]*\} from '\.\.?\/candlesSocketProtocol'/,
    'candle WS must use the shared broker-id URL helper from the protocol module',
  );
  assertSourceContains(
    socketServiceSource,
    /const wsUrl = appendCandleWsBrokerId\(this\.url, brokerId\)[\s\S]*this\.ws = new WebSocket\(wsUrl\)/,
    'candle WS connect path must build the URL with the selected broker id',
  );
  assertSourceContains(
    socketServiceSource,
    /private startTokenWatcher\(\): void[\s\S]*useUserPreferences\.subscribe[\s\S]*nextBrokerId[\s\S]*nextServerUrl[\s\S]*this\.connect\(\)/,
    'candle WS must reconnect when the selected broker id or broker URL changes',
  );
  assertSourceContains(
    socketServiceSource,
    /this\.activeBrokerId !== brokerId[\s\S]*this\.tearDownSocketSafe\(\)/,
    'candle WS must drop a stale-broker connection before opening a new one',
  );
  assert.doesNotMatch(
    socketServiceSource,
    /anonymousFallbackToken|retryPublicChannelWithoutToken|appendCandleWsToken/,
    'candle WS must not depend on token fallback logic for public candle channels',
  );
});

test('candle websocket call sites guard against stale-prototype singletons (HMR safety)', () => {
  // Under hot-module-reload the singleton instance can pre-date a method that
  // was added to the class. Crashing the chart with "this.X is not a function"
  // is unacceptable — guard the new methods with typeof checks and fall back
  // to inline cleanup in the WS teardown path.
  assertSourceContains(
    socketSource,
    /if \(typeof this\.startTokenWatcher === 'function'\) \{[\s\S]*this\.startTokenWatcher\(\)/,
    'candle WS connect() must guard the startTokenWatcher call so a stale singleton cannot crash the chart',
  );
  assertSourceContains(
    socketSource,
    /if \(typeof this\.stopTokenWatcher === 'function'\) \{[\s\S]*this\.stopTokenWatcher\(\)/,
    'candle WS disconnect() must guard the stopTokenWatcher call',
  );
  assertSourceContains(
    socketSource,
    /private tearDownSocketSafe\(\): void \{[\s\S]*if \(typeof this\.teardownSocket === 'function'\)[\s\S]*const socket = this\.ws[\s\S]*this\.ws = null/,
    'candle WS must expose a fallback teardown that works even if teardownSocket is missing on a stale prototype',
  );
});

test('prefetch history result does not overwrite a newer authoritative loadHistory state', () => {
  assertSourceContains(
    streamSource,
    /liveEntry &&[\s\S]*candles\.length > 0 &&[\s\S]*liveEntry\.requestId === 0 &&[\s\S]*!liveEntry\.historyLoading/,
    'prefetch must skip applying its result if a real loadHistory has already run or is running',
  );
});

test('reconnect safe subscription path resubscribes without polluting current symbol or timeframe', () => {
  assertSourceContains(
    socketSource,
    /this\.ws\.onopen = \(\) => \{[\s\S]*this\.reconnectAttempts = 0[\s\S]*this\.sendSubscriptions\(\)/,
    'candle socket must resubscribe active subscriptions after reconnect',
  );
  assertSourceContains(
    socketSource,
    /const candidates = states\.filter\(\(state\) => \{[\s\S]*if \(symbol && state\.symbol !== symbol\) return false[\s\S]*if \(tf && state\.tf !== tf\) return false/,
    'ambiguous replayed backend candle messages must be routed only to matching subscriptions',
  );
  assertSourceContains(
    socketSource,
    /if \(candidates\.length === 1\) \{[\s\S]*liveCandlesEngine\.ingestLiveCandle\(item, candidates\[0\]\.symbol, candidates\[0\]\.tf\)/,
    'backend candle payloads without full context must only be accepted for exactly one active subscription',
  );
});

test('previous candles stay in the WebView raw buffer during live update', () => {
  const applyTickBody = extractFunctionBody(chartSource, 'applyTickUpdate');

  assertSourceContains(
    chartSource,
    /function upsertRawSeriesDatum\(tick\)[\s\S]*lastRawSeriesData\[lastIndex\] = normalized[\s\S]*lastRawSeriesData\.push\(normalized\)/,
    'WebView incremental updates must replace latest candle or append exactly one candle',
  );
  assertSourceContains(
    applyTickBody,
    /currentSeriesLength = lastRawSeriesData\.length/,
    'incremental updates must not truncate the retained raw history buffer',
  );
});

test('zoom/data-density path does not convert candlesticks into line data', () => {
  assertSourceContains(
    chartSource,
    /series = window\.addRTX5CustomCandlestickSeries\(chart,[\s\S]*bodyUpColor: colors\.bodyUp[\s\S]*bodyDownColor: colors\.bodyDown/,
    'candle chart modes must use the RTX5 custom candlestick series, not a line series',
  );
  assertSourceContains(
    chartSource,
    /const buildChartTickPayload = \([\s\S]*if \(chartType === 'line'\) \{[\s\S]*return \{ time: candle\.time, value: candle\.close \}/,
    'only explicit line chart mode may emit line-series points',
  );
  assertSourceContains(
    chartSource,
    /const buildChartTickPayload = \([\s\S]*return \{[\s\S]*open: candle\.open[\s\S]*high: candle\.high[\s\S]*low: candle\.low[\s\S]*close: candle\.close/,
    'candlestick update payload must preserve full OHLC for wick rendering',
  );
});

test('dense zoomed-out custom candles render as a continuous colored line', () => {
  assertSourceContains(
    customCandleRendererSource,
    /const DENSE_CANDLE_LINE_MAX_BAR_SPACING = 3\.25/,
    'custom candle renderer must define the dense spacing threshold',
  );
  assertSourceContains(
    customCandleRendererSource,
    /const fillDenseCandleLine = \([\s\S]*Math\.min\(geometry\.wickTop, geometry\.bodyTop, geometry\.bodyBottom\)[\s\S]*Math\.max\(geometry\.wickBottom, geometry\.bodyTop, geometry\.bodyBottom\)[\s\S]*ctx\.fillRect/,
    'custom candle renderer must draw one continuous high-low rect at dense spacing',
  );
  assertSourceContains(
    customCandleRendererSource,
    /if \(shouldRenderDenseCandleAsLine\(bitmapBarSpacing, bodyWidth, horizontalPixelRatio\)\) \{[\s\S]*fillDenseCandleLine\(context, geometry, wickColor\)[\s\S]*continue/,
    'custom candle renderer must bypass separate wick/body drawing in dense mode',
  );
  assertSourceContains(
    customCandleWebViewRendererSource,
    /function shouldRenderDenseCandleAsLine\(barSpacing, bodyWidth, pixelRatio\)[\s\S]*barSpacing <= DENSE_CANDLE_LINE_MAX_BAR_SPACING/,
    'native WebView renderer string must keep the same dense-line rule',
  );
});

test('chart adapter never sends malformed candlestick objects to setData', () => {
  const sanitizerBody = extractFunctionBody(chartSource, 'sanitizeSeriesData');
  const normalizerBody = extractFunctionBody(chartSource, 'normalizeRawSeriesDatum');

  assertSourceContains(
    sanitizerBody,
    /var normalized = normalizeRawSeriesDatum\(data\[i\]\)[\s\S]*byTime\[key\] = mergeRawSeriesDatum\(byTime\[key\], normalized\)/,
    'WebView must sanitize, sort, and merge duplicate candle data before setData',
  );
  assertSourceContains(
    normalizerBody,
    /isFiniteNumber\(open\)[\s\S]*isFiniteNumber\(rawHigh\)[\s\S]*isFiniteNumber\(rawLow\)[\s\S]*isFiniteNumber\(close\)/,
    'WebView must reject incomplete candle objects before chart update',
  );
  assertSourceContains(
    normalizerBody,
    /rawHigh < open[\s\S]*rawHigh < close[\s\S]*rawHigh < rawLow[\s\S]*rawLow > open[\s\S]*rawLow > close[\s\S]*rawLow > rawHigh/,
    'WebView must reject impossible OHLC ranges before chart update',
  );
  assert.doesNotMatch(
    normalizerBody,
    /isRawSeriesDatumInternallyCoherent/,
    'WebView must not drop a finite backend OHLC candle because its wick is large',
  );
  assert.doesNotMatch(
    sanitizerBody,
    /filterRawSeriesDataByPriceContinuity/,
    'WebView must not drop valid backend candles using a price-continuity heuristic',
  );
  assert.doesNotMatch(
    chartSource,
    /trimTrailingFlatRawSeriesOutlier|isRawSeriesFlatLineDatum/,
    'WebView must not blindly delete flat tail candles without host-side provenance',
  );
});

test('quote feed updates price lines without creating display candles', () => {
  assert.doesNotMatch(
    chartSource,
    /resolveLivePriceCoherentCandles/,
    'ChartScreen must not fold live quotes into display candles',
  );

  const quoteBridgeStart = chartSource.indexOf('Quote ticks move only the live price line.');
  assert.notEqual(quoteBridgeStart, -1, 'quote bridge contract comment must exist');
  const quoteBridge = chartSource.slice(quoteBridgeStart, chartSource.indexOf('// Watchdog', quoteBridgeStart));

  assertSourceContains(quoteBridge, /pendingMarketPriceLinesRef\.current = \{[\s\S]*price: visibleLivePrice[\s\S]*requestMarketPriceLineFlush\(\)/, 'quote bridge must schedule the live price line move');
  assert.doesNotMatch(quoteBridge, /updateTick\(/, 'quote bridge must leave candle bridge updates in the candle sync effect');
  assert.doesNotMatch(quoteBridge, /buildChartTickPayload/, 'quote bridge must not create a second candle payload path');
});
