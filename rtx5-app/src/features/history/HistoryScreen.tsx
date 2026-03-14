import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { historyDeals, historyOrders, historyPositions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
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

  const accountSummary = liveAccount || {
    balance: 0,
    profit: 0,
    currency: 'USD',
  };
  const deposit = accountSummary.balance - accountSummary.profit;

  // Map API transactions to HistoryRow format, fallback to mock if empty
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
    if (hasLiveData) return liveRows; // Use live API data when available
    // Fallback to mock data
    if (tab === 'Orders') return historyOrders;
    if (tab === 'Deals') return historyDeals;
    return historyPositions;
  }, [tab, hasLiveData, liveRows]);

  const data = useMemo(() => sortHistoryRows(baseData, sortBy), [baseData, sortBy]);
  const profitRows = useMemo(
    () => data.filter((item) => typeof item.profit === 'number') as Array<HistoryRow & { profit: number }>,
    [data]
  );
  const netProfit = useMemo(
    () => profitRows.reduce((sum, item) => sum + item.profit, 0),
    [profitRows]
  );
  const wins = useMemo(
    () => profitRows.filter((item) => item.profit > 0).length,
    [profitRows]
  );
  const winRate = useMemo(() => {
    if (!profitRows.length) return '0%';
    return `${Math.round((wins / profitRows.length) * 100)}%`;
  }, [profitRows.length, wins]);
  const filledCount = useMemo(
    () => data.filter((item) => item.status === 'filled').length,
    [data]
  );

  const netTone: Tone = netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral';

  return (
    <Screen>
      <View style={styles.page}>
        {/* ── Header with ☰ ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
              <Ionicons name="menu" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>History</Text>
          </View>
        </View>
        <View style={styles.topBlock}>
          <View style={styles.topControlsRow}>
            <Pressable style={styles.iconButton} onPress={() => showActionSheet({ title: 'Sort By', actions: SORT_OPTIONS.map((option) => ({ label: option === sortBy ? `${option} ✓` : option, onPress: () => setSortBy(option) })) })}>
              <Ionicons name='swap-vertical-outline' size={17} color='#9db2d5' />
            </Pressable>

            <View style={styles.segment}>
              {TABS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.segmentButton, tab === item && styles.segmentButtonActive]}
                  onPress={() => setTab(item)}
                >
                  <Text style={[styles.segmentText, tab === item && styles.segmentTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.iconButton} onPress={() => router.push('/history/filter')}>
              <Ionicons name='time-outline' size={17} color='#9db2d5' />
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <MetricPill
              label='Range'
              value={historyRange}
              icon='calendar-outline'
              tone='neutral'
              valueOverrideStyle={styles.rangeValueText}
            />
            <MetricPill
              label={tab === 'Orders' ? 'Filled' : 'Win Rate'}
              value={tab === 'Orders' ? `${filledCount}/${data.length}` : winRate}
              icon={tab === 'Orders' ? 'checkmark-done-outline' : 'stats-chart-outline'}
              tone={tab === 'Orders' ? 'neutral' : 'positive'}
            />
            <MetricPill
              label={tab === 'Orders' ? 'Records' : 'Net P/L'}
              value={tab === 'Orders' ? String(data.length) : fmt.pnl(netProfit)}
              icon={tab === 'Orders' ? 'layers-outline' : 'cash-outline'}
              tone={tab === 'Orders' ? 'neutral' : netTone}
            />
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Account Summary</Text>
            <Text style={styles.summaryCurrency}>{accountSummary.currency}</Text>
          </View>
          <SummaryRow label='Deposit' value={fmt.int(deposit)} />
          <SummaryRow label='Profit' value={fmt.int(accountSummary.profit)} tone='positive' />
          <SummaryRow label='Swap' value={fmt.int(0)} />
          <SummaryRow label='Commission' value={fmt.int(0)} />
          <SummaryRow label='Balance' value={fmt.int(accountSummary.balance)} emphasize />
        </View>

        <FlatList
          style={styles.list}
          data={data}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <HistoryItemRow item={item} tab={tab} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No history records</Text>}
        />

      </View>
    </Screen>
  );
}

function HistoryItemRow({ item, tab }: { item: HistoryRow; tab: Tab }) {
  const { symbol, side, volume } = parseLine1(item.line1);
  const sideLower = side.toLowerCase().replace(',', '');
  const sideTone: Tone = sideLower.includes('sell') ? 'negative' : sideLower.includes('buy') ? 'positive' : 'neutral';
  const profit = typeof item.profit === 'number' ? item.profit : null;

  return (
    <View style={styles.rowCard}>
      <View style={styles.ticketWrap}>
        <Text style={styles.ticketText}>#{extractTicket(item.id)}</Text>
      </View>
      <View style={styles.rowTop}>
        <View style={styles.rowTitleWrap}>
          <Text style={styles.symbolText}>{symbol}</Text>
          {side ? (
            <View style={[styles.sidePill, sideTone === 'positive' ? styles.sidePillBuy : sideTone === 'negative' ? styles.sidePillSell : styles.sidePillNeutral]}>
              <Text style={[styles.sideText, sideTone === 'positive' ? styles.positiveText : sideTone === 'negative' ? styles.negativeText : styles.neutralText]}>
                {side}
              </Text>
            </View>
          ) : null}
          {volume ? (
            <View style={styles.volumePill}>
              <Text style={styles.volumeText}>{volume}</Text>
            </View>
          ) : null}
        </View>

        {tab === 'Orders' && item.status ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        ) : profit !== null ? (
          <Text style={[styles.profitValue, profit >= 0 ? styles.positiveText : styles.negativeText]}>
            {fmt.pnl(profit)}
          </Text>
        ) : (
          <Text style={styles.timeOnly}>{shortTime(item.time)}</Text>
        )}
      </View>

      <View style={styles.rowMeta}>
        <Text style={styles.priceTrack}>{item.line2}</Text>
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
    </View>
  );
}

function MetricPill({
  label,
  value,
  icon,
  tone,
  valueOverrideStyle,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  valueOverrideStyle?: object;
}) {
  return (
    <View style={styles.metricPill}>
      <View style={styles.metricTop}>
        <Ionicons name={icon} size={12} color='#7184a3' />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text
        style={[
          styles.metricValue,
          tone === 'positive' && styles.positiveText,
          tone === 'negative' && styles.negativeText,
          tone === 'neutral' && styles.neutralText,
          valueOverrideStyle,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  tone = 'neutral',
  emphasize = false,
}: {
  label: string;
  value: string;
  tone?: Tone;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasize && styles.summaryLabelEmphasize]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === 'positive' && styles.positiveText,
          tone === 'negative' && styles.negativeText,
          emphasize && styles.summaryValueEmphasize,
        ]}
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

function extractSymbol(item: HistoryRow) {
  return parseLine1(item.line1).symbol;
}

function extractSide(item: HistoryRow) {
  return parseLine1(item.line1).side;
}

function extractVolume(item: HistoryRow) {
  const raw = parseLine1(item.line1).volume;
  const volume = Number(raw);
  return Number.isFinite(volume) ? volume : 0;
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
    if (sortBy === 'Symbol') return extractSymbol(a).localeCompare(extractSymbol(b));
    if (sortBy === 'Ticket') return extractTicket(a.id).localeCompare(extractTicket(b.id), undefined, { numeric: true });
    if (sortBy === 'Type') return extractSide(a).localeCompare(extractSide(b));
    if (sortBy === 'Volume') return extractVolume(b) - extractVolume(a);
    if (sortBy === 'Open Time' || sortBy === 'Close Time') return b.time.localeCompare(a.time);
    if (sortBy === 'Profit') return (b.profit ?? Number.NEGATIVE_INFINITY) - (a.profit ?? Number.NEGATIVE_INFINITY);
    return 0;
  });

  return sorted;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topBlock: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass2,
    padding: spacing.sm,
    paddingBottom: spacing.md,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass2,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: G.glass3,
  },
  segmentText: {
    color: G.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: G.text,
  },
  metricsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    marginRight: -spacing.sm,
  },
  metricPill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: spacing.sm,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    marginLeft: 4,
    color: G.textSub,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: G.text,
  },
  rangeValueText: {
    color: G.text,
    fontSize: 12,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  rowCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass2,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: spacing.md,
  },
  symbolText: {
    color: G.text,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 6,
  },
  sidePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
  },
  sidePillBuy: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderColor: 'rgba(37, 99, 235, 0.15)',
  },
  sidePillSell: {
    backgroundColor: G.downGlow,
    borderColor: G.downGlow,
  },
  sidePillNeutral: {
    backgroundColor: G.glass2,
    borderColor: G.border,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  volumePill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass2,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  volumeText: {
    color: G.textSub,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: G.accentGlow,
    backgroundColor: G.accentGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    color: G.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profitValue: {
    color: G.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  priceTrack: {
    color: G.textSub,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  rowMeta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketWrap: {
    marginBottom: 4,
  },
  ticketText: {
    color: G.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeText: {
    color: G.textSub,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timeOnly: {
    color: G.textSub,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    marginTop: spacing.lg,
    color: G.textMuted,
    textAlign: 'center',
    fontSize: 13,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass2,
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: G.border,
  },
  summaryTitle: {
    color: G.text,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryCurrency: {
    color: '#FFFFFF',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: G.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: G.textSub,
    fontSize: 14,
  },
  summaryLabelEmphasize: {
    color: G.text,
    fontWeight: '700',
  },
  summaryValue: {
    color: G.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  summaryValueEmphasize: {
    fontSize: 16,
    fontWeight: '700',
  },
  positiveText: {
    color: G.trading.profit,
  },
  negativeText: {
    color: G.down,
  },
  neutralText: {
    color: G.textMuted,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: G.glass1, borderWidth: 1, borderColor: G.borderHi, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: G.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});
