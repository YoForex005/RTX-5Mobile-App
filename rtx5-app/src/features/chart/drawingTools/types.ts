import type { ReactNode } from 'react';

export type DrawingToolIconRenderer = (color: string) => ReactNode;

export type SelectableDrawingToolDefinition = {
  actionLabel: string;
  runtimeLabel?: string;
  renderIcon: DrawingToolIconRenderer;
  tool: string;
};

export type EnhancedDrawingToolRuntime = {
  script: string;
  tool: string;
};

export type DrawingToolsCommandState = {
  chartHideAll: boolean;
  chartLockAll: boolean;
  magnetEnabled: boolean;
  stickyDrawingMode: boolean;
};

export type DrawingToolCommandKey =
  | 'zoomToFit'
  | 'magnetMode'
  | 'stayInDrawingMode'
  | 'lockAllDrawings'
  | 'hideAllDrawings'
  | 'clearDrawings';

export type DrawingToolCommandDefinition = {
  actionLabel: string | ((state: DrawingToolsCommandState) => string);
  danger?: boolean;
  isActive?: (state: DrawingToolsCommandState) => boolean;
  key: DrawingToolCommandKey;
  renderIcon: DrawingToolIconRenderer;
};

export type DrawingToolSidebarEntry =
  | { kind: 'selectable'; definition: SelectableDrawingToolDefinition }
  | { kind: 'command'; definition: DrawingToolCommandDefinition };

export type DrawingToolSidebarGroup = {
  entries: DrawingToolSidebarEntry[];
  key: string;
};

export type DrawingToolsActionSheetAction = {
  danger?: boolean;
  label: string;
  onPress?: () => void;
};

export type DrawingToolsActionSheetConfig = DrawingToolsCommandState & {
  onClearDrawings: () => void;
  onSelectTool: (tool: string) => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleMagnet: () => void;
  onToggleStickyMode: () => void;
  onZoomTool: () => void;
};

export type DrawingToolCommandHandlers = Record<DrawingToolCommandKey, () => void>;

export function resolveDrawingToolCommandLabel(
  definition: DrawingToolCommandDefinition,
  state: DrawingToolsCommandState,
) {
  return typeof definition.actionLabel === 'function'
    ? definition.actionLabel(state)
    : definition.actionLabel;
}
