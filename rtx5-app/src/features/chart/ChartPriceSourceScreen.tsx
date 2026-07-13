import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartPriceSourceScreen
 * 
 * Preferences screen to define whether the primary chart line renders the Bid
 * or the Ask price stream from the WebSocket.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../../ui/theme/useTheme';
import { safeRouterBack } from '../../utils/navigation';

export function ChartPriceSourceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const insets = useSafeAreaInsets();
  const priceSource = useUserPreferences((s) => s.priceSource);
  const setPriceSource = useUserPreferences((s) => s.setPriceSource);

  const handleSelect = (source: 'bid' | 'ask') => {
    setPriceSource(source);
  };

  const screenBg = T.bg;

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      {/* Status bar spacer */}
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: screenBg }]}>
        <Pressable onPress={() => safeRouterBack(router, '/(tabs)/chart')} hitSlop={16} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]} numberOfLines={1}>
          {t('Price source')}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => handleSelect('bid')}>
            <Text style={styles.rowLabel}>{t('Bid price')}</Text>
            {priceSource === 'bid' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
          <View style={styles.separator} />
          <Pressable style={styles.row} onPress={() => handleSelect('ask')}>
            <Text style={styles.rowLabel}>{t('Ask price')}</Text>
            {priceSource === 'ask' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: any, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    headerBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
      paddingTop: 16,
    },
    card: {
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 12,
      marginHorizontal: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 52,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: T.text,
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
      marginLeft: 16,
    },
  });
}
