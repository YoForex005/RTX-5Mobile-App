/**
 * Historical trade record timeline (aka 'History' tab).
 * 
 * Displays closed positions, executed orders, and balance operations spanning 
 * user-defined time periods (e.g. Last Month, Last 6 Months).
 * Calculates and visualizes realized PL, Swaps, Commission, and Net Balance evolution.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { AppHeader } from '../../components/AppHeader';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { usePositionHistoryQuery, usePositionsQuery } from '../../query/positions';
import { useAccountDealsQuery } from '../../query/deals';
import { useOrdersByLoginQuery } from '../../query/orders';
import { useMarketData } from '../../query/websocket';
import { useLiveAccountState } from '../../state/liveAccountState';
import { Deal } from '../../api/deals';
import { LoginOrder } from '../../api/orders';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { formatBrokerTime } from '../../utils/brokerTime';
import { useTranslation } from '../../i18n/useTranslation';

type Tab = 'Positions' | 'Orders' | 'Deals';
type SortBy = 'Default' | 'Symbol' | 'Ticket' | 'Type' | 'Volume' | 'Open Time' | 'Close Time' | 'Profit';
type HistoryRow = {
  id: string;
  line1: string;
  line2: string;
  time: string;
  status?: string;
  profit?: number | null;
  /** Optional note shown beneath the price row (e.g. deal comment from EA or manual entry) */
  note?: string;
};

type Tone = 'positive' | 'negative' | 'neutral';

const TABS: Tab[] = ['Positions', 'Orders', 'Deals'];
const SORT_OPTIONS: SortBy[] = ['Default', 'Symbol', 'Ticket', 'Type', 'Volume', 'Open Time', 'Close Time', 'Profit'];

function safeTimeStr(timestamp?: number): string {
  if (!timestamp || isNaN(timestamp)) return '--';
  try {
    return formatBrokerTime(timestamp);
  } catch {
    return '--';
  }
}

/**
 * Maps a LoginOrder DTO from GET /api/v2/orders/{login}
 * into the HistoryRow format used by the list renderer.
 *
 * Real response uses `price_open` (not `price`), `time_setup` (order placed),
 * and `time_done` (order completed). For closed orders, `time_done` is shown
 * as the primary timestamp since it represents when the position was closed.
 *
 * Price precision: 5 dp for non-JPY forex, 3 dp for JPY pairs.
 * Status forwarded so the row badge can colour-code filled vs closed/canceled.
 * Comment forwarded as `note` — shows EA name or manual annotation.
 */
function mapOrderToRow(o: LoginOrder): HistoryRow {
  const isJpy = o.symbol?.includes('JPY');
  const priceDecimals = isJpy ? 3 : 5;

  // Closed orders: show time_done (when position closed) as primary time.
  // Filled/open orders: show time_setup (when order was placed).
  const isClosed = o.status === 'closed' || o.status === 'canceled';
  const displayTime = isClosed ? o.time_done : o.time_setup;

  return {
    id: `ho${o.ticket}`,
    line1: `${o.symbol ?? ''} ${o.side ?? ''} ${(o.volume ?? 0).toFixed(2)}`,
    line2: `${o.type ?? 'market'} at ${(o.price_open ?? 0).toFixed(priceDecimals)}`,
    time: safeTimeStr(displayTime),
    status: o.status,
    profit: null,
    note: o.comment?.trim() || undefined,
  };
}

/**
 * Maps a Deal DTO from GET /api/v2/deals/{login}
 * into the HistoryRow format used by the list renderer.
 *
 * Price precision: forex pairs need 5 decimal places (3 for JPY pairs).
 * Fee: included in the net profit — `fee` is a broker cost separate from commission.
 * Comment: forwarded as a `note` so the EA or manual annotation is visible.
 */
