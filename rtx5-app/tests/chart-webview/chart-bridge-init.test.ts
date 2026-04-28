import test from 'node:test';

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
    /const candlesRef = useRef\(candles\)[\s\S]*candlesRef\.current = candles/,
    'latest candle array must be retained outside READY timing',
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
    /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*!chartInitializedRef\.current[\s\S]*webViewReady[\s\S]*sendInit\(\)/,
    'watchdog must resend initChart until the chart is confirmed',
  );
});

test('WebView process loss resets bridge and reloads on both iOS and Android paths', () => {
  assertSourceContains(
    source,
    /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/,
    'iOS content process termination must reload chart WebView',
  );
  assertSourceContains(
    source,
    /onRenderProcessGone=\{\(\) => \{[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(false\)[\s\S]*webViewRef\.current\?\.reload\(\)/,
    'Android render process loss must reload chart WebView',
  );
});
