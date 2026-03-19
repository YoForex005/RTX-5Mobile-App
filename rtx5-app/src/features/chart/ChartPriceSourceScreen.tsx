import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme } from '../../theme/useTheme';

export function ChartPriceSourceScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { priceSource, setPriceSource } = useUserPreferences();

  const handleSelect = (source: 'bid' | 'ask') => {
    setPriceSource(source);
    // Optionally auto-nav back, but usually these screens let user tap back
    // router.back();
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => handleSelect('bid')}>
            <Text style={styles.rowLabel}>Bid price</Text>
            {priceSource === 'bid' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
          <View style={styles.separator} />
          <Pressable style={styles.row} onPress={() => handleSelect('ask')}>
            <Text style={styles.rowLabel}>Ask price</Text>
            {priceSource === 'ask' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: any, isDark: boolean) {
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
      paddingTop: 16,
    },
    card: {
      backgroundColor: isDark ? '#0B0F19' : '#FFFFFF',
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
