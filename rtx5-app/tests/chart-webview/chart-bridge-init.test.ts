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
    /const candlesRef = useRef\(sanitizedCandles\)[\s\S]*const candlesRefContextSigRef = useRef\(chartDataContextSig\)[\s\S]*const readCurrentProjectedChartCandles = useCallback\(\(\) => \{[\s\S]*const canonicalCandles = readRenderableCanonicalCandles\(\)[\s\S]*const baseCandles = resolveContextScopedChartCandles\([\s\S]*chartDataContextSig,[\s\S]*canonicalCandles,[\s\S]*contextKey: candlesRefContextSigRef\.current,[\s\S]*candles: candlesRef\.current,[\s\S]*projectChartLiveTickCandles\([\s\S]*const \{ projection \} = readCurrentProjectedChartCandles\(\);[\s\S]*retainCurrentChartCandles\(projection\.candles\)/,
    'READY retention must prefer canonical candles, accept fallback candles only from the active context, and retain the current Bid projection',
  );
  assertSourceContains(
    source,
    /const sendInit = useCallback\([\s\S]*readCurrentProjectedChartCandles\(\)[\s\S]*const data = projection\.candles[\s\S]*retainCurrentChartCandles\(data\)[\s\S]*initChart\(/,
    'sendInit must re-project the retained candles before initializing the WebView',
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

test('CHART_READY resets a historyless viewport when committed history wins the init race', () => {
  const readyStart = source.indexOf("msg.type === 'CHART_READY'");
  const readyEnd = source.indexOf("msg.type === 'CHART_DATA_PAINTED'", readyStart);
  assert.notEqual(readyStart, -1, 'CHART_READY branch was not found');
  assert.notEqual(readyEnd, -1, 'CHART_DATA_PAINTED branch was not found');
  const readyBranch = source.slice(readyStart, readyEnd);

  assertSourceContains(
    readyBranch,
    /const pendingHistorylessBootstrap = historylessBootstrapViewportRef\.current;[\s\S]*const resetForHistorylessBootstrap = shouldResetViewportForHistorylessBootstrap\([\s\S]*pendingHistorylessBootstrap\.snapshot,[\s\S]*readySnapshot,[\s\S]*readyHasHistoryCandles/,
    'CHART_READY must compare committed history with the live-only init it is replacing',
  );
  assertSourceContains(
    readyBranch,
    /const usableHistoryPaintAlreadyPending =[\s\S]*resetForHistorylessBootstrap[\s\S]*pendingChartDataPaintRef\.current\.confirmsUsableChart[\s\S]*pendingChartDataPaintRef\.current\.dataContextSig === chartDataContextSig[\s\S]*pendingChartDataPaintRef\.current\.token\.length > 0;[\s\S]*else if \(!usableHistoryPaintAlreadyPending\) \{[\s\S]*updateChartData\([\s\S]*preserveVisibleLogicalSpan: \$\{!resetForHistorylessBootstrap\},[\s\S]*resetVisibleRange: \$\{resetForHistorylessBootstrap\}[\s\S]*if \(!readyHasHistoryCandles\) \{[\s\S]*historylessBootstrapViewportRef\.current = \{/,
    'the READY race must reset the live-only range without replacing an in-flight reset token and must retain the historyless marker until a usable paint is confirmed',
  );
});

test('historyless CHART_READY and paint acknowledgements stay concealed', () => {
  const readyStart = source.indexOf("msg.type === 'CHART_READY'");
  const paintStart = source.indexOf("msg.type === 'CHART_DATA_PAINTED'", readyStart);
  const paintEnd = source.indexOf("msg.type === 'DRAWING_TEXT_EDIT_REQUEST'", paintStart);
  assert.notEqual(readyStart, -1, 'CHART_READY branch was not found');
  assert.notEqual(paintStart, -1, 'CHART_DATA_PAINTED branch was not found');
  assert.notEqual(paintEnd, -1, 'CHART_DATA_PAINTED branch end was not found');
  const readyBranch = source.slice(readyStart, paintStart);
  const paintBranch = source.slice(paintStart, paintEnd);

  assertSourceContains(
    readyBranch,
    /if \(!readyHasHistoryCandles\) \{[\s\S]*historylessBootstrapViewportRef\.current = \{[\s\S]*if \(readyHasHistoryCandles\) \{[\s\S]*setHasPaintedChartOnce\(true\);[\s\S]*setLastPaintedChartDataContextSig\(chartDataContextSig\);[\s\S]*setLastPaintedChartDataContextEpoch\([\s\S]*chartDataContextEpochRef\.current\.epoch/,
    'an exact live-only init may arm recovery but only committed history may reveal the chart',
  );
  assertSourceContains(
    readyBranch,
    /issueChartDataPaintToken\([\s\S]*chartDataContextSig,[\s\S]*readyHasHistoryCandles,[\s\S]*\)/,
    'a READY-race paint token must carry committed-history eligibility',
  );
  assertSourceContains(
    paintBranch,
    /const pendingPaint = pendingChartDataPaintRef\.current;[\s\S]*if \(!pendingPaint\.confirmsUsableChart\) \{[\s\S]*return;[\s\S]*setHasPaintedChartOnce\(true\);[\s\S]*setLastPaintedChartDataContextSig\(paintedDataContextSig\)/,
    'empty and live-only paint acknowledgements must return before changing visible readiness',
  );
  assertSourceContains(
    source,
    /opacity: hasUsableRetainedChart \? 1 : 0/,
    'the native WebView must remain fully hidden until that history-backed acknowledgement',
  );
});

test('watchdog retries init and exact usable-paint acknowledgements without revealing the chart', () => {
  assertSourceContains(
    source,
    /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*if \(!webViewReady\) \{[\s\S]*return;[\s\S]*if \(!chartInitializedRef\.current\) \{[\s\S]*sendInit\(true\)/,
    'watchdog must resend initChart until the chart is confirmed',
  );
  assertSourceContains(
    source,
    /const hasTimedOutCurrentUsablePaint =[\s\S]*pendingPaint\.confirmsUsableChart[\s\S]*pendingPaint\.dataContextSig === chartDataContextSigRef\.current[\s\S]*pendingPaint\.ackRetryCount < CHART_DATA_PAINT_ACK_RETRY_MAX[\s\S]*retryChartDataPaintAcknowledgement\([\s\S]*JSON\.stringify\(pendingPaint\.dataContextSig\)[\s\S]*JSON\.stringify\(pendingPaint\.token\)[\s\S]*ackRetryCount: pendingPaint\.ackRetryCount \+ 1[\s\S]*resetChartBridgeState\(\);[\s\S]*sendInit\(true\)/,
    'watchdog must retry the exact pending usable paint up to the shared maximum, then rebuild without hiding the loader',
  );
  const paintAckRetryBody = extractFunctionBody(source, 'retryChartDataPaintAcknowledgement');
  assertSourceContains(
    paintAckRetryBody,
    /!series[\s\S]*currentSeriesLength <= 0[\s\S]*requestedDataContextSig !== lastInitDataContextSig[\s\S]*requestedPaintToken !== lastAppliedChartDataPaintToken[\s\S]*return false;[\s\S]*postChartDataPainted\(requestedDataContextSig, requestedPaintToken\)[\s\S]*return true/,
    'WebView acknowledgement retry must reject missing series/data and stale context or token identities',
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
    /const lastInitDispatchRef = useRef\(\{[\s\S]*signature: '',[\s\S]*configSig: '',[\s\S]*dataContextSig: '',[\s\S]*dataContextEpoch: -1,[\s\S]*at: 0,[\s\S]*\}\)/,
    'native chart must remember the last init dispatch while CHART_READY is pending',
  );
  assertSourceContains(
    source,
    /const recentInitInFlight =[\s\S]*!chartInitializedRef\.current &&[\s\S]*lastInitDispatchRef\.current\.configSig === currentSig &&[\s\S]*lastInitDispatchRef\.current\.dataContextSig === chartDataContextSig &&[\s\S]*lastInitDispatchRef\.current\.dataContextEpoch === chartDataContextEpoch &&[\s\S]*now - lastInitDispatchRef\.current\.at < CHART_INIT_RETRY_MIN_MS;[\s\S]*if \(!force && recentInitInFlight\) return;[\s\S]*if \(!force && initAttemptSig === lastInitAttemptSigRef\.current\) return;[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\];/,
    'non-forced pending init throttling must be epoch-scoped and happen before expensive full-history mapping and injection',
  );
  assertSourceContains(
    source,
    /lastInitDispatchRef\.current = \{[\s\S]*signature: initAttemptSig,[\s\S]*configSig: currentSig,[\s\S]*dataContextSig: chartDataContextSig,[\s\S]*dataContextEpoch: chartDataContextEpoch,[\s\S]*at: now,[\s\S]*\}/,
    'successful init injection must update the epoch-scoped pending dispatch throttle',
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
