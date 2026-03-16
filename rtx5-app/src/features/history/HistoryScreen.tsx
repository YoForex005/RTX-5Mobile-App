import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { historyDeals, historyOrders, historyPositions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { useAccountSummary } from '../../query/account';
import { useTransactions } from '../../query/transactions';

type Tab = 'Positions' | 'Orders' | 'Deals';
type SortBy = 'Default' | 'Symbol' | 'Ticket' | 'Type' | 'Volume' | 'Open Time' | 'Close Time' | 'Profit';
type HistoryRow = {
  id: string;
  line1: string;
  line2: string;
  time: string;
  status?: string;
  profit?: number | null;
};

type Tone = 'positive' | 'negative' | 'neutral';

const TABS: Tab[] = ['Positions', 'Orders', 'Deals'];
const SORT_OPTIONS: SortBy[] = ['Default', 'Symbol', 'Ticket', 'Type', 'Volume', 'Open Time', 'Close Time', 'Profit'];

export function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('Positions');
  const [sortBy, setSortBy] = useState<SortBy>('Default');
  const { historyRange, accountDetails } = useUserPreferences();
  const { data: liveAccount } = useAccountSummary(accountDetails?.id);
  const { data: txnData } = useTransactions();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const accountSummary = liveAccount || { balance: 0, profit: 0, currency: 'USD' };
  const deposit = accountSummary.balance - accountSummary.profit;

  const liveRows = useMemo<HistoryRow[]>(() => {
    if (!txnData?.transactions?.length) return [];
    return txnData.transactions.map((t) => ({
      id: t.id || String(Math.random()),
      line1: `${t.symbol ?? t.type} ${t.side ?? ''} ${(t.volume || 0).toFixed(2)}`.trim(),
      line2: t.open_price && t.close_price
        ? `${(t.open_price || 0).toFixed(5)} → ${(t.close_price || 0).toFixed(5)}`
        : t.description || '',
      time: t.created_at ? new Date(t.created_at).toLocaleString() : '',
      status: t.status,
      profit: t.profit ?? null,
    }));
  }, [txnData]);

  const hasLiveData = liveRows.length > 0;

  const baseData = useMemo<HistoryRow[]>(() => {
    if (hasLiveData) return liveRows;
    if (tab === 'Orders') return historyOrders;
    if (tab === 'Deals') return historyDeals;
    return historyPositions;
  }, [tab, hasLiveData, liveRows]);

  const data = useMemo(() => sortHistoryRows(baseData, sortBy), [baseData, sortBy]);
  const profitRows = useMemo(
    () => data.filter((item) => typeof item.profit === 'number') as Array<HistoryRow & { profit: number }>,
    [data]
  );
  const netProfit = useMemo(() => profitRows.reduce((sum, item) => sum + item.profit, 0), [profitRows]);
  const wins = useMemo(() => profitRows.filter((item) => item.profit > 0).length, [profitRows]);
  const winRate = useMemo(() => {
    if (!profitRows.length) return '0%';
    return `${Math.round((wins / profitRows.length) * 100)}%`;
  }, [profitRows.length, wins]);
  const filledCount = useMemo(() => data.filter((item) => item.status === 'filled').length, [data]);
  const netTone: Tone = netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral';

  return (
    <Screen>
      <FlatList
        style={styles.list}
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            {/* ── Header ── */}
            <View style={styles.headerRow}>
              <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
                <Ionicons name="menu" size={22} color={T.text} />
              </Pressable>
            </View>

            {/* ── Account Summary ── */}
            <Text style={styles.accountSummaryHeading}>Account Summary</Text>
            <View style={styles.summaryBlock}>
              <View style={styles.summaryTop}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(37,99,235,0.08)' : 'rgba(37,99,235,0.04)' }]} />
                <Text style={[styles.summaryLabel, { color: T.text }]}>Balance</Text>
                <View style={styles.floatingRow}>
                  <Text style={[styles.floating, { color: T.text }]}>
                    {fmt.int(accountSummary.balance)}
                  </Text>
                  <Text style={[styles.balanceQuickCurrency, { color: T.textSub }]}> {accountSummary.currency}</Text>
                </View>
              </View>
              <View style={[styles.metricsCard, { borderTopColor: T.borderMedium }]}>
                <MetricRow label='Account ID:' value={String(accountDetails?.id ?? '—')} compact withDivider white />
                <MetricRow label='Deposit:' value={fmt.int(deposit)} compact withDivider white />
                <MetricRow label='Closed P/L:' value={fmt.pnl(accountSummary.profit)} compact withDivider white />
                <MetricRow label='Swap:' value={fmt.int(0)} compact withDivider white />
                <MetricRow label='Commission:' value={fmt.int(0)} compact withDivider white />
                <MetricRow label='Range:' value={historyRange} compact white />
              </View>
            </View>

            {/* ── Controls Card ── */}
            <View style={styles.topBlock}>
              <View style={styles.topControlsRow}>
                <Pressable style={styles.iconButton} onPress={() => showActionSheet({ title: 'Sort By', actions: SORT_OPTIONS.map((option) => ({ label: option === sortBy ? `${option} ✓` : option, onPress: () => setSortBy(option) })) })}>
                  <Ionicons name='swap-vertical-outline' size={17} color={T.textSub} />
                </Pressable>

                <View style={styles.segment}>
                  {TABS.map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.segmentButton, tab === item && styles.segmentButtonActive]}
                      onPress={() => setTab(item)}
                    >
                      <Text style={[styles.segmentText, { color: tab === item ? T.text : T.textMuted }]}>{item}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={styles.iconButton} onPress={() => router.push('/history/filter')}>
                  <Ionicons name='time-outline' size={17} color={T.textSub} />
                </Pressable>
              </View>

              <View style={styles.metricsRow}>
                <MetricPill label='Range' value={historyRange} icon='calendar-outline' tone='neutral' T={T} isDark={isDark} />
                <MetricPill
                  label={tab === 'Orders' ? 'Filled' : 'Win Rate'}
                  value={tab === 'Orders' ? `${filledCount} / ${data.length}` : winRate}
                  icon={tab === 'Orders' ? 'checkmark-done-outline' : 'stats-chart-outline'}
                  tone={tab === 'Orders' ? (filledCount > 0 ? 'positive' : 'neutral') : 'positive'}
                  T={T}
                  isDark={isDark}
                />
                <MetricPill label='Trades' value={String(data.length)} icon='layers-outline' tone='neutral' T={T} isDark={isDark} />
                <MetricPill label='Net P/L' value={fmt.pnl(netProfit)} icon='wallet-outline' tone={netTone} T={T} isDark={isDark} />
              </View>
            </View>

            {/* ── Section Header ── */}
            <View style={[styles.sectionHeader, { borderBottomColor: T.borderMedium }]}>
              <View>
                <Text style={[styles.sectionTitle, { color: T.text }]}>Trade Records</Text>
                <Text style={[styles.sectionMeta, { color: T.textMuted }]}>{data.length} records</Text>
              </View>
            </View>
          </>
        )}
        renderItem={({ item }) => <HistoryItemRow item={item} tab={tab} T={T} isDark={isDark} />}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: T.textMuted }]}>No history records</Text>}
      />
    </Screen>
  );
}

