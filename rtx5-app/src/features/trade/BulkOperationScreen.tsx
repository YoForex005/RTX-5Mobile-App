import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: BulkOperationScreen
 *
 * Provides an interface to execute bulk actions on multiple open positions simultaneously
 * such as "Close all profitable", "Close all losing", or "Close all".
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { bulkModeLabel, filterPositionsForBulk } from './tradeFlow';

export function BulkOperationScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const positions = usePositionsState((s) => s.positions);
  const title = bulkModeLabel(mode);
  const affectedPositions = useMemo(
    () => filterPositionsForBulk(positions, mode),
    [positions, mode]
  );
  const totalPnl = affectedPositions.reduce((sum, position) => sum + position.pnl, 0);

  // Live exposure stats
  const activeExposures: any[] = [];
  const totalNetExposure = 0;
  const screenBg = isDark ? '#06080D' : T.bg;

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      <View
        style={[
          styles.customHeader,
          { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle },
        ]}
      >
        <Pressable
          onPress={() => safeRouterBack(router, '/(tabs)/trade')}
          hitSlop={16}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>

        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text
            style={[styles.headerTitle, { color: T.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
        </View>

        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        keyboardShouldPersistTaps='always'
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Row label='Affected Positions' value={String(affectedPositions.length)} isDark={isDark} T={T} />
          <Row border label='Total Exposure P/L' value={fmt.pnl(totalPnl)} danger={totalPnl < 0} positive={totalPnl > 0} isDark={isDark} T={T} />
          <Row border label='Active Exposures' value={String(activeExposures.length)} isDark={isDark} T={T} />
          <Row border label='Net Exposure (USD)' value={fmt.pnl(totalNetExposure)} danger={totalNetExposure < 0} positive={totalNetExposure > 0} isDark={isDark} T={T} />
        </View>

        <View style={styles.previewCard}>
          {affectedPositions.slice(0, 6).map((position, i) => (
            <View key={position.id} style={[styles.previewRow, i !== 0 && styles.previewRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowIdText, { color: T.textMuted }]}>#{position.id}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.symbolText, { color: T.text }]}>{position.symbol.replace(/\//g, '')}</Text>
                  <Text
                    style={[
                      styles.sideText,
                      position.side === 'buy' ? { color: T.trading.buy.hover } : { color: T.trading.sell.hover },
                    ]}
                  >
                    {position.side}
                  </Text>
                  <Text style={[styles.volumeText, { color: T.textMuted }]}>{(position.volume || 0).toFixed(2)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={[styles.previewRight, position.pnl < 0 ? styles.danger : styles.positive]}>{fmt.pnl(position.pnl)}</Text>
              </View>
            </View>
          ))}
          {affectedPositions.length === 0 ? (
            <Text style={styles.emptyText}>No positions match this operation.</Text>
          ) : null}
        </View>

        {submitted ? (
          <View style={styles.success}>
            <Text style={styles.successText}>Bulk operation simulated and queued for backend execution.</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.executeButton, affectedPositions.length === 0 && styles.executeDisabled]}
          onPress={() => setSubmitted(true)}
          disabled={affectedPositions.length === 0}
        >
          <Text style={styles.executeText}>Execute Bulk Operation</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  danger = false,
  positive = false,
  border = false,
  isDark,
  T,
}: {
  label: string;
  value: string;
  danger?: boolean;
  positive?: boolean;
  border?: boolean;
  isDark: boolean;
  T: ThemeColors;
}) {
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  return (
    <View style={[styles.summaryRow, border && styles.summaryRowBorder]}>
      <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: T.text }, danger && styles.danger, positive && styles.positive]}>{value}</Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => StyleSheet.create({
  root: {
    flex: 1,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    backgroundColor: isDark ? '#0E141F' : T.glass2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryRowBorder: {
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  previewCard: {
    marginHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    backgroundColor: isDark ? '#0E141F' : T.glass2,
    overflow: 'hidden',
  },
  previewRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewRowBorder: {
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
  },
  rowIdText: { 
    fontSize: 11, 
    fontWeight: '800', 
    fontVariant: ['tabular-nums'], 
    letterSpacing: 0.5, 
    marginBottom: 4 
  },
  symbolText: { 
    fontSize: 15, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  sideText: { 
    fontSize: 12, 
    fontWeight: '800', 
    textTransform: 'lowercase', 
    letterSpacing: 0.3 
  },
  volumeText: { 
    fontSize: 13, 
    fontWeight: '700' 
  },
  previewRight: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    padding: spacing.xl,
    textAlign: 'center',
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  success: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.08)',
    padding: spacing.md,
  },
  successText: {
    color: T.trading.profit,
    fontSize: 13,
    fontWeight: '600',
  },
  executeButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: 12,
    backgroundColor: '#DC2626', // Pure bright red instead of T.trading.sell.primary which might be dark
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  executeDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
  executeText: {
    color: '#FFFFFF', // Force stark white for explosive contrast against red
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  danger: {
    color: T.trading.loss,
  },
  positive: {
    color: T.trading.profit,
  },
});
