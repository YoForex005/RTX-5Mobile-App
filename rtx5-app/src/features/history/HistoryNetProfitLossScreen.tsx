import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { usePositionHistoryQuery, usePositionsQuery } from '../../query/positions';
import { useMarketData } from '../../query/websocket';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useUserPreferences } from '../../state/userPreferences';
import { PositionItem } from '../../mock/tradingData';
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

type OpenHistoryPosition = PositionItem & {
  livePnl: number;
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

function normalizeLeaderboardPosition<T extends { livePnl?: unknown; volume?: unknown; side?: unknown }>(
  position: T,
): T & { livePnl: number; volume: number; side: 'buy' | 'sell' } {
  return {
    ...position,
    livePnl: toFiniteNumber(position.livePnl),
    volume: toFiniteNumber(position.volume),
    side: String(position.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
  };
}

function buildLiveHistoryPosition(position: PositionItem, liveQuote?: { bid?: number; ask?: number }): OpenHistoryPosition {
  const fallbackPrice = toFiniteNumber(position.currentPrice);
  const liveBid = toFiniteNumber(liveQuote?.bid) || fallbackPrice;
  const liveAsk = toFiniteNumber(liveQuote?.ask) || liveBid + (position.symbol.includes('JPY') ? 0.015 : 0.00015);
  const isBuy = position.side === 'buy';
  const livePrice = isBuy ? liveBid : liveAsk;
  const contractSize = position.symbol.includes('JPY') ? 1000 : 100000;
  const priceDiff = isBuy
    ? livePrice - toFiniteNumber(position.openPrice)
    : toFiniteNumber(position.openPrice) - livePrice;

  return {
    ...position,
    livePnl: priceDiff * (toFiniteNumber(position.volume) || 0.01) * contractSize,
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
  const { data: rawPositions = [] } = usePositionsQuery(accountLogin);

  const activeSymbols = useMemo(
    () => Array.from(new Set(rawPositions.map((position) => position.symbol))),
    [rawPositions],
  );
  const quotesStore = useMarketData(activeSymbols);

  const openPositions = useMemo(
    () =>
      rawPositions.map((position) =>
        buildLiveHistoryPosition(position, quotesStore[position.symbol]),
      ),
    [quotesStore, rawPositions],
  );

  const netProfit = useMemo(
    () => openPositions.reduce((sum, position) => sum + position.livePnl, 0),
    [openPositions],
  );
  const totalVolume = useMemo(
    () => openPositions.reduce((sum, position) => sum + toFiniteNumber(position.volume), 0),
    [openPositions],
  );
  const profitable = useMemo(
    () => openPositions.filter((position) => position.livePnl > 0),
    [openPositions],
  );
  const losing = useMemo(
    () => openPositions.filter((position) => position.livePnl < 0),
    [openPositions],
  );
  const breakevenCount = useMemo(
    () => openPositions.filter((position) => position.livePnl === 0).length,
    [openPositions],
  );
  const buyCount = useMemo(
    () => openPositions.filter((position) => position.side === 'buy').length,
    [openPositions],
  );
  const sellCount = useMemo(
    () => openPositions.filter((position) => position.side === 'sell').length,
    [openPositions],
  );
  const grossProfit = useMemo(
    () => profitable.reduce((sum, position) => sum + position.livePnl, 0),
    [profitable],
  );
  const grossLoss = useMemo(
    () => losing.reduce((sum, position) => sum + position.livePnl, 0),
    [losing],
  );
  const topWinner = useMemo(
    () =>
      [...profitable]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => right.livePnl - left.livePnl)[0] ?? null,
    [profitable],
  );
  const topLoser = useMemo(
    () =>
      [...losing]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => left.livePnl - right.livePnl)[0] ?? null,
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
      <Stack.Screen options={{ title: 'Net P/L', headerTitleAlign: 'center' }} />

      <View style={styles.heroWrap}>
        <LinearGradient
          colors={isDark ? ['#101827', '#0E141F', '#0A0F18'] : ['#F8FBFF', '#FFFFFF', '#F3F7FC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.heroEyebrow, { color: T.textMuted }]}>History Positions</Text>
              <Text style={[styles.heroTitle, { color: T.text }]}>Net P/L</Text>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
              <Ionicons
                name={netProfit >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={netProfit >= 0 ? T.up : T.down}
              />
              <Text style={[styles.heroBadgeText, { color: T.textMuted }]}>Positions</Text>
            </View>
          </View>

          <Text style={[styles.heroValue, { color: netProfit >= 0 ? T.up : T.down }]}>
            {fmt.pnl(netProfit)}
          </Text>
          <Text style={[styles.heroSubtext, { color: T.textSub }]}>
            Live net result for the History tab Positions view.
          </Text>

          <View style={styles.heroChips}>
            <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
              <Text style={[styles.heroChipValue, { color: T.text }]}>{openPositions.length}</Text>
              <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>Positions</Text>
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
        <StatCard label="Buy Positions" value={String(buyCount)} hint={`${totalVolume.toFixed(2)} lots total`} color={T.text} styles={styles} T={T} />
        <StatCard label="Sell Positions" value={String(sellCount)} hint={`${breakevenCount} break-even`} color={T.text} styles={styles} T={T} />
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#0E141F' : T.glass2, borderColor: T.border }]}>
        <Text style={[styles.sectionTitle, { color: T.text }]}>Contribution</Text>
        <SnapshotRow label="Open Position Net P/L" value={fmt.pnl(netProfit)} color={netProfit >= 0 ? T.up : T.down} styles={styles} T={T} />
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
            <Text style={[styles.leaderPnl, { color: T.up }]}>{fmt.pnl(topWinner.livePnl)}</Text>
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
            <Text style={[styles.leaderPnl, { color: T.down }]}>{fmt.pnl(topLoser.livePnl)}</Text>
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
    heroWrap: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
    },
    heroCard: {
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    heroTitle: {
      marginTop: 4,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    heroBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    heroValue: {
      marginTop: 16,
      fontSize: 38,
      fontWeight: '800',
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    heroSubtext: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },
    heroChips: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    heroChip: {
      flex: 1,
      minHeight: 64,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    heroChipValue: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },
    heroChipLabel: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    card: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    snapshotRowBorder: {
      borderTopWidth: 1,
    },
    snapshotLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    snapshotValue: {
      fontSize: 16,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    statsGrid: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statCard: {
      width: '48.5%',
      minHeight: 104,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'space-between',
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    statValue: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.7,
      fontVariant: ['tabular-nums'],
    },
    statHint: {
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    leaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    leaderIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaderSymbol: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    leaderMeta: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
    },
    leaderPnl: {
      fontSize: 16,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    emptyText: {
      fontSize: 13,
      fontWeight: '500',
      paddingVertical: 10,
    },
  });
