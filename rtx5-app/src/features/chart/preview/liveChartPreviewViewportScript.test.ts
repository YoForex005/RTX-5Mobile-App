import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
  resolveLiveChartPreviewRecentViewport,
} from './liveChartPreviewViewportScript';

test('full-width auxiliary panes open on the same recent-candle density as ChartScreen', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 320,
    viewportWidth: 390,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 45);
  assert.equal(viewport.rightEdge, 326.5);
  assert.equal(viewport.from, 281.5);
  assert.equal(viewport.to, 326.5);
  assert.ok(viewport.barSpacing >= 5 && viewport.barSpacing <= 11);
});

test('narrow divided panes keep readable candles and the shared seven-bar live gap', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 180,
    viewportWidth: 195,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 42);
  assert.equal(viewport.barSpacing, 5);
  assert.equal(viewport.rightEdge, 186.5);
  assert.equal(viewport.from, 144.5);
});

test('short histories remain fully visible without exceeding the normal spacing cap', () => {
  const viewport = resolveLiveChartPreviewRecentViewport({
    dataLength: 10,
    viewportWidth: 390,
  });

  assert.ok(viewport);
  assert.equal(viewport.visibleBars, 10);
  assert.equal(viewport.barSpacing, 11);
  assert.equal(viewport.from, 6.5);
  assert.equal(viewport.to, 16.5);
});

test('preview viewport bridge owns recent range and live-edge clamping', () => {
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /function applyPreviewRecentViewport\(lengthOverride\)/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /setVisibleLogicalRange\(\{[\s\S]*from: Math\.max\(-0\.5, rightEdge - visibleBars\),[\s\S]*to: rightEdge/,
  );
  assert.match(
    LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT,
    /subscribeVisibleLogicalRangeChange[\s\S]*clampPreviewVisibleLogicalRangeToLiveEdge/,
  );
});
