import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';

type ToggleItem = { label: string; key: string };
type NavItem = { label: string; value?: string; onPress?: () => void };

const SHOW_ON_CHART: ToggleItem[] = [
  { label: 'Open positions', key: 'openPositions' },
  { label: 'TP / SL / Stop / Limit', key: 'tpSlStopLimit' },
  { label: 'Closed positions', key: 'closedPositions' },
  { label: 'Trading signals', key: 'tradingSignals' },
  { label: 'HMR periods', key: 'hmrPeriods' },
  { label: 'Price alerts', key: 'priceAlerts' },
  { label: 'Potential Stop Out line', key: 'potentialStopOut' },
];

const INITIAL_TOGGLES: Record<string, boolean> = {
  openPositions: true,
  tpSlStopLimit: true,
  closedPositions: false,
  tradingSignals: false,
  hmrPeriods: true,
  priceAlerts: true,
  potentialStopOut: true,
};

export function ChartSettingsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { showTradingSignals, setShowTradingSignals, priceSource, openOrderMode } = useUserPreferences();
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    ...INITIAL_TOGGLES,
    tradingSignals: showTradingSignals,
  });

  const handleToggle = (key: string) => {
    if (key === 'tradingSignals') {
      const newState = !toggles.tradingSignals;
      setShowTradingSignals(newState);
      setToggles((prev) => ({ ...prev, [key]: newState }));
      return;
    }
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const CHART_PREFS: NavItem[] = [
    { label: 'Chart', value: 'Exness' },
    { label: 'Price source', value: priceSource === 'bid' ? 'Bid price' : 'Ask price', onPress: () => router.push('/chart/price-source') },
    { label: 'Colors', onPress: () => router.push('/chart/colors') },
    { label: 'Open order mode', value: openOrderMode, onPress: () => router.push('/chart/open-order-mode') },
  ];

  const NAVIGATION: NavItem[] = [
    { label: 'Order of menu items', onPress: () => router.push('/chart/menu-order') },
  ];

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* SHOW ON CHART */}
        <Text style={styles.sectionHeader}>SHOW ON CHART</Text>
        <View style={styles.sectionCard}>
          {SHOW_ON_CHART.map((item, idx) => (
            <View key={item.key}>
              <Pressable style={styles.toggleRow} onPress={() => handleToggle(item.key)}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {toggles[item.key] ? (
                  <Ionicons name="checkmark" size={22} color={isDark ? '#FFFFFF' : '#0F172A'} />
                ) : null}
              </Pressable>
              {idx < SHOW_ON_CHART.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>

        {/* CHART PREFERENCES */}
        <Text style={styles.sectionHeader}>CHART PREFERENCES</Text>
        <View style={styles.sectionCard}>
          {CHART_PREFS.map((item, idx) => (
            <View key={item.label}>
              <Pressable style={styles.navRow} onPress={item.onPress}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <View style={styles.navRight}>
                  {item.value && <Text style={styles.navValue}>{item.value}</Text>}
                  <Ionicons name="chevron-forward" size={18} color={isDark ? 'rgba(255,255,255,0.3)' : '#CBD5E1'} />
                </View>
              </Pressable>
              {idx < CHART_PREFS.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>
        <Text style={styles.sectionFooter}>
          Chart preferences are applied to all trading accounts and instruments
        </Text>

        {/* NAVIGATION */}
        <Text style={styles.sectionHeader}>NAVIGATION</Text>
        <View style={styles.sectionCard}>
          {NAVIGATION.map((item, idx) => (
            <View key={item.label}>
              <Pressable style={styles.navRow} onPress={item.onPress}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={isDark ? 'rgba(255,255,255,0.3)' : '#CBD5E1'} />
              </Pressable>
              {idx < NAVIGATION.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? T.bg : '#F1F5F9',
      paddingHorizontal: 0,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B',
      letterSpacing: 0.8,
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 10,
    },
    sectionCard: {
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      marginHorizontal: 16,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 50,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 50,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? '#F1F5F9' : '#0F172A',
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    navValue: {
      fontSize: 15,
      fontWeight: '400',
      color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B',
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      marginLeft: 16,
    },
    sectionFooter: {
      fontSize: 13,
      color: isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8',
      paddingHorizontal: 20,
      paddingTop: 10,
      lineHeight: 18,
    },
  });
}
