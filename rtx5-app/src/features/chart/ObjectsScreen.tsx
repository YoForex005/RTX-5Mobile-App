/**
 * Chart Feature UI: ObjectsScreen
 *
 * Professional drawing objects management screen. Allows users to manage,
 * add, lock, hide, and delete chart drawings with a polished trading-app UI.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';
import {
  TvTrendLine, TvFib, TvBrush, TvText, TvMeasure,
  TvPatterns, TvPrediction, TvPitchfork, TvSmiley,
  TvLock, TvHide, TvTrash,
} from './components/ChartToolbarIcons';
import {
  type ChartDrawingKind,
  getChartDrawingBucketKey,
} from './drawingPersistence';

// Drawing tool definitions for the quick-add grid
const DRAWING_TOOLS = [
  { key: 'trendline', label: 'Trend Line', Icon: TvTrendLine, color: '#3B82F6' },
  { key: 'fib', label: 'Fib Zone', Icon: TvFib, color: '#F59E0B' },
  { key: 'brush', label: 'Highlight', Icon: TvBrush, color: '#3B82F6' },
  { key: 'text', label: 'Text', Icon: TvText, color: '#2563EB' },
  { key: 'patterns', label: 'Pattern', Icon: TvPatterns, color: '#A855F7' },
  { key: 'prediction', label: 'Long Pos', Icon: TvPrediction, color: '#10B981' },
  { key: 'pitchfork', label: 'Pitchfork', Icon: TvPitchfork, color: '#8B5CF6' },
  { key: 'measure', label: 'Measure', Icon: TvMeasure, color: '#94A3B8' },
  { key: 'smiley', label: 'Emoji', Icon: TvSmiley, color: '#F59E0B' },
] as const satisfies ReadonlyArray<{
  key: ChartDrawingKind;
  label: string;
  Icon: typeof TvTrendLine;
  color: string;
}>;

export function ObjectsScreen() {
  const {
    chartSymbol,
    chartLockAll,
    chartHideAll,
    chartDrawings: legacyChartDrawings,
    chartDrawingRecordsBySymbol,
    setChartLockAll,
    setChartHideAll,
    addChartDrawing,
    removeChartDrawing,
    removeChartDrawingRecordForSymbol,
    themeMode,
  } = useUserPreferences();
  const queueChartDrawingTool = useUIState((s) => s.queueChartDrawingTool);
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const chartDrawings = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [];
  const legacyRows = legacyChartDrawings.map((label) => ({ id: label, label }));
  const displayDrawings = chartDrawings.length > 0 ? chartDrawings : legacyRows;

  const handleSelectTool = (tool: ChartDrawingKind) => {
    if (Platform.OS === 'web') {
      const selectedTool = DRAWING_TOOLS.find((item) => item.key === tool);
      if (selectedTool) {
        addChartDrawing(`${selectedTool.label} ${legacyChartDrawings.length + 1}`);
      }
      return;
    }

    queueChartDrawingTool(tool);
    router.back();
  };

  const handleRemoveDrawing = (drawingId: string, label: string) => {
    if (chartDrawings.length > 0) {
      removeChartDrawingRecordForSymbol(chartSymbol, drawingId);
      return;
    }

    removeChartDrawing(label);
  };

  return (
    <Screen style={s.screen}>
      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={s.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={s.headerTitleWrap} pointerEvents="none">
            <Text style={s.headerTitle} numberOfLines={1}>Objects</Text>
          </View>
          <View style={s.headerBackBtn} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Lock / Hide toggles */}
        <View style={s.toggleRow}>
          <Pressable
            style={[s.toggle, chartLockAll && s.toggleActive]}
            onPress={() => setChartLockAll(!chartLockAll)}
          >
            <TvLock color={chartLockAll ? '#3B82F6' : (isDark ? '#94A3B8' : '#64748B')} />
            <Text style={[s.toggleText, chartLockAll && s.toggleTextActive]}>
              {chartLockAll ? 'Unlock All' : 'Lock All'}
            </Text>
          </Pressable>
          <Pressable
            style={[s.toggle, chartHideAll && s.toggleActive]}
            onPress={() => setChartHideAll(!chartHideAll)}
          >
            <TvHide color={chartHideAll ? '#3B82F6' : (isDark ? '#94A3B8' : '#64748B')} />
            <Text style={[s.toggleText, chartHideAll && s.toggleTextActive]}>
              {chartHideAll ? 'Show All' : 'Hide All'}
            </Text>
          </Pressable>
        </View>

        {/* Drawing tools grid */}
        <View style={s.sectionHeader}>
          <Ionicons name="create-outline" size={16} color={isDark ? '#64748B' : '#94A3B8'} />
          <Text style={s.sectionTitle}>Drawing Tools</Text>
        </View>
        <View style={s.toolsGrid}>
          {DRAWING_TOOLS.map((tool) => (
            <Pressable
              key={tool.key}
              style={({ pressed }) => [s.toolCard, pressed && s.toolCardPressed]}
              onPress={() => handleSelectTool(tool.key)}
            >
              <View style={[s.toolIconWrap, { backgroundColor: tool.color + '18' }]}>
                <tool.Icon color={tool.color} />
              </View>
              <Text style={s.toolLabel} numberOfLines={1}>{tool.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Saved drawings */}
        <View style={s.sectionHeader}>
          <Ionicons name="layers-outline" size={16} color={isDark ? '#64748B' : '#94A3B8'} />
          <Text style={s.sectionTitle}>Saved Drawings</Text>
          <View style={s.countBadge}>
            <Text style={s.countText}>{displayDrawings.length}</Text>
          </View>
        </View>

        {displayDrawings.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="pencil-outline" size={40} color={isDark ? '#1E293B' : '#CBD5E1'} />
            <Text style={s.emptyTitle}>No drawings yet</Text>
            <Text style={s.emptySubtitle}>Tap a tool above or draw directly on the chart</Text>
          </View>
        ) : (
          <View style={s.drawingsList}>
            {displayDrawings.map((drawing, index: number) => (
              <Pressable
                key={drawing.id}
                style={({ pressed }) => [s.drawingRow, pressed && s.drawingRowPressed]}
                onLongPress={() => handleRemoveDrawing(drawing.id, drawing.label)}
              >
                <View style={s.drawingLeft}>
                  <View style={s.drawingIndex}>
                    <Text style={s.drawingIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={s.drawingName} numberOfLines={1}>{drawing.label}</Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveDrawing(drawing.id, drawing.label)}
                  hitSlop={12}
                  style={s.deleteBtn}
                >
                  <TvTrash color={isDark ? '#475569' : '#94A3B8'} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}

        {displayDrawings.length > 0 && (
          <Text style={s.hint}>
            <Ionicons name="information-circle-outline" size={13} color={isDark ? '#475569' : '#94A3B8'} />
            {'  '}Long press a drawing to remove it
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#0D1117' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subtleBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';

  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#06080D' : '#F1F5F9',
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      backgroundColor: isDark ? '#06080D' : '#F1F5F9',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },

    // Toggle buttons
    toggleRow: {
      marginTop: 16,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
    },
    toggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: cardBg,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    toggleActive: {
      borderColor: '#3B82F6',
      backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)',
    },
    toggleText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 14,
      fontWeight: '600',
    },
    toggleTextActive: {
      color: '#3B82F6',
    },

    // Section headers
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      flex: 1,
    },
    countBadge: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    countText: {
      color: '#3B82F6',
      fontSize: 12,
      fontWeight: '700',
    },

    // Drawing tools grid
    toolsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      gap: 8,
    },
    toolCard: {
      width: '30%',
      flexGrow: 1,
      flexBasis: '28%',
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 8,
    },
    toolCardPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.97 }],
    },
    toolIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolLabel: {
      color: isDark ? '#CBD5E1' : '#334155',
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 32,
      gap: 8,
    },
    emptyTitle: {
      color: isDark ? '#475569' : '#94A3B8',
      fontSize: 16,
      fontWeight: '600',
      marginTop: 4,
    },
    emptySubtitle: {
      color: isDark ? '#334155' : '#CBD5E1',
      fontSize: 13,
      textAlign: 'center',
    },

    // Drawings list
    drawingsList: {
      paddingHorizontal: 16,
      gap: 6,
    },
    drawingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingVertical: 12,
      paddingLeft: 12,
      paddingRight: 8,
    },
    drawingRowPressed: {
      backgroundColor: subtleBg,
    },
    drawingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    drawingIndex: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    drawingIndexText: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12,
      fontWeight: '700',
    },
    drawingName: {
      color: isDark ? '#E2E8F0' : '#1E293B',
      fontSize: 15,
      fontWeight: '500',
      flex: 1,
    },
    deleteBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },

    // Hint
    hint: {
      textAlign: 'center',
      color: isDark ? '#475569' : '#94A3B8',
      fontSize: 12,
      marginTop: 16,
      paddingHorizontal: 16,
    },
  });
}
