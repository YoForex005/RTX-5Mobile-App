/**
 * Chart Feature UI: IndicatorConfigScreen
 *
 * MT5-style indicator configuration screen. Parameters, Style, Levels,
 * and Visualization sections — each style line and level opens its own
 * dedicated editor screen, mirroring MT5's mobile flow.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme } from '../../theme/useTheme';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import {
  Card,
  LinePreview,
  Row,
  SectionHeader,
  Separator,
} from './components/IndicatorConfigPrimitives';
import { useIndicatorEditState } from './indicatorEditState';
import {
  APPLY_TO_OPTIONS,
  getIndicatorMeta,
  IndicatorParam,
  MA_METHOD_OPTIONS,
} from './indicatorRegistry';

export function IndicatorConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();

  const meta = useMemo(() => getIndicatorMeta(id as string), [id]);
  const initialize = useIndicatorEditState((s) => s.initialize);
  const clear = useIndicatorEditState((s) => s.clear);
  const editMeta = useIndicatorEditState((s) => s.meta);

  useEffect(() => {
    if (meta && (!editMeta || editMeta.id !== meta.id)) {
      initialize(meta);
    }
  }, [meta, editMeta, initialize]);

  const bgColor = isDark ? '#06080D' : '#F4F5F7';
  const styles = useMemo(() => makeStyles(bgColor, isDark, T), [bgColor, isDark, T]);

  if (!meta) {
    return (
      <Screen style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>Unknown</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </Screen>
    );
  }

  return (
    <ConfigBody
      metaId={meta.id}
      styles={styles}
      isDark={isDark}
      insets={insets}
      T={T}
      onDone={() => {
        clear();
        router.back();
      }}
    />
  );
}

function ConfigBody({
  metaId,
  styles,
  isDark,
  insets,
  T,
  onDone,
}: {
  metaId: string;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  T: ReturnType<typeof useTheme>;
  onDone: () => void;
}) {
  const meta = useIndicatorEditState((s) => s.meta);
  const values = useIndicatorEditState((s) => s.values);
  const styleLines = useIndicatorEditState((s) => s.styleLines);
  const levels = useIndicatorEditState((s) => s.levels);
  const viz = useIndicatorEditState((s) => s.visualization);
  const setValue = useIndicatorEditState((s) => s.setValue);
  const addLevel = useIndicatorEditState((s) => s.addLevel);
  const setVisualization = useIndicatorEditState((s) => s.setVisualization);

  const [numberEdit, setNumberEdit] = useState<{
    key: string;
    label: string;
    value: string;
    decimals?: number;
    target: 'param' | 'fixedMin' | 'fixedMax';
  } | null>(null);

  const [selectSheet, setSelectSheet] = useState<{
    title: string;
    options: Array<{ value: string; label: string }>;
    onPick: (v: string) => void;
  } | null>(null);

  const commitNumber = () => {
    if (!numberEdit) return;
    const parsed = Number(numberEdit.value);
    if (Number.isFinite(parsed)) {
      if (numberEdit.target === 'param') {
        setValue(numberEdit.key, parsed);
      } else if (numberEdit.target === 'fixedMin') {
        setVisualization({ fixedMin: parsed });
      } else if (numberEdit.target === 'fixedMax') {
        setVisualization({ fixedMax: parsed });
      }
    }
    setNumberEdit(null);
  };

  // Guard: before initialize fires, meta in store may be null. Fall back to registry meta.
  const fallbackMeta = !meta || meta.id !== metaId ? getIndicatorMeta(metaId) : meta;
  if (!fallbackMeta) return null;

  // Use store data when ready; otherwise render nothing to avoid flicker.
  const usingStore = meta && meta.id === metaId;
  const displayLines = usingStore ? styleLines : fallbackMeta.styles;
  const displayLevels = usingStore ? levels : [];
  const displayValues = usingStore ? values : (() => {
    const v: Record<string, number | string | boolean> = {};
    for (const p of fallbackMeta.parameters) v[p.key] = p.default;
    return v;
  })();

  const renderParamRow = (param: IndicatorParam) => {
    const current = displayValues[param.key];
    switch (param.kind) {
      case 'number': {
        const display =
          typeof current === 'number'
            ? param.decimals !== undefined
              ? current.toFixed(param.decimals)
              : String(current)
            : String(current);
        return (
          <Row
            label={param.label}
            rightText={display}
            onPress={() =>
              setNumberEdit({
                key: param.key,
                label: param.label,
                value: display,
                decimals: param.decimals,
                target: 'param',
              })
            }
            T={T}
            isDark={isDark}
          />
        );
      }
      case 'applyTo':
      case 'maMethod':
      case 'select': {
        const options =
          param.kind === 'applyTo'
            ? APPLY_TO_OPTIONS
            : param.kind === 'maMethod'
              ? MA_METHOD_OPTIONS
              : param.options;
        const currentOption = options.find((o) => o.value === current);
        return (
          <Row
            label={param.label}
            rightText={currentOption?.label ?? String(current)}
            onPress={() =>
              setSelectSheet({
                title: param.label,
                options,
                onPick: (v) => setValue(param.key, v),
              })
            }
            T={T}
            isDark={isDark}
          />
        );
      }
      case 'boolean': {
        return (
          <View style={styles.rowWrap}>
            <Row
              label={param.label}
              rightNode={
                <Switch
                  value={!!current}
                  onValueChange={(v) => setValue(param.key, v)}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
          </View>
        );
      }
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable onPress={() => { onDone(); }} hitSlop={16} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>{fallbackMeta.name}</Text>
          </View>
          <Pressable onPress={onDone} hitSlop={16} style={styles.headerDoneBtn}>
            <Text style={styles.headerDoneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {fallbackMeta.parameters.length > 0 && (
            <>
              <SectionHeader title="Parameters" isDark={isDark} />
              <Card isDark={isDark}>
                {fallbackMeta.parameters.map((param, idx) => (
                  <View key={param.key}>
                    {renderParamRow(param)}
                    {idx < fallbackMeta.parameters.length - 1 && <Separator isDark={isDark} />}
                  </View>
                ))}
              </Card>
            </>
          )}

          <SectionHeader title="Style" isDark={isDark} />
          <Card isDark={isDark}>
            {displayLines.map((line, idx) => (
              <View key={line.key}>
                <Row
                  label={line.name}
                  rightNode={
                    <LinePreview color={line.color} style={line.style} width={line.width} />
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/chart/indicator-line-style',
                      params: { lineKey: line.key },
                    })
                  }
                  T={T}
                  isDark={isDark}
                />
                {idx < displayLines.length - 1 && <Separator isDark={isDark} />}
              </View>
            ))}
          </Card>

          {fallbackMeta.levelsEnabled && (
            <>
              <SectionHeader title="Levels" isDark={isDark} />
              <Card isDark={isDark}>
                {displayLevels.map((lvl, idx) => (
                  <View key={lvl.id}>
                    <Row
                      label={String(lvl.value)}
                      rightNode={
                        <LinePreview color={lvl.color} style={lvl.style} width={lvl.width} />
                      }
                      onPress={() =>
                        router.push({
                          pathname: '/chart/indicator-level',
                          params: { levelId: lvl.id },
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                    {idx < displayLevels.length - 1 && <Separator isDark={isDark} />}
                  </View>
                ))}
                {displayLevels.length > 0 && <Separator isDark={isDark} />}
                <Pressable
                  style={({ pressed }) => [
                    styles.addRow,
                    pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
                  ]}
                  onPress={() => {
                    const id = addLevel();
                    router.push({
                      pathname: '/chart/indicator-level',
                      params: { levelId: id },
                    });
                  }}
                >
                  <Ionicons name="add" size={20} color={T.trading.buy.primary} />
                  <Text style={[styles.addRowText, { color: T.trading.buy.primary }]}>Add level</Text>
                </Pressable>
              </Card>
            </>
          )}

          <SectionHeader title="Visualization" isDark={isDark} />
          <Card isDark={isDark}>
            <Row
              label="Show in data window"
              rightNode={
                <Switch
                  value={viz.showInDataWindow}
                  onValueChange={(v) => setVisualization({ showInDataWindow: v })}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
            <Separator isDark={isDark} />
            <Row
              label="All timeframes"
              rightNode={
                <Switch
                  value={viz.allTimeframes}
                  onValueChange={(v) => setVisualization({ allTimeframes: v })}
                  trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                  thumbColor="#FFFFFF"
                />
              }
              T={T}
              isDark={isDark}
              showChevron={false}
            />
            {fallbackMeta.levelsEnabled && (
              <>
                <Separator isDark={isDark} />
                <Row
                  label="Fixed minimum"
                  rightNode={
                    <Switch
                      value={viz.fixedMinEnabled}
                      onValueChange={(v) => setVisualization({ fixedMinEnabled: v })}
                      trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                      thumbColor="#FFFFFF"
                    />
                  }
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {viz.fixedMinEnabled && (
                  <>
                    <Separator isDark={isDark} />
                    <Row
                      label="Minimum"
                      rightText={String(viz.fixedMin)}
                      onPress={() =>
                        setNumberEdit({
                          key: 'fixedMin',
                          label: 'Minimum',
                          value: String(viz.fixedMin),
                          target: 'fixedMin',
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                  </>
                )}
                <Separator isDark={isDark} />
                <Row
                  label="Fixed maximum"
                  rightNode={
                    <Switch
                      value={viz.fixedMaxEnabled}
                      onValueChange={(v) => setVisualization({ fixedMaxEnabled: v })}
                      trackColor={{ false: isDark ? '#3F4B5C' : '#D1D5DB', true: T.trading.buy.primary }}
                      thumbColor="#FFFFFF"
                    />
                  }
                  T={T}
                  isDark={isDark}
                  showChevron={false}
                />
                {viz.fixedMaxEnabled && (
                  <>
                    <Separator isDark={isDark} />
                    <Row
                      label="Maximum"
                      rightText={String(viz.fixedMax)}
                      onPress={() =>
                        setNumberEdit({
                          key: 'fixedMax',
                          label: 'Maximum',
                          value: String(viz.fixedMax),
                          target: 'fixedMax',
                        })
                      }
                      T={T}
                      isDark={isDark}
                    />
                  </>
                )}
              </>
            )}
          </Card>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={numberEdit !== null}
        transparent
        animationType="fade"
        {...OVERLAY_MODAL_PROPS}
        onRequestClose={() => setNumberEdit(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNumberEdit(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{numberEdit?.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={numberEdit?.value ?? ''}
              onChangeText={(text) =>
                setNumberEdit((prev) => (prev ? { ...prev, value: text } : prev))
              }
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={commitNumber}
              returnKeyType="done"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setNumberEdit(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={commitNumber}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionSheet
        visible={selectSheet !== null}
        title={selectSheet?.title}
        onClose={() => setSelectSheet(null)}
        actions={(selectSheet?.options ?? []).map((opt) => ({
          label: opt.label,
          onPress: () => {
            selectSheet?.onPick(opt.value);
            setSelectSheet(null);
          },
        }))}
      />
    </Screen>
  );
}

function makeStyles(
  bgColor: string,
  isDark: boolean,
  T: ReturnType<typeof useTheme>,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: bgColor,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
      backgroundColor: bgColor,
    },
    headerBackBtn: {
      width: 40,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    headerTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    headerDoneBtn: {
      minWidth: 56,
      height: 32,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    headerDoneText: {
      color: T.trading.buy.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    content: {
      paddingBottom: 40,
    },
    rowWrap: {
      // no-op wrapper for layout consistency
    },
    addRow: {
      minHeight: 52,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addRowText: {
      fontSize: 15,
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: isDark ? '#0E141F' : '#FFFFFF',
      borderRadius: 14,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7',
    },
    modalTitle: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 14,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: T.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16,
    },
    modalBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    modalBtnPrimary: {
      backgroundColor: T.trading.buy.primary,
    },
    modalBtnText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
    },
    modalBtnTextPrimary: {
      color: '#FFFFFF',
    },
  });
}
