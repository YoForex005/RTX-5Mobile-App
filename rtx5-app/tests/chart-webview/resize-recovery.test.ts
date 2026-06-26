import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();
const radialMenuSource = (() => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/components/ChartTapRadialMenu.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/components/ChartTapRadialMenu.tsx'),
  ];
  const radialPath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(radialPath, 'ChartTapRadialMenu.tsx was not found from the test working directory');
  return readFileSync(radialPath, 'utf8');
})();

test('native viewport layout schedules resize and frame sync', () => {
  assertSourceContains(
    source,
    /onLayout=\{\(event\) => \{[\s\S]*setChartTapMenuBounds\(\{ width, height \}\)[\s\S]*scheduleChartViewportResize\(width, height, true\)[\s\S]*syncChartViewportFrame\(\)/,
    'chart viewport layout must force a fast WebView resize and update measured frame',
  );
});

test('fullscreen enter and exit cancel stale resize frames and use the fast press path', () => {
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*cancelChartViewportRecovery\(\)[\s\S]*pendingChartViewportSizeRef\.current = null[\s\S]*\}, \[cancelChartViewportRecovery, isChartExpanded\]\)/,
    'fullscreen changes must cancel stale pending resize state',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*requestChartViewportRecovery\(4\)[\s\S]*isChartExpanded/,
    'fullscreen changes must request chart viewport recovery',
  );
  assertSourceContains(
    source,
    /onPressIn=\{handleToggleChartExpanded\}/,
    'fullscreen toggle must react on touch-down instead of waiting for press release',
  );
});

test('chart viewport keeps scale controls in the radial menu, not price-scale dots', () => {
  assertSourceContains(
    source,
    /<ChartTapRadialMenu[\s\S]*onOpenScaleControls=\{handleOpenChartScaleMenu\}/,
    'chart scale controls must be opened from one tap radial menu section',
  );
  assertSourceContains(
    radialMenuSource,
    /accessibilityLabel: 'Chart scale controls'[\s\S]*onPress: onOpenScaleControls[\s\S]*<Ionicons name="options-outline"/,
    'radial menu must render one filter-style chart scale button',
  );
  assertSourceContains(
    source,
    /const chartScaleActions = useMemo\([\s\S]*label: t\('Scroll to last bar'\)[\s\S]*label: t\('Reset vertical scale'\)[\s\S]*label: t\(isChartAutoScaleEnabled \? 'Free chart movement' : 'Auto-scale'\)[\s\S]*label: t\(isVerticalScrollingLocked \? 'Unlock vertical scrolling' : 'Lock vertical scrolling'\)/,
    'chart scale dropdown must contain the four scale commands',
  );
  assert.doesNotMatch(radialMenuSource, /const scaleActionItems/);
  assert.doesNotMatch(source, /const chartPriceScaleActions = useMemo\(/);
  assert.doesNotMatch(source, /handleOpenChartPriceScaleMenu/);
  assert.doesNotMatch(source, /styles\.chartPriceScaleMenuButton/);
  assertSourceContains(
    source,
    /label: t\(showChartVolumePane \? 'Hide Volume Bar' : 'Show Volume Bar'\)[\s\S]*label: t\('Reset'\)/,
    'chart volume/reset actions must remain available from the toolbar options sheet',
  );
});

test('requestChartViewportRecovery forces resize passes and ends with recoverChartSurface', () => {
  const body = source.slice(source.indexOf('const requestChartViewportRecovery'), source.indexOf('const { candles } = useLiveCandles'));

  assertSourceContains(body, /scheduleChartViewportResize\(resizeWidth, resizeHeight, true\)/, 'recovery must force resize commits');
  assertSourceContains(body, /recoverChartViewportSurface\(resizeWidth, resizeHeight\)/, 'final recovery pass must call recoverChartSurface bridge');
  assertSourceContains(body, /requestAnimationFrame\(runRecoveryPass\)/, 'recovery must run across animation frames');
});

test('WebView resizeChartViewport replays pending init and reports geometry', () => {
  const body = extractFunctionBody(source, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending init');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize active chart');
  assertSourceContains(body, /refreshOverlayDomLabels\(_overlayPayload\)/, 'resize must refresh overlay labels');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must post updated chart geometry');
});

test('recoverChartSurface restores data, overlays, market price lines, direction lines, and geometry', () => {
  const body = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'recovery must restore chart data');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'recovery must restore overlays');
  assertSourceContains(body, /setMarketPriceLines\(lastBidPrice, lastAskPrice\)/, 'recovery must restore bid/ask lines');
  assertSourceContains(body, /refreshDirectionPriceLine\(\)/, 'recovery must restore direction price line');
  assertSourceContains(body, /postChartGeometry\(\)/, 'recovery must report geometry');
});

test('AppState foreground recovery refreshes overlay sources and chart surface', () => {
  assertSourceContains(
    source,
    /AppState\.addEventListener\('change', \(state\) => \{[\s\S]*state === 'active' && isScreenFocused[\s\S]*refreshShowOnChartSources\(\)[\s\S]*requestChartViewportRecovery\(3\)/,
    'foreground transition must refresh chart data sources and recover WebView surface',
  );
});
