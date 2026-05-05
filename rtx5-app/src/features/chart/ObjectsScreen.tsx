/**
 * Chart Feature UI: ObjectsScreen
 *
 * MetaTrader-style chart objects manager backed by persisted drawing records.
 * It exposes add-object flows, global object toggles, and a current-objects
 * list that can hide/show or delete persisted drawings.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { Screen } from '../../ui/components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import {
  TvBrush,
  TvFib,
  TvMeasure,
  TvPatterns,
  TvPitchfork,
  TvPrediction,
  TvSmiley,
  TvText,
  TvTrendLine,
} from './components/ChartToolbarIcons';
import {
  type ChartDrawingKind,
  getChartDrawingBucketKey,
} from './drawingPersistence';
import { useShallow } from 'zustand/shallow';

type DrawingIconComponent = typeof TvTrendLine;

type DrawingToolMeta = {
  key: ChartDrawingKind;
  label: string;
  description: string;
  Icon: DrawingIconComponent;
  accent: string;
};

type DisplayDrawing = {
  id: string;
  label: string;
  description: string;
  hidden: boolean;
  kind: ChartDrawingKind | null;
  text?: string;
  supportsVisibility: boolean;
};

const DRAWING_TOOL_META: Record<ChartDrawingKind, DrawingToolMeta> = {
  trendline: {
    key: 'trendline',
    label: 'Trend line',
    description: 'Two-point line',
    Icon: TvTrendLine,
    accent: '#2563EB',
  },
  fib: {
    key: 'fib',
    label: 'Fib zone',
    description: 'Retracement area',
    Icon: TvFib,
    accent: '#D97706',
  },
  brush: {
    key: 'brush',
    label: 'Highlight',
    description: 'Marked area',
    Icon: TvBrush,
    accent: '#2563EB',
  },
  text: {
    key: 'text',
    label: 'Text',
    description: 'Chart label',
    Icon: TvText,
    accent: '#1D4ED8',
  },
  patterns: {
    key: 'patterns',
    label: 'Pattern',
    description: 'Polyline pattern',
    Icon: TvPatterns,
    accent: '#9333EA',
  },
  prediction: {
    key: 'prediction',
    label: 'Long position',
    description: 'Risk / reward box',
    Icon: TvPrediction,
    accent: '#059669',
  },
  pitchfork: {
    key: 'pitchfork',
    label: 'Pitchfork',
    description: 'Three-point fork',
    Icon: TvPitchfork,
    accent: '#7C3AED',
  },
  smiley: {
    key: 'smiley',
    label: 'Sticker',
    description: 'Chart sticker',
    Icon: TvSmiley,
    accent: '#D97706',
  },
  measure: {
    key: 'measure',
    label: 'Measure',
    description: 'Price / time range',
    Icon: TvMeasure,
    accent: '#475569',
  },
};

const ADD_OBJECT_TOOLS: ChartDrawingKind[] = [
  'trendline',
  'fib',
  'brush',
  'patterns',
  'prediction',
  'pitchfork',
  'measure',
  'smiley',
];

function buildLegacyDrawingDescription(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'Chart object';
  }

  const knownMeta = Object.values(DRAWING_TOOL_META).find((item) =>
    normalized.toLowerCase().startsWith(item.label.toLowerCase()),
  );

  return knownMeta?.description ?? 'Chart object';
}

function ActionRow({
  label,
  description,
  accent,
  Icon,
  onPress,
  showDivider,
  styles,
  isDark,
}: {
  label: string;
  description: string;
  accent: string;
  Icon: DrawingIconComponent;
  onPress: () => void;
  showDivider?: boolean;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
}) {
  return (
    <>
      <Pressable style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]} onPress={onPress}>
        <View style={styles.rowLeft}>
          <View style={[styles.rowIconWrap, { backgroundColor: `${accent}18` }]}>
            <Icon color={accent} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{label}</Text>
            <Text style={styles.rowSubtitle}>{description}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={isDark ? '#475569' : '#94A3B8'} />
      </Pressable>
      {showDivider ? <View style={styles.panelDivider} /> : null}
    </>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  styles,
  isDark,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? '#1E293B' : '#CBD5E1', true: '#3B82F6' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

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
    setChartDrawingRecordsForSymbol,
    removeChartDrawingRecordForSymbol,
    themeMode,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartLockAll: state.chartLockAll,
      chartHideAll: state.chartHideAll,
      chartDrawings: state.chartDrawings,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      setChartLockAll: state.setChartLockAll,
      setChartHideAll: state.setChartHideAll,
      addChartDrawing: state.addChartDrawing,
      removeChartDrawing: state.removeChartDrawing,
      setChartDrawingRecordsForSymbol: state.setChartDrawingRecordsForSymbol,
      removeChartDrawingRecordForSymbol: state.removeChartDrawingRecordForSymbol,
      themeMode: state.themeMode,
    })),
  );
  const queueChartDrawingTool = useUIState((state) => state.queueChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((state) => state.clearPendingChartDrawingTool);
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const [showAddObjectSheet, setShowAddObjectSheet] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const chartDrawings = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [];

  const displayDrawings = useMemo<DisplayDrawing[]>(() => {
    if (chartDrawings.length > 0) {
      return chartDrawings.map((drawing) => {
        const meta = DRAWING_TOOL_META[drawing.kind];
        const extraText = drawing.kind === 'text' && drawing.text ? ` | ${drawing.text}` : '';
        return {
          id: drawing.id,
          label: drawing.label,
          description: `${meta.description}${extraText}`,
          hidden: drawing.hidden,
          kind: drawing.kind,
          text: drawing.text,
          supportsVisibility: true,
        };
      });
    }

    return legacyChartDrawings.map((label) => ({
      id: label,
      label,
      description: buildLegacyDrawingDescription(label),
      hidden: false,
      kind: null,
      supportsVisibility: false,
    }));
  }, [chartDrawings, legacyChartDrawings]);

  const selectedDrawing = useMemo(
    () => displayDrawings.find((drawing) => drawing.id === selectedDrawingId) ?? null,
    [displayDrawings, selectedDrawingId],
  );

  const handleSelectTool = useCallback((tool: ChartDrawingKind) => {
    setShowAddObjectSheet(false);
    clearPendingChartDrawingTool();

    if (Platform.OS === 'web') {
      const selectedTool = DRAWING_TOOL_META[tool];
      addChartDrawing(`${selectedTool.label} ${legacyChartDrawings.length + 1}`);
      return;
    }

    if (chartLockAll) {
      setChartLockAll(false);
    }
    if (chartHideAll) {
      setChartHideAll(false);
    }

    queueChartDrawingTool(tool);
    router.back();
  }, [
    addChartDrawing,
    chartHideAll,
    chartLockAll,
    clearPendingChartDrawingTool,
    legacyChartDrawings.length,
    queueChartDrawingTool,
    setChartHideAll,
    setChartLockAll,
  ]);

  const handleRemoveDrawing = useCallback((drawing: DisplayDrawing) => {
    if (chartDrawings.length > 0 && drawing.supportsVisibility) {
      removeChartDrawingRecordForSymbol(chartSymbol, drawing.id);
      return;
    }

    removeChartDrawing(drawing.label);
  }, [chartDrawings.length, chartSymbol, removeChartDrawing, removeChartDrawingRecordForSymbol]);

  const handleToggleDrawingVisibility = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === drawing.id
        ? {
            ...record,
            hidden: !record.hidden,
          }
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const addObjectActions = useMemo(
    () =>
      ADD_OBJECT_TOOLS.map((tool) => {
        const meta = DRAWING_TOOL_META[tool];
        return {
          label: meta.label,
          icon: <meta.Icon color={meta.accent} />,
          onPress: () => handleSelectTool(tool),
        };
      }),
    [handleSelectTool],
  );

  const selectedDrawingActions = useMemo(() => {
    if (!selectedDrawing) {
      return [];
    }

    const actions: Array<{ label: string; danger?: boolean; onPress?: () => void }> = [];

    if (selectedDrawing.supportsVisibility) {
      actions.push({
        label: selectedDrawing.hidden ? 'Show on chart' : 'Hide on chart',
        onPress: () => handleToggleDrawingVisibility(selectedDrawing),
      });
    }

    if (selectedDrawing.kind) {
      actions.push({
        label: `Add another ${DRAWING_TOOL_META[selectedDrawing.kind].label.toLowerCase()}`,
        onPress: () => handleSelectTool(selectedDrawing.kind as ChartDrawingKind),
      });
    }

    actions.push({
      label: 'Delete',
      danger: true,
      onPress: () => handleRemoveDrawing(selectedDrawing),
    });

    return actions;
  }, [handleRemoveDrawing, handleSelectTool, handleToggleDrawingVisibility, selectedDrawing]);

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 10 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Objects</Text>
          <Pressable onPress={() => setShowAddObjectSheet(true)} hitSlop={16} style={styles.headerButton}>
            <Ionicons name="add" size={24} color="#3B82F6" />
          </Pressable>
        </View>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {chartSymbol.replace(/\//g, '')} chart objects
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.panel}>
          <ActionRow
            label="Add object"
            description="Trend line, fib zone, highlight and more"
            accent="#2563EB"
            Icon={TvTrendLine}
            onPress={() => setShowAddObjectSheet(true)}
            showDivider
            styles={styles}
            isDark={isDark}
          />
          <ActionRow
            label="Add text"
            description="Place a text label on the chart"
            accent="#1D4ED8"
            Icon={TvText}
            onPress={() => handleSelectTool('text')}
            styles={styles}
            isDark={isDark}
          />
        </View>

        <Text style={styles.sectionLabel}>Controls</Text>
        <View style={styles.panel}>
          <ToggleRow
            label="Locked all"
            description="Prevent object edits on the chart"
            value={chartLockAll}
            onValueChange={setChartLockAll}
            styles={styles}
            isDark={isDark}
          />
          <View style={styles.panelDivider} />
          <ToggleRow
            label="Hidden all"
            description="Hide every drawing on the chart"
            value={chartHideAll}
            onValueChange={setChartHideAll}
            styles={styles}
            isDark={isDark}
          />
        </View>

        <View style={styles.objectsHeader}>
          <Text style={styles.sectionLabel}>Main chart</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{displayDrawings.length}</Text>
          </View>
        </View>

        {displayDrawings.length === 0 ? (
          <View style={[styles.panel, styles.emptyPanel]}>
            <Ionicons name="layers-outline" size={36} color={isDark ? '#334155' : '#94A3B8'} />
            <Text style={styles.emptyTitle}>No objects on this chart</Text>
            <Text style={styles.emptySubtitle}>Use Add object or Add text to place a new chart object.</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            {displayDrawings.map((drawing, index) => {
              const meta = drawing.kind ? DRAWING_TOOL_META[drawing.kind] : null;
              const Icon = meta?.Icon ?? TvTrendLine;
              const accent = meta?.accent ?? '#64748B';
              return (
                <React.Fragment key={drawing.id}>
                  <Pressable
                    style={({ pressed }) => [styles.objectRow, pressed && styles.rowPressed]}
                    onPress={() => setSelectedDrawingId(drawing.id)}
                  >
                    <View style={styles.rowLeft}>
                      <View style={[styles.rowIconWrap, { backgroundColor: `${accent}18` }]}>
                        <Icon color={accent} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{drawing.label}</Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>{drawing.description}</Text>
                      </View>
                    </View>
                    <View style={styles.objectRowRight}>
                      {drawing.hidden ? (
                        <View style={styles.hiddenPill}>
                          <Text style={styles.hiddenPillText}>Hidden</Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={drawing.hidden ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={isDark ? '#64748B' : '#94A3B8'}
                      />
                      <Ionicons name="chevron-forward" size={18} color={isDark ? '#475569' : '#94A3B8'} />
                    </View>
                  </Pressable>
                  {index < displayDrawings.length - 1 ? <View style={styles.panelDivider} /> : null}
                </React.Fragment>
              );
            })}
          </View>
        )}

        {displayDrawings.length > 0 ? (
          <Text style={styles.footerHint}>
            Tap an object row for actions like hide, repeat, or delete.
          </Text>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={showAddObjectSheet}
        onClose={() => setShowAddObjectSheet(false)}
        title="Add object"
        actions={addObjectActions}
      />

      <ActionSheet
        visible={Boolean(selectedDrawing)}
        onClose={() => setSelectedDrawingId(null)}
        title={selectedDrawing?.label ?? 'Object'}
        actions={selectedDrawingActions}
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const screenBg = isDark ? '#06080D' : '#F3F4F6';
  const surface = isDark ? '#FFFFFF' : '#FFFFFF';
  const border = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';
  const primaryText = isDark ? '#0F172A' : '#0F172A';
  const secondaryText = isDark ? '#64748B' : '#64748B';
  const divider = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';

  return StyleSheet.create({
    screen: {
      backgroundColor: screenBg,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: screenBg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '700',
      paddingHorizontal: 8,
    },
    headerSubtitle: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 4,
    },
    sectionLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 16,
    },
    panel: {
      marginHorizontal: 16,
      backgroundColor: surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      overflow: 'hidden',
    },
    panelDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: divider,
      marginLeft: 64,
    },
    actionRow: {
      minHeight: 68,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    objectRow: {
      minHeight: 70,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleRow: {
      minHeight: 64,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    rowIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      color: primaryText,
      fontSize: 15,
      fontWeight: '600',
    },
    rowSubtitle: {
      color: secondaryText,
      fontSize: 12,
      marginTop: 2,
    },
    objectsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: 16,
    },
    countBadge: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    countText: {
      color: '#2563EB',
      fontSize: 12,
      fontWeight: '700',
    },
    objectRowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 12,
    },
    hiddenPill: {
      paddingHorizontal: 8,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? 'rgba(100,116,139,0.18)' : 'rgba(100,116,139,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    hiddenPillText: {
      color: secondaryText,
      fontSize: 11,
      fontWeight: '700',
    },
    emptyPanel: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      color: primaryText,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 12,
    },
    emptySubtitle: {
      color: secondaryText,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 18,
    },
    footerHint: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12,
      textAlign: 'center',
      paddingHorizontal: 24,
      marginTop: 12,
    },
  });
}
