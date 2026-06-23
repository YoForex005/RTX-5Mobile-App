import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
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
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import {
  CHART_SHOW_ON_CHART_ITEMS,
  type ChartShowOnChartKey,
} from './chartShowOnChart';


const SHOW_ON_CHART_ICONS: Record<ChartShowOnChartKey, keyof typeof Ionicons.glyphMap> = {
  buyTrade: 'trending-up-outline',
  sellTrade: 'trending-down-outline',
};

export function ChartSettingsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const priceSource = useUserPreferences((s) => s.priceSource);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const setChartShowOnChartItem = useUserPreferences((s) => s.setChartShowOnChartItem);
  const handleToggleShowOnChart = useCallback(
    (key: ChartShowOnChartKey, value: boolean) => {
      setChartShowOnChartItem(key, value);
    },
    [setChartShowOnChartItem],
  );

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={styles.headerRow}>
          <FastPressable onPress={() => safeRouterBack(router, '/(tabs)/chart')} latencyLabel="chartSettings.back" hitSlop={16} style={styles.headerBackBtn}>
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

        <View style={styles.sectionHeader}>
          <Ionicons name="funnel-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>SHOW ON CHART</Text>
        </View>
        <View style={styles.card}>
          {CHART_SHOW_ON_CHART_ITEMS.map((item, index) => (
            <React.Fragment key={item.key}>
              <ToggleRow
                item={item}
                enabled={chartShowOnChart[item.key]}
                isDark={isDark}
                onValueChange={(value) => handleToggleShowOnChart(item.key, value)}
                styles={styles}
              />
              {index < CHART_SHOW_ON_CHART_ITEMS.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>
        <View style={styles.sectionHeader}>
          <Ionicons name="menu-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text style={styles.sectionTitle}>NAVIGATION</Text>
        </View>
        <View style={styles.card}>
          <NavRow
            label="Order of menu items"
            value=""
            onPress={() => router.push('/chart/menu-order')}
            styles={styles}
          />
        </View>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={isDark ? '#475569' : '#94A3B8'} />
          <Text style={styles.preferencesNote}>
            Chart preferences are applied to all trading accounts and instruments
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

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
        <Text style={styles.toggleLabel} numberOfLines={1}>{item.label}</Text>
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

function makeStyles(_T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#06080D' : '#F4F5F7',
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
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
      backgroundColor: isDark ? '#06080D' : '#F4F5F7',
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
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    card: {
      marginHorizontal: 14,
      backgroundColor: isDark ? '#0E141F' : '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
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
      minHeight: 56,
      paddingHorizontal: 14,
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
    toggleIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(148,163,184,0.10)' : '#F1F5F9',
    },
    toggleLabel: {
      flex: 1,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '500',
    },
    toggleSwitch: {
      transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }],
    },
    rowLabel: {
      flex: 1,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '500',
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    navValue: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 14,
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