function mapDealToRow(d: Deal): HistoryRow {
  const direction = d.action === 'deal_buy' ? 'buy' : 'sell';
  const entry = d.entry === 'entry_in' ? 'in' : 'out';
  const timeStr = safeTimeStr(d.time);

  // Use symbol-aware decimal places: JPY pairs → 3 dp, all others → 5 dp
  const isJpy = d.symbol?.includes('JPY');
  const priceDecimals = isJpy ? 3 : 5;

  // Net profit includes swap, commission, and fee (all are real P&L costs).
  // entry_in deals (opening a position) typically have 0 profit but non-zero
  // commission/fee — we show those as a cost by including them. entry_out
  // deals close the position and realise the full P&L including all costs.
  const netCosts = (d.swap || 0) + (d.commission || 0) + (d.fee || 0);
  const netProfit = d.entry === 'entry_out' ? d.profit + netCosts : null;

  return {
    id: `hd${d.ticket}`,
    line1: `${d.symbol} ${direction},${entry}`,
    line2: `${(d.volume ?? 0).toFixed(2)} at ${(d.price ?? 0).toFixed(priceDecimals)}`,
    time: timeStr,
    profit: netProfit,
    // Only forward non-empty comments — EA names, manual notes, or reason codes
    note: d.comment?.trim() || undefined,
  };
}

export function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('Positions');
  const [sortBy, setSortBy] = useState<SortBy>('Default');
  const { historyRange, accountDetails } = useUserPreferences();
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  // ── Live API data via TanStack Query ─────────────────────────────────
  // GET /api/v2/positions/{login}/history — closed position history
  // GET /api/v2/account/deals             — deal history (JWT-resolved, date-range aware)
  // GET /api/v2/orders/{login}            — order history (login-based, verified real fields)
  const accountLogin = resolveTradingLogin();
  const { data: rawPositionHistory = [], refetch: refetchPositionHistory } = usePositionHistoryQuery(accountLogin);
  const { data: rawPositions = [], refetch: refetchPositions } = usePositionsQuery(accountLogin);
  const { data: rawDeals = [], refetch: refetchDeals } = useAccountDealsQuery();
  const { data: rawOrders = [], refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchPositionHistory(), refetchPositions(), refetchDeals(), refetchOrders()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchPositionHistory, refetchPositions, refetchDeals, refetchOrders]);

  // Hook into live pricing feed for open positions parity
  const activeSymbols = useMemo(() => Array.from(new Set(rawPositions.map(p => p.symbol))), [rawPositions]);
  const quotesStore = useMarketData(activeSymbols);

  const liveAcc = useLiveAccountState();
  const accountLoginStr = String(accountDetails?.id ?? accountLogin ?? '—');
  const balance = liveAcc.balance || 0;
  const currency = 'USD';

  // Calculate actual history summary stats from the raw API payload
  const closedSwap = useMemo(() => rawPositionHistory.reduce((acc, p) => acc + (p.swap || 0), 0), [rawPositionHistory]);
  const closedCommission = useMemo(() => rawPositionHistory.reduce((acc, p) => acc + (p.commission || 0), 0), [rawPositionHistory]);
  const rawClosedProfit = useMemo(() => rawPositionHistory.reduce((acc, p) => acc + (p.profit || 0), 0), [rawPositionHistory]);
  const totalClosedPnl = rawClosedProfit + closedSwap + closedCommission;

  // Approximate initial deposit using current balance & realized PNL
  const deposit = balance - totalClosedPnl;

  const baseData = useMemo<HistoryRow[]>(() => {
    // GET /api/v2/account/orders — real order history, replaces static mock
    if (tab === 'Orders') return rawOrders.map(mapOrderToRow);
    if (tab === 'Deals') return rawDeals.map(mapDealToRow);

    // Positions tab — open positions with live prices ticking
    const openRows = rawPositions.map((p) => {
      const liveQuote = quotesStore[p.symbol];
      const liveBid = liveQuote?.bid || p.currentPrice;
      const liveAsk = liveQuote?.ask || liveBid + (p.symbol.includes('JPY') ? 0.015 : 0.00015);
      const isBuy = p.side === 'buy';
      const livePrice = isBuy ? liveBid : liveAsk;

      const contractSize = p.symbol.includes('JPY') ? 1000 : 100000;
      const priceDiff = isBuy ? (livePrice - p.openPrice) : (p.openPrice - livePrice);
      const livePnl = priceDiff * (p.volume || 0.01) * contractSize;

      const ts = p.openTime ? new Date(p.openTime).getTime() / 1000 : undefined;
      return {
        id: `hpo_${p.id}`,
        line1: `${p.symbol} ${p.side} ${p.volume.toFixed(2)} (Open)`,
        line2: `${fmt.price(p.openPrice)} → ${fmt.price(livePrice)}`,
        time: safeTimeStr(ts),
        profit: livePnl,
      };
    });

    return openRows;
  }, [tab, rawPositions, rawDeals, quotesStore]);

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
    <Screen noBottomInset style={isDark ? { backgroundColor: '#06080D' } : undefined}>
      <AppHeader title={t('History')} noBorder />
      {/* ── Account Summary (fixed) ── */}
      <Text style={styles.accountSummaryHeading}>Account Summary</Text>
      <View style={styles.summaryBlock}>
        <View style={styles.summaryTop}>
          <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Balance</Text>
          <View style={styles.floatingRow}>
            <Text style={[styles.floating, { color: T.text, opacity: 0.9 }]}>
              {fmt.int(balance)}
            </Text>
            <Text style={[styles.balanceQuickCurrency, { color: T.textSub }]}> {currency}</Text>
          </View>
        </View>
        <View style={[styles.metricsCard, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle, backgroundColor: 'transparent' }]}>
          <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
            <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Account ID:</Text>
              </View>
              <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{accountLoginStr}</Text>
            </View>
            <View style={styles.gridCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Deposit:</Text>
              </View>
              <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.int(deposit)}</Text>
            </View>
          </View>
          <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
            <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Closed P/L:</Text>
              </View>
              <Text style={[styles.gridValue, { color: totalClosedPnl >= 0 ? T.up : T.down, opacity: 0.9 }]}>{fmt.pnl(totalClosedPnl)}</Text>
            </View>
            <View style={styles.gridCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Swap:</Text>
              </View>
              <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.pnl(closedSwap)}</Text>
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Commission:</Text>
              </View>
              <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.pnl(closedCommission)}</Text>
            </View>
            <Pressable
              style={styles.gridCol}
              onPress={() => router.push('/history/filter')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Range:</Text>
              </View>
              <Text style={[styles.gridValue, { color: T.accent, opacity: 1 }]}>{historyRange}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={data}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#D1D4DC' : '#131722'}
            colors={[isDark ? '#D1D4DC' : '#131722']}
            progressBackgroundColor={isDark ? '#0E141F' : '#FFFFFF'}
          />
        }
        ListHeaderComponent={(
          <>
            {/* ── Controls Card ── */}
            <View style={styles.topBlock}>
              <View style={styles.topControlsRow}>
                <Pressable style={styles.iconButton} onPress={() => showActionSheet({ title: 'Sort By', actions: SORT_OPTIONS.map((option) => ({ label: option === sortBy ? `${option} ✓` : option, onPress: () => setSortBy(option) })) })}>
                  <Ionicons name='swap-vertical-outline' size={20} color={T.text} />
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
                  <Ionicons name='time-outline' size={20} color={T.text} />
                </Pressable>
              </View>

              <View style={styles.metricsRow}>
                <MetricPill
                  label='Range'
                  value={historyRange}
                  icon='calendar-outline'
                  tone='neutral'
                  T={T}
                  isDark={isDark}
                  onPress={() => router.push('/history/filter')}
                />
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
            <View style={[styles.sectionHeader, { borderBottomColor: T.border }]}>
              <View>
                <Text style={[styles.sectionTitle, { color: T.text }]}>Trade Records</Text>
                <Text style={[styles.sectionMeta, { color: T.textMuted }]}>{data.length} records</Text>
              </View>
            </View>
          </>
        )}
        renderItem={({ item }) => <HistoryItemRow item={item} T={T} isDark={isDark} />}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: T.textMuted }]}>No history records</Text>}
      />
    </Screen>
  );
}

