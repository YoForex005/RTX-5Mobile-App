import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { historyDeals, historyOrders, historyPositions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';

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

const ACCOUNT_SUMMARY = {
  deposit: 100000,
  profit: 19701.53,
  swap: 0,
  commission: 0,
  balance: 119701.53,
};

export function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('Positions');
  const [sortBy, setSortBy] = useState<SortBy>('Default');
  const [sortOpen, setSortOpen] = useState(false);
  const { historyRange } = useUserPreferences();

  const baseData = useMemo<HistoryRow[]>(() => {
    if (tab === 'Orders') return historyOrders;
    if (tab === 'Deals') return historyDeals;
    return historyPositions;
  }, [tab]);

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
        <View style={styles.topBlock}>
          <View style={styles.topControlsRow}>
            <Pressable style={styles.iconButton} onPress={() => setSortOpen(true)}>
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

        <FlatList
          style={styles.list}
          data={data}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <HistoryItemRow item={item} tab={tab} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No history records</Text>}
        />

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Account Summary</Text>
            <Text style={styles.summaryCurrency}>USD</Text>
          </View>
          <SummaryRow label='Deposit' value={fmt.int(ACCOUNT_SUMMARY.deposit)} />
          <SummaryRow label='Profit' value={fmt.int(ACCOUNT_SUMMARY.profit)} tone='positive' />
          <SummaryRow label='Swap' value={fmt.int(ACCOUNT_SUMMARY.swap)} />
          <SummaryRow label='Commission' value={fmt.int(ACCOUNT_SUMMARY.commission)} />
          <SummaryRow label='Balance' value={fmt.int(ACCOUNT_SUMMARY.balance)} emphasize />
        </View>

        <ActionSheet
          visible={sortOpen}
          onClose={() => setSortOpen(false)}
          title='Sort By'
          actions={SORT_OPTIONS.map((option) => ({
            label: option === sortBy ? `${option} ✓` : option,
            onPress: () => setSortBy(option),
          }))}
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

      <Text style={styles.priceTrack}>{item.line2}</Text>

      <View style={styles.rowMeta}>
        <Text style={styles.ticketText}>#{extractTicket(item.id)}</Text>
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
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
    padding: spacing.sm,
    paddingBottom: spacing.md,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass2,
  },
  segmentButton: {
    minWidth: 82,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: G.glass3,
  },
  segmentText: {
    color: G.textMuted,
    fontSize: 12,
    fontWeight: '600',
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
    borderColor: G.border,
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
    color: G.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: G.text,
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
    borderColor: G.border,
    backgroundColor: G.glass1,
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
    backgroundColor: G.accentGlow,
    borderColor: G.accentGlow,
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
    marginTop: 4,
    color: G.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  rowMeta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketText: {
    color: G.textSub,
    fontSize: 11,
    fontWeight: '600',
  },
  timeText: {
    color: G.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  timeOnly: {
    color: G.textMuted,
    fontSize: 12,
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
    marginBottom: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
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
    color: G.textMuted,
    fontSize: 11,
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
    color: G.up,
  },
  negativeText: {
    color: G.down,
  },
  neutralText: {
    color: G.textMuted,
  },
});
