import { arrowMarkerDrawingTool } from './arrowMarkerTool';
import { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
import { crosshairDrawingTool } from './crosshairTool';
import { ellipseDrawingTool } from './ellipseTool';
import { elliottWaveDrawingTool } from './elliottWaveTool';
import { extendedLineDrawingTool } from './extendedLineTool';
import { fibExtensionDrawingTool } from './fibExtensionTool';
import { fibZoneDrawingTool } from './fibZoneTool';
import { freehandBrushDrawingTool } from './freehandBrushTool';
import { gannFanDrawingTool } from './gannFanTool';
import { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
import { highlightBoxDrawingTool } from './highlightBoxTool';
import { horizontalLineDrawingTool } from './horizontalLineTool';
import { horizontalRayDrawingTool } from './horizontalRayTool';
import { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
import { longPositionDrawingTool } from './longPositionTool';
import { magnetModeDrawingToolAction } from './magnetModeTool';
import { measureRangeDrawingTool } from './measureRangeTool';
import { parallelChannelDrawingTool } from './parallelChannelTool';
import { patternPathDrawingTool } from './patternPathTool';
import { pitchforkDrawingTool } from './pitchforkTool';
import { rayDrawingTool } from './rayTool';
import { rectangleDrawingTool } from './rectangleTool';
import { redoDrawingToolAction } from './redoDrawingTool';
import { regressionChannelDrawingTool } from './regressionChannelTool';
import { shortPositionDrawingTool } from './shortPositionTool';
import { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
import { stickerDrawingTool } from './stickerTool';
import { textLabelDrawingTool } from './textLabelTool';
import { textLevelDrawingTool } from './textLevelTool';
import { trendLineDrawingTool } from './trendLineTool';
import { undoDrawingToolAction } from './undoDrawingTool';
import { verticalLineDrawingTool } from './verticalLineTool';
import { xabcdDrawingTool } from './xabcdTool';
import { zoomToFitDrawingToolAction } from './zoomToFitTool';
import type {
  DrawingToolCommandDefinition,
  DrawingToolCommandHandlers,
  DrawingToolSidebarGroup,
  DrawingToolsActionSheetAction,
  DrawingToolsActionSheetConfig,
  DrawingToolsCommandState,
  SelectableDrawingToolDefinition,
} from './types';
import { resolveDrawingToolCommandLabel } from './types';

export type {
  DrawingToolCommandHandlers,
  DrawingToolCommandDefinition,
  DrawingToolCommandKey,
  DrawingToolIconRenderer,
  DrawingToolSidebarEntry,
  DrawingToolSidebarGroup,
  DrawingToolsActionSheetAction,
  DrawingToolsActionSheetConfig,
  DrawingToolsCommandState,
  EnhancedDrawingToolRuntime,
  SelectableDrawingToolDefinition,
} from './types';
export { resolveDrawingToolCommandLabel } from './types';

export { arrowMarkerDrawingTool } from './arrowMarkerTool';
export { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
export { crosshairDrawingTool } from './crosshairTool';
export { ellipseDrawingTool } from './ellipseTool';
export { elliottWaveDrawingTool } from './elliottWaveTool';
export { extendedLineDrawingTool } from './extendedLineTool';
export { fibExtensionDrawingTool } from './fibExtensionTool';
export { fibZoneDrawingTool } from './fibZoneTool';
export { freehandBrushDrawingTool } from './freehandBrushTool';
export { gannFanDrawingTool } from './gannFanTool';
export { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
export { highlightBoxDrawingTool } from './highlightBoxTool';
export { horizontalLineDrawingTool } from './horizontalLineTool';
export { horizontalRayDrawingTool } from './horizontalRayTool';
export { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
export { longPositionDrawingTool } from './longPositionTool';
export { magnetModeDrawingToolAction } from './magnetModeTool';
export { measureRangeDrawingTool } from './measureRangeTool';
export { parallelChannelDrawingTool } from './parallelChannelTool';
export { patternPathDrawingTool } from './patternPathTool';
export { pitchforkDrawingTool } from './pitchforkTool';
export { rayDrawingTool } from './rayTool';
export { rectangleDrawingTool } from './rectangleTool';
export { redoDrawingToolAction } from './redoDrawingTool';
export { regressionChannelDrawingTool } from './regressionChannelTool';
export { shortPositionDrawingTool } from './shortPositionTool';
export { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
export { stickerDrawingTool } from './stickerTool';
export { textLabelDrawingTool } from './textLabelTool';
export { textLevelDrawingTool } from './textLevelTool';
export { trendLineDrawingTool } from './trendLineTool';
export { undoDrawingToolAction } from './undoDrawingTool';
export { verticalLineDrawingTool } from './verticalLineTool';
export { xabcdDrawingTool } from './xabcdTool';
export { zoomToFitDrawingToolAction } from './zoomToFitTool';
export {
  arrowMarkerEnhancedDrawingToolRuntime,
  crosshairEnhancedDrawingToolRuntime,
  ellipseEnhancedDrawingToolRuntime,
  elliottWaveEnhancedDrawingToolRuntime,
  ENHANCED_DRAWING_TOOL_RUNTIMES,
  ENHANCED_DRAWING_TOOLS_RUNTIME_JS,
  extendedLineEnhancedDrawingToolRuntime,
  fibExtensionEnhancedDrawingToolRuntime,
  fibZoneEnhancedDrawingToolRuntime,
  freehandBrushEnhancedDrawingToolRuntime,
  gannFanEnhancedDrawingToolRuntime,
  highlightBoxEnhancedDrawingToolRuntime,
  horizontalLineEnhancedDrawingToolRuntime,
  horizontalRayEnhancedDrawingToolRuntime,
  longPositionEnhancedDrawingToolRuntime,
  measureRangeEnhancedDrawingToolRuntime,
  parallelChannelEnhancedDrawingToolRuntime,
  patternPathEnhancedDrawingToolRuntime,
  pitchforkEnhancedDrawingToolRuntime,
  rayEnhancedDrawingToolRuntime,
  rectangleEnhancedDrawingToolRuntime,
  regressionChannelEnhancedDrawingToolRuntime,
  shortPositionEnhancedDrawingToolRuntime,
  stickerEnhancedDrawingToolRuntime,
  textLabelEnhancedDrawingToolRuntime,
  textLevelEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
  verticalLineEnhancedDrawingToolRuntime,
  xabcdEnhancedDrawingToolRuntime,
} from './runtime';

export const DRAWING_TOOL_OPTIONS: SelectableDrawingToolDefinition[] = [
  crosshairDrawingTool,
  trendLineDrawingTool,
  extendedLineDrawingTool,
  horizontalRayDrawingTool,
  fibZoneDrawingTool,
  textLabelDrawingTool,
  textLevelDrawingTool,
  longPositionDrawingTool,
];

export const DRAWING_SHEET_OPTIONS: SelectableDrawingToolDefinition[] = [
  ...DRAWING_TOOL_OPTIONS,
  horizontalLineDrawingTool,
  verticalLineDrawingTool,
  rayDrawingTool,
  arrowMarkerDrawingTool,
  parallelChannelDrawingTool,
  fibExtensionDrawingTool,
  rectangleDrawingTool,
  ellipseDrawingTool,
  freehandBrushDrawingTool,
  highlightBoxDrawingTool,
  patternPathDrawingTool,
  pitchforkDrawingTool,
  gannFanDrawingTool,
  regressionChannelDrawingTool,
  elliottWaveDrawingTool,
  xabcdDrawingTool,
  shortPositionDrawingTool,
  stickerDrawingTool,
  measureRangeDrawingTool,
];

export const DRAWING_TOOL_COMMANDS: DrawingToolCommandDefinition[] = [
  undoDrawingToolAction,
  redoDrawingToolAction,
  zoomToFitDrawingToolAction,
  magnetModeDrawingToolAction,
  stayInDrawingModeDrawingToolAction,
  lockAllDrawingsDrawingToolAction,
  hideAllDrawingsDrawingToolAction,
  clearDrawingsDrawingToolAction,
];

export const DRAWING_TOOL_SIDEBAR_GROUPS: DrawingToolSidebarGroup[] = [
  {
    key: 'main-tools',
    entries: DRAWING_TOOL_OPTIONS.map((definition) => ({ kind: 'selectable', definition })),
  },
  {
    key: 'history',
    entries: [
      { kind: 'command', definition: undoDrawingToolAction },
      { kind: 'command', definition: redoDrawingToolAction },
    ],
  },
  {
    key: 'measure-and-zoom',
    entries: [
      { kind: 'selectable', definition: measureRangeDrawingTool },
      { kind: 'command', definition: zoomToFitDrawingToolAction },
      { kind: 'command', definition: magnetModeDrawingToolAction },
    ],
  },
  {
    key: 'drawing-state',
    entries: [
      { kind: 'command', definition: stayInDrawingModeDrawingToolAction },
      { kind: 'command', definition: lockAllDrawingsDrawingToolAction },
      { kind: 'command', definition: hideAllDrawingsDrawingToolAction },
    ],
  },
  {
    key: 'destructive',
    entries: [
      { kind: 'command', definition: clearDrawingsDrawingToolAction },
    ],
  },
];

function createDrawingToolCommandHandlers({
  onClearDrawings,
  onRedoDrawing,
  onToggleHide,
  onToggleLock,
  onToggleMagnetMode,
  onToggleStickyMode,
  onUndoDrawing,
  onZoomTool,
}: Pick<
  DrawingToolsActionSheetConfig,
  | 'onClearDrawings'
  | 'onRedoDrawing'
  | 'onToggleHide'
  | 'onToggleLock'
  | 'onToggleMagnetMode'
  | 'onToggleStickyMode'
  | 'onUndoDrawing'
  | 'onZoomTool'
>): DrawingToolCommandHandlers {
  return {
    clearDrawings: onClearDrawings,
    hideAllDrawings: onToggleHide,
    lockAllDrawings: onToggleLock,
    redoDrawing: onRedoDrawing,
    stayInDrawingMode: onToggleStickyMode,
    toggleMagnetMode: onToggleMagnetMode,
    undoDrawing: onUndoDrawing,
    zoomToFit: onZoomTool,
  };
}

export function createDrawingToolsCommandHandlers(
  config: Pick<
    DrawingToolsActionSheetConfig,
    | 'onClearDrawings'
    | 'onRedoDrawing'
    | 'onToggleHide'
    | 'onToggleLock'
    | 'onToggleMagnetMode'
    | 'onToggleStickyMode'
    | 'onUndoDrawing'
    | 'onZoomTool'
  >,
): DrawingToolCommandHandlers {
  return createDrawingToolCommandHandlers(config);
}

export function createDrawingToolsActionSheetActions(
  config: DrawingToolsActionSheetConfig,
): DrawingToolsActionSheetAction[] {
  const iconColor = config.iconColor ?? '#64748B';
  const dangerIconColor = config.dangerIconColor ?? '#DC2626';
  const commandState: DrawingToolsCommandState = {
    chartHideAll: config.chartHideAll,
    chartLockAll: config.chartLockAll,
    drawingMagnetMode: config.drawingMagnetMode,
    stickyDrawingMode: config.stickyDrawingMode,
  };
  const commandHandlers = createDrawingToolCommandHandlers(config);
  const historyCommands = DRAWING_TOOL_COMMANDS.filter(
    (definition) => definition.key === 'undoDrawing' || definition.key === 'redoDrawing',
  );
  const utilityCommands = DRAWING_TOOL_COMMANDS.filter(
    (definition) => definition.key !== 'undoDrawing' && definition.key !== 'redoDrawing',
  );

  return [
    ...historyCommands.map((definition) => ({
      danger: definition.danger,
      icon: definition.renderIcon(definition.danger ? dangerIconColor : iconColor),
      label: resolveDrawingToolCommandLabel(definition, commandState),
      onPress: commandHandlers[definition.key],
    })),
    ...DRAWING_SHEET_OPTIONS.map((definition) => ({
      icon: definition.renderIcon(iconColor),
      label: definition.actionLabel,
      onPress: () => config.onSelectTool(definition.tool),
    })),
    ...utilityCommands.map((definition) => ({
      danger: definition.danger,
      icon: definition.renderIcon(definition.danger ? dangerIconColor : iconColor),
      label: resolveDrawingToolCommandLabel(definition, commandState),
      onPress: commandHandlers[definition.key],
    })),
  ];
}
