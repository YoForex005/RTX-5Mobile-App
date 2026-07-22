import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { dismissBeforeDrawingToolsSelection } from './drawingTools/actionSheetSelection';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('drawing tools action sheet exposes the full supported tool set', () => {
  const source = readSource('src/features/chart/drawingTools/index.ts');
  const arrowSource = readSource('src/features/chart/drawingTools/arrowMarkerTool.tsx');
  const ellipseSource = readSource('src/features/chart/drawingTools/ellipseTool.tsx');
  const extendedLineSource = readSource('src/features/chart/drawingTools/extendedLineTool.tsx');
  const fibExtensionSource = readSource('src/features/chart/drawingTools/fibExtensionTool.tsx');
  const fibSource = readSource('src/features/chart/drawingTools/fibZoneTool.tsx');
  const freehandSource = readSource('src/features/chart/drawingTools/freehandBrushTool.tsx');
  const horizontalRaySource = readSource('src/features/chart/drawingTools/horizontalRayTool.tsx');
  const measureSource = readSource('src/features/chart/drawingTools/measureRangeTool.tsx');
  const magnetSource = readSource('src/features/chart/drawingTools/magnetModeTool.tsx');
  const rectangleSource = readSource('src/features/chart/drawingTools/rectangleTool.tsx');
  const redoSource = readSource('src/features/chart/drawingTools/redoDrawingTool.tsx');
  const undoSource = readSource('src/features/chart/drawingTools/undoDrawingTool.tsx');
  const sheetOptions = source.slice(
    source.indexOf('export const DRAWING_SHEET_OPTIONS'),
    source.indexOf('export const DRAWING_TOOL_COMMANDS'),
  );
  const commandOptions = source.slice(
    source.indexOf('export const DRAWING_TOOL_COMMANDS'),
    source.indexOf('export const DRAWING_TOOL_SIDEBAR_GROUPS'),
  );
  const toolbarOptions = source.slice(
    source.indexOf('export const DRAWING_TOOL_OPTIONS'),
    source.indexOf('export const DRAWING_SHEET_OPTIONS'),
  );
  const actionSheetFactory = source.slice(
    source.indexOf('export function createDrawingToolsActionSheetActions'),
  );

  assert.match(toolbarOptions, /\btextLabelDrawingTool\b/);
  assert.match(toolbarOptions, /\bextendedLineDrawingTool\b/);
  assert.match(toolbarOptions, /\bhorizontalRayDrawingTool\b/);
  assert.match(sheetOptions, /\.\.\.DRAWING_TOOL_OPTIONS/);
  assert.match(arrowSource, /actionLabel:\s*'Arrow \/ Marker'/);
  assert.match(ellipseSource, /actionLabel:\s*'Circle \/ Ellipse'/);
  assert.match(extendedLineSource, /actionLabel:\s*'Extended Line'/);
  assert.match(fibSource, /actionLabel:\s*'Fibonacci Retracement'/);
  assert.match(fibExtensionSource, /actionLabel:\s*'Fibonacci Extension'/);
  assert.match(freehandSource, /actionLabel:\s*'Freehand Brush'/);
  assert.match(horizontalRaySource, /actionLabel:\s*'Horizontal Ray'/);
  assert.match(measureSource, /actionLabel:\s*'Scale'/);
  assert.match(rectangleSource, /actionLabel:\s*'Rectangle'/);
  assert.match(undoSource, /actionLabel:\s*'Undo Drawing'/);
  assert.match(redoSource, /actionLabel:\s*'Redo Drawing'/);
  assert.match(commandOptions, /undoDrawingToolAction[\s\S]*redoDrawingToolAction/);
  assert.match(source, /key:\s*'history'[\s\S]*undoDrawingToolAction[\s\S]*redoDrawingToolAction/);
  assert.match(actionSheetFactory, /const historyCommands = DRAWING_TOOL_COMMANDS\.filter/);
  assert.match(
    actionSheetFactory,
    /return \[\s*\.\.\.historyCommands\.map[\s\S]*\.\.\.DRAWING_SHEET_OPTIONS\.map[\s\S]*\.\.\.utilityCommands\.map/,
  );
  assert.doesNotMatch(actionSheetFactory, /activateOnPressIn:\s*true/);
  assert.match(source, /\bmagnetModeDrawingToolAction\b/);
  assert.match(magnetSource, /actionLabel:\s*\(\{ drawingMagnetMode \}\)/);
  for (const toolDefinition of [
    'horizontalLineDrawingTool',
    'verticalLineDrawingTool',
    'rayDrawingTool',
    'arrowMarkerDrawingTool',
    'parallelChannelDrawingTool',
    'fibExtensionDrawingTool',
    'rectangleDrawingTool',
    'ellipseDrawingTool',
    'freehandBrushDrawingTool',
    'highlightBoxDrawingTool',
    'patternPathDrawingTool',
    'pitchforkDrawingTool',
    'shortPositionDrawingTool',
    'stickerDrawingTool',
  ]) {
    assert.match(sheetOptions, new RegExp(`\\b${toolDefinition}\\b`));
  }
});

test('blank drawing search keeps every tool directly selectable on the chart', () => {
  const drawingSource = readSource('src/features/chart/drawingTools/index.ts');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const actionSheetFactory = drawingSource.slice(
    drawingSource.indexOf('export function createDrawingToolsActionSheetActions'),
  );
  const setToolHandler = chartSource.slice(
    chartSource.indexOf('const handleSetTool = useCallback'),
    chartSource.indexOf('const handleClearDrawings = useCallback'),
  );
  const drawingSheetConfig = chartSource.slice(
    chartSource.indexOf('const drawingToolsActionSheetConfig'),
    chartSource.indexOf('const handleOpenDrawingTools'),
  );
  const drawingSheetHandler = chartSource.slice(
    chartSource.indexOf('const handleOpenDrawingTools'),
    chartSource.indexOf('const handleOpenSettingsScreen'),
  );
  const drawingSheetPreload = chartSource.slice(
    chartSource.indexOf("preloadScopedActionSheet('chart', drawingToolsActionSheetConfig)"),
    chartSource.indexOf('const handleOpenDrawingTools'),
  );

  assert.match(
    actionSheetFactory,
    /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*onPress:\s*\(\) => config\.onSelectTool\(definition\.tool\)/,
  );
  assert.match(chartSource, /onSelectTool:\s*handleSetTool/);
  assert.match(setToolHandler, /setActiveTool\(tool\)/);
  assert.match(setToolHandler, /setChartDrawingInputActive\(nextDrawingInputActive\)/);
  assert.match(setToolHandler, /injectChartScript\(`setDrawingTool\(/);
  assert.match(drawingSheetConfig, /searchable:\s*true/);
  assert.match(drawingSheetConfig, /maximumVisibleActionRows:\s*12/);
  assert.match(drawingSheetConfig, /detent:\s*'large'/);
  assert.match(drawingSheetConfig, /instantOpen:\s*true/);
  assert.match(drawingSheetConfig, /entryMotion:\s*'instant'/);
  assert.doesNotMatch(drawingSheetConfig, /entryMotion:\s*'mt5Slide'/);
  assert.match(drawingSheetConfig, /keepFullHeightOnKeyboard:\s*true/);
  assert.match(drawingSheetConfig, /runActionAfterClose:\s*false/);
  assert.match(
    drawingSheetPreload,
    /useUIState\.subscribe\(\(state, previousState\) => \{[\s\S]*previousState\.scopedActionSheets\.chart !== null[\s\S]*state\.scopedActionSheets\.chart === null[\s\S]*preloadScopedActionSheet\('chart', drawingToolsActionSheetConfig\)/,
  );
  assert.match(
    drawingSheetHandler,
    /requestRetainedActionSheetPreview\(drawingToolsVisualKey\)[\s\S]*commitRetainedActionSheetPreview\([\s\S]*retainedRevision,[\s\S]*drawingToolsVisualKey,[\s\S]*\)[\s\S]*if \(retainedRevealAccepted\) \{[\s\S]*scheduleAfterFirstFrame\(adoptDrawingToolsSheet\)[\s\S]*return;/,
  );
  assert.match(
    drawingSheetHandler,
    /cancelRetainedActionSheetPreview\(retainedRevision\);[\s\S]*adoptDrawingToolsSheet\(\)/,
  );
  assert.match(
    drawingSheetHandler,
    /const adoptDrawingToolsSheet = \(\) => \{[\s\S]*closeChartTapMenu\(\);[\s\S]*showChartActionSheet\(drawingToolsActionSheetConfig\);[\s\S]*scheduleChartActionSheetContextReset\(\);/,
  );
  assert.doesNotMatch(drawingSheetHandler, /openChartActionSheetSmoothly/);
  assert.doesNotMatch(drawingSheetHandler, /requestAnimationFrame|setTimeout/);
});

test('every drawing action dismisses the sheet before applying its selection', () => {
  const calls: string[] = [];
  const [wrappedAction] = dismissBeforeDrawingToolsSelection(
    [{ label: 'Trend Line', onPress: () => calls.push('apply') }],
    () => calls.push('dismiss'),
  );

  wrappedAction.onPress?.();

  assert.deepEqual(calls, ['dismiss', 'apply']);

  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const drawingActions = chartSource.slice(
    chartSource.indexOf('const drawingToolsActions = useMemo'),
    chartSource.indexOf('const drawingToolsVisualKey'),
  );
  assert.match(
    drawingActions,
    /dismissBeforeDrawingToolsSelection\([\s\S]*createDrawingToolsActionSheetActions\([\s\S]*hideChartActionSheet/,
  );
});
