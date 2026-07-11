import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { FastPressable } from '../../ui/components/FastPressable';
import { safeRouterBack } from '../../utils/navigation';
import { useUserPreferences, type ChartDisplaySettings } from '../../state/userPreferences';
import { useUIState, type PendingChartCommand } from '../../state/uiState';
import { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import {
  CHART_SHOW_ON_CHART_ITEMS,
  type ChartShowOnChartKey,
} from './chartShowOnChart';


const SHOW_ON_CHART_ICONS: Record<ChartShowOnChartKey, keyof typeof Ionicons.glyphMap> = {
  buyTrade: 'trending-up-outline',
  sellTrade: 'trending-down-outline',
  slTpLevels: 'shield-checkmark-outline',
};

const CHART_SETTINGS_DISPLAY_ITEMS: Array<{
  key: keyof ChartDisplaySettings;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'showTicker', label: 'Show ticker', description: 'Show the symbol ticker on the chart', icon: 'pricetag-outline' },
  { key: 'showOHLC', label: 'Show OHLC', description: 'Show open, high, low, and close values', icon: 'stats-chart-outline' },
  { key: 'showQuickTradingButtons', label: 'Show quick trading buttons', description: 'Show quick buy and sell buttons on the chart', icon: 'flash-outline' },
  { key: 'showLivePriceLine', label: 'Show live price line', description: 'Show the live Bid price line on the chart', icon: 'pulse-outline' },
  { key: 'showLastPriceLine', label: 'Show last price line', description: 'Show the last price marker on the chart', icon: 'ellipse-outline' },
  { key: 'showGrid', label: 'Show grid', description: 'Show the chart grid lines', icon: 'grid-outline' },
  { key: 'periodSeparators', label: 'Period separators', description: 'Show MT5-style period separator lines', icon: 'reorder-three-outline' },
  { key: 'showObjectDescriptions', label: 'Show object descriptions', description: 'Show labels for chart objects', icon: 'text-outline' },
  { key: 'showTradeLevels', label: 'Show trade levels', description: 'Show trade level lines on the chart', icon: 'shield-checkmark-outline' },
];

const CHART_DISPLAY_TO_SHOW_ON_CHART_KEY: Partial<Record<keyof ChartDisplaySettings, ChartShowOnChartKey>> = {
  showTradeLevels: 'slTpLevels',
};

const CHART_TRADE_VISIBILITY_ITEMS = CHART_SHOW_ON_CHART_ITEMS.filter(
  (item) => item.key !== 'slTpLevels',
);

const CHART_SETTINGS_LEFT_SWIPE_CLAIM_DISTANCE = 18;
const CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_DISTANCE = 72;
const CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_VELOCITY = 0.45;
const CHART_SETTINGS_HORIZONTAL_SWIPE_RATIO = 1.35;

const isChartSettingsLeftSwipeIntent = (dx: number, dy: number) => {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  return (
    dx < 0 &&
    horizontalDistance >= CHART_SETTINGS_LEFT_SWIPE_CLAIM_DISTANCE &&
    horizontalDistance > verticalDistance * CHART_SETTINGS_HORIZONTAL_SWIPE_RATIO
  );
};

const shouldNavigateFromChartSettingsSwipe = (dx: number, dy: number, vx: number) => {
  if (!isChartSettingsLeftSwipeIntent(dx, dy)) {
    return false;
  }

  return (
    Math.abs(dx) >= CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_DISTANCE ||
    vx <= -CHART_SETTINGS_LEFT_SWIPE_NAVIGATE_VELOCITY
  );
};

/**
 * Screen where users can toggle various chart visual preferences (OHLC, grid, trade levels, volumes) and configure chart behaviors.
 */
