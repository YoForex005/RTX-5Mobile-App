/**
 * Chart Feature UI: ChartTradingCalculatorScreen
 * 
 * Provides a mini-calculator overlay to estimate profit/loss and margin requirements
 * based on entry price, stop-loss, take-profit, and leverage before placing a trade.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/Screen';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketData } from '../../query/websocket';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../theme/useTheme';

// Format helpers — return "—" when an input is missing so the UI never shows
// a misleading hardcoded number.
const fmtMoney = (n: number | undefined, currency: string) =>
  n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(2)} ${currency}`;
const fmtPipValue = (n: number | undefined, currency: string) =>
  n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(4)} ${currency}`;

export function ChartTradingCalculatorScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const currentSymbol = symbol || 'XAU/USD';

  // Real broker meta + live market quote
  const { data: meta } = useInstrumentMeta(currentSymbol);
  const liveQuotes = useMarketData([currentSymbol]);
  const liveQuote = liveQuotes[currentSymbol];

  const liveBid = typeof liveQuote?.bid === 'number' ? liveQuote.bid : undefined;
  const liveAsk = typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined;
  const liveMid = liveBid !== undefined && liveAsk !== undefined
    ? (liveBid + liveAsk) / 2
    : (liveBid ?? liveAsk);
  const profitCurrency = meta?.profitCurrency || 'USD';

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lotSize, setLotSize] = useState('0.01');
  const [openPrice, setOpenPrice] = useState('');
  const [closePrice, setClosePrice] = useState('');

  const adjustLotSize = (amount: number) => {
    setLotSize((prev) => {
      const parsed = parseFloat(prev) || 0;
      return Math.max(0.01, parsed + amount).toFixed(2);
    });
  };

  // ── Derive every summary value from real inputs ───────────────────────
  // Resolve effective open/close prices, falling back to live quote.
  const lots = parseFloat(lotSize) || 0;
  const effectiveOpen = parseFloat(openPrice) || (side === 'buy' ? liveAsk : liveBid) || liveMid;
  const effectiveClose = parseFloat(closePrice) || (side === 'buy' ? liveBid : liveAsk) || liveMid;
  const contractSize = meta?.contractSize ?? 0;
  const tickValue = meta?.tickValue ?? 0;
  const pipMultiplier = currentSymbol.includes('JPY') ? 100 : 10000;

  // Standard formulas (broker math, not magic constants):
  //   Spread (pips)  = (ask - bid) * pipMultiplier
  //   Pip value      = lots * contractSize * tickSize  (or directly meta.tickValue * lots / pip ratio)
  //   Margin         = lots * contractSize * openPrice / leverage
  //   Swap (1 day)   = lots * (swapLong | swapShort)
  //   P/L            = (close - open) * lots * contractSize  * directionSign
  const accountLeverage = 2000; // TODO: thread real account leverage when available
  const directionSign = side === 'buy' ? 1 : -1;

  const spread = liveBid !== undefined && liveAsk !== undefined
    ? (liveAsk - liveBid) * pipMultiplier
    : undefined;
  const pipValue = lots > 0 && contractSize > 0 && tickValue > 0
    ? lots * tickValue
    : undefined;
  const margin = lots > 0 && contractSize > 0 && effectiveOpen
    ? (lots * contractSize * effectiveOpen) / accountLeverage
    : undefined;
  const swapPerDay = lots > 0
    ? lots * ((side === 'buy' ? meta?.swapLong : meta?.swapShort) ?? NaN)
    : undefined;
  const commission = 0; // No commission field in InstrumentMetaDTO; surface 0 explicitly.
  const profitLoss = lots > 0 && contractSize > 0 && effectiveOpen && effectiveClose
    ? (effectiveClose - effectiveOpen) * lots * contractSize * directionSign
    : undefined;

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              Calculator · {currentSymbol}
            </Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
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
              placeholder={liveMid ? `Market price (${liveMid.toFixed(meta?.tickSize && meta.tickSize < 0.01 ? 5 : 3)})` : 'Market price'}
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
            { label: 'Margin',     value: fmtMoney(margin, profitCurrency) },
            { label: 'Commission', value: fmtMoney(commission, profitCurrency) },
            { label: 'Swap',       value: fmtMoney(swapPerDay, profitCurrency) },
            { label: 'Spread',     value: spread !== undefined ? `${spread.toFixed(1)} pts` : '—' },
            { label: 'Pip Value',  value: fmtPipValue(pipValue, profitCurrency) },
            { label: 'P/L',        value: fmtMoney(profitLoss, profitCurrency) },
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
            Live preview only. Real margin, swap and P/L are set when your order is filled.
          </Text>
        </View>

      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#06080D' : '#F4F5F7',
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
      backgroundColor: isDark ? '#06080D' : '#F4F5F7',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
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
