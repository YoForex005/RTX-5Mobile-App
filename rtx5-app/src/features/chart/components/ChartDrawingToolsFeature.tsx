import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, View, Platform } from 'react-native';
import { ActionSheet } from '../../../ui/components/ActionSheet';
import {
  TvRadialPlus,
} from './ChartToolbarIcons';
import {
  createDrawingToolsActionSheetActions,
  createDrawingToolsCommandHandlers,
  DRAWING_TOOL_SIDEBAR_GROUPS,
  type DrawingToolCommandHandlers,
  type DrawingToolSidebarEntry,
  type DrawingToolsCommandState,
} from '../drawingTools';

type ChartDrawingToolbarButtonProps = {
  isDark: boolean;
  textMutedColor: string;
  onPress: () => void;
};

type ChartDrawingToolsSidebarProps = {
  activeTool: string;
  chartHideAll: boolean;
  chartLockAll: boolean;
  colors: {
    blue: string;
    textMuted: string;
  };
  isChartExpanded: boolean;
  isDark: boolean;
  onClearDrawings: () => void;
  onOpenDrawingTools: () => void;
  onSelectTool: (tool: string) => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleStickyMode: () => void;
  onZoomTool: () => void;
  showDrawingToolbar: boolean;
  stickyDrawingMode: boolean;
};

type ChartDrawingToolsActionSheetProps = {
  chartHideAll: boolean;
  chartLockAll: boolean;
  dangerIconColor?: string;
  iconColor?: string;
  minimumTopInset?: number;
  onClearDrawings: () => void;
  onClose: () => void;
  onSelectTool: (tool: string) => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleStickyMode: () => void;
  onZoomTool: () => void;
  stickyDrawingMode: boolean;
  visible: boolean;
};


const baseStyles = StyleSheet.create({
  toolbarSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  toolbarIconButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftToolbar: {
    width: 54,
    minWidth: 54,
    maxWidth: 54,
    flexShrink: 0,
    flexGrow: 0,
    borderRightWidth: 1,
  },
  leftToolbarOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    height: '100%',
    borderRightWidth: 1,
  },
  leftToolbarContent: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  toolIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  toolIconPrimary: {
    marginBottom: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 0,
  },
  toolSeparator: {
    width: 20,
    height: 1,
    marginVertical: -4,
  },
});

const lightStyles = StyleSheet.create({
  toolbarSlot: {
    borderLeftColor: 'rgba(0,0,0,0.08)',
  },
  leftToolbar: {
    backgroundColor: '#F8FAFC',
    borderRightColor: '#E5E7EB',
  },
  leftToolbarOverlay: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRightColor: 'rgba(0,0,0,0.1)',
  },
  toolIconActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  toolSeparator: {
    backgroundColor: '#E5E7EB',
  },
});

