import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';
import { ChartTradingHoursModal } from './ChartTradingHoursModal';

const MOCK_DATA = {
  minVolume: '0.01',
  maxVolume: '200',
  step: '0.01',
  contractSize: '100',
  spreadUnits: 'USD',
  stopLevel: '0.0',
  swapLong: '-62.0',
  swapShort: '0.0',
};

export function ChartSpecificationScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [showTradingHoursModal, setShowTradingHoursModal] = React.useState(false);

  const currentSymbol = symbol || 'XAU/USD';

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Trading Hours Section */}
        <Text style={styles.sectionHeader}>TRADING HOURS</Text>
        <Pressable style={styles.tradingHoursCard} onPress={() => setShowTradingHoursModal(true)}>
          <Ionicons name="time-outline" size={24} color={T.text} style={styles.timeIcon} />
          <View style={styles.tradingHoursTextCol}>
            <Text style={styles.tradingHoursTitle}>Market is open</Text>
            <Text style={styles.tradingHoursSub}>Closes in 13:45:15</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={T.text} />
        </Pressable>

        {/* Info Section */}
        <Text style={[styles.sectionHeader, { marginTop: 32 }]}>INFO</Text>
        <View style={styles.infoContainer}>
          {[
            { label: 'Minimum volume, lots', value: MOCK_DATA.minVolume },
            { label: 'Maximum volume, lots', value: MOCK_DATA.maxVolume },
            { label: 'Step', value: MOCK_DATA.step },
            { label: 'Contract size', value: MOCK_DATA.contractSize },
            { label: 'Spread units', value: MOCK_DATA.spreadUnits },
            { label: 'Stop level, pips', value: MOCK_DATA.stopLevel },
            { label: 'Swap long, pips', value: MOCK_DATA.swapLong },
            { label: 'Swap short, pips', value: MOCK_DATA.swapShort },
          ].map((item, index) => (
            <View key={item.label} style={[styles.infoRow, index === 0 && { paddingTop: 0 }]}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <ChartTradingHoursModal 
        visible={showTradingHoursModal} 
        onClose={() => setShowTradingHoursModal(false)} 
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? T.bg : '#FFFFFF',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#94A3B8', // Keeping it a muted gray/silver for section headers
      letterSpacing: 0.5,
      marginBottom: 16,
    },
    tradingHoursCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    timeIcon: {
      marginRight: 16,
    },
    tradingHoursTextCol: {
      flex: 1,
    },
    tradingHoursTitle: {
      fontSize: 16,
      color: T.text,
      fontWeight: '400',
      marginBottom: 2,
    },
    tradingHoursSub: {
      fontSize: 14,
      color: T.textMuted,
    },
    infoContainer: {
      // no background or borders, just clean padding layout
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
    },
    infoLabel: {
      fontSize: 15,
      color: isDark ? '#CBD5E1' : '#334155', // slightly softer than fully black
      fontWeight: '400',
    },
    infoValue: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '400',
    },
  });
}
