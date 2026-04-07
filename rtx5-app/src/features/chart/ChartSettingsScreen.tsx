import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';
import { useTheme } from '../../theme/useTheme';

export function ChartSettingsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const priceSource = useUserPreferences((s) => s.priceSource);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
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

  const tradingFields = [
    { label: 'Open positions', value: showOpenPositions, setter: setShowOpenPositions },
    { label: 'TP / SL / Stop / Limit', value: showTpSlStopLimit, setter: setShowTpSlStopLimit },
    { label: 'Closed positions', value: showClosedPositions, setter: setShowClosedPositions },
    { label: 'Trading signals', value: showTradingSignals, setter: setShowTradingSignals },
    { label: 'HMR periods', value: showHmrPeriods, setter: setShowHmrPeriods },
    { label: 'Price alerts', value: showPriceAlerts, setter: setShowPriceAlerts },
    { label: 'Potential Stop Out line', value: showPotentialStopOut, setter: setShowPotentialStopOut },
  ];

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── SHOW ON CHART ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>SHOW ON CHART</Text>
        <View style={styles.card}>
          {tradingFields.map((item, index) => (
            <View key={item.label}>
              <Pressable style={styles.checkRow} onPress={() => item.setter(!item.value)}>
                <Text style={styles.checkLabel}>{item.label}</Text>
                <View style={[styles.checkbox, item.value && styles.checkboxChecked]}>
                  {item.value && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
              </Pressable>
              {index < tradingFields.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>

        {/* ── NAVIGATION ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>NAVIGATION</Text>
        <View style={styles.card}>
          <NavRow
            label="Order of menu items"
            value=""
            onPress={() => router.push('/chart/menu-order')}
            styles={styles}
          />
        </View>

        {/* ── CHART PREFERENCES ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>CHART PREFERENCES</Text>
        <View style={styles.card}>
          <NavRow
            label="Chart"
            value="TradingView"
            onPress={() => {}}
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
        <Text style={styles.preferencesNote}>
          Chart preferences are applied to all trading accounts and instruments
        </Text>

      </ScrollView>
    </Screen>
  );
}

/* ── Navigation Row Sub-Component ──────────────────────────────── */

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
    <Pressable style={styles.navRow} onPress={onPress}>
      <Text style={styles.navLabel}>{label}</Text>
      <View style={styles.navRight}>
        {value !== '' && <Text style={styles.navValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#000000' : '#F4F5F7',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 40,
    },

    /* Section titles */
    sectionTitle: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 8,
    },

    /* Grouped card */
    card: {
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : '#FFFFFF',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      overflow: 'hidden',
    },

    /* Separator line */
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      marginLeft: 16,
    },

    /* ── Check row (trading toggles) ────────────────────────── */
    checkRow: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    checkLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '500',
      flex: 1,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxChecked: {
      backgroundColor: T.trading.buy.primary,
      borderColor: T.trading.buy.primary,
    },

    /* ── Nav row (preferences) ──────────────────────────────── */
    navRow: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    navLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '500',
    },
    navRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    navValue: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 14,
      fontWeight: '500',
    },

    /* Preferences note */
    preferencesNote: {
      color: isDark ? '#475569' : '#94A3B8',
      fontSize: 12,
      fontWeight: '500',
      paddingHorizontal: 16,
      marginTop: 8,
      lineHeight: 18,
    },
  });
}