function HistoryItemRow({ item, T, isDark }: { item: HistoryRow; T: ThemeColors; isDark: boolean }) {
  const { symbol, side, volume } = parseLine1(item.line1);
  const sideLower = side.toLowerCase().replace(',', '');
  const isBuy = sideLower.includes('buy');
  const isSell = sideLower.includes('sell');
  const profit = typeof item.profit === 'number' ? item.profit : null;
  const cardBg = T.glass2;

  return (
    <View style={[
      rStyles.rowCard,
      {
        backgroundColor: isDark ? '#0E141F' : cardBg,
        borderColor: isDark ? T.border : T.borderSubtle,
      },
      !isDark && rStyles.cardShadowLight,
      isDark && rStyles.cardShadowDark,
    ]}>
      <View style={rStyles.rowBody}>
        <Text style={[rStyles.rowIdText, { color: T.textMuted }]}>#{extractTicket(item.id)}</Text>
        <View style={rStyles.rowTop}>
          <View style={rStyles.symbolLine}>
            <Text style={[rStyles.symbolText, { color: T.text }]}>{symbol}</Text>
            {side ? (
              <View style={[
                rStyles.sideBadge,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : T.glass1 },
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
          {item.line2.includes('→') ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[rStyles.priceTrack, { color: T.textSub }]}>{item.line2.split('→')[0].trim()}</Text>
              <Ionicons name="arrow-forward" size={14} color={T.textMuted} />
              <Text style={[rStyles.priceTrack, { color: T.text, fontWeight: '700' }]}>{item.line2.split('→')[1].trim()}</Text>
            </View>
          ) : (
            <Text style={[rStyles.priceTrack, { color: T.textSub }]}>{item.line2}</Text>
          )}
          <Text style={[rStyles.timeText, { color: T.textMuted }]}>{item.time}</Text>
        </View>
        {/* Deal comment — shown when present (EA notes, manual reason codes, etc.) */}
        {item.note ? (
          <View style={rStyles.noteRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={T.textMuted} />
            <Text style={[rStyles.noteText, { color: T.textMuted }]} numberOfLines={1}>{item.note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MetricPill({
  label, value, icon, tone, T, isDark, onPress,
}: {
  label: string; value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone; T: ThemeColors; isDark: boolean;
  onPress?: () => void;
}) {
  const cardBg = T.glass1;
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper style={[mpS.metricPill, { borderColor: isDark ? T.border : 'transparent', backgroundColor: isDark ? cardBg : T.glass1 }]} onPress={onPress}>
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
    </Wrapper>
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
    paddingTop: 12, paddingBottom: 10, paddingHorizontal: spacing.md,
    borderRadius: 16, borderWidth: 1,
  },
  cardShadowLight: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1 },
  cardShadowDark: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  rowIdText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5, marginBottom: 4 },
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
  /** Deal comment row — only rendered when a non-empty comment exists on the deal */
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  noteText: { fontSize: 11, fontWeight: '500', flex: 1 },
});

const mpS = StyleSheet.create({
  metricPill: { flex: 1, minHeight: 52, borderRadius: 10, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 6, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  metricLabel: { marginLeft: 4, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { fontSize: 15, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
});

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = T.glass2;
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    menuBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
    accountSummaryHeading: { color: T.text, fontSize: 18, fontWeight: '600', letterSpacing: -0.5, marginTop: 4, marginHorizontal: spacing.md, marginBottom: 8 },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: isDark ? '#0E141F' : cardBg, borderWidth: 1, borderColor: isDark ? T.border : T.borderSubtle,
      shadowColor: isDark ? '#2563EB' : '#0F172A',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.04,
      shadowRadius: isDark ? 16 : 24, elevation: 4,
      overflow: 'hidden',
    },
    summaryTop: { paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
    summaryLabel: { fontSize: 18, fontWeight: '500', letterSpacing: -0.5, marginTop: 4 },
    floatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    floating: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5, lineHeight: 30, marginTop: 4, fontVariant: ['tabular-nums'] },
    balanceQuickCurrency: { fontSize: 18, fontWeight: '500' },
    metricsCard: { borderTopWidth: 1, borderColor: T.borderSubtle, backgroundColor: 'transparent', overflow: 'hidden' },
    gridRow: { flexDirection: 'row' },
    gridCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gridLabel: { fontSize: 13, fontWeight: '500' },
    gridValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.2 },
    topBlock: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, borderRadius: 16,
      borderWidth: 1, borderColor: isDark ? T.border : T.borderSubtle,
      backgroundColor: isDark ? '#0E141F' : cardBg, padding: 6, paddingBottom: 8,
      shadowColor: isDark ? '#2563EB' : '#0F172A',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.04,
      shadowRadius: isDark ? 16 : 24, elevation: 4,
    },
    topControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    segment: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, backgroundColor: T.glass1 },
    segmentButton: { paddingVertical: 5, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    segmentButtonActive: { backgroundColor: isDark ? T.glass3 : T.glass2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 2, elevation: 1 },
    segmentText: { fontSize: 13, fontWeight: '700' },
    metricsRow: { marginTop: 14, flexDirection: 'row', columnGap: 8 },
    sectionHeader: { marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
    sectionTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
    sectionMeta: { marginTop: 2, fontSize: 12, fontWeight: '500' },
    emptyText: { marginTop: spacing.lg, textAlign: 'center', fontSize: 13 },
  });
}
