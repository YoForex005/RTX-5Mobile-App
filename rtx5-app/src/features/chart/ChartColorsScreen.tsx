/**
 * Chart Feature UI: ChartColorsScreen
 * 
 * Provides an interface for customizing the colors of diverse chart components.
 * Designed with a premium, dynamic interface for professional traders.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { ThemeColors } from '../../theme/glass';
import type { ChartColorsConfig } from '../../state/userPreferences';

type ColorRow = { label: string; keyId: keyof ChartColorsConfig };

const SECTIONS: { title: string; items: ColorRow[] }[] = [
  {
    title: 'CANDLES',
    items: [
      { label: 'Uptrend', keyId: 'candlesUptrend' },
      { label: 'Downtrend', keyId: 'candlesDowntrend' },
    ],
  },
  {
    title: 'HOLLOW CANDLES',
    items: [
      { label: 'Body', keyId: 'hollowBody' },
    ],
  },
  {
    title: 'BARS',
    items: [
      { label: 'Uptrend', keyId: 'barsUptrend' },
      { label: 'Downtrend', keyId: 'barsDowntrend' },
    ],
  },
  {
    title: 'LINE',
    items: [
      { label: 'Body', keyId: 'lineBody' },
    ],
  },
];

export function ChartColorsScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const chartColors = useUserPreferences((s) => s.chartColors);
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section, sIdx) => (
          <View key={section.title} style={{ marginTop: sIdx === 0 ? 8 : 24 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
            </View>
            <View style={[styles.sectionCard, styles.cardShadow]}>
              {section.items.map((item, idx) => (
                <View key={item.label}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.colorRow,
                      pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }
                    ]}
                  >
                    {/* Left: Label */}
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                    </View>

                    {/* Right: Hex Code & Color Swatch */}
                    <View style={styles.rowRight}>
                      <Text style={styles.hexText}>{chartColors[item.keyId].toUpperCase()}</Text>
                      <View style={styles.colorSwatchWrap}>
                        <View style={[styles.colorSwatch, { backgroundColor: chartColors[item.keyId] }]} />
                        <View style={styles.colorSwatchHighlight} />
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={T.textMuted} style={{ marginLeft: 6 }} />
                    </View>
                  </Pressable>
                  {idx < section.items.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 60 }} />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? T.bg : '#F8FAFC',
      paddingHorizontal: 0,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingBottom: 10,
      gap: 8,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? 'rgba(255,255,255,0.4)' : '#64748B',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sectionCard: {
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#FFFFFF',
      marginHorizontal: 16,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
    },
    cardShadow: {
      ...Platform.select({
        ios: {
          shadowColor: isDark ? '#000' : '#475569',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 16,
        },
        android: {
          elevation: isDark ? 0 : 4,
        },
        web: {
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 24px rgba(71, 85, 105, 0.05)',
        }
      })
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 56,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? '#F8FAFC' : '#0F172A',
      letterSpacing: 0.3,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    hexText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? 'rgba(255,255,255,0.3)' : '#94A3B8',
      fontVariant: ['tabular-nums'],
    },
    colorSwatchWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      position: 'relative',
    },
    colorSwatch: {
      ...StyleSheet.absoluteFillObject,
    },
    colorSwatchHighlight: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.3)',
      borderRadius: 8,
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      marginLeft: 60,
    },
  });
}

