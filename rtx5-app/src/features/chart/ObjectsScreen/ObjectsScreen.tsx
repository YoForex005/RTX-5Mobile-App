import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Chart Feature UI: ObjectsScreen
 *
 * MetaTrader-style chart objects manager backed by persisted drawing records.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
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
import {
  cloneDrawingObjectRecord,
  getDrawingObjectPriceAlertDraft,
  renameDrawingObjectRecord,
  sanitizeDrawingObjectLabel,
  toggleDrawingObjectLock,
} from './drawingObjectActions';
import {
  DRAWING_STYLE_COLOR_SWATCHES,
  DRAWING_STYLE_EXTEND_MODE_OPTIONS,
  DRAWING_STYLE_LINE_STYLE_OPTIONS,
  applyDrawingStylePatch,
  drawingSupportsStyleEditor,
  getDrawingStyleEditorValues,
  type DrawingStyleExtendMode,
  type DrawingStyleLineStyle,
  type DrawingStylePatch,
} from './drawingStyleEditor';
import {
  addFibLevel,
  applyFibLevelPatch,
  drawingSupportsFibLevelEditor,
  formatFibLevelPercent,
  formatFibLevelValue,
  getFibLevelEditorLevels,
  parseFibLevelValue,
  removeFibLevel,
  resetFibLevels,
} from './fibLevelEditor';
import { ActionRow, ToggleRow } from './rows';
import { makeObjectsScreenStyles, type ObjectsScreenStyles } from './styles';

const STYLE_OPACITY_STEP = 0.1;

function formatOpacity(value: number) {
  return `${Math.round(value * 100)}%`;
}

function StyleSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  styles,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  styles: ObjectsScreenStyles;
}) {
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StyleStepper({
  label,
  value,
  onDecrease,
  onIncrease,
  styles,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  styles: ObjectsScreenStyles;
}) {
  return (
    <View style={styles.styleStepperRow}>
      <Text style={styles.styleControlLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <Pressable style={styles.stepperButton} onPress={onDecrease} hitSlop={8}>
          <Ionicons name="remove" size={18} color="#2563EB" />
        </Pressable>
        <Text style={styles.stepperValue} numberOfLines={1}>{value}</Text>
        <Pressable style={styles.stepperButton} onPress={onIncrease} hitSlop={8}>
          <Ionicons name="add" size={18} color="#2563EB" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Screen displaying a list of all active drawing objects (trendlines, fibonacci, etc.) on the current chart symbol.
 */
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
  const [styleEditorDrawingId, setStyleEditorDrawingId] = useState<string | null>(null);
  const [fibEditorDrawingId, setFibEditorDrawingId] = useState<string | null>(null);
  const [selectedFibLevelId, setSelectedFibLevelId] = useState<string | null>(null);
  const [fibLevelValueDraft, setFibLevelValueDraft] = useState('');
  const [fibLevelLabelDraft, setFibLevelLabelDraft] = useState('');
  const [renameDrawingId, setRenameDrawingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

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
          locked: Boolean(drawing.locked),
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
      locked: false,
      kind: null,
      supportsVisibility: false,
    }));
  }, [chartDrawings, legacyChartDrawings]);

  const selectedDrawing = useMemo(
    () => displayDrawings.find((drawing) => drawing.id === selectedDrawingId) ?? null,
    [displayDrawings, selectedDrawingId],
  );
  const styleEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) => drawing.id === styleEditorDrawingId) ?? null,
    [chartDrawings, styleEditorDrawingId],
  );
  const fibEditorDrawing = useMemo(
    () => chartDrawings.find((drawing) =>
      drawing.id === fibEditorDrawingId && drawingSupportsFibLevelEditor(drawing.kind),
    ) ?? null,
    [chartDrawings, fibEditorDrawingId],
  );
  const fibEditorLevels = useMemo(
    () => getFibLevelEditorLevels(fibEditorDrawing),
    [fibEditorDrawing],
  );
  const selectedFibLevel = useMemo(
    () => fibEditorLevels.find((level) => level.id === selectedFibLevelId) ?? fibEditorLevels[0] ?? null,
    [fibEditorLevels, selectedFibLevelId],
  );
  const renameDrawing = useMemo(
    () => chartDrawings.find((drawing) => drawing.id === renameDrawingId) ?? null,
    [chartDrawings, renameDrawingId],
  );
  const selectedDrawingRecord = useMemo(
    () => selectedDrawing?.supportsVisibility
      ? chartDrawings.find((drawing) => drawing.id === selectedDrawing.id) ?? null
      : null,
    [chartDrawings, selectedDrawing],
  );
  const selectedDrawingPriceAlertDraft = useMemo(
    () => selectedDrawingRecord ? getDrawingObjectPriceAlertDraft(selectedDrawingRecord, chartSymbol) : null,
    [chartSymbol, selectedDrawingRecord],
  );
  const styleEditorValues = useMemo(
    () => styleEditorDrawing ? getDrawingStyleEditorValues(styleEditorDrawing) : null,
    [styleEditorDrawing],
  );

  useEffect(() => {
    if (styleEditorDrawingId && !styleEditorDrawing) {
      setStyleEditorDrawingId(null);
    }
  }, [styleEditorDrawing, styleEditorDrawingId]);

  useEffect(() => {
    if (fibEditorDrawingId && !fibEditorDrawing) {
      setFibEditorDrawingId(null);
      setSelectedFibLevelId(null);
      setFibLevelValueDraft('');
      setFibLevelLabelDraft('');
    }
  }, [fibEditorDrawing, fibEditorDrawingId]);

  useEffect(() => {
    if (!fibEditorDrawing) {
      return;
    }
    if (!selectedFibLevel && fibEditorLevels[0]) {
      setSelectedFibLevelId(fibEditorLevels[0].id);
      return;
    }
    if (selectedFibLevel && selectedFibLevel.id !== selectedFibLevelId) {
      setSelectedFibLevelId(selectedFibLevel.id);
    }
  }, [fibEditorDrawing, fibEditorLevels, selectedFibLevel, selectedFibLevelId]);

  useEffect(() => {
    if (!selectedFibLevel) {
      setFibLevelValueDraft('');
      setFibLevelLabelDraft('');
      return;
    }

    setFibLevelValueDraft(formatFibLevelValue(selectedFibLevel.value));
    setFibLevelLabelDraft(selectedFibLevel.label);
  }, [selectedFibLevel]);

  useEffect(() => {
    if (renameDrawingId && !renameDrawing) {
      setRenameDrawingId(null);
      setRenameDraft('');
    }
  }, [renameDrawing, renameDrawingId]);

  /**
   * Opens a bottom sheet action menu allowing the user to select a new drawing tool to add to the chart.
   */
  const handleOpenAddObjectSheet = useCallback(() => {
    runImmediateAction('chart.objects.addObjectSheet.open', () => setShowAddObjectSheet(true));
  }, []);

  const handleCloseStyleEditor = useCallback(() => {
    setStyleEditorDrawingId(null);
  }, []);

  const handleCloseFibLevelEditor = useCallback(() => {
    setFibEditorDrawingId(null);
    setSelectedFibLevelId(null);
    setFibLevelValueDraft('');
    setFibLevelLabelDraft('');
  }, []);

  const handleCloseRenameDialog = useCallback(() => {
    setRenameDrawingId(null);
    setRenameDraft('');
  }, []);

  /**
   * Fired when the user selects a specific drawing tool from the 'Add Object' bottom sheet, activating the tool on the chart.
   */
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

  /**
   * Deletes the selected drawing object from the chart permanently.
   */
  const handleRemoveDrawing = useCallback((drawing: DisplayDrawing) => {
    if (chartDrawings.length > 0 && drawing.supportsVisibility) {
      removeChartDrawingRecordForSymbol(chartSymbol, drawing.id);
      return;
    }

    removeChartDrawing(drawing.label);
  }, [chartDrawings.length, chartSymbol, removeChartDrawing, removeChartDrawingRecordForSymbol]);

  /**
   * Temporarily hides or shows a specific drawing object without deleting it.
   */
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

  const handleToggleDrawingLock = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setChartDrawingRecordsForSymbol(
      chartSymbol,
      toggleDrawingObjectLock(chartDrawings, drawing.id),
    );
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const handleOpenRenameDialog = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setRenameDrawingId(drawing.id);
    setRenameDraft(drawing.label);
  }, []);

  const handleSubmitRename = useCallback(() => {
    if (!renameDrawing) {
      handleCloseRenameDialog();
      return;
    }

    setChartDrawingRecordsForSymbol(
      chartSymbol,
      renameDrawingObjectRecord(chartDrawings, renameDrawing.id, renameDraft),
    );
    handleCloseRenameDialog();
  }, [
    chartDrawings,
    chartSymbol,
    handleCloseRenameDialog,
    renameDraft,
    renameDrawing,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleCloneDrawing = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.supportsVisibility) {
      return;
    }

    setSelectedDrawingId(null);
    setChartDrawingRecordsForSymbol(
      chartSymbol,
      cloneDrawingObjectRecord(chartDrawings, drawing.id),
    );
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol]);

  const handleOpenStyleEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsStyleEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setFibEditorDrawingId(null);
    setStyleEditorDrawingId(drawing.id);
  }, []);

  const handleOpenFibLevelEditor = useCallback((drawing: DisplayDrawing) => {
    if (!drawing.kind || !drawingSupportsFibLevelEditor(drawing.kind)) {
      return;
    }

    setSelectedDrawingId(null);
    setStyleEditorDrawingId(null);
    setFibEditorDrawingId(drawing.id);
  }, []);

  const handleOpenPriceAlertFromDrawing = useCallback(() => {
    if (!selectedDrawingPriceAlertDraft) {
      return;
    }

    setSelectedDrawingId(null);
    router.push({
      pathname: '/chart/alerts',
      params: {
        condition: selectedDrawingPriceAlertDraft.condition,
        drawingId: selectedDrawingPriceAlertDraft.drawingId,
        drawingKind: selectedDrawingPriceAlertDraft.drawingKind,
        message: selectedDrawingPriceAlertDraft.message,
        price: selectedDrawingPriceAlertDraft.price,
        symbol: selectedDrawingPriceAlertDraft.symbol,
      },
    });
  }, [selectedDrawingPriceAlertDraft]);

  const handleUpdateDrawingStyle = useCallback((patch: DrawingStylePatch) => {
    if (!styleEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === styleEditorDrawing.id
        ? applyDrawingStylePatch(record, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, setChartDrawingRecordsForSymbol, styleEditorDrawing]);

  const handleUpdateFibLevel = useCallback((levelId: string, patch: Parameters<typeof applyFibLevelPatch>[2]) => {
    if (!fibEditorDrawing) {
      return;
    }

    const nextDrawings = chartDrawings.map((record) =>
      record.id === fibEditorDrawing.id
        ? applyFibLevelPatch(record, levelId, patch)
        : record,
    );
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, fibEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleAddFibLevel = useCallback(() => {
    if (!fibEditorDrawing) {
      return;
    }

    const currentIds = new Set(fibEditorLevels.map((level) => level.id));
    let nextSelectedLevelId = selectedFibLevelId;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = addFibLevel(record);
      const addedLevel = getFibLevelEditorLevels(next).find((level) => !currentIds.has(level.id));
      nextSelectedLevelId = addedLevel?.id ?? nextSelectedLevelId;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [
    chartDrawings,
    chartSymbol,
    fibEditorDrawing,
    fibEditorLevels,
    selectedFibLevelId,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleRemoveSelectedFibLevel = useCallback(() => {
    if (!fibEditorDrawing || !selectedFibLevel) {
      return;
    }

    let nextSelectedLevelId: string | null = null;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = removeFibLevel(record, selectedFibLevel.id);
      nextSelectedLevelId = getFibLevelEditorLevels(next)[0]?.id ?? null;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [
    chartDrawings,
    chartSymbol,
    fibEditorDrawing,
    selectedFibLevel,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleResetFibLevels = useCallback(() => {
    if (!fibEditorDrawing) {
      return;
    }

    let nextSelectedLevelId: string | null = null;
    const nextDrawings = chartDrawings.map((record) => {
      if (record.id !== fibEditorDrawing.id) {
        return record;
      }
      const next = resetFibLevels(record);
      nextSelectedLevelId = getFibLevelEditorLevels(next)[0]?.id ?? null;
      return next;
    });
    setSelectedFibLevelId(nextSelectedLevelId);
    setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
  }, [chartDrawings, chartSymbol, fibEditorDrawing, setChartDrawingRecordsForSymbol]);

  const handleCommitFibLevelValue = useCallback(() => {
    if (!selectedFibLevel) {
      return;
    }

    const nextValue = parseFibLevelValue(fibLevelValueDraft);
    if (nextValue === null) {
      setFibLevelValueDraft(formatFibLevelValue(selectedFibLevel.value));
      return;
    }
    handleUpdateFibLevel(selectedFibLevel.id, { value: nextValue });
  }, [fibLevelValueDraft, handleUpdateFibLevel, selectedFibLevel]);

  const handleCommitFibLevelLabel = useCallback(() => {
    if (!selectedFibLevel) {
      return;
    }

    const nextLabel = fibLevelLabelDraft.trim() || formatFibLevelValue(selectedFibLevel.value);
    setFibLevelLabelDraft(nextLabel);
    handleUpdateFibLevel(selectedFibLevel.id, { label: nextLabel });
  }, [fibLevelLabelDraft, handleUpdateFibLevel, selectedFibLevel]);

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
        label: 'Rename',
        onPress: () => handleOpenRenameDialog(selectedDrawing),
      });
      actions.push({
        label: selectedDrawing.locked ? 'Unlock object' : 'Lock object',
        onPress: () => handleToggleDrawingLock(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsFibLevelEditor(selectedDrawing.kind)) {
      actions.push({
        label: 'Edit Fibonacci levels',
        onPress: () => handleOpenFibLevelEditor(selectedDrawing),
      });
    }

    if (selectedDrawing.kind && drawingSupportsStyleEditor(selectedDrawing.kind)) {
      actions.push({
        label: 'Edit style',
        onPress: () => handleOpenStyleEditor(selectedDrawing),
      });
    }

    if (selectedDrawingPriceAlertDraft) {
      actions.push({
        label: 'Create price alert',
        onPress: handleOpenPriceAlertFromDrawing,
      });
    }

    if (selectedDrawing.supportsVisibility) {
      actions.push({
        label: 'Duplicate / clone',
        onPress: () => handleCloneDrawing(selectedDrawing),
      });
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
  }, [
    handleCloneDrawing,
    handleOpenFibLevelEditor,
    handleOpenRenameDialog,
    handleOpenPriceAlertFromDrawing,
    handleOpenStyleEditor,
    handleRemoveDrawing,
    handleSelectTool,
    handleToggleDrawingLock,
    handleToggleDrawingVisibility,
    selectedDrawing,
    selectedDrawingPriceAlertDraft,
  ]);

  const styleEditorOpen = Boolean(styleEditorDrawing && styleEditorValues);
  const fibLevelEditorOpen = Boolean(fibEditorDrawing);
  const editorOpen = styleEditorOpen || fibLevelEditorOpen;
  const renameLabelPreview = renameDrawing
    ? sanitizeDrawingObjectLabel(renameDraft, renameDrawing.label)
    : '';
  const renameSaveDisabled = renameDrawing
    ? renameLabelPreview === renameDrawing.label
    : true;

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 10 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={
              fibLevelEditorOpen
                ? handleCloseFibLevelEditor
                : (styleEditorOpen ? handleCloseStyleEditor : () => safeRouterBack(router, '/(tabs)/chart'))
            }
            hitSlop={16}
            style={styles.headerButton}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {fibLevelEditorOpen ? 'Fib levels' : (styleEditorOpen ? 'Style' : 'Objects')}
          </Text>
          {editorOpen ? (
            <Pressable
              onPress={fibLevelEditorOpen ? handleCloseFibLevelEditor : handleCloseStyleEditor}
              activateOnPressIn
              activateOnTouchStart
              unstable_pressDelay={0}
              hitSlop={16}
              style={styles.headerButton}
            >
              <Ionicons name="checkmark" size={24} color="#3B82F6" />
            </Pressable>
          ) : (
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
          )}
        </View>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {fibEditorDrawing?.label ?? styleEditorDrawing?.label ?? `${chartSymbol.replace(/\//g, '')} chart objects`}
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {fibEditorDrawing ? (
          <>
            <Text style={styles.sectionLabel}>Levels</Text>
            <View style={styles.panel}>
              {fibEditorLevels.map((level, index) => {
                const color = level.lineColor ?? level.color ?? '#64748B';
                const selected = selectedFibLevel?.id === level.id;
                return (
                  <React.Fragment key={level.id}>
                    <Pressable
                      style={[styles.fibLevelRow, selected && styles.fibLevelRowSelected]}
                      onPress={() => setSelectedFibLevelId(level.id)}
                    >
                      <View style={styles.rowLeft}>
                        <View style={[styles.fibLevelColorDot, { backgroundColor: color }]} />
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{level.label}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {formatFibLevelValue(level.value)} | {formatFibLevelPercent(level.value)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.fibLevelRight}>
                        {selected ? <Ionicons name="checkmark-circle" size={18} color="#2563EB" /> : null}
                        <Switch
                          value={level.visible}
                          onValueChange={(visible) => handleUpdateFibLevel(level.id, { visible })}
                          trackColor={{ false: isDark ? '#1E1E1E' : '#CBD5E1', true: '#3B82F6' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    </Pressable>
                    {index < fibEditorLevels.length - 1 ? <View style={styles.panelDivider} /> : null}
                  </React.Fragment>
                );
              })}
            </View>

            <View style={[styles.panel, styles.fibActionPanel]}>
              <Pressable style={styles.fibActionButton} onPress={handleAddFibLevel}>
                <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>Add level</Text>
              </Pressable>
              <View style={styles.fibActionDivider} />
              <Pressable style={styles.fibActionButton} onPress={handleResetFibLevels}>
                <Ionicons name="refresh-outline" size={18} color="#2563EB" />
                <Text style={styles.fibActionText}>Reset</Text>
              </Pressable>
            </View>

            {selectedFibLevel ? (
              <>
                <Text style={styles.sectionLabel}>Selected level</Text>
                <View style={styles.panel}>
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>Value</Text>
                    <TextInput
                      value={fibLevelValueDraft}
                      onChangeText={setFibLevelValueDraft}
                      onBlur={handleCommitFibLevelValue}
                      onSubmitEditing={handleCommitFibLevelValue}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      style={styles.fibTextInput}
                    />
                  </View>
                  <View style={styles.panelDivider} />
                  <View style={styles.fibInputRow}>
                    <Text style={styles.styleControlLabel}>Label</Text>
                    <TextInput
                      value={fibLevelLabelDraft}
                      onChangeText={setFibLevelLabelDraft}
                      onBlur={handleCommitFibLevelLabel}
                      onSubmitEditing={handleCommitFibLevelLabel}
                      selectTextOnFocus
                      maxLength={24}
                      style={styles.fibTextInput}
                    />
                  </View>
                </View>

                <Text style={styles.sectionLabel}>Color</Text>
                <View style={[styles.panel, styles.colorSwatchPanel]}>
                  {DRAWING_STYLE_COLOR_SWATCHES.map((color) => {
                    const active = color.toLowerCase() === (selectedFibLevel.lineColor ?? selectedFibLevel.color ?? '').toLowerCase();
                    return (
                      <Pressable
                        key={color}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: color },
                          color === '#FFFFFF' && styles.colorSwatchLight,
                          active && styles.colorSwatchActive,
                        ]}
                        onPress={() => handleUpdateFibLevel(selectedFibLevel.id, { color })}
                        accessibilityLabel={`Set Fibonacci level color ${color}`}
                      >
                        {active ? (
                          <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#0F172A' : '#FFFFFF'} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Stroke</Text>
                <View style={[styles.panel, styles.styleControlsPanel]}>
                  <StyleStepper
                    label="Width"
                    value={`${Number((selectedFibLevel.lineWidth ?? 1).toFixed(2))}px`}
                    onDecrease={() =>
                      handleUpdateFibLevel(selectedFibLevel.id, { lineWidth: (selectedFibLevel.lineWidth ?? 1) - 1 })
                    }
                    onIncrease={() =>
                      handleUpdateFibLevel(selectedFibLevel.id, { lineWidth: (selectedFibLevel.lineWidth ?? 1) + 1 })
                    }
                    styles={styles}
                  />
                  <View style={styles.panelDivider} />
                  <View style={styles.styleControlBlock}>
                    <Text style={styles.styleControlLabel}>Pattern</Text>
                    <StyleSegmentedControl<DrawingStyleLineStyle>
                      options={DRAWING_STYLE_LINE_STYLE_OPTIONS}
                      value={selectedFibLevel.lineStyle ?? 'solid'}
                      onChange={(lineStyle) => handleUpdateFibLevel(selectedFibLevel.id, { lineStyle })}
                      styles={styles}
                    />
                  </View>
                </View>

                <Text style={styles.sectionLabel}>Labels</Text>
                <View style={styles.panel}>
                  <ToggleRow
                    label="Price label"
                    description="Show price beside this level"
                    value={selectedFibLevel.showPrice !== false}
                    onValueChange={(showPrice) => handleUpdateFibLevel(selectedFibLevel.id, { showPrice })}
                    styles={styles}
                    isDark={isDark}
                  />
                  <View style={styles.panelDivider} />
                  <ToggleRow
                    label="Percent label"
                    description="Show percent beside this level"
                    value={selectedFibLevel.showPercent !== false}
                    onValueChange={(showPercent) => handleUpdateFibLevel(selectedFibLevel.id, { showPercent })}
                    styles={styles}
                    isDark={isDark}
                  />
                </View>

                <View style={styles.panel}>
                  <Pressable
                    style={[
                      styles.fibDeleteButton,
                      fibEditorLevels.length <= 1 && styles.fibDeleteButtonDisabled,
                    ]}
                    onPress={handleRemoveSelectedFibLevel}
                    disabled={fibEditorLevels.length <= 1}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={fibEditorLevels.length <= 1 ? (isDark ? '#64748B' : '#94A3B8') : '#EF4444'}
                    />
                    <Text
                      style={[
                        styles.fibDeleteText,
                        fibEditorLevels.length <= 1 && styles.fibDeleteTextDisabled,
                      ]}
                    >
                      Delete selected level
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        ) : styleEditorDrawing && styleEditorValues ? (
          <>
            <Text style={styles.sectionLabel}>Preview</Text>
            <View style={[styles.panel, styles.stylePreviewPanel]}>
              <View style={styles.stylePreviewHeader}>
                <View style={styles.stylePreviewCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{styleEditorDrawing.label}</Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {DRAWING_TOOL_META[styleEditorDrawing.kind].label}
                  </Text>
                </View>
                <View style={[styles.styleColorPill, { backgroundColor: styleEditorValues.color }]} />
              </View>
              <View style={styles.stylePreviewLineTrack}>
                <View
                  style={[
                    styles.stylePreviewLine,
                    {
                      borderTopColor: styleEditorValues.color,
                      borderTopWidth: styleEditorValues.width,
                      borderStyle: styleEditorValues.lineStyle,
                      opacity: styleEditorValues.opacity,
                    },
                  ]}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Color</Text>
            <View style={[styles.panel, styles.colorSwatchPanel]}>
              {DRAWING_STYLE_COLOR_SWATCHES.map((color) => {
                const active = color.toLowerCase() === styleEditorValues.color.toLowerCase();
                return (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      color === '#FFFFFF' && styles.colorSwatchLight,
                      active && styles.colorSwatchActive,
                    ]}
                    onPress={() => handleUpdateDrawingStyle({ color })}
                    accessibilityLabel={`Set drawing color ${color}`}
                  >
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={color === '#FFFFFF' ? '#0F172A' : '#FFFFFF'} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Stroke</Text>
            <View style={[styles.panel, styles.styleControlsPanel]}>
              <StyleStepper
                label="Width"
                value={`${styleEditorValues.width}px`}
                onDecrease={() => handleUpdateDrawingStyle({ width: styleEditorValues.width - 1 })}
                onIncrease={() => handleUpdateDrawingStyle({ width: styleEditorValues.width + 1 })}
                styles={styles}
              />
              <View style={styles.panelDivider} />
              <View style={styles.styleControlBlock}>
                <Text style={styles.styleControlLabel}>Pattern</Text>
                <StyleSegmentedControl<DrawingStyleLineStyle>
                  options={DRAWING_STYLE_LINE_STYLE_OPTIONS}
                  value={styleEditorValues.lineStyle}
                  onChange={(lineStyle) => handleUpdateDrawingStyle({ lineStyle })}
                  styles={styles}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Opacity</Text>
            <View style={styles.panel}>
              <StyleStepper
                label="Opacity"
                value={formatOpacity(styleEditorValues.opacity)}
                onDecrease={() =>
                  handleUpdateDrawingStyle({ opacity: styleEditorValues.opacity - STYLE_OPACITY_STEP })
                }
                onIncrease={() =>
                  handleUpdateDrawingStyle({ opacity: styleEditorValues.opacity + STYLE_OPACITY_STEP })
                }
                styles={styles}
              />
            </View>

            {styleEditorValues.supportsExtendMode ? (
              <>
                <Text style={styles.sectionLabel}>Extend</Text>
                <View style={[styles.panel, styles.styleControlBlock]}>
                  <Text style={styles.styleControlLabel}>Mode</Text>
                  <StyleSegmentedControl<DrawingStyleExtendMode>
                    options={DRAWING_STYLE_EXTEND_MODE_OPTIONS}
                    value={styleEditorValues.extendMode}
                    onChange={(extendMode) => handleUpdateDrawingStyle({ extendMode })}
                    styles={styles}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
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
                      {drawing.locked ? (
                        <View style={styles.lockedPill}>
                          <Text style={styles.lockedPillText}>Locked</Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={drawing.locked ? 'lock-closed-outline' : (drawing.hidden ? 'eye-off-outline' : 'eye-outline')}
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
            Tap an object row for rename, lock, clone, hide, or delete.
          </Text>
        ) : null}
          </>
        )}
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

      <Modal
        visible={Boolean(renameDrawing)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseRenameDialog}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.renameModalOverlay}
        >
          <Pressable style={styles.renameModalBackdrop} onPress={handleCloseRenameDialog} />
          <View style={styles.renameModalSheet}>
            <Text style={styles.renameModalTitle}>Rename object</Text>
            <Text style={styles.renameModalSubtitle} numberOfLines={1}>
              {renameDrawing?.label ?? 'Chart object'}
            </Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              selectTextOnFocus
              maxLength={64}
              returnKeyType="done"
              onSubmitEditing={handleSubmitRename}
              placeholder="Object name"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              style={styles.renameInput}
            />
            <View style={styles.renameModalActions}>
              <Pressable style={styles.renameModalButton} onPress={handleCloseRenameDialog}>
                <Text style={styles.renameModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.renameModalButton, styles.renameModalSaveButton, renameSaveDisabled && styles.renameModalSaveDisabled]}
                onPress={handleSubmitRename}
                disabled={renameSaveDisabled}
              >
                <Text style={[styles.renameModalSaveText, renameSaveDisabled && styles.renameModalSaveTextDisabled]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
