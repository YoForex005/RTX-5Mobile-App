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

test('route entry retries kept-alive chart viewport recovery during cold start', () => {
  assertSourceContains(
    source,
    /const scheduleChartViewportColdStartRecovery = useCallback\(\(\) => \{[\s\S]*requestChartViewportRecovery\(6\)[\s\S]*\[180, 650, 1400, 2600\]\.map\(\(delayMs\) =>[\s\S]*setTimeout\(\(\) => \{[\s\S]*requestChartViewportRecovery\(delayMs >= 1400 \? 4 : 5\)[\s\S]*recoveryTimers\.forEach\(\(timer\) => clearTimeout\(timer\)\)/,
    'cold route entry must retry viewport recovery across the slow first WebView boot window',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*!isScreenFocused \|\| !chartRuntimeActive \|\| !chartSurfaceReady[\s\S]*chartTapMenuBounds\.width <= 0 \|\| chartTapMenuBounds\.height <= 0[\s\S]*const cancelColdStartRecovery = scheduleChartViewportColdStartRecovery\(\)[\s\S]*cancelColdStartRecovery\(\)[\s\S]*cancelChartViewportRecovery\(\)[\s\S]*\}, \[[\s\S]*chartRuntimeActive[\s\S]*chartSurfaceReady[\s\S]*chartTapMenuBounds\.height[\s\S]*chartTapMenuBounds\.width[\s\S]*cancelChartViewportRecovery[\s\S]*isScreenFocused[\s\S]*scheduleChartViewportColdStartRecovery[\s\S]*\]\);/,
    'focused chart route must schedule cold-start recovery and clean it up on route changes',
  );
});

test('WebView ready events recover cold-start viewport size after the bridge exists', () => {
  assertSourceContains(
    source,
    /msg\.type === 'READY'[\s\S]*setWebViewReady\(true\);[\s\S]*if \(isScreenFocused\) \{[\s\S]*requestChartViewportRecovery\(2\);[\s\S]*\}[\s\S]*msg\.type === 'CHART_READY'/,
    'WebView READY must retry viewport recovery after the resize bridge has loaded',
  );
  assertSourceContains(
    source,
    /msg\.type === 'CHART_READY'[\s\S]*setChartReadyEpoch\(\(c\) => c \+ 1\);[\s\S]*requestChartViewportRecovery\(4\);/,
    'CHART_READY must recover the viewport after the chart surface is created',
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
    /accessibilityLabel: `\$\{t\('Chart'\)\} \$\{t\('Options'\)\}`[\s\S]*onPress: onOpenScaleControls[\s\S]*<Ionicons name="options-outline"/,
    'radial menu must render one filter-style chart scale button',
  );
  assertSourceContains(
    source,
    /const chartScaleActions = useMemo\([\s\S]*label: t\('Scroll to last bar'\)[\s\S]*label: t\('Reset vertical scale'\)[\s\S]*label: t\('Auto-scale'\)[\s\S]*label: t\('Vertical movement'\)/,
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
  assertSourceContains(body, /rememberHostViewportSize\(width, height\)[\s\S]*resolveChartViewportSize\(hostSize\.width, hostSize\.height\)/, 'resize must use native host viewport size as the authority');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize active chart');
  assertSourceContains(body, /refreshOverlayDomLabels\(_overlayPayload\)/, 'resize must refresh overlay labels');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must post updated chart geometry');
});

test('WebView chart creation resists cold-start internal shrink measurements', () => {
  const rememberBody = extractFunctionBody(source, 'rememberHostViewportSize');
  const resolveBody = extractFunctionBody(source, 'resolveChartViewportSize');
  const initBody = extractFunctionBody(source, '_doInitChart');
  const recoverBody = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(source, /var lastHostViewportSize = \{ width: 0, height: 0 \}/, 'WebView must remember the latest native viewport');
  assertSourceContains(rememberBody, /lastHostViewportSize = size/, 'native viewport measurements must replace stale remembered size');
  assertSourceContains(resolveBody, /hostWidth > 0 && \(resolvedWidth <= 0 \|\| resolvedWidth < hostWidth \* 0\.92\)[\s\S]*resolvedWidth = hostWidth/, 'cold WebView width must not override a larger native host width');
  assertSourceContains(resolveBody, /hostHeight > 0 && \(resolvedHeight <= 0 \|\| resolvedHeight < hostHeight \* 0\.92\)[\s\S]*resolvedHeight = hostHeight/, 'cold WebView height must not override a larger native host height');
  assertSourceContains(initBody, /var viewportSize = resolveChartViewportSize\(\)[\s\S]*safeOpts\.width = w[\s\S]*safeOpts\.height = h/, 'initial chart creation must use the stable viewport resolver');
  assertSourceContains(recoverBody, /rememberHostViewportSize\(width, height\)[\s\S]*resolveChartViewportSize\(hostSize\.width, hostSize\.height\)[\s\S]*chart\.resize\(w, h\)/, 'surface recovery must use the same stable viewport resolver');
  assertSourceContains(source, /new ResizeObserver\(function\(entries\) \{[\s\S]*resolveChartViewportSize\(entry\.contentRect\.width, entry\.contentRect\.height\)[\s\S]*chart\.resize\(w, h\)/, 'ResizeObserver must not reapply stale shrunken WebView dimensions');
});

test('recoverChartSurface restores data, overlays, market price lines, direction lines, and geometry', () => {
  const body = extractFunctionBody(source, 'recoverChartSurface');

  assertSourceContains(body, /series\.setData\(mapped\)/, 'recovery must restore chart data');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'recovery must restore overlays');
  assertSourceContains(body, /setLivePriceLine\(lastLivePrice\)/, 'recovery must restore the live price line');
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
