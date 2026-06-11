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
const apiSource = readModuleSource('src/domain/candles/api/candles');

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
    /if \(lastInitSigRef\.current !== currentSig\) \{[\s\S]*chartInitializedRef\.current = false[\s\S]*renderedSeriesSnapshotRef\.current = EMPTY_CHART_SERIES_SNAPSHOT[\s\S]*setChartCanvasReady\(false\)[\s\S]*setChartPlotArea\(null\)/,
    'symbol/timeframe signature changes must invalidate stale canvas readiness',
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
    /const isLoading = \(!chartCanvasReady \|\| !candlesAvailable\) && loadingDelayPassed && !loadingFallback/,
    'native chart must keep loading visible when the WebView initializes before candles arrive',
  );
  assertSourceContains(
    chartSource,
    /const isNoMarketData = sanitizedCandles\.length === 0 && !isLoading && loadingFallback/,
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

test('logged-out user can render market chart when public data exists', () => {
  assertSourceContains(apiSource, /const hasAuthToken = Boolean\(getStoredAccessToken\(\)\)/, 'API must detect auth without requiring it');
  assertSourceContains(
    apiSource,
    /if \(hasAuthToken\) \{[\s\S]*fetchAuthenticatedCandleHistory[\s\S]*\}[\s\S]*try \{[\s\S]*fetchPublicCandleHistory/,
    'public candle history must still be attempted when auth is absent or authenticated history fails',
  );
  assertSourceContains(
    apiSource,
    /PUBLIC_API_V1_BASE_URL[\s\S]*\/candles\/\$\{encodeURIComponent\(requestedSymbol\)\}/,
    'logged-out fallback must use public market candle endpoints',
  );
});

test('candle websocket appends stored JWT when available and reconnects on token changes', () => {
  // Public /ws/v2 candle channels can stream anonymously, but logged-in
  // sessions may still depend on the token for account or broker-scoped
  // routing. The socket should attach the stored token when present and
  // reconnect after login/logout/account switches.
  assertSourceContains(
    socketSource,
    /const getStoredAccessToken = \(\): string \| null =>[\s\S]*useUserPreferences\.getState\(\)\.accountDetails\?\.credentials\?\.accessToken/,
    'candle WS must read JWT from user preferences at connect time',
  );
  assertSourceContains(
    socketSource,
    // Path may be `./candlesSocketProtocol` or `../candlesSocketProtocol`,
    // depending on whether the service lives in a sibling file or folder.
    /import \{[\s\S]*appendCandleWsToken[\s\S]*\} from '\.\.?\/candlesSocketProtocol'/,
    'candle WS must use the shared appendCandleWsToken helper from the protocol module',
  );
  assertSourceContains(
    socketSource,
    /const wsUrl = appendCandleWsToken\(this\.url, token\)[\s\S]*this\.ws = new WebSocket\(wsUrl\)/,
    'candle WS connect path must build the URL with the active token',
  );
  assertSourceContains(
    socketSource,
    /private startTokenWatcher\(\): void[\s\S]*useUserPreferences\.subscribe[\s\S]*if \(next === prev\)[\s\S]*if \(this\.subscriptions\.size === 0\)[\s\S]*this\.connect\(\)/,
    'candle WS must reconnect when the stored token changes (login, logout, account switch)',
  );
  assertSourceContains(
    socketSource,
    /this\.activeToken !== token[\s\S]*this\.tearDownSocketSafe\(\)/,
    'candle WS must drop a stale-token connection before opening a new one',
  );
});

test('candle websocket falls back to public channels when stored JWT handshake fails', () => {
  assertSourceContains(
    socketSource,
    /private anonymousFallbackToken: string \| null = null/,
    'candle WS must remember a rejected token so public channel fallback is stable',
  );
  assertSourceContains(
    socketSource,
    /private resolveConnectionToken\(\): string \| null \{[\s\S]*return this\.anonymousFallbackToken === token \? null : token/,
    'candle WS must omit a token that already failed the public candle handshake',
  );
  assertSourceContains(
    socketSource,
    /this\.ws\.onerror = \(\) => \{[\s\S]*this\.retryPublicChannelWithoutToken\(\)/,
    'candle WS errors must trigger an anonymous retry path',
  );
  assertSourceContains(
    socketSource,
    /private retryPublicChannelWithoutToken\(\): void \{[\s\S]*this\.anonymousFallbackToken = this\.activeToken[\s\S]*this\.tearDownSocketSafe\(\)[\s\S]*this\.scheduleReconnect\(\)/,
    'candle WS must reconnect active subscriptions without a rejected token',
  );
  assertSourceContains(
    socketSource,
    /this\.anonymousFallbackToken = null[\s\S]*if \(this\.subscriptions\.size === 0\)/,
    'token rotation must clear anonymous fallback so the new token can be tried',
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
    /series = chart\.addSeries\(LightweightCharts\.CandlestickSeries,[\s\S]*upColor: colors\.bodyUp[\s\S]*downColor: colors\.bodyDown/,
    'candle chart modes must use candlestick series, not a line series',
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

test('chart adapter never sends malformed candlestick objects to setData', () => {
  assertSourceContains(
    chartSource,
    /function sanitizeSeriesData\(data\)[\s\S]*var normalized = normalizeRawSeriesDatum\(data\[i\]\)[\s\S]*byTime\[key\] = mergeRawSeriesDatum\(byTime\[key\], normalized\)/,
    'WebView must sanitize, sort, and merge duplicate candle data before setData',
  );
  assertSourceContains(
    chartSource,
    /function normalizeRawSeriesDatum\(item\)[\s\S]*isFiniteNumber\(item\.open\)[\s\S]*isFiniteNumber\(item\.high\)[\s\S]*isFiniteNumber\(item\.low\)[\s\S]*isFiniteNumber\(item\.close\)/,
    'WebView must reject incomplete candle objects before chart update',
  );
  assertSourceContains(
    chartSource,
    /function normalizeRawSeriesDatum\(item\)[\s\S]*isRawSeriesDatumInternallyCoherent\(normalized\) \? normalized : null/,
    'WebView must reject one OHLC candle that mixes incompatible price regimes',
  );
  assertSourceContains(
    chartSource,
    /function filterRawSeriesDataByPriceContinuity\(data\)[\s\S]*var filtered = \[data\[0\]\][\s\S]*areRawSeriesDataRegimesCoherent\(previous, candidateAnchor\)[\s\S]*return filtered/,
    'WebView must remove only anchored short outlier runs instead of dropping the valid history side of a split',
  );
  assert.doesNotMatch(
    chartSource,
    /trimTrailingFlatRawSeriesOutlier|isRawSeriesFlatLineDatum/,
    'WebView must not blindly delete flat tail candles without host-side provenance',
  );
});

test('quote feed synchronizes display candles before price-line bridge updates', () => {
  assertSourceContains(
    chartSource,
    /resolveLivePriceCoherentCandles\(sanitizedBackendCandles, chartTimeframe,[\s\S]*price: liveChartPrice,[\s\S]*time: chartTradeTickTimestamp/,
    'ChartScreen must fold the latest live quote into the display candle before bridge sync',
  );

  const quoteBridgeStart = chartSource.indexOf('The display candle has already folded in the same live quote used here');
  assert.notEqual(quoteBridgeStart, -1, 'quote bridge contract comment must exist');
  const quoteBridge = chartSource.slice(quoteBridgeStart, chartSource.indexOf('// Watchdog', quoteBridgeStart));

  assertSourceContains(quoteBridge, /setMarketPriceLines\(/, 'quote bridge must move price lines');
  assert.doesNotMatch(quoteBridge, /updateTick\(/, 'quote bridge must leave candle bridge updates in the candle sync effect');
  assert.doesNotMatch(quoteBridge, /buildChartTickPayload/, 'quote bridge must not create a second candle payload path');
});
