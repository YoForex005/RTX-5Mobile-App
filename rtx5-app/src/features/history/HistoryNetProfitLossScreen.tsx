import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { usePositionHistoryQuery } from '../../query/positions';
import { ClosedPosition } from '../../api/positions';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { ThemeColors } from '../../theme/glass';
import { useTheme } from '../../theme/useTheme';
import { fmt } from '../../utils/format';

type SnapshotRowProps = {
  label: string;
  value: string;
  color?: string;
  border?: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
};

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  color: string;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
};

type ClosedHistoryPosition = ClosedPosition & {
  netPnl: number;
  volume: number;
  side: 'buy' | 'sell';
};

function SnapshotRow({ label, value, color, border = false, styles, T }: SnapshotRowProps) {
  return (
    <View style={[styles.snapshotRow, border && styles.snapshotRowBorder, border && { borderTopColor: T.borderSubtle }]}>
      <Text style={[styles.snapshotLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.snapshotValue, { color: color ?? T.text }]}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value, hint, color, styles, T }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderColor: T.border, backgroundColor: T.glass1 }]}>
      <Text style={[styles.statLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statHint, { color: T.textDimmed }]}>{hint}</Text>
    </View>
  );
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeLeaderboardPosition<T extends { netPnl?: unknown; volume?: unknown; side?: unknown }>(
  position: T,
): T & { netPnl: number; volume: number; side: 'buy' | 'sell' } {
  return {
    ...position,
    netPnl: toFiniteNumber(position.netPnl),
    volume: toFiniteNumber(position.volume),
    side: String(position.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
  };
}

function normalizeClosedHistoryPosition(position: ClosedPosition): ClosedHistoryPosition {
  return {
    ...position,
    netPnl:
      toFiniteNumber(position.profit) +
      toFiniteNumber(position.swap) +
      toFiniteNumber(position.commission),
    volume: toFiniteNumber(position.volume),
    side: String(position.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
  };
}

export function HistoryNetProfitLossScreen() {
  const isDark = useUserPreferences((state) => state.themeMode) === 'dark';
  const historyRange = useUserPreferences((state) => state.historyRange);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const accountLogin = resolveTradingLogin();
  const balance = useLiveAccountState((state) => state.balance) || 0;

  const { data: rawPositionHistory = [] } = usePositionHistoryQuery(accountLogin);
  const closedPositions = useMemo(
    () => rawPositionHistory.map(normalizeClosedHistoryPosition),
    [rawPositionHistory],
  );

  const netProfit = useMemo(
    () => closedPositions.reduce((sum, position) => sum + position.netPnl, 0),
    [closedPositions],
  );
  const totalVolume = useMemo(
    () => closedPositions.reduce((sum, position) => sum + position.volume, 0),
    [closedPositions],
  );
  const profitable = useMemo(
    () => closedPositions.filter((position) => position.netPnl > 0),
    [closedPositions],
  );
  const losing = useMemo(
    () => closedPositions.filter((position) => position.netPnl < 0),
    [closedPositions],
  );
  const breakevenCount = useMemo(
    () => closedPositions.filter((position) => position.netPnl === 0).length,
    [closedPositions],
  );
  const buyCount = useMemo(
    () => closedPositions.filter((position) => position.side === 'buy').length,
    [closedPositions],
  );
  const sellCount = useMemo(
    () => closedPositions.filter((position) => position.side === 'sell').length,
    [closedPositions],
  );
  const grossProfit = useMemo(
    () => profitable.reduce((sum, position) => sum + position.netPnl, 0),
    [profitable],
  );
  const grossLoss = useMemo(
    () => losing.reduce((sum, position) => sum + position.netPnl, 0),
    [losing],
  );
  const topWinner = useMemo(
    () =>
      [...profitable]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => right.netPnl - left.netPnl)[0] ?? null,
    [profitable],
  );
  const topLoser = useMemo(
    () =>
      [...losing]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => left.netPnl - right.netPnl)[0] ?? null,
    [losing],
  );

  const closedSwap = useMemo(
    () => rawPositionHistory.reduce((sum, position) => sum + toFiniteNumber(position.swap), 0),
    [rawPositionHistory],
  );
  const closedCommission = useMemo(
    () => rawPositionHistory.reduce((sum, position) => sum + toFiniteNumber(position.commission), 0),
    [rawPositionHistory],
  );
  const rawClosedProfit = useMemo(
    () => rawPositionHistory.reduce((sum, position) => sum + toFiniteNumber(position.profit), 0),
    [rawPositionHistory],
  );
  const totalClosedPnl = rawClosedProfit + closedSwap + closedCommission;
  const deposit = balance - totalClosedPnl;

  return (
    <Screen scroll style={isDark ? { backgroundColor: '#06080D' } : undefined}>
      <Stack.Screen
        options={{
          title: 'Net P/L',
          headerTitleAlign: 'center',
          headerRight: () => <View style={styles.navHeaderSpacer} />,
          headerTitle: () => (
            <View style={styles.navTitleWrap} pointerEvents="none">
              <Text
                style={[styles.navTitle, { color: T.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Net P/L
              </Text>
            </View>
          ),
        }}
      />

      <View style={styles.heroWrap}>
        <LinearGradient
          colors={isDark ? ['#101827', '#0E141F', '#0A0F18'] : ['#F8FBFF', '#FFFFFF', '#F3F7FC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroHeader}>
              <Text style={[styles.heroEyebrow, { color: T.textMuted }]}>Closed Trade History</Text>
              <Text
                style={[styles.heroTitle, { color: T.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.9}
              >
                Net P/L
              </Text>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
              <Ionicons
                name={netProfit >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={netProfit >= 0 ? T.up : T.down}
              />
              <Text style={[styles.heroBadgeText, { color: T.textMuted }]}>Closed</Text>
            </View>
          </View>

          <Text style={[styles.heroValue, { color: netProfit >= 0 ? T.up : T.down }]}>
            {fmt.pnl(netProfit)}
          </Text>
          <Text style={[styles.heroSubtext, { color: T.textSub }]}>
            Net closed result for the selected History range.
          </Text>

          <View style={styles.heroChips}>
            <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
              <Text style={[styles.heroChipValue, { color: T.text }]}>{closedPositions.length}</Text>
              <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>Trades</Text>
            </View>
            <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
              <Text style={[styles.heroChipValue, { color: T.text }]}>{totalVolume.toFixed(2)}</Text>
              <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>Lots</Text>
            </View>
            <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
              <Text style={[styles.heroChipValue, { color: T.text }]} numberOfLines={1}>{historyRange}</Text>
              <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>Range</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#0E141F' : T.glass2, borderColor: T.border }]}>
        <Text style={[styles.sectionTitle, { color: T.text }]}>History Snapshot</Text>
        <SnapshotRow label="Balance" value={fmt.decimal(balance)} styles={styles} T={T} />
        <SnapshotRow label="Estimated Deposit" value={fmt.decimal(deposit)} border styles={styles} T={T} />
        <SnapshotRow label="Closed P/L" value={fmt.pnl(totalClosedPnl)} border color={totalClosedPnl >= 0 ? T.up : T.down} styles={styles} T={T} />
        <SnapshotRow label="Swap" value={fmt.pnl(closedSwap)} border color={closedSwap >= 0 ? T.up : T.down} styles={styles} T={T} />
        <SnapshotRow label="Commission" value={fmt.pnl(closedCommission)} border color={closedCommission <= 0 ? T.down : T.up} styles={styles} T={T} />
        <SnapshotRow label="Range" value={historyRange} border styles={styles} T={T} />
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Profitable" value={String(profitable.length)} hint={fmt.pnl(grossProfit)} color={T.up} styles={styles} T={T} />
        <StatCard label="Losing" value={String(losing.length)} hint={fmt.pnl(grossLoss)} color={T.down} styles={styles} T={T} />
        <StatCard label="Buy Trades" value={String(buyCount)} hint={`${totalVolume.toFixed(2)} lots total`} color={T.text} styles={styles} T={T} />
        <StatCard label="Sell Trades" value={String(sellCount)} hint={`${breakevenCount} break-even`} color={T.text} styles={styles} T={T} />
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#0E141F' : T.glass2, borderColor: T.border }]}>
        <Text style={[styles.sectionTitle, { color: T.text }]}>Contribution</Text>
        <SnapshotRow label="Net Closed P/L" value={fmt.pnl(netProfit)} color={netProfit >= 0 ? T.up : T.down} styles={styles} T={T} />
        <SnapshotRow label="Gross Winners" value={fmt.pnl(grossProfit)} border color={grossProfit >= 0 ? T.up : T.down} styles={styles} T={T} />
        <SnapshotRow label="Gross Losers" value={fmt.pnl(grossLoss)} border color={grossLoss >= 0 ? T.up : T.down} styles={styles} T={T} />
        <SnapshotRow label="Closed History P/L" value={fmt.pnl(totalClosedPnl)} border color={totalClosedPnl >= 0 ? T.up : T.down} styles={styles} T={T} />
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#0E141F' : T.glass2, borderColor: T.border }]}>
        <Text style={[styles.sectionTitle, { color: T.text }]}>Top Movers</Text>
        {topWinner ? (
          <View style={[styles.leaderRow, { borderBottomColor: T.borderSubtle }]}>
            <View style={styles.leaderLeft}>
              <View style={[styles.leaderIcon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                <Ionicons name="arrow-up" size={14} color={T.up} />
              </View>
              <View>
                <Text style={[styles.leaderSymbol, { color: T.text }]}>{fmt.symbol(topWinner.symbol)}</Text>
                <Text style={[styles.leaderMeta, { color: T.textMuted }]}>
                  {topWinner.side.toUpperCase()} | {topWinner.volume.toFixed(2)} lots
                </Text>
              </View>
            </View>
            <Text style={[styles.leaderPnl, { color: T.up }]}>{fmt.pnl(topWinner.netPnl)}</Text>
          </View>
        ) : null}
        {topLoser ? (
          <View style={styles.leaderRow}>
            <View style={styles.leaderLeft}>
              <View style={[styles.leaderIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                <Ionicons name="arrow-down" size={14} color={T.down} />
              </View>
              <View>
                <Text style={[styles.leaderSymbol, { color: T.text }]}>{fmt.symbol(topLoser.symbol)}</Text>
                <Text style={[styles.leaderMeta, { color: T.textMuted }]}>
                  {topLoser.side.toUpperCase()} | {topLoser.volume.toFixed(2)} lots
                </Text>
              </View>
            </View>
            <Text style={[styles.leaderPnl, { color: T.down }]}>{fmt.pnl(topLoser.netPnl)}</Text>
          </View>
        ) : null}
        {!topWinner && !topLoser ? (
          <Text style={[styles.emptyText, { color: T.textMuted }]}>No position contributors available yet.</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    navTitleWrap: {
      width: 160,
      maxWidth: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    navTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    navHeaderSpacer: {
      width: 46,
      height: 40,
    },
    heroWrap: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
    },
    heroCard: {
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroHeader: {
      flex: 1,
      paddingRight: 12,
    },
    heroEyebrow: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    heroTitle: {
      marginTop: 2,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    heroBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    heroValue: {
      marginTop: 12,
      fontSize: 36,
      lineHeight: 40,
      fontWeight: '800',
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    heroSubtext: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    heroChips: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 12,
    },
    heroChip: {
      flex: 1,
      minHeight: 56,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 8,
      justifyContent: 'center',
    },
    heroChipValue: {
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },
    heroChipLabel: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    card: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    snapshotRowBorder: {
      borderTopWidth: 1,
    },
    snapshotLabel: {
      flex: 1,
      paddingRight: 12,
      fontSize: 13,
      fontWeight: '600',
    },
    snapshotValue: {
      flexShrink: 0,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    statsGrid: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    statCard: {
      width: '49%',
      minHeight: 88,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 9,
      justifyContent: 'space-between',
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.7,
      fontVariant: ['tabular-nums'],
    },
    statHint: {
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 15,
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    leaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    leaderIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaderSymbol: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    leaderMeta: {
      marginTop: 1,
      fontSize: 11,
      fontWeight: '500',
    },
    leaderPnl: {
      flexShrink: 0,
      paddingLeft: 8,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    emptyText: {
      fontSize: 12,
      fontWeight: '500',
      paddingVertical: 6,
    },
  });
