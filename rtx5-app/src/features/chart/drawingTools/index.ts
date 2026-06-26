import { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
import { crosshairDrawingTool } from './crosshairTool';
import { fibZoneDrawingTool } from './fibZoneTool';
import { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
import { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
import { longPositionDrawingTool } from './longPositionTool';
import { measureRangeDrawingTool } from './measureRangeTool';
import { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
import { textLabelDrawingTool } from './textLabelTool';
import { textLevelDrawingTool } from './textLevelTool';
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
export { measureRangeDrawingTool } from './measureRangeTool';
export { patternPathDrawingTool } from './patternPathTool';
export { pitchforkDrawingTool } from './pitchforkTool';
export { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
export { stickerDrawingTool } from './stickerTool';
export { textLabelDrawingTool } from './textLabelTool';
export { textLevelDrawingTool } from './textLevelTool';
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
  textLevelEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
} from './runtime';

export const DRAWING_TOOL_OPTIONS: SelectableDrawingToolDefinition[] = [
  crosshairDrawingTool,
  trendLineDrawingTool,
  fibZoneDrawingTool,
  textLabelDrawingTool,
  textLevelDrawingTool,
  longPositionDrawingTool,
];

export const DRAWING_SHEET_OPTIONS: SelectableDrawingToolDefinition[] = [
  ...DRAWING_TOOL_OPTIONS.filter((definition) => definition.tool !== textLabelDrawingTool.tool),
  measureRangeDrawingTool,
];

export const DRAWING_TOOL_COMMANDS: DrawingToolCommandDefinition[] = [
  zoomToFitDrawingToolAction,
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
  onToggleStickyMode,
  onZoomTool,
}: Pick<
  DrawingToolsActionSheetConfig,
  'onClearDrawings' | 'onToggleHide' | 'onToggleLock' | 'onToggleStickyMode' | 'onZoomTool'
>): DrawingToolCommandHandlers {
  return {
    clearDrawings: onClearDrawings,
    hideAllDrawings: onToggleHide,
    lockAllDrawings: onToggleLock,
    stayInDrawingMode: onToggleStickyMode,
    zoomToFit: onZoomTool,
  };
}

export function createDrawingToolsCommandHandlers(
  config: Pick<
    DrawingToolsActionSheetConfig,
    'onClearDrawings' | 'onToggleHide' | 'onToggleLock' | 'onToggleStickyMode' | 'onZoomTool'
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
    stickyDrawingMode: config.stickyDrawingMode,
  };
  const commandHandlers = createDrawingToolCommandHandlers(config);

  return [
    ...DRAWING_SHEET_OPTIONS.map((definition) => ({
      icon: definition.renderIcon(iconColor),
      label: definition.actionLabel,
      onPress: () => config.onSelectTool(definition.tool),
    })),
    ...DRAWING_TOOL_COMMANDS.map((definition) => ({
      danger: definition.danger,
      icon: definition.renderIcon(definition.danger ? dangerIconColor : iconColor),
      label: resolveDrawingToolCommandLabel(definition, commandState),
      onPress: commandHandlers[definition.key],
    })),
  ];
}
