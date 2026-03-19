import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';

type ColorRow = { label: string; color: string };

const SECTIONS: { title: string; items: ColorRow[] }[] = [
  {
    title: 'CANDLES',
    items: [
      { label: 'Uptrend', color: '#2962FF' },
      { label: 'Downtrend', color: '#EF5350' },
    ],
  },
  {
    title: 'HOLLOW CANDLES',
    items: [
      { label: 'Body', color: '#1E293B' },
    ],
  },
  {
    title: 'BARS',
    items: [
      { label: 'Uptrend', color: '#2962FF' },
      { label: 'Downtrend', color: '#EF5350' },
    ],
  },
  {
    title: 'LINE',
    items: [
      { label: 'Body', color: '#1E293B' },
    ],
  },
];

export function ChartColorsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <View key={item.label}>
                  <View style={styles.colorRow}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                  </View>
                  {idx < section.items.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        ))}
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
    colorRow: {
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
    colorDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      marginLeft: 16,
    },
  });
}
