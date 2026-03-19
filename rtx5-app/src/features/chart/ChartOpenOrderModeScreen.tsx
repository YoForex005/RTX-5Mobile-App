import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme } from '../../theme/useTheme';

export function ChartOpenOrderModeScreen() {
  const router = useRouter();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { openOrderMode, setOpenOrderMode } = useUserPreferences();

  const handleSelect = (mode: 'Regular' | 'Risk calculator' | 'One-click') => {
    setOpenOrderMode(mode);
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => handleSelect('Regular')}>
            <Text style={styles.rowLabel}>Regular</Text>
            {openOrderMode === 'Regular' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
          <View style={styles.separator} />
          
          <Pressable style={styles.row} onPress={() => handleSelect('Risk calculator')}>
            <Text style={styles.rowLabel}>Risk calculator</Text>
            {openOrderMode === 'Risk calculator' && (
              <Ionicons name="checkmark" size={24} color={T.trading.buy.primary} />
            )}
          </Pressable>
          <View style={styles.separator} />
          
          <Pressable style={styles.row} onPress={() => handleSelect('One-click')}>
            <Text style={styles.rowLabel}>One-click</Text>
            {openOrderMode === 'One-click' && (
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
