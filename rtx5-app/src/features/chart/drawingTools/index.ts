import { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
import { crosshairDrawingTool } from './crosshairTool';
import { fibZoneDrawingTool } from './fibZoneTool';
import { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
import { highlightBoxDrawingTool } from './highlightBoxTool';
import { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
import { longPositionDrawingTool } from './longPositionTool';
import { magnetModeDrawingToolAction } from './magnetModeTool';
import { measureRangeDrawingTool } from './measureRangeTool';
import { patternPathDrawingTool } from './patternPathTool';
import { pitchforkDrawingTool } from './pitchforkTool';
import { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
import { stickerDrawingTool } from './stickerTool';
import { textLabelDrawingTool } from './textLabelTool';
import { trendLineDrawingTool } from './trendLineTool';
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

export { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
export { crosshairDrawingTool } from './crosshairTool';
export { fibZoneDrawingTool } from './fibZoneTool';
export { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
export { highlightBoxDrawingTool } from './highlightBoxTool';
export { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
export { longPositionDrawingTool } from './longPositionTool';
export { magnetModeDrawingToolAction } from './magnetModeTool';
export { measureRangeDrawingTool } from './measureRangeTool';
export { patternPathDrawingTool } from './patternPathTool';
export { pitchforkDrawingTool } from './pitchforkTool';
export { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
export { stickerDrawingTool } from './stickerTool';
export { textLabelDrawingTool } from './textLabelTool';
export { trendLineDrawingTool } from './trendLineTool';
export { zoomToFitDrawingToolAction } from './zoomToFitTool';
export {
  crosshairEnhancedDrawingToolRuntime,
  ENHANCED_DRAWING_TOOL_RUNTIMES,
  ENHANCED_DRAWING_TOOLS_RUNTIME_JS,
  fibZoneEnhancedDrawingToolRuntime,
  highlightBoxEnhancedDrawingToolRuntime,
  longPositionEnhancedDrawingToolRuntime,
  measureRangeEnhancedDrawingToolRuntime,
  patternPathEnhancedDrawingToolRuntime,
  pitchforkEnhancedDrawingToolRuntime,
  stickerEnhancedDrawingToolRuntime,
  textLabelEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
} from './runtime';

export const DRAWING_TOOL_OPTIONS: SelectableDrawingToolDefinition[] = [
  crosshairDrawingTool,
  trendLineDrawingTool,
  fibZoneDrawingTool,
  highlightBoxDrawingTool,
  textLabelDrawingTool,
  patternPathDrawingTool,
  longPositionDrawingTool,
  pitchforkDrawingTool,
  stickerDrawingTool,
];

export const DRAWING_SHEET_OPTIONS: SelectableDrawingToolDefinition[] = [
  ...DRAWING_TOOL_OPTIONS,
  measureRangeDrawingTool,
];

export const DRAWING_TOOL_COMMANDS: DrawingToolCommandDefinition[] = [
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
    key: 'measure-and-zoom',
    entries: [
      { kind: 'selectable', definition: measureRangeDrawingTool },
      { kind: 'command', definition: zoomToFitDrawingToolAction },
    ],
  },
  {
    key: 'drawing-state',
    entries: [
      { kind: 'command', definition: magnetModeDrawingToolAction },
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
  onToggleHide,
  onToggleLock,
  onToggleMagnet,
  onToggleStickyMode,
  onZoomTool,
}: Pick<
  DrawingToolsActionSheetConfig,
  'onClearDrawings' | 'onToggleHide' | 'onToggleLock' | 'onToggleMagnet' | 'onToggleStickyMode' | 'onZoomTool'
>): DrawingToolCommandHandlers {
  return {
    clearDrawings: onClearDrawings,
    hideAllDrawings: onToggleHide,
    lockAllDrawings: onToggleLock,
    magnetMode: onToggleMagnet,
    stayInDrawingMode: onToggleStickyMode,
    zoomToFit: onZoomTool,
  };
}

export function createDrawingToolsCommandHandlers(
  config: Pick<
    DrawingToolsActionSheetConfig,
    'onClearDrawings' | 'onToggleHide' | 'onToggleLock' | 'onToggleMagnet' | 'onToggleStickyMode' | 'onZoomTool'
  >,
): DrawingToolCommandHandlers {
  return createDrawingToolCommandHandlers(config);
}

export function createDrawingToolsActionSheetActions(
  config: DrawingToolsActionSheetConfig,
): DrawingToolsActionSheetAction[] {
  const commandState: DrawingToolsCommandState = {
    chartHideAll: config.chartHideAll,
    chartLockAll: config.chartLockAll,
    magnetEnabled: config.magnetEnabled,
    stickyDrawingMode: config.stickyDrawingMode,
  };
  const commandHandlers = createDrawingToolCommandHandlers(config);

  return [
    ...DRAWING_SHEET_OPTIONS.map((definition) => ({
      label: definition.actionLabel,
      onPress: () => config.onSelectTool(definition.tool),
    })),
    ...DRAWING_TOOL_COMMANDS.map((definition) => ({
      danger: definition.danger,
      label: resolveDrawingToolCommandLabel(definition, commandState),
      onPress: commandHandlers[definition.key],
    })),
  ];
}
