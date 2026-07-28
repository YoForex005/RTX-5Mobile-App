import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('READY resets bridge state and allows candles that arrived earlier to initialize', () => {
  assertSourceContains(
    source,
    /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/,
    'READY must reset bridge state and enable WebView readiness',
  );
  assertSourceContains(
    source,
    /const candlesRef = useRef\(sanitizedCandles\)[\s\S]*const canonicalCandles = liveCandlesEngine\.getCandles\(chartSymbol, chartTimeframe\);[\s\S]*candlesRef\.current = canonicalCandles\.length > 0 \? canonicalCandles : sanitizedCandles/,
    'READY retention must prefer the newest canonical candle array and use the React snapshot only as bootstrap fallback',
  );
  assertSourceContains(
    source,
    /const data = candlesRef\.current[\s\S]*initChart\(/,
    'sendInit must initialize from retained candles',
  );
});

test('initChart defers zero-size WebView initialization and retries after layout', () => {
  const initBody = extractFunctionBody(source, 'initChart');
  const doInitBody = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(initBody, /requestAnimationFrame\(function\(\)/, 'initChart must wait for a layout frame');
  assertSourceContains(doInitBody, /if \(w === 0 \|\| h === 0\)[\s\S]*_pendingInit = \{/, 'zero-size init must store pending payload');
  assertSourceContains(source, /new ResizeObserver\(function\(entries\)[\s\S]*if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'ResizeObserver must replay pending init');
});

test('CHART_READY marks canvas ready and bumps chartReadyEpoch for bridge effects', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_READY'[\s\S]*chartInitializedRef\.current = true[\s\S]*setChartCanvasReady\(true\)[\s\S]*setChartReadyEpoch\(\(c\) => c \+ 1\)/,
    'CHART_READY must confirm chart initialization and force dependent bridge effects',
  );
});

test('watchdog retries init while valid candles exist but CHART_READY has not arrived', () => {
  assertSourceContains(
    source,
    /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*!chartInitializedRef\.current[\s\S]*webViewReady[\s\S]*sendInit\(true\)/,
    'watchdog must resend initChart until the chart is confirmed',
  );
  assertSourceContains(
    source,
    /\}, CHART_WATCHDOG_INTERVAL_MS\);/,
    'watchdog retry cadence must come from the shared startup interval constant',
  );
});

test('pending init retries are throttled before remapping full history', () => {
  assertSourceContains(
    source,
    /const CHART_WATCHDOG_INTERVAL_MS = 3000;[\s\S]*const CHART_INIT_RETRY_MIN_MS = 5000;/,
    'chart startup retry cadence must stay long enough for slower iOS WebViews to finish first init',
  );
  assertSourceContains(
    source,
    /const lastInitDispatchRef = useRef\(\{ signature: '', configSig: '', at: 0 \}\)/,
    'native chart must remember the last init dispatch while CHART_READY is pending',
  );
  assertSourceContains(
    source,
    /const recentInitInFlight =[\s\S]*!chartInitializedRef\.current &&[\s\S]*lastInitDispatchRef\.current\.configSig === currentSig &&[\s\S]*now - lastInitDispatchRef\.current\.at < CHART_INIT_RETRY_MIN_MS;[\s\S]*if \(recentInitInFlight\) return;[\s\S]*if \(!force && initAttemptSig === lastInitAttemptSigRef\.current\) return;[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\];/,
    'pending init throttling must happen before expensive full-history mapping and injection',
  );
  assertSourceContains(
    source,
    /lastInitDispatchRef\.current = \{ signature: initAttemptSig, configSig: currentSig, at: now \}/,
    'successful init injection must update the pending dispatch throttle',
  );
});

test('WebView process loss resets the bridge and defers hidden surface recreation', () => {
  assertSourceContains(
    source,
    /const handleChartWebViewProcessLoss = useCallback\([\s\S]*failedGeneration: number[\s\S]*lastRecoveredChartWebViewGenerationRef\.current === failedGeneration[\s\S]*lastRecoveredChartWebViewGenerationRef\.current = failedGeneration[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*if \(!isScreenFocused\) \{[\s\S]*pendingChartWebViewRecoveryRef\.current = true[\s\S]*return[\s\S]*setChartWebViewGeneration\(\(generation\) => generation \+ 1\)/,
    'process termination must deduplicate a failed generation, reset readiness, and defer recreation while Chart is hidden',
  );
  assertSourceContains(
    source,
    /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*handleChartWebViewProcessLoss\('iOS', chartWebViewGeneration\)[\s\S]*onRenderProcessGone=\{\(\) => \{[\s\S]*handleChartWebViewProcessLoss\('Android', chartWebViewGeneration\)/,
    'both iOS and Android process-loss callbacks must use the generation-deduplicated focus-gated recreation path',
  );
  assert.doesNotMatch(source, /webViewRef\.current\?\.reload\(\)/);
});
