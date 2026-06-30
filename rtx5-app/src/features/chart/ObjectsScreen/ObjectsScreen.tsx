import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Chart Feature UI: ObjectsScreen
 *
 * MetaTrader-style chart objects manager backed by persisted drawing records.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/shallow';
import { ActionSheet } from '../../../ui/components/ActionSheet';
import { Screen } from '../../../ui/components/Screen';
import { useUserPreferences } from '../../../state/userPreferences';
import { useUIState } from '../../../state/uiState';
import { useTheme } from '../../../ui/theme/useTheme';
import { safeRouterBack } from '../../../utils/navigation';
import { runImmediateAction } from '../../../utils/actionLatency';
import { TvText, TvTrendLine } from '../components/ChartToolbarIcons';
import {
  type ChartDrawingKind,
  getChartDrawingBucketKey,
} from '../drawingPersistence';
import {
  ADD_OBJECT_TOOLS,
  DRAWING_TOOL_META,
  buildLegacyDrawingDescription,
  type DisplayDrawing,
} from './drawingMeta';
import { ActionRow, ToggleRow } from './rows';
import { makeObjectsScreenStyles } from './styles';

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
  const styles = useMemo(() => makeObjectsScreenStyles(T, isDark), [T, isDark]);
  const [showAddObjectSheet, setShowAddObjectSheet] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const chartDrawings = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [];

  const displayDrawings = useMemo<DisplayDrawing[]>(() => {
    if (chartDrawings.length > 0) {
      return chartDrawings.map((drawing) => {
        const meta = DRAWING_TOOL_META[drawing.kind];
        const extraText = (drawing.kind === 'text' || drawing.kind === 'textLevel') && drawing.text ? ` | ${drawing.text}` : '';
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

  const handleOpenAddObjectSheet = useCallback(() => {
    runImmediateAction('chart.objects.addObjectSheet.open', () => setShowAddObjectSheet(true));
  }, []);

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
    safeRouterBack(router, '/(tabs)/chart');
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
        ? { ...record, hidden: !record.hidden }
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

    if (selectedDrawing.kind && ADD_OBJECT_TOOLS.includes(selectedDrawing.kind)) {
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
          <Pressable onPress={() => safeRouterBack(router, '/(tabs)/chart')} hitSlop={16} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Objects</Text>
          <Pressable
            onPress={handleOpenAddObjectSheet}
            activateOnPressIn
            activateOnTouchStart
            unstable_pressDelay={0}
            hitSlop={16}
            style={styles.headerButton}
          >
            <Ionicons name="add" size={24} color="#3B82F6" />
          </Pressable>
        </View>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {chartSymbol.replace(/\//g, '')} chart objects
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
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
            onPress={handleOpenAddObjectSheet}
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
            showDivider
            styles={styles}
            isDark={isDark}
          />
          <ActionRow
            label="Add text level"
            description="Mark a horizontal price level"
            accent="#2962FF"
            Icon={TvText}
            onPress={() => handleSelectTool('textLevel')}
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
        detent="auto"
        instantOpen
        actions={addObjectActions}
      />

      <ActionSheet
        visible={Boolean(selectedDrawing)}
        onClose={() => setSelectedDrawingId(null)}
        title={selectedDrawing?.label ?? 'Object'}
        detent="adaptive"
        instantOpen
        actions={selectedDrawingActions}
      />
    </Screen>
  );
}
