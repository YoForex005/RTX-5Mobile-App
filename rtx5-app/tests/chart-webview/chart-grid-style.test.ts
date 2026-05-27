import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readProjectFile = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, `${relativePath} was not found from the test working directory`);
  return readFileSync(filePath, 'utf8');
};

const constantsSource = readProjectFile('src/features/chart/ChartScreen.constants.ts');
const nativeChartSource = readProjectFile('src/features/chart/ChartScreen.native.tsx');
const webChartSource = readProjectFile('src/features/chart/ChartScreen.web.tsx');
const chartWebViewHtmlSource = readProjectFile('src/features/chart/rendering/ChartWebViewHtml.ts');
const fixedGridOverlaySource = readProjectFile(
  'src/features/chart/components/ChartFixedHorizontalGridOverlay.tsx',
);

test('native chart grid uses dotted MT5 guides behind candles', () => {
  assert.match(
    constantsSource,
    /export const CHART_GRID_LINE_STYLE = 4;/,
    'shared native grid style must use LightweightCharts LineStyle.SparseDotted',
  );
  assert.match(
    constantsSource,
    /measured 720x1640 reference recording/,
    'shared grid constant must document that the visible cadence comes from the measured MT5 recording',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_HORIZONTAL_LINE_COUNT = 7;/,
    'native WebView grid must keep MT5-style horizontal density',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET = 118;/,
    'native WebView grid must keep the measured first interior horizontal guide offset',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_HORIZONTAL_SPACING = 150;/,
    'native WebView grid must keep the measured MT5 horizontal spacing',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_VERTICAL_SPACING = 56;/,
    'native WebView grid must keep MT5-style vertical spacing',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_DASH_PATTERN = '7 5';/,
    'native grid layer must render measured MT5 dash cadence',
  );
  assert.match(
    constantsSource,
    /export const CHART_GRID_STROKE_WIDTH = 0\.5;/,
    'native grid stroke must stay thinner than a full WebView CSS pixel',
  );
  assert.match(
    nativeChartSource,
    /vertLines:\s*\{[\s\S]*style:\s*CHART_GRID_LINE_STYLE/,
    'native vertical grid lines must use the shared MT5-style grid constant',
  );
  assert.match(
    nativeChartSource,
    /vertLines:\s*\{\s*color:\s*'transparent'[\s\S]*style:\s*CHART_GRID_LINE_STYLE/,
    'native LightweightCharts vertical tick grid must stay hidden behind the MT5-style grid overlay',
  );
  assert.match(
    nativeChartSource,
    /horzLines:\s*\{[\s\S]*style:\s*CHART_GRID_LINE_STYLE/,
    'native horizontal grid lines must use the shared MT5-style grid constant',
  );
  assert.match(
    nativeChartSource,
    /horzLines:\s*\{\s*color:\s*'transparent'[\s\S]*style:\s*CHART_GRID_LINE_STYLE/,
    'native LightweightCharts horizontal tick grid must stay hidden behind the MT5-style grid overlay',
  );
  assert.match(
    nativeChartSource,
    /grid:\s*chartDisplay\.showGrid\s*\?\s*resolvedChartColors\.grid\s*:\s*'transparent'/,
    'native chart must pass grid visibility into the WebView moving time-grid layer',
  );
  assert.match(
    nativeChartSource,
    /chartDisplay\.showGrid\s*\?\s*'grid'\s*:\s*'nogrid'/,
    'native chart config signature must rebuild when grid visibility changes',
  );
  assert.doesNotMatch(
    nativeChartSource,
    /<ChartFixedHorizontalGridOverlay/,
    'native chart must not rely on a React Native fixed grid overlay for the visible chart grid',
  );
  assert.doesNotMatch(
    fixedGridOverlaySource,
    /gridLines\.vertical\.map|fixed-grid-vertical|verticalSpacing/,
    'fixed React Native overlay must not draw vertical guides because they would stay stuck during horizontal chart pan',
  );
});

test('WebView chart grid combines fixed horizontal guides with moving vertical guides', () => {
  assert.match(
    chartWebViewHtmlSource,
    /rtx5-moving-vertical-grid/,
    'native WebView must own the vertical time-grid layer',
  );
  assert.match(
    chartWebViewHtmlSource,
    /logicalToCoordinate/,
    'vertical grid must use LightweightCharts logical coordinates so it moves with candles',
  );
  assert.match(
    chartWebViewHtmlSource,
    /resolveMovingGridYPositions/,
    'horizontal grid guides must be drawn by the WebView plot layer',
  );
  assert.match(
    chartWebViewHtmlSource,
    /#chart \{[^}]*z-index: 1;[^}]*background: transparent/,
    'chart canvas must stay transparent so the grid layer sits behind candles, not over candle bodies',
  );
  assert.match(
    chartWebViewHtmlSource,
    /#rtx5-moving-vertical-grid \{[\s\S]*z-index: 0/,
    'custom grid layer must sit behind the chart canvas',
  );
  assert.match(
    chartWebViewHtmlSource,
    /makeChartCanvasBackgroundTransparent/,
    'WebView chart options must keep the canvas background transparent over the custom grid',
  );
  assert.match(
    chartWebViewHtmlSource,
    /setMovingGridAttribute\(horizontalLine, 'x1', 0\)[\s\S]*setMovingGridAttribute\(horizontalLine, 'x2', metrics\.paneWidth\)/,
    'horizontal grid guides must stay fixed across the full plot width',
  );
  assert.match(
    chartWebViewHtmlSource,
    /function applyMovingGridLineStyle\(line\)[\s\S]*line\.setAttribute\('stroke-linecap', 'round'\)/,
    'custom WebView grid must render round MT5-style dots instead of solid square lines',
  );
  assert.match(
    chartWebViewHtmlSource,
    /stroke-width', String\(MOVING_GRID_STROKE_WIDTH\)/,
    'custom WebView grid must use the measured fractional MT5-style stroke width',
  );
  assert.match(
    chartWebViewHtmlSource,
    /function setMovingGridAttribute\(line, name, value\)[\s\S]*line\.getAttribute\(name\) !== nextValue[\s\S]*line\.setAttribute\(name, nextValue\)/,
    'custom WebView grid must avoid redundant SVG attribute writes during scroll',
  );
  assert.match(
    chartWebViewHtmlSource,
    /layer\.style\.top = '0px'[\s\S]*layer\.style\.height = metrics\.paneHeight \+ 'px'/,
    'custom grid must cover the full chart pane, not only the candle margin band',
  );
  assert.match(
    chartWebViewHtmlSource,
    /anchorCoordinate = timeScaleApi\.logicalToCoordinate\(0\)[\s\S]*for \(var x = firstCoordinate; x <= metrics\.paneWidth \+ 1; x \+= visualSpacing\)/,
    'vertical grid must keep measured pixel spacing while taking phase from logical chart coordinates',
  );
  assert.match(
    chartWebViewHtmlSource,
    /subscribeVisibleLogicalRangeChange[\s\S]*scheduleMovingVerticalGridUpdate/,
    'vertical grid must update during left-right chart scroll',
  );
  assert.match(
    chartWebViewHtmlSource,
    /function scheduleMovingVerticalGridUpdate\(\)[\s\S]*if \(movingVerticalGridRaf\) \{[\s\S]*return;[\s\S]*requestAnimationFrame/,
    'vertical grid updates must coalesce to the next animation frame without canceling every scroll event',
  );
  assert.match(
    chartWebViewHtmlSource,
    /movingGridVerticalLines[\s\S]*resolveMovingGridLine[\s\S]*hideUnusedMovingGridLines/,
    'vertical grid scrolling must reuse SVG line nodes instead of rebuilding the grid every frame',
  );
  assert.match(
    chartWebViewHtmlSource,
    /CHART_GRID_VERTICAL_SPACING/,
    'vertical grid must use the shared MT5-style spacing constant',
  );
  assert.match(
    chartWebViewHtmlSource,
    /var firstInteriorLine = MOVING_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET;[\s\S]*var y = firstInteriorLine \+ index \* spacing/,
    'horizontal grid must keep the measured 118px first offset and 150px cadence',
  );
});

test('web chart and fixed horizontal overlay keep the same visible dotted grid style', () => {
  assert.match(
    webChartSource,
    /vertLines:\s*\{[^}]*style:\s*LineStyle\.SparseDotted/,
    'web vertical grid lines must match the native dotted cadence',
  );
  assert.match(
    webChartSource,
    /horzLines:\s*\{[^}]*style:\s*LineStyle\.SparseDotted/,
    'web horizontal grid lines must match the native dotted cadence',
  );
  assert.match(
    fixedGridOverlaySource,
    /strokeDasharray=\{dashPattern\}/,
    'fixed horizontal grid overlay must use the shared dotted dash pattern',
  );
  assert.match(
    fixedGridOverlaySource,
    /strokeLinecap="round"/,
    'fixed horizontal grid overlay must render round MT5-style dots',
  );
  assert.match(
    fixedGridOverlaySource,
    /strokeWidth=\{CHART_GRID_STROKE_WIDTH\}/,
    'fixed horizontal grid overlay must share the thinner MT5-style stroke width',
  );
});

test('chart time scale keeps older history open and bounds the live right edge', () => {
  assert.match(
    constantsSource,
    /export const CHART_TIME_SCALE_FIX_LEFT_EDGE = false;/,
    'left chart edge must stay open so older-history scrolling and pagination can continue',
  );
  assert.match(
    constantsSource,
    /export const CHART_TIME_SCALE_FIX_RIGHT_EDGE = false;/,
    'the library right-edge clamp must stay off so the visible live-candle right-offset gap is not collapsed',
  );
  assert.match(
    nativeChartSource,
    /fixLeftEdge:\s*CHART_TIME_SCALE_FIX_LEFT_EDGE[\s\S]*fixRightEdge:\s*CHART_TIME_SCALE_FIX_RIGHT_EDGE/,
    'native chart options must use the MT5-style asymmetric scroll bounds',
  );
  assert.match(
    webChartSource,
    /fixLeftEdge:\s*CHART_TIME_SCALE_FIX_LEFT_EDGE[\s\S]*fixRightEdge:\s*CHART_TIME_SCALE_FIX_RIGHT_EDGE/,
    'web chart options must use the same asymmetric scroll bounds',
  );
  assert.match(
    chartWebViewHtmlSource,
    /function resetTimeScaleDefaults\(lengthOverride\)[\s\S]*fixLeftEdge: \$\{CHART_TIME_SCALE_FIX_LEFT_EDGE\}[\s\S]*fixRightEdge: \$\{CHART_TIME_SCALE_FIX_RIGHT_EDGE\}/,
    'WebView reset must preserve the shared open-edge time-scale options',
  );
  assert.match(
    chartWebViewHtmlSource,
    /function clampVisibleLogicalRangeToLiveEdge\(range\)[\s\S]*var maxRight = getBoundedLiveRightEdge\(\)[\s\S]*range\.to <= maxRight \+ 0\.001[\s\S]*setVisibleLogicalRange\(\{[\s\S]*to: maxRight/,
    'WebView must bound right-side panning at latest candle plus the default right offset',
  );
  assert.match(
    chartWebViewHtmlSource,
    /subscribeVisibleLogicalRangeChange\(function\(range\) \{[\s\S]*if \(clampVisibleLogicalRangeToLiveEdge\(range\)\) \{[\s\S]*return;[\s\S]*\}[\s\S]*scheduleMovingVerticalGridUpdate\(\)/,
    'WebView must clamp extra live-side scroll before doing scroll-path work',
  );
});
