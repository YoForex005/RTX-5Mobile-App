import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();

test('setData full reload clears and recreates overlay price lines and markers', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full data reload must clear stale price-line refs');
  assertSourceContains(body, /_overlayMarkers = null/, 'full data reload must clear stale marker refs');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full data reload must recreate overlays');
});

test('applyOverlayPayload always starts from a clean slate before creating lines', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const clearBody = extractFunctionBody(source, 'clearOverlayPriceLines');

  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'overlay apply must clear old line refs first');
  assertSourceContains(body, /series\.createPriceLine/, 'overlay apply must create price lines from payload');
  assertSourceContains(clearBody, /series\.removePriceLine\(_positionLinesArr\[i\]\)/, 'clear must remove every previous line');
  assertSourceContains(clearBody, /_overlayPriceLinesByDragKey = Object\.create\(null\)/, 'clear must reset drag-key lookup');
});

test('overlay right-axis labels are deduped at the displayed price precision', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');

  assertSourceContains(source, /function getOverlayAxisLabelPriceKey\(price\)/, 'WebView must key labels by displayed precision');
  assertSourceContains(body, /var visibleOverlayAxisLabelKeys = Object\.create\(null\)/, 'overlay apply must track visible price labels');
  assertSourceContains(body, /var axisLabelKey = getOverlayAxisLabelPriceKey\(ln\.price\)/, 'overlay labels must use formatted price keys');
  assertSourceContains(body, /axisLabelVisible = false/, 'duplicate formatted labels must be hidden');
});

test('market price lines keep right-axis highlight badges disabled', () => {
  const setBidBody = extractFunctionBody(source, 'setBidPriceLine');
  const setAskBody = extractFunctionBody(source, 'setAskPriceLine');
  const refreshBody = extractFunctionBody(source, 'refreshOverlayDomLabels');

  assertSourceContains(setBidBody, /axisLabelVisible: false/, 'bid price line must not use native stacked axis labels');
  assertSourceContains(setAskBody, /axisLabelVisible: false/, 'ask price line must not use native stacked axis labels');
  assert.doesNotMatch(refreshBody, /renderMarketPriceBadges\(layer\)/, 'DOM refresh must not render filled bid/ask price badges');
});

test('empty overlay payload clears old price lines and markers immediately', () => {
  const body = extractFunctionBody(source, 'applyOverlayPayload');
  const setChartOverlaysBody = extractFunctionBody(source, 'setChartOverlays');

  assertSourceContains(body, /var lines = Array\.isArray\(payload\.priceLines\) \? payload\.priceLines : \[\]/, 'empty payload must normalize priceLines to []');
  assertSourceContains(body, /var markers = Array\.isArray\(payload\.markers\) \? payload\.markers : \[\]/, 'empty payload must normalize markers to []');
  assertSourceContains(body, /clearOverlayPriceLines\(\)/, 'empty payload must clear previous price lines');
  assertSourceContains(body, /clearOverlayMarkers\(\)/, 'empty payload must clear previous markers');
  assertSourceContains(body, /emptyPayloadClearConfirmed/, 'empty payload clear must be diagnostically confirmed');
  assertSourceContains(setChartOverlaysBody, /postWebViewOverlayLog\('setChartOverlays received'/, 'WebView must log received overlay payloads');
});

test('overlay injection before series exists self-heals through init, native resync, and WebView resync', () => {
  assertSourceContains(
    extractFunctionBody(source, '_doInitChart'),
    /applyOverlayPayload\(_overlayPayload\)/,
    'chart init must apply cached overlay payload once series exists',
  );
  assertSourceContains(
    source,
    /const resyncInterval = setInterval\(\(\) => \{[\s\S]*webViewRef\.current\.injectJavaScript\(js\)/,
    'native side must periodically re-push overlays',
  );
  assertSourceContains(
    source,
    /empty payload[\s\S]*stale price lines and markers/,
    'native resync must include empty payload clears',
  );
  assertSourceContains(
    extractFunctionBody(source, 'startOverlayResync'),
    /_positionLinesArr\.length !== _overlayPayload\.priceLines\.length[\s\S]*applyOverlayPayload\(_overlayPayload\)/,
    'WebView side must recreate missing overlay lines',
  );
});

test('CHART_READY immediately pushes latest overlays and market price lines', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_READY'[\s\S]*const latestOverlay = overlayPayloadRef\.current[\s\S]*setChartOverlays\(\$\{JSON\.stringify\(latestOverlay\)\}\)[\s\S]*setMarketPriceLines/,
    'CHART_READY must immediately restore overlays and bid/ask lines',
  );
});

test('dragging SL/TP line suppresses overlay recreation until drag finishes', () => {
  assertSourceContains(
    extractFunctionBody(source, 'setChartOverlays'),
    /if \(activeTradeLineDrag\)[\s\S]*scheduleTradeLineDragDomRefresh\(\)[\s\S]*return/,
    'overlay updates must not recreate lines while trade-line drag is active',
  );
  assertSourceContains(
    extractFunctionBody(source, 'updatePositionLines'),
    /if \(activeTradeLineDrag\)[\s\S]*return/,
    'manual overlay refresh must skip active trade-line drag',
  );
});
