import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';

type MenuItem = { label: string; icon: keyof typeof Ionicons.glyphMap };

const QUICK_ACCESS: MenuItem[] = [
  { label: 'Price Alerts', icon: 'navigate-circle-outline' },
  { label: 'Maximise', icon: 'expand-outline' },
  { label: 'Settings', icon: 'settings-outline' },
];

const OTHER: MenuItem[] = [
  { label: 'Add to favorites', icon: 'star-outline' },
  { label: 'Trading calculator', icon: 'calculator-outline' },
  { label: 'Analytics', icon: 'analytics-outline' },
  { label: 'Specification', icon: 'document-text-outline' },
];

export function ChartMenuOrderScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const renderItem = (item: MenuItem, idx: number, arr: MenuItem[]) => (
    <View key={item.label}>
      <View style={styles.menuRow}>
        <View style={styles.menuLeft}>
          <Ionicons name={item.icon} size={22} color={isDark ? '#94A3B8' : '#475569'} />
          <Text style={styles.rowLabel}>{item.label}</Text>
        </View>
        <Ionicons name="menu" size={22} color={isDark ? 'rgba(255,255,255,0.3)' : '#CBD5E1'} />
      </View>
      {idx < arr.length - 1 && <View style={styles.separator} />}
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionHeader}>QUICK ACCESS</Text>
        <View style={styles.sectionCard}>
          {QUICK_ACCESS.map((item, idx) => renderItem(item, idx, QUICK_ACCESS))}
        </View>
        <Text style={styles.sectionFooter}>Only 3 items can be placed in Quick Access.</Text>

        <Text style={styles.sectionHeader}>OTHER</Text>
        <View style={styles.sectionCard}>
          {OTHER.map((item, idx) => renderItem(item, idx, OTHER))}
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
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 50,
    },
    menuLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? '#F1F5F9' : '#0F172A',
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