const darkStyles = StyleSheet.create({
  toolbarSlot: {
    borderLeftColor: 'rgba(255,255,255,0.08)',
  },
  leftToolbar: {
    backgroundColor: '#1E1E1E',
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  leftToolbarOverlay: {
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  toolIconActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  toolSeparator: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

export function ChartDrawingToolbarButton({
  isDark,
  textMutedColor,
  onPress,
}: ChartDrawingToolbarButtonProps) {
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <View style={[baseStyles.toolbarSlot, themeStyles.toolbarSlot]}>
      <Pressable
        style={baseStyles.toolbarIconButton}
        onPress={onPress}
        activateOnPressIn
        activateOnTouchStart
        hitSlop={8}
        unstable_pressDelay={0}
      >
        <Ionicons name="pencil-outline" size={18} color={textMutedColor} />
      </Pressable>
    </View>
  );
}

export function ChartDrawingToolsSidebar({
  activeTool,
  chartHideAll,
  chartLockAll,
  colors,
  isChartExpanded,
  isDark,
  onClearDrawings,
  onOpenDrawingTools,
  onSelectTool,
  onToggleHide,
  onToggleLock,
  onToggleStickyMode,
  onZoomTool,
  showDrawingToolbar,
  stickyDrawingMode,
}: ChartDrawingToolsSidebarProps) {
  const themeStyles = isDark ? darkStyles : lightStyles;
  const commandState: DrawingToolsCommandState = {
    chartHideAll,
    chartLockAll,
    stickyDrawingMode,
  };
  const commandHandlers: DrawingToolCommandHandlers = createDrawingToolsCommandHandlers({
    onClearDrawings,
    onToggleHide,
    onToggleLock,
    onToggleStickyMode,
    onZoomTool,
  });
  const renderSidebarEntry = (entry: DrawingToolSidebarEntry) => {
    if (entry.kind === 'selectable') {
      const active = activeTool === entry.definition.tool;

      return (
        <Pressable
          key={entry.definition.tool}
          style={[baseStyles.toolIcon, active && themeStyles.toolIconActive]}
          onPress={() => onSelectTool(entry.definition.tool)}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={6}
          unstable_pressDelay={0}
        >
          {entry.definition.renderIcon(active ? colors.blue : colors.textMuted)}
        </Pressable>
      );
    }

    const active = entry.definition.isActive?.(commandState) ?? false;

    return (
      <Pressable
        key={entry.definition.key}
        style={[baseStyles.toolIcon, active && themeStyles.toolIconActive]}
        onPress={commandHandlers[entry.definition.key]}
        activateOnPressIn
        activateOnTouchStart
        hitSlop={6}
        unstable_pressDelay={0}
      >
        {entry.definition.renderIcon(active ? colors.blue : colors.textMuted)}
      </Pressable>
    );
  };

  if (!showDrawingToolbar) {
    return null;
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="always"
      canCancelContentTouches={Platform.OS === 'ios'}
      style={[
        baseStyles.leftToolbar,
        themeStyles.leftToolbar,
        !isChartExpanded && baseStyles.leftToolbarOverlay,
        !isChartExpanded && themeStyles.leftToolbarOverlay,
      ]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={baseStyles.leftToolbarContent}
    >
      <Pressable
        style={[
          baseStyles.toolIcon,
          baseStyles.toolIconPrimary,
          { backgroundColor: colors.blue, shadowColor: colors.blue },
        ]}
        onPress={onOpenDrawingTools}
        activateOnPressIn
        activateOnTouchStart
        hitSlop={6}
        unstable_pressDelay={0}
      >
        <TvRadialPlus color="#FFFFFF" />
      </Pressable>
      {DRAWING_TOOL_SIDEBAR_GROUPS.map((group, groupIndex) => (
        <React.Fragment key={group.key}>
          {group.entries.map(renderSidebarEntry)}
          {groupIndex < DRAWING_TOOL_SIDEBAR_GROUPS.length - 1 ? (
            <View style={[baseStyles.toolSeparator, themeStyles.toolSeparator]} />
          ) : null}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

export function ChartDrawingToolsActionSheet({
  chartHideAll,
  chartLockAll,
  dangerIconColor = '#DC2626',
  iconColor = '#64748B',
  minimumTopInset,
  onClearDrawings,
  onClose,
  onSelectTool,
  onToggleHide,
  onToggleLock,
  onToggleStickyMode,
  onZoomTool,
  stickyDrawingMode,
  visible,
}: ChartDrawingToolsActionSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      presentation="mt5Plain"
      showActionIcons
      minimumTopInset={minimumTopInset}
      detent="adaptive"
      instantOpen
      actions={createDrawingToolsActionSheetActions({
        chartHideAll,
        chartLockAll,
        dangerIconColor,
        iconColor,
        onClearDrawings,
        onSelectTool,
        onToggleHide,
        onToggleLock,
        onToggleStickyMode,
        onZoomTool,
        stickyDrawingMode,
      })}
    />
  );
}
