import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ActionSheet } from '../../../components/ActionSheet';

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
  magnetEnabled: boolean;
  onClearDrawings: () => void;
  onOpenDrawingTools: () => void;
  onSelectTool: (tool: string) => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleMagnet: () => void;
  onToggleStickyMode: () => void;
  onZoomTool: () => void;
  showDrawingToolbar: boolean;
  stickyDrawingMode: boolean;
};

type ChartDrawingToolsActionSheetProps = {
  chartHideAll: boolean;
  chartLockAll: boolean;
  magnetEnabled: boolean;
  minimumTopInset?: number;
  onClearDrawings: () => void;
  onClose: () => void;
  onSelectTool: (tool: string) => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleMagnet: () => void;
  onToggleStickyMode: () => void;
  onZoomTool: () => void;
  stickyDrawingMode: boolean;
  visible: boolean;
};

type DrawingToolOption = {
  actionLabel: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tool: string;
};

const DRAWING_TOOL_OPTIONS: DrawingToolOption[] = [
  { actionLabel: 'Crosshair', icon: 'crosshairs', tool: 'crosshair' },
  { actionLabel: 'Trend Line', icon: 'vector-line', tool: 'trendline' },
  { actionLabel: 'Fib Zone', icon: 'chart-timeline-variant', tool: 'fib' },
  { actionLabel: 'Highlight Box', icon: 'brush', tool: 'brush' },
  { actionLabel: 'Text Label', icon: 'format-text', tool: 'text' },
  { actionLabel: 'Pattern Path', icon: 'chart-bell-curve-cumulative', tool: 'patterns' },
  { actionLabel: 'Long Position', icon: 'chart-box-outline', tool: 'prediction' },
  { actionLabel: 'Pitchfork', icon: 'pitchfork', tool: 'pitchfork' },
  { actionLabel: 'Sticker', icon: 'emoticon-outline', tool: 'smiley' },
];

export const DRAWING_SHEET_OPTIONS: DrawingToolOption[] = [
  ...DRAWING_TOOL_OPTIONS,
  { actionLabel: 'Measure Range', icon: 'ruler', tool: 'measure' },
];

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
    backgroundColor: '#080B11',
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
  magnetEnabled,
  onClearDrawings,
  onOpenDrawingTools,
  onSelectTool,
  onToggleHide,
  onToggleLock,
  onToggleMagnet,
  onToggleStickyMode,
  onZoomTool,
  showDrawingToolbar,
  stickyDrawingMode,
}: ChartDrawingToolsSidebarProps) {
  const themeStyles = isDark ? darkStyles : lightStyles;

  if (!showDrawingToolbar) {
    return null;
  }

  return (
    <ScrollView
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
      >
        <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
      </Pressable>
      {DRAWING_TOOL_OPTIONS.map((option) => {
        const active = activeTool === option.tool;

        return (
          <Pressable
            key={option.tool}
            style={[baseStyles.toolIcon, active && themeStyles.toolIconActive]}
            onPress={() => onSelectTool(option.tool)}
          >
            <MaterialCommunityIcons
              name={option.icon}
              size={22}
              color={active ? colors.blue : colors.textMuted}
            />
          </Pressable>
          );
        })}
      <View style={[baseStyles.toolSeparator, themeStyles.toolSeparator]} />
      <Pressable
        style={[baseStyles.toolIcon, activeTool === 'measure' && themeStyles.toolIconActive]}
        onPress={() => onSelectTool('measure')}
      >
        <MaterialCommunityIcons
          name="ruler"
          size={22}
          color={activeTool === 'measure' ? colors.blue : colors.textMuted}
        />
      </Pressable>
      <Pressable style={baseStyles.toolIcon} onPress={onZoomTool}>
        <MaterialCommunityIcons name="magnify-plus-outline" size={22} color={colors.textMuted} />
      </Pressable>
      <View style={[baseStyles.toolSeparator, themeStyles.toolSeparator]} />
      <Pressable style={[baseStyles.toolIcon, magnetEnabled && themeStyles.toolIconActive]} onPress={onToggleMagnet}>
        <MaterialCommunityIcons name="magnet" size={22} color={magnetEnabled ? colors.blue : colors.textMuted} />
      </Pressable>
      <Pressable style={[baseStyles.toolIcon, stickyDrawingMode && themeStyles.toolIconActive]} onPress={onToggleStickyMode}>
        <MaterialCommunityIcons name="pencil-lock" size={22} color={stickyDrawingMode ? colors.blue : colors.textMuted} />
      </Pressable>
      <Pressable style={[baseStyles.toolIcon, chartLockAll && themeStyles.toolIconActive]} onPress={onToggleLock}>
        <MaterialCommunityIcons name="lock-outline" size={22} color={chartLockAll ? colors.blue : colors.textMuted} />
      </Pressable>
      <Pressable style={[baseStyles.toolIcon, chartHideAll && themeStyles.toolIconActive]} onPress={onToggleHide}>
        <MaterialCommunityIcons name="eye-off-outline" size={22} color={chartHideAll ? colors.blue : colors.textMuted} />
      </Pressable>
      <View style={[baseStyles.toolSeparator, themeStyles.toolSeparator]} />
      <Pressable style={baseStyles.toolIcon} onPress={onClearDrawings}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.textMuted} />
      </Pressable>
    </ScrollView>
  );
}

export function ChartDrawingToolsActionSheet({
  chartHideAll,
  chartLockAll,
  magnetEnabled,
  minimumTopInset,
  onClearDrawings,
  onClose,
  onSelectTool,
  onToggleHide,
  onToggleLock,
  onToggleMagnet,
  onToggleStickyMode,
  onZoomTool,
  stickyDrawingMode,
  visible,
}: ChartDrawingToolsActionSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Drawing Tools"
      minimumTopInset={minimumTopInset}
      actions={[
        ...DRAWING_SHEET_OPTIONS.map((option) => ({
          label: option.actionLabel,
          onPress: () => onSelectTool(option.tool),
        })),
        { label: 'Zoom To Fit', onPress: onZoomTool },
        {
          label: magnetEnabled ? 'Disable Magnet Mode' : 'Enable Magnet Mode',
          onPress: onToggleMagnet,
        },
        {
          label: stickyDrawingMode ? 'Disable Stay in Drawing Mode' : 'Enable Stay in Drawing Mode',
          onPress: onToggleStickyMode,
        },
        {
          label: chartLockAll ? 'Unlock All Drawings' : 'Lock All Drawings',
          onPress: onToggleLock,
        },
        {
          label: chartHideAll ? 'Show All Drawings' : 'Hide All Drawings',
          onPress: onToggleHide,
        },
        { label: 'Clear Drawings', danger: true, onPress: onClearDrawings },
      ]}
    />
  );
}