export function ChartSettingsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const priceSource = useUserPreferences((s) => s.priceSource);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const chartOneClickPanelAtBottom = useUserPreferences((s) => s.chartOneClickPanelAtBottom);
  const chartVerticalScrollingLocked = useUserPreferences((s) => s.chartVerticalScrollingLocked);
  const chartAutoScaleEnabled = useUserPreferences((s) => s.chartAutoScaleEnabled);
  const chartDisplay = useUserPreferences((s) => s.chartDisplay);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const setChartOneClickPanelAtBottom = useUserPreferences((s) => s.setChartOneClickPanelAtBottom);
  const setChartVerticalScrollingLocked = useUserPreferences((s) => s.setChartVerticalScrollingLocked);
  const setChartAutoScaleEnabled = useUserPreferences((s) => s.setChartAutoScaleEnabled);
  const setChartDisplaySetting = useUserPreferences((s) => s.setChartDisplaySetting);
  const setChartShowOnChartItem = useUserPreferences((s) => s.setChartShowOnChartItem);
  const queueChartCommand = useUIState((s) => s.queueChartCommand);
  /**
   * Closes the chart settings screen and returns the user to the active chart.
   */
  const handleReturnToChart = useCallback(() => {
    safeRouterBack(router, '/(tabs)/chart');
  }, []);
  const getChartDisplaySettingEnabled = useCallback(
    (key: keyof ChartDisplaySettings) => {
      const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
      if (linkedShowOnChartKey) {
        return chartShowOnChart[linkedShowOnChartKey];
      }
      return Boolean(chartDisplay[key]);
    },
    [chartDisplay, chartShowOnChart],
  );
  /**
   * Toggles a specific display setting (like OHLC, grid, ticker) within the user's chart display preferences.
   */
  const handleToggleChartDisplaySetting = useCallback(
    (key: keyof ChartDisplaySettings, value: boolean) => {
      setChartDisplaySetting(key, value);
      const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
      if (linkedShowOnChartKey) {
        setChartShowOnChartItem(linkedShowOnChartKey, value);
      }
    },
    [setChartDisplaySetting, setChartShowOnChartItem],
  );
  /**
   * Toggles whether the user can scroll the chart freely along the vertical price axis.
   */
  const handleToggleChartVerticalMovement = useCallback(
    (enabled: boolean) => {
      setChartVerticalScrollingLocked(!enabled);
    },
    [setChartVerticalScrollingLocked],
  );
  /**
   * Toggles whether trade-specific UI elements (like SL/TP levels, open positions, history) are rendered directly on the chart.
   */
  const handleToggleShowOnChart = useCallback(
    (key: ChartShowOnChartKey, value: boolean) => {
      setChartShowOnChartItem(key, value);
    },
    [setChartShowOnChartItem],
  );
  /**
   * Executes a global chart command (such as reverting to default settings or clearing drawings).
   */
  const handleRunChartCommand = useCallback(
    (command: PendingChartCommand) => {
      queueChartCommand(command);
      handleReturnToChart();
    },
    [handleReturnToChart, queueChartCommand],
  );
  const chartReturnSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          isChartSettingsLeftSwipeIntent(gestureState.dx, gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          isChartSettingsLeftSwipeIntent(gestureState.dx, gestureState.dy),
        onPanResponderRelease: (_event, gestureState) => {
          if (
            shouldNavigateFromChartSettingsSwipe(
              gestureState.dx,
              gestureState.dy,
              gestureState.vx,
            )
          ) {
            handleReturnToChart();
          }
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [handleReturnToChart],
  );

  return (
    <Screen style={styles.screen}>
      <View style={styles.swipeHost} {...chartReturnSwipePanResponder.panHandlers}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <View style={styles.headerRow}>
            <FastPressable onPress={handleReturnToChart} latencyLabel="chartSettings.back" hitSlop={16} style={styles.headerBackBtn}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
            </FastPressable>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitle} numberOfLines={1}>Chart Preferences</Text>
            </View>
            <View style={styles.headerBackBtn} />
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>



        <View style={styles.sectionHeader}>
          <Ionicons name="build-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>CHART CONFIGURATION</Text>
        </View>
        <View style={styles.card}>
          <NavRow
            label="Chart Schema & Colors"
            value=""
            onPress={() => router.push('/chart/schema-colors')}
            styles={styles}
          />
          <View style={styles.separator} />
          <NavRow
            label="Chart"
            value="RTX-5"
            onPress={() => router.push('/(tabs)/chart')}
            styles={styles}
          />
          <View style={styles.separator} />
          <NavRow
            label="Price source"
            value={priceSource === 'bid' ? 'Bid prices' : 'Ask prices'}
            onPress={() => router.push('/chart/price-source')}
            styles={styles}
          />
          <View style={styles.separator} />
          <NavRow
            label="Open order mode"
            value={openOrderMode}
            onPress={() => router.push('/chart/open-order-mode')}
            styles={styles}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="resize-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>CHART SCALE</Text>
        </View>
        <View style={styles.card}>
          <ActionPreferenceRow
            title="Scroll to last bar"
            description="Move the chart to the newest candle"
            iconName="arrow-forward-outline"
            onPress={() => handleRunChartCommand('scrollToLastBar')}
            styles={styles}
            isDark={isDark}
            latencyLabel="chartSettings.scrollToLastBar"
          />
          <View style={styles.separator} />
          <ActionPreferenceRow
            title="Reset vertical scale"
            description="Fit the vertical price scale again"
            iconName="refresh-outline"
            onPress={() => handleRunChartCommand('resetVerticalScale')}
            styles={styles}
            isDark={isDark}
            latencyLabel="chartSettings.resetVerticalScale"
          />
          <View style={styles.separator} />
          <PreferenceToggleRow
            title="Auto-scale"
            description="Keep the vertical scale fitted to visible prices"
            iconName="resize-outline"
            enabled={chartAutoScaleEnabled}
            isDark={isDark}
            onValueChange={setChartAutoScaleEnabled}
            styles={styles}
            latencyLabel="chartSettings.autoScale"
          />
          <View style={styles.separator} />
          <PreferenceToggleRow
            title="Vertical movement"
            description="Allow manual up and down chart movement"
            iconName={chartVerticalScrollingLocked ? 'lock-closed-outline' : 'lock-open-outline'}
            enabled={!chartVerticalScrollingLocked}
            isDark={isDark}
            onValueChange={handleToggleChartVerticalMovement}
            styles={styles}
            latencyLabel="chartSettings.verticalMovement"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="swap-horizontal-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>TRADING</Text>
        </View>
        <View style={styles.card}>
          <PreferenceToggleRow
            title="One Click panel at the bottom"
            description="Show one click trading panel at the bottom of the chart"
            iconName="trail-sign-outline"
            enabled={chartOneClickPanelAtBottom}
            isDark={isDark}
            onValueChange={setChartOneClickPanelAtBottom}
            styles={styles}
            latencyLabel="chartSettings.oneClickPanelAtBottom"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="funnel-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>SHOW ON CHART</Text>
        </View>
        <View style={styles.card}>
          {CHART_SETTINGS_DISPLAY_ITEMS.map((item) => (
            <React.Fragment key={item.key}>
              <PreferenceToggleRow
                title={item.label}
                description={item.description}
                iconName={item.icon}
                enabled={getChartDisplaySettingEnabled(item.key)}
                isDark={isDark}
                onValueChange={(value) => handleToggleChartDisplaySetting(item.key, value)}
                styles={styles}
                latencyLabel={`chartSettings.display.${item.key}`}
              />
              <View style={styles.separator} />
            </React.Fragment>
          ))}
          {CHART_TRADE_VISIBILITY_ITEMS.map((item, index) => (
            <React.Fragment key={item.key}>
              <ToggleRow
                item={item}
                enabled={chartShowOnChart[item.key]}
                isDark={isDark}
                onValueChange={(value) => handleToggleShowOnChart(item.key, value)}
                styles={styles}
              />
              {index < CHART_TRADE_VISIBILITY_ITEMS.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="notifications-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>ALERTS</Text>
        </View>
        <View style={styles.card}>
          <NavRow
            label="Price Alerts"
            value=""
            onPress={() => router.push('/chart/alerts')}
            styles={styles}
          />
        </View>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={isDark ? '#475569' : '#94A3B8'} />
          <Text style={styles.preferencesNote}>
            Chart preferences are applied to all trading accounts
          </Text>
        </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

/**
 * A reusable list row component that renders a label on the left and a switch toggle on the right.
 */
function ToggleRow({
  item,
  enabled,
  isDark,
  onValueChange,
  styles,
}: {
  item: (typeof CHART_SHOW_ON_CHART_ITEMS)[number];
  enabled: boolean;
  isDark: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const iconName = SHOW_ON_CHART_ICONS[item.key];
  const accentColor = isDark ? '#60A5FA' : '#2563EB';

  return (
    <FastPressable
      style={({ pressed }) => [styles.toggleRow, pressed && styles.rowPressed]}
      onPress={() => onValueChange(!enabled)}
      latencyLabel={`chartSettings.showOnChart.${item.key}`}
    >
      <View style={styles.toggleLeft}>
        <View style={styles.toggleIconWrap}>
          <Ionicons name={iconName} size={17} color={isDark ? '#94A3B8' : '#64748B'} />
        </View>
        <View style={styles.preferenceToggleText}>
          <Text style={styles.toggleLabel} numberOfLines={2}>{item.label}</Text>
          <Text style={styles.toggleDescription} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>
      <Switch
        pointerEvents="none"
        value={enabled}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? 'rgba(148,163,184,0.24)' : '#CBD5E1', true: isDark ? 'rgba(96,165,250,0.42)' : '#BFDBFE' }}
        thumbColor={enabled ? accentColor : (isDark ? '#CBD5E1' : '#FFFFFF')}
        ios_backgroundColor={isDark ? 'rgba(148,163,184,0.24)' : '#CBD5E1'}
        style={styles.toggleSwitch}
      />
    </FastPressable>
  );
}

/**
 * A specific toggle row tied directly to the global user preferences state, automatically managing updates.
 */
function PreferenceToggleRow({
  title,
  description,
  iconName,
  enabled,
  isDark,
  onValueChange,
  styles,
  latencyLabel,
}: {
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  enabled: boolean;
  isDark: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  latencyLabel: string;
}) {
  const accentColor = isDark ? '#60A5FA' : '#2563EB';

  return (
    <FastPressable
      style={({ pressed }) => [styles.preferenceToggleRow, pressed && styles.rowPressed]}
      onPress={() => onValueChange(!enabled)}
      latencyLabel={latencyLabel}
    >
      <View style={styles.toggleLeft}>
        <View style={styles.toggleIconWrap}>
          <Ionicons name={iconName} size={17} color={isDark ? '#94A3B8' : '#64748B'} />
        </View>
        <View style={styles.preferenceToggleText}>
          <Text style={styles.preferenceToggleTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.toggleDescription} numberOfLines={2}>{description}</Text>
        </View>
      </View>
      <Switch
        pointerEvents="none"
        value={enabled}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? 'rgba(148,163,184,0.24)' : '#CBD5E1', true: isDark ? 'rgba(96,165,250,0.42)' : '#BFDBFE' }}
        thumbColor={enabled ? accentColor : (isDark ? '#CBD5E1' : '#FFFFFF')}
        ios_backgroundColor={isDark ? 'rgba(148,163,184,0.24)' : '#CBD5E1'}
        style={styles.toggleSwitch}
      />
    </FastPressable>
  );
}

/**
 * A specialized row component for executing chart commands or actions rather than just toggling a boolean.
 */
function ActionPreferenceRow({
  title,
  description,
  iconName,
  onPress,
  styles,
  isDark,
  latencyLabel,
}: {
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
  latencyLabel: string;
}) {
  return (
    <FastPressable
      style={({ pressed }) => [styles.preferenceToggleRow, pressed && styles.rowPressed]}
      onPress={onPress}
      latencyLabel={latencyLabel}
    >
      <View style={styles.toggleLeft}>
        <View style={styles.toggleIconWrap}>
          <Ionicons name={iconName} size={17} color={isDark ? '#94A3B8' : '#64748B'} />
        </View>
        <View style={styles.preferenceToggleText}>
          <Text style={styles.preferenceToggleTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.toggleDescription} numberOfLines={2}>{description}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={isDark ? '#64748B' : '#94A3B8'} />
    </FastPressable>
  );
}

/**
 * A navigation row component that acts as a button, navigating the user to a deeper sub-menu (like Chart Colors) when tapped.
 */
function NavRow({
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
    <FastPressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      latencyLabel={`chartSettings.nav.${label}`}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.navRight}>
        {value !== '' && <Text style={styles.navValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color="#64748B" />
      </View>
    </FastPressable>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: T.bg,
    },
    swipeHost: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 40,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: T.bg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 10,
    },
    sectionTitle: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    card: {
      marginHorizontal: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#EEF2F7',
      overflow: 'hidden',
      shadowColor: isDark ? '#000' : '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      marginLeft: 56,
    },
    row: {
      minHeight: 56,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rowPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    },
    toggleRow: {
      minHeight: 74,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    preferenceToggleRow: {
      minHeight: 74,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    toggleLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    preferenceToggleText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    toggleIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(148,163,184,0.10)' : '#F1F5F9',
    },
    toggleLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },
    preferenceToggleTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },
    toggleDescription: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    toggleSwitch: {
      transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }],
    },
    rowLabel: {
      flex: 1,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 13,
      fontWeight: '500',
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    navValue: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      paddingHorizontal: 20,
      marginTop: 10,
    },
    preferencesNote: {
      flex: 1,
      color: isDark ? '#475569' : '#94A3B8',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 18,
    },
  });
}