function HistoryItemRow({ item, tab, T, isDark }: { item: HistoryRow; tab: Tab; T: ThemeColors; isDark: boolean }) {
  const { symbol, side, volume } = parseLine1(item.line1);
  const sideLower = side.toLowerCase().replace(',', '');
  const isBuy = sideLower.includes('buy');
  const isSell = sideLower.includes('sell');
  const profit = typeof item.profit === 'number' ? item.profit : null;
  const cardBg = isDark ? T.glass2 : '#ffffff';

  return (
    <View style={[
      rStyles.rowCard,
      {
        backgroundColor: cardBg,
        borderColor: T.borderMedium,
        borderLeftColor: isBuy ? T.trading.buy.primary : isSell ? T.trading.sell.primary : T.borderMedium,
      },
      !isDark && rStyles.cardShadowLight,
    ]}>
      <Text style={[rStyles.cornerId, { color: T.textMuted }]}>#{extractTicket(item.id)}</Text>
      <View style={rStyles.rowBody}>
        <View style={rStyles.rowTop}>
          <View style={rStyles.symbolLine}>
            <Text style={[rStyles.symbolText, { color: T.text }]}>{symbol}</Text>
            {side ? (
              <View style={[
                rStyles.sideBadge,
                isBuy ? { backgroundColor: 'rgba(37,99,235,0.15)' }
                  : isSell ? { backgroundColor: 'rgba(220,38,38,0.12)' }
                  : { backgroundColor: T.glass2 },
              ]}>
                <Text style={[
                  rStyles.sideText,
                  isBuy ? { color: T.trading.buy.hover }
                    : isSell ? { color: T.trading.sell.hover }
                    : { color: T.textMuted },
                ]}>
                  {side}
                </Text>
              </View>
            ) : null}
            {volume ? <Text style={[rStyles.volumeText, { color: T.textMuted }]}>{volume}</Text> : null}
          </View>
          <View style={rStyles.rightCol}>
            {profit !== null ? (
              <Text style={[rStyles.pnlText, { color: profit >= 0 ? T.trading.profit : T.down }]}>
                {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
              </Text>
            ) : (
              <Text style={[rStyles.timeOnly, { color: T.textSub }]}>{shortTime(item.time)}</Text>
            )}
          </View>
        </View>
        <View style={rStyles.priceRow}>
          <Text style={[rStyles.priceTrack, { color: T.textSub }]}>{item.line2}</Text>
          <Text style={[rStyles.timeText, { color: T.textMuted }]}>{item.time}</Text>
        </View>
      </View>
    </View>
  );
}

function MetricPill({
  label, value, icon, tone, T, isDark,
}: {
  label: string; value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone; T: ThemeColors; isDark: boolean;
}) {
  const cardBg = isDark ? T.glass1 : '#ffffff';
  return (
    <View style={[mpS.metricPill, { borderColor: T.borderMedium, backgroundColor: cardBg }]}>
      <View style={mpS.metricTop}>
        <Ionicons name={icon} size={12} color={T.textSub} />
        <Text style={[mpS.metricLabel, { color: T.textSub }]}>{label}</Text>
      </View>
      <Text
        style={[
          mpS.metricValue,
          { color: T.text },
          tone === 'positive' && { color: T.trading.profit },
          tone === 'negative' && { color: T.down },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function parseLine1(line1: string) {
  const parts = line1.trim().split(/\s+/);
  const symbol = parts[0] ?? line1;
  const sideRaw = parts[1] ?? '';
  const volumeRaw = parts[2] ?? '';
  const side = sideRaw.trim();
  const hasVolume = Number.isFinite(Number(volumeRaw));
  const volume = hasVolume ? Number(volumeRaw).toFixed(2) : '';
  return { symbol, side, volume };
}

function extractTicket(id: string) {
  const digits = id.replace(/\D/g, '');
  return digits || id;
}

function shortTime(input: string) {
  const parts = input.split(' ');
  return parts[1] ?? input;
}

function sortHistoryRows(rows: HistoryRow[], sortBy: SortBy) {
  const sorted = [...rows];
  if (sortBy === 'Default') return sorted;
  sorted.sort((a, b) => {
    if (sortBy === 'Symbol') return parseLine1(a.line1).symbol.localeCompare(parseLine1(b.line1).symbol);
    if (sortBy === 'Ticket') return extractTicket(a.id).localeCompare(extractTicket(b.id), undefined, { numeric: true });
    if (sortBy === 'Type') return parseLine1(a.line1).side.localeCompare(parseLine1(b.line1).side);
    if (sortBy === 'Volume') {
      const av = Number(parseLine1(a.line1).volume) || 0;
      const bv = Number(parseLine1(b.line1).volume) || 0;
      return bv - av;
    }
    if (sortBy === 'Open Time' || sortBy === 'Close Time') return b.time.localeCompare(a.time);
    if (sortBy === 'Profit') return (b.profit ?? Number.NEGATIVE_INFINITY) - (a.profit ?? Number.NEGATIVE_INFINITY);
    return 0;
  });
  return sorted;
}

/* ─── Static layout-only stylesheets ──────────────────────────────────────── */

const rStyles = StyleSheet.create({
  rowCard: {
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    paddingTop: 18, paddingBottom: 10, paddingHorizontal: spacing.md,
    borderRadius: 7, borderWidth: 1, borderLeftWidth: 2,
  },
  cardShadowLight: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cornerId: { position: 'absolute', top: 4, left: 8, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  rowBody: { width: '100%' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbolLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  symbolText: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sideBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  sideText: { fontSize: 11, fontWeight: '800', textTransform: 'lowercase', letterSpacing: 0.3 },
  volumeText: { fontSize: 13, fontWeight: '700' },
  rightCol: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  pnlText: { minWidth: 88, textAlign: 'right', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  priceRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceTrack: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeText: { fontSize: 11, fontWeight: '500', textAlign: 'right', fontVariant: ['tabular-nums'] },
  timeOnly: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
});

const mpS = StyleSheet.create({
  metricPill: { flex: 1, minHeight: 52, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, marginRight: spacing.sm },
  metricTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  metricLabel: { marginLeft: 4, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? T.glass2 : '#ffffff';
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: spacing.xl + spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    menuBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.borderMedium },
    accountSummaryHeading: { color: T.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginTop: 4, marginHorizontal: spacing.md, marginBottom: 8 },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 18,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.borderMedium,
      shadowColor: T.trading.buy.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.05 : 0.1, shadowRadius: 16, elevation: 4, overflow: 'hidden',
    },
    summaryTop: { paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    floating: { fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 34, marginTop: 4, fontVariant: ['tabular-nums'] },
    balanceQuickCurrency: { fontSize: 28, fontWeight: '800' },
    metricsCard: { borderTopWidth: 1, backgroundColor: 'transparent', overflow: 'hidden' },
    topBlock: { marginTop: spacing.lg, marginHorizontal: spacing.md, borderRadius: 18, borderWidth: 1, borderColor: T.borderMedium, backgroundColor: cardBg, padding: 6, paddingBottom: 8 },
    topControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: T.border, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    segment: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, backgroundColor: cardBg },
    segmentButton: { paddingVertical: 5, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    segmentButtonActive: { backgroundColor: T.glass3 },
    segmentText: { fontSize: 13, fontWeight: '700' },
    metricsRow: { marginTop: 14, flexDirection: 'row', marginRight: -6 },
    sectionHeader: { marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
    sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    sectionMeta: { marginTop: 2, fontSize: 12, fontWeight: '500' },
    emptyText: { marginTop: spacing.lg, textAlign: 'center', fontSize: 13 },
  });
}
