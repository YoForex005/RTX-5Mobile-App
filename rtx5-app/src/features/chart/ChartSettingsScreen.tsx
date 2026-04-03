import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import ColorPicker, { HueSlider, Panel1, Preview, colorKit } from 'reanimated-color-picker';
import { Screen } from '../../components/Screen';
import { useLiveCandles } from '../../hooks/useLiveCandles';
import { useMarketData } from '../../query/websocket';
import {
  CHART_COLOR_SCHEME_PRESETS,
  ChartColorScheme,
  ChartColorsConfig,
  ChartDisplaySettings,
  useUserPreferences,
} from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';
import { useTheme } from '../../theme/useTheme';
import { LiveChartPreview } from './preview';

type SettingsTab = 'common' | 'trading' | 'show' | 'colors';

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'common', label: 'Common' },
  { key: 'trading', label: 'Trading' },
  { key: 'show', label: 'Show' },
  { key: 'colors', label: 'Colors' },
];

const SHOW_FIELDS: Array<{ key: keyof ChartDisplaySettings; label: string }> = [
  { key: 'showTicker', label: 'Show ticker' },
  { key: 'showOHLC', label: 'Show OHLC' },
  { key: 'showQuickTradingButtons', label: 'Show quick trading buttons' },
  { key: 'showBidPriceLine', label: 'Show bid price line' },
  { key: 'showAskPriceLine', label: 'Show ask price line' },
  { key: 'showLastPriceLine', label: 'Show last price line' },
  { key: 'showPeriodSeparators', label: 'Show period separators' },
  { key: 'showGrid', label: 'Show grid' },
  { key: 'showTickVolumes', label: 'Show tick volumes' },
  { key: 'showRealVolumes', label: 'Show real volumes' },
  { key: 'showObjectDescriptions', label: 'Show object descriptions' },
  { key: 'showTradeLevels', label: 'Show trade levels' },
  { key: 'showTradeHistory', label: 'Show trade history' },
];

const COLOR_FIELDS: Array<{ key: keyof ChartColorsConfig; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'grid', label: 'Grid' },
  { key: 'barsUptrend', label: 'Bar up' },
  { key: 'barsDowntrend', label: 'Bar down' },
  { key: 'candlesUptrend', label: 'Bull candle' },
  { key: 'candlesDowntrend', label: 'Bear candle' },
  { key: 'hollowBody', label: 'Hollow body' },
  { key: 'lineBody', label: 'Line chart' },
  { key: 'tradeOpen', label: 'Open positions' },
  { key: 'tradeTpSl', label: 'TP / SL / Stop / Limit' },
  { key: 'tradeStopOut', label: 'Potential Stop Out line' },
];

const SCHEME_OPTIONS: Array<{ key: ChartColorScheme; label: string }> = [
  { key: 'green_on_black', label: CHART_COLOR_SCHEME_PRESETS.green_on_black.label },
  { key: 'black_on_white', label: CHART_COLOR_SCHEME_PRESETS.black_on_white.label },
  { key: 'yellow_on_black', label: CHART_COLOR_SCHEME_PRESETS.yellow_on_black.label },
  { key: 'custom', label: 'Custom' },
];

