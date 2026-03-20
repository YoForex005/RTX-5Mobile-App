import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';

const MOCK_DATA = {
  margin: '2.39',
  commission: '0.00',
  swap: '-0.62',
  spread: '0.22',
  pipValue: '0.01',
  pl: '10.12',
  currency: 'USD',
  marketPrice: '4778.654',
};

export function ChartTradingCalculatorScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lotSize, setLotSize] = useState('0.01');
  const [openPrice, setOpenPrice] = useState('');
  const [closePrice, setClosePrice] = useState('4788.771');

  const adjustLotSize = (amount: number) => {
    setLotSize((prev) => {
      const parsed = parseFloat(prev) || 0;
      return Math.max(0.01, parsed + amount).toFixed(2);
    });
  };

  const currentSymbol = symbol || 'XAU/USD';

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: `Calculator (${currentSymbol})` }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Segmented Control */}
        <View style={styles.segmentContainer}>
          <Pressable
            style={[styles.segmentBtn, side === 'buy' && styles.segmentBtnActive]}
            onPress={() => setSide('buy')}
          >
            <Text style={[styles.segmentText, side === 'buy' && styles.segmentTextActive]}>Buy</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, side === 'sell' && styles.segmentBtnActive]}
            onPress={() => setSide('sell')}
          >
            <Text style={[styles.segmentText, side === 'sell' && styles.segmentTextActive]}>Sell</Text>
          </Pressable>
        </View>

        {/* Form Inputs */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Volume, lots</Text>
          <View style={styles.inputBox}>
            <Pressable onPress={() => adjustLotSize(-0.01)} style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={lotSize}
              onChangeText={setLotSize}
              keyboardType="numeric"
            />
            <Pressable onPress={() => adjustLotSize(0.01)} style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Leverage</Text>
          <Pressable style={styles.dropdownBox}>
            <Text style={styles.dropdownText}>1:2000 (Account leverage)</Text>
            <Ionicons name="chevron-down" size={18} color={T.textMuted} />
          </Pressable>

          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>Open at</Text>
            <Pressable onPress={() => setOpenPrice('')}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.inputBox}>
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={openPrice}
              onChangeText={setOpenPrice}
              keyboardType="numeric"
              placeholder={`Market price (${MOCK_DATA.marketPrice})`}
              placeholderTextColor={T.textMuted}
            />
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>Close at</Text>
            <Pressable onPress={() => setClosePrice('')}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.inputBox}>
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={closePrice}
              onChangeText={setClosePrice}
              keyboardType="numeric"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
            />
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Summary Table */}
        <View style={styles.summaryTable}>
          {[
            { label: 'Margin', value: `${MOCK_DATA.margin} ${MOCK_DATA.currency}` },
            { label: 'Commission', value: `${MOCK_DATA.commission} ${MOCK_DATA.currency}` },
            { label: 'Swap', value: `${MOCK_DATA.swap} ${MOCK_DATA.currency}` },
            { label: 'Spread', value: `${MOCK_DATA.spread} ${MOCK_DATA.currency}` },
            { label: 'Pip Value', value: `${MOCK_DATA.pipValue} ${MOCK_DATA.currency}` },
            { label: 'P/L', value: `${MOCK_DATA.pl} ${MOCK_DATA.currency}` },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.summaryValue}>{item.value}</Text>
                  <Ionicons name="information-circle-outline" size={20} color={T.textMuted} />
                </View>
              </View>
              {i < arr.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>

        {/* Footer Warning */}
        <View style={styles.footerWarning}>
          <Ionicons name="information-circle-outline" size={24} color={isDark ? T.text : '#000'} style={{ marginTop: 2 }} />
          <Text style={styles.footerWarningText}>
            Always review the Order Information when placing an order. Order parameters may vary depending on specific conditions.
          </Text>
        </View>

      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? T.bg : '#FFFFFF',
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0B0F19' : '#FFFFFF',
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginBottom: 20,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9', // subtle background for active
    },
    segmentText: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    segmentTextActive: {
      color: T.text,
      fontWeight: '600',
    },
    inputSection: {
      marginBottom: 24,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
    },
    inputLabel: {
      fontSize: 14,
      color: isDark ? '#94A3B8' : '#334155',
      marginBottom: 8,
    },
    clearText: {
      fontSize: 14,
      color: T.trading.buy.primary,
      fontWeight: '500',
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      borderRadius: 8,
      backgroundColor: isDark ? '#0B0F19' : '#FFFFFF',
      overflow: 'hidden',
    },
    stepperBtn: {
      padding: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    textInput: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      color: T.text,
      paddingVertical: 14,
    },
    dropdownBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      borderRadius: 8,
      backgroundColor: isDark ? '#0B0F19' : '#FFFFFF',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    dropdownText: {
      fontSize: 16,
      color: T.text,
    },
    summaryTable: {
      backgroundColor: isDark ? '#0f172a' : '#F8FAFC',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    summaryLabel: {
      fontSize: 15,
      color: T.text,
      fontWeight: '400',
    },
    summaryValue: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    footerWarning: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0f172a' : '#F1F5F9',
      padding: 16,
      borderRadius: 12,
      alignItems: 'flex-start',
      gap: 12,
    },
    footerWarningText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? '#94A3B8' : '#334155',
      lineHeight: 20,
    },
  });
}