const SWATCHES = ['#FFFFFF', '#000000', '#10B981', '#EF4444', '#FACC15', '#2563EB', '#F59E0B', '#94A3B8', '#1E293B', '#0E0E12', 'transparent'];

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '#000000';
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed}`.toUpperCase();
};

const normalizeChartColorInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'transparent') return 'transparent';
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) return normalizeHex(trimmed);
  if (/^rgba?\(/i.test(trimmed)) return trimmed;
  return null;
};

const isTransparent = (color?: string) => typeof color === 'string' && color.toLowerCase() === 'transparent';

const formatQuote = (value?: number, digits = 2) =>
  Number.isFinite(value) ? Number(value).toFixed(Math.min(Math.max(digits, 2), 5)) : '--';

export function ChartSettingsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  const chartSymbol = useUserPreferences((s) => s.chartSymbol);
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);
  const priceSource = useUserPreferences((s) => s.priceSource);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const chartDisplay = useUserPreferences((s) => s.chartDisplay);
  const chartColors = useUserPreferences((s) => s.chartColors);
  const chartColorScheme = useUserPreferences((s) => s.chartColorScheme);
  const setChartColorScheme = useUserPreferences((s) => s.setChartColorScheme);
  const setChartColor = useUserPreferences((s) => s.setChartColor);
  const setChartDisplaySetting = useUserPreferences((s) => s.setChartDisplaySetting);
  const showOpenPositions = useUserPreferences((s) => s.showOpenPositions);
  const setShowOpenPositions = useUserPreferences((s) => s.setShowOpenPositions);
  const showTpSlStopLimit = useUserPreferences((s) => s.showTpSlStopLimit);
  const setShowTpSlStopLimit = useUserPreferences((s) => s.setShowTpSlStopLimit);
  const showClosedPositions = useUserPreferences((s) => s.showClosedPositions);
  const setShowClosedPositions = useUserPreferences((s) => s.setShowClosedPositions);
  const showHmrPeriods = useUserPreferences((s) => s.showHmrPeriods);
  const setShowHmrPeriods = useUserPreferences((s) => s.setShowHmrPeriods);
  const showPriceAlerts = useUserPreferences((s) => s.showPriceAlerts);
  const setShowPriceAlerts = useUserPreferences((s) => s.setShowPriceAlerts);
  const showPotentialStopOut = useUserPreferences((s) => s.showPotentialStopOut);
  const setShowPotentialStopOut = useUserPreferences((s) => s.setShowPotentialStopOut);
  const showTradingSignals = useUserPreferences((s) => s.showTradingSignals);
  const setShowTradingSignals = useUserPreferences((s) => s.setShowTradingSignals);

  const liveQuotes = useMarketData([chartSymbol]);
  const liveQuote = liveQuotes[chartSymbol];
  const { candles } = useLiveCandles(chartSymbol, chartTimeframe);

  const [activeTab, setActiveTab] = useState<SettingsTab>('colors');
  const [schemeModalOpen, setSchemeModalOpen] = useState(false);
  const [activeColorKey, setActiveColorKey] = useState<keyof ChartColorsConfig | null>(null);
  const [draftColor, setDraftColor] = useState('');

  const colorRgb = useMemo(() => {
    try {
      return colorKit.RGB(draftColor).object();
    } catch {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
  }, [draftColor]);

  const colorHsv = useMemo(() => {
    try {
      return colorKit.HSV(draftColor).object();
    } catch {
      return { h: 0, s: 0, v: 0, a: 1 };
    }
  }, [draftColor]);

  const colorHsl = useMemo(() => {
    try {
      return colorKit.HSL(draftColor).object();
    } catch {
      return { h: 0, s: 0, l: 0, a: 1 };
    }
  }, [draftColor]);

  const tradingFields = [
    { label: 'Open positions', value: showOpenPositions, setter: setShowOpenPositions },
    { label: 'TP / SL / Stop / Limit', value: showTpSlStopLimit, setter: setShowTpSlStopLimit },
    { label: 'Closed positions', value: showClosedPositions, setter: setShowClosedPositions },
    { label: 'Trading signals', value: showTradingSignals, setter: setShowTradingSignals },
    { label: 'HMR periods', value: showHmrPeriods, setter: setShowHmrPeriods },
    { label: 'Price alerts', value: showPriceAlerts, setter: setShowPriceAlerts },
    { label: 'Potential Stop Out line', value: showPotentialStopOut, setter: setShowPotentialStopOut },
  ];

  const snapshot = [
    { label: 'Bid', value: formatQuote(liveQuote?.bid, liveQuote?.digits) },
    { label: 'Ask', value: formatQuote(liveQuote?.ask, liveQuote?.digits) },
    { label: 'Spread', value: Number.isFinite(liveQuote?.spread) ? liveQuote.spread.toFixed(1) : '--' },
  ];

  const openColorEditor = (key: keyof ChartColorsConfig) => {
    setActiveColorKey(key);
    setDraftColor(chartColors[key] || '#000000');
  };

  const applyDraftColor = (value: string) => {
    if (!activeColorKey) return;
    const normalized = normalizeChartColorInput(value);
    if (!normalized) return;
    setDraftColor(normalized);
    setChartColor(activeColorKey, normalized);
    setActiveColorKey(null);
  };

  const handleDraftColorChange = (value: string) => {
    setDraftColor(value);
    if (!activeColorKey) return;
    const normalized = normalizeChartColorInput(value);
    if (normalized) {
      setChartColor(activeColorKey, normalized);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Properties of {chartSymbol.replace(/\//g, '')},{chartTimeframe}</Text>

        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewTitle}>Live chart preview</Text>
              <Text style={styles.previewSub}>Tabbed chart properties with live color updates.</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.snapshotRow}>
            {snapshot.map((item) => (
              <View key={item.label} style={styles.snapshotCard}>
                <Text style={styles.snapshotLabel}>{item.label}</Text>
                <Text style={styles.snapshotValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.previewChart, { backgroundColor: chartColors.background }]}>
            <LiveChartPreview
              symbol={chartSymbol}
              timeframe={chartTimeframe}
              colors={chartColors}
              display={chartDisplay}
              isDark={isDark}
            />
          </View>

          <View style={styles.previewFooter}>
            <Text style={styles.previewFooterText}>Scheme: {SCHEME_OPTIONS.find((option) => option.key === chartColorScheme)?.label ?? 'Custom'}</Text>
            <Text style={styles.previewFooterText}>Source: {priceSource === 'bid' ? 'Bid price' : 'Ask price'}</Text>
            <Text style={styles.previewFooterText}>Candles: {candles.length}</Text>
          </View>
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((tab) => (
            <Pressable key={tab.key} style={styles.tabButton} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              <View style={[styles.tabUnderline, activeTab === tab.key && styles.tabUnderlineActive]} />
            </Pressable>
          ))}
        </View>

        <View style={styles.panel}>
          {activeTab === 'common' && (
            <View style={styles.panelBody}>
              <SettingsNavRow label="Price source" value={priceSource === 'bid' ? 'Bid price' : 'Ask price'} onPress={() => router.push('/chart/price-source')} styles={styles} />
              <View style={styles.separator} />
              <SettingsNavRow label="Open order mode" value={openOrderMode} onPress={() => router.push('/chart/open-order-mode')} styles={styles} />
              <View style={styles.separator} />
              <SettingsNavRow label="Order of menu items" value="Manage" onPress={() => router.push('/chart/menu-order')} styles={styles} />
            </View>
          )}

          {activeTab === 'trading' && (
            <View style={styles.panelBody}>
              {tradingFields.map((item, index) => (
                <View key={item.label}>
                  <Pressable style={styles.checkRow} onPress={() => item.setter(!item.value)}>
                    <View style={[styles.checkbox, item.value && styles.checkboxChecked]}>
                      {item.value && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                  </Pressable>
                  {index < tradingFields.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          )}

          {activeTab === 'show' && (
            <View style={styles.panelBody}>
              {SHOW_FIELDS.map((item, index) => (
                <View key={item.key}>
                  <Pressable style={styles.checkRow} onPress={() => setChartDisplaySetting(item.key, !chartDisplay[item.key])}>
                    <View style={[styles.checkbox, chartDisplay[item.key] && styles.checkboxChecked]}>
                      {chartDisplay[item.key] && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                  </Pressable>
                  {index < SHOW_FIELDS.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          )}

          {activeTab === 'colors' && (
            <View style={styles.panelBody}>
              <Pressable style={styles.colorRow} onPress={() => setSchemeModalOpen(true)}>
                <Text style={styles.colorLabel}>Scheme</Text>
                <View style={styles.colorValueRow}>
                  <Text style={styles.colorValueText}>{SCHEME_OPTIONS.find((option) => option.key === chartColorScheme)?.label ?? 'Custom'}</Text>
                  <Ionicons name="chevron-down" size={16} color={T.textMuted} />
                </View>
              </Pressable>
              <View style={styles.separator} />
              {COLOR_FIELDS.map((item, index) => (
                <View key={item.key}>
                  <Pressable style={styles.colorRow} onPress={() => openColorEditor(item.key)}>
                    <Text style={styles.colorLabel}>{item.label}</Text>
                    <View style={styles.colorValueRow}>
                      <View
                        style={[
                          styles.colorChip,
                          {
                            backgroundColor: isTransparent(chartColors[item.key]) ? 'transparent' : chartColors[item.key],
                            borderColor: isTransparent(chartColors[item.key])
                              ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')
                              : 'transparent',
                          },
                        ]}
                      >
                        {isTransparent(chartColors[item.key]) && <View style={styles.transparentSlash} />}
                      </View>
                      <Text style={styles.colorValueText}>{chartColors[item.key]}</Text>
                      <Ionicons name="chevron-down" size={16} color={T.textMuted} />
                    </View>
                  </Pressable>
                  {index < COLOR_FIELDS.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal transparent visible={schemeModalOpen} animationType="fade" onRequestClose={() => setSchemeModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSchemeModalOpen(false)}>
          <View style={styles.modalCard}>
            {SCHEME_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={styles.modalRow}
                onPress={() => {
                  setChartColorScheme(option.key);
                  setSchemeModalOpen(false);
                }}
              >
                <Text style={[styles.modalRowText, option.key === chartColorScheme && styles.modalRowTextActive]}>{option.label}</Text>
                {option.key === chartColorScheme && <Ionicons name="checkmark" size={16} color={T.trading.buy.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={activeColorKey !== null} animationType="slide" onRequestClose={() => applyDraftColor(draftColor)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalBackdropBottom} onPress={() => applyDraftColor(draftColor)}>
            <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>{COLOR_FIELDS.find((item) => item.key === activeColorKey)?.label ?? 'Color'}</Text>

                <ColorPicker
                  style={{ width: '100%' }}
                  value={draftColor}
                  onChange={(color) => handleDraftColorChange(color.hex.toUpperCase())}
                  onComplete={() => {}}
                >
                  <View style={styles.colorPickerRow}>
                    <Preview hideText disableOpacityTexture style={styles.previewPanel} />
                    <Panel1 style={styles.panel1} />
                  </View>
                  <HueSlider sliderThickness={12} boundedThumb style={styles.slider} />
                </ColorPicker>

                <View style={styles.swatchRow}>
                  {SWATCHES.map((swatch) => (
                    <Pressable
                      key={swatch}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: swatch === 'transparent' ? 'transparent' : swatch,
                          borderColor: swatch === 'transparent'
                            ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')
                            : 'transparent',
                        },
                      ]}
                      onPress={() => handleDraftColorChange(swatch)}
                    >
                      {swatch === 'transparent' && <View style={styles.transparentSlash} />}
                    </Pressable>
                  ))}
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>HEX</Text>
                  <TextInput style={styles.hexInput} value={draftColor} onChangeText={handleDraftColorChange} autoCapitalize="characters" />
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoCardHalf}>
                    <Text style={styles.infoLabel}>RGB</Text>
                    <Text style={styles.infoValue}>{colorRgb.r}, {colorRgb.g}, {colorRgb.b}</Text>
                  </View>
                  <View style={styles.infoCardHalf}>
                    <Text style={styles.infoLabel}>HSV</Text>
                    <Text style={styles.infoValue}>{Math.round(colorHsv.h)} deg, {Math.round(colorHsv.s)}%, {Math.round(colorHsv.v)}%</Text>
                  </View>
                  <View style={styles.infoCardHalf}>
                    <Text style={styles.infoLabel}>HSL</Text>
                    <Text style={styles.infoValue}>{Math.round(colorHsl.h)} deg, {Math.round(colorHsl.s)}%, {Math.round(colorHsl.l)}%</Text>
                  </View>
                </View>

                <Pressable style={styles.doneButton} onPress={() => applyDraftColor(draftColor)}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function SettingsNavRow({
  label,
  value,
  onPress,
  styles,
}: {
  label: string;
  value: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <Text style={styles.navLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#0B0D10' : '#F4F5F7',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 26,
    },
    title: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 26,
      marginBottom: 12,
    },
    previewCard: {
      backgroundColor: isDark ? '#101722' : '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      padding: 16,
      marginBottom: 14,
    },
    previewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    previewTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
    },
    previewSub: {
      marginTop: 4,
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.12)',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: '#22C55E',
    },
    liveBadgeText: {
      color: isDark ? '#DBEAFE' : '#1D4ED8',
      fontSize: 12,
      fontWeight: '800',
    },
    snapshotRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    snapshotCard: {
      flex: 1,
      minWidth: 88,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(248,250,252,0.94)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.12)',
    },
    snapshotLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    snapshotValue: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '800',
    },
    previewChart: {
      height: 240,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#DDE3EA',
    },
    previewFooter: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    previewFooterText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '600',
    },
    tabsRow: {
      flexDirection: 'row',
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(16,23,34,0.88)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      paddingHorizontal: 8,
      paddingTop: 6,
      marginBottom: 12,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      gap: 8,
    },
    tabText: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 13,
      fontWeight: '700',
    },
    tabTextActive: {
      color: isDark ? '#F8FAFC' : '#0F172A',
    },
    tabUnderline: {
      width: '60%',
      height: 3,
      borderRadius: 999,
      backgroundColor: 'transparent',
    },
    tabUnderlineActive: {
      backgroundColor: T.trading.buy.primary,
    },
    panel: {
      backgroundColor: isDark ? '#101722' : '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      overflow: 'hidden',
    },
    panelBody: {
      paddingVertical: 4,
    },
    navRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    navLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: '58%',
      minWidth: 0,
    },
    rowRightCompact: {
      width: '100%',
      maxWidth: '100%',
      justifyContent: 'flex-end',
      marginTop: 8,
    },
    rowValue: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
      minWidth: 0,
      textAlign: 'right',
    },
    checkRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxChecked: {
      backgroundColor: T.trading.buy.primary,
      borderColor: T.trading.buy.primary,
    },
    checkLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
    },
    colorRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 14,
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 12,
    },
    colorLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
      width: '100%',
    },
    colorLabelCompact: {
      width: '100%',
      flex: 0,
    },
    colorValueRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
    },
    colorValueText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
      minWidth: 0,
    },
    colorChip: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    transparentSlash: {
      width: 28,
      height: 2,
      backgroundColor: '#EF4444',
      transform: [{ rotate: '45deg' }],
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      marginLeft: 16,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    modalBackdropBottom: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 360,
      backgroundColor: isDark ? '#101722' : '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      overflow: 'hidden',
    },
    modalRow: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalRowText: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
    },
    modalRowTextActive: {
      color: T.trading.buy.primary,
    },
    bottomSheet: {
      backgroundColor: isDark ? '#101722' : '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      padding: 18,
      maxHeight: '88%',
    },
    sheetTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 16,
      textAlign: 'center',
    },
    colorPickerRow: {
      flexDirection: 'row',
      height: 176,
      marginBottom: 12,
      borderRadius: 14,
      overflow: 'hidden',
    },
    previewPanel: {
      width: '30%',
      height: '100%',
      borderRadius: 0,
      borderWidth: 0,
      margin: 0,
    },
    panel1: {
      width: '70%',
      height: '100%',
      borderRadius: 0,
      borderWidth: 0,
      margin: 0,
    },
    slider: {
      borderRadius: 6,
      marginBottom: 16,
    },
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 18,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    infoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 10,
    },
    infoCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : '#F8FAFC',
    },
    infoCardHalf: {
      width: '47.5%',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : '#F8FAFC',
    },
    infoLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    infoValue: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    hexInput: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 0,
    },
    doneButton: {
      marginTop: 18,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: T.trading.buy.primary,
    },
    doneButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },
  });
}
