import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { PositionItem, positions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useAccountSummary } from '../../query/account';
import { useExposure } from '../../query/exposure';
import { useUIState } from '../../state/uiState';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { fmt } from '../../utils/format';

export function TradeScreen() {
  const { oneClickAccepted, setChartSymbol, accountDetails, isDemoAccount } = useUserPreferences();
  const { data: liveAccount } = useAccountSummary(accountDetails?.id);
  const { data: exposureData } = useExposure();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const showActionSheet = useUIState((s) => s.showActionSheet);

  const account = liveAccount || {
    balance: 0,
    credit: 0,
    profit: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0,
    currency: 'USD',
  };
  const totalVolume = positions.reduce((sum, position) => sum + (position.volume || 0), 0);

  const showBulkSheet = () => {
    showActionSheet({
      title: 'Bulk Operations',
      actions: [
        { label: 'Close All Positions', danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'all' } }) },
        { label: 'Close Profitable Positions', danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'profitable' } }) },
        { label: 'Close Losing Positions', danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'losing' } }) },
        { label: 'Close Buy Positions', danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'buy' } }) },
        { label: 'Close BTCUSDm Positions', danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'symbol:BTCUSDm' } }) },
      ],
    });
  };

  const showPositionSheet = (item: PositionItem) => {
    showActionSheet({
      title: `#${item.id} ${item.symbol} ${item.side} ${(item.volume || 0).toFixed(2)}`,
      actions: [
        { label: 'Close position', danger: true, onPress: () => router.push({ pathname: '/trade/close-position', params: { positionId: item.id } }) },
        { label: 'Close By', danger: true, onPress: () => router.push({ pathname: '/trade/close-by', params: { positionId: item.id } }) },
        { label: 'Modify position', onPress: () => router.push({ pathname: '/trade/modify-position', params: { positionId: item.id } }) },
        { label: 'Trade', onPress: () => router.push({ pathname: '/trade/order-ticket', params: { symbol: item.symbol } }) },
        { label: 'Chart', onPress: () => { setChartSymbol(item.symbol); router.push('/(tabs)/chart'); } },
        { label: 'Bulk Operations...', onPress: () => showBulkSheet() },
      ],
    });
  };

  return (
    <Screen>
      <FlatList
        style={styles.list}
        data={positions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            {/* ── Professional Header ── */}
            <View style={styles.headerGrad}>
              <View style={styles.headerRow}>
                <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
                  <Ionicons name="menu" size={22} color="#fff" />
                </Pressable>

                <View style={styles.headerCenter}>
                  <Text style={styles.headerAccountName}>Trade</Text>
                </View>

                <View style={styles.headerActions}>
                  <Pressable style={styles.headerIconBtn}>
                    <Ionicons name="notifications-outline" size={19} color="#64748B" />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/trade/order-ticket')}
                    style={({ pressed }) => [styles.newOrderHeaderBtn, pressed && styles.newOrderHeaderBtnPressed]}
                  >
                    <Ionicons name="add" size={15} color="#fff" />
                    <Text style={styles.newOrderHeaderText}>Order</Text>
                  </Pressable>
                </View>
              </View>

            </View>

            {/* ── Summary Block ── */}
            <View style={styles.summaryBlock}>
              <View style={styles.summaryTop}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(37, 99, 235, 0.08)' }]} />
                <View style={styles.plSection}>
                  <Text style={styles.summaryLabel}>Unrealized P/L</Text>
                  <View style={styles.floatingRow}>
                    <Text style={[styles.floating, account.profit >= 0 ? styles.floatingPositive : styles.floatingNegative]}>
                      {fmt.pnl(account.profit)}
                    </Text>
                    <View style={[styles.trendBadge, account.profit >= 0 ? styles.trendUp : styles.trendDown]}>
                      <Ionicons
                        name={account.profit >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                        size={18}
                        color={account.profit >= 0 ? G.up : G.down}
                      />
                    </View>
                  </View>
                  <View style={styles.plMeta}>
                    <Text style={styles.summaryHint}>Margin level {fmt.int(account.marginLevel)}%</Text>
                  </View>
                </View>
                <View style={styles.balanceQuick}>
                  <Text style={styles.balanceQuickLabel}>Balance</Text>
                  <Text style={styles.balanceQuickValue}>{fmt.int(account.balance)}</Text>
                  <Text style={styles.balanceQuickCurrency}>{account.currency}</Text>
                  <View style={styles.equityRow}>
                    <Text style={styles.equityLabel}>Equity </Text>
                    <Text style={styles.equityValue}>{fmt.int(account.equity)}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.metricsCard}>
                <MetricRow label='Margin:' value={fmt.int(account.margin)} compact withDivider white />
                <MetricRow label='Free Margin:' value={fmt.int(account.freeMargin)} compact withDivider white />
                <MetricRow label='Margin Level (%):' value={fmt.int(account.marginLevel)} compact withDivider white />
                <MetricRow label='Credit:' value={fmt.int(account.credit)} compact white />
              </View>
            </View>

            <View style={styles.positionsHeader}>
              <View>
                <Text style={styles.positionsTitle}>Positions</Text>
                <Text style={styles.positionsMeta}>
                  {positions.length} open • {(totalVolume || 0).toFixed(2)} lots
                </Text>
              </View>
              <Pressable
                onPress={showBulkSheet}
                style={({ pressed }) => [styles.bulkButton, pressed && styles.bulkButtonPressed]}
              >
                <Text style={styles.bulkButtonText}>Bulk</Text>
              </Pressable>
            </View>
          </>
        )}
        renderItem={({ item }) => (
          <TradePositionRow
            item={item}
            onPress={showPositionSheet}
            onLongPress={showPositionSheet}
          />
        )}
        ListFooterComponent={(
          <>
          <Pressable
            style={({ pressed }) => [styles.oneClick, pressed && styles.oneClickPressed]}
            onPress={() => router.push('/trade/one-click-terms')}
          >
            <View>
              <Text style={styles.oneClickTitle}>One Click Trading</Text>
              <Text style={styles.oneClickSub}>
                {oneClickAccepted ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={[
              styles.statusPill,
              oneClickAccepted ? styles.statusPillEnabled : styles.statusPillDisabled,
            ]}>
              <Text style={[
                styles.statusPillText,
                oneClickAccepted ? styles.statusPillTextEnabled : styles.statusPillTextDisabled,
              ]}>
                {oneClickAccepted ? 'ACTIVE' : 'SETUP'}
              </Text>
            </View>
          </Pressable>

          {/* ── Top Exposures ── */}
          {exposureData?.exposure && exposureData.exposure.filter(e => e.volume_net !== 0).length > 0 && (
            <View style={styles.exposureSection}>
              <View style={styles.exposureHeader}>
                <Text style={styles.exposureSectionTitle}>TOP EXPOSURES</Text>
                <Text style={styles.exposureCount}>
                  {exposureData.exposure.filter(e => e.volume_net !== 0).length} active
                </Text>
              </View>
              {exposureData.exposure
                .filter(e => e.volume_net !== 0 && e.symbol !== '')
                .sort((a, b) => Math.abs(b.volume_net) - Math.abs(a.volume_net))
                .slice(0, 5)
                .map((exp) => {
                  const isPositive = exp.volume_net > 0;
                  const maxNet = Math.max(
                    ...exposureData.exposure
                      .filter(e => e.volume_net !== 0 && e.symbol !== '')
                      .map(e => Math.abs(e.volume_net))
                  );
                  const barWidth = Math.min(Math.abs(exp.volume_net) / maxNet * 100, 100);
                  return (
                    <View key={exp.symbol} style={styles.exposureRow}>
                      <Text style={styles.exposureSymbol}>{exp.symbol}</Text>
                      <View style={styles.exposureBarWrap}>
                        <View
                          style={[
                            styles.exposureBar,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: isPositive ? 'rgba(52,199,89,0.4)' : 'rgba(255,59,48,0.4)',
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.exposureNet, { color: isPositive ? G.up : G.down }]}>
                        {fmt.pnl(exp.volume_net)}
                      </Text>
                    </View>
                  );
                })}
            </View>
          )}
          </>
        )}
      />


    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl + spacing.md,
  },
  summaryBlock: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: G.glass2,
    borderWidth: 1,
    borderColor: G.borderMedium,
    shadowColor: G.trading.buy.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  },
  summaryTop: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: G.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  floating: {
    color: G.trading.buy.hover,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 46,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  floatingCurrency: {
    color: G.trading.buy.hover,
    fontSize: 22,
    fontWeight: '800',
  },
  summaryHint: {
    marginTop: 4,
    color: G.textSub,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  metricsCard: {
    borderTopWidth: 1,
    borderTopColor: G.borderMedium,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  positionsHeader: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: G.borderMedium,
  },
  positionsTitle: {
    color: G.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  positionsMeta: {
    marginTop: 2,
    color: G.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  bulkButton: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass1,
  },
  bulkButtonPressed: {
    backgroundColor: G.glass3,
  },
  bulkButtonText: {
    color: G.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  oneClick: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    backgroundColor: G.glass2,
    borderColor: G.borderMedium,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: G.trading.buy.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  oneClickPressed: {
    backgroundColor: G.glass2,
  },
  oneClickTitle: {
    color: G.text,
    fontSize: 15,
    fontWeight: '700',
  },
  oneClickSub: {
    color: G.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillEnabled: {
    borderColor: G.upGlow,
    backgroundColor: G.upGlow,
  },
  statusPillDisabled: {
    borderColor: G.downGlow,
    backgroundColor: G.downGlow,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusPillTextEnabled: {
    color: G.up,
  },
  statusPillTextDisabled: {
    color: G.down,
  },
  /* Header gradient wrapper */
  headerGrad: {
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 6,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerAccountName: { color: '#F1F5F9', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },

  menuBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: G.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.borderMedium },

  /* Compact DEMO/LIVE Badge for header */
  headerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1, gap: 4 },
  headerBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  /* Keep accountBadge for any legacy usage */
  accountBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, gap: 6 },
  badgeDemo: { backgroundColor: 'rgba(0,230,118,0.08)', borderColor: 'rgba(0,230,118,0.3)' },
  badgeLive: { backgroundColor: 'rgba(250,204,21,0.08)', borderColor: 'rgba(250,204,21,0.3)' },
  dotGlow: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  glowDemo: { backgroundColor: 'rgba(0,230,118,0.2)' },
  glowLive: { backgroundColor: 'rgba(250,204,21,0.2)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotDemo: { backgroundColor: '#00E676' },
  dotLive: { backgroundColor: '#FACC15' },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  textDemo: { color: '#00E676' },
  textLive: { color: '#FACC15' },

  /* Connected indicator */
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connectedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22c55e' },
  connectedText: { color: '#22c55e', fontSize: 9, fontWeight: '600' },

  /* Header right actions */
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: G.glass1, borderWidth: 1, borderColor: G.borderMedium, alignItems: 'center', justifyContent: 'center' },

  /* New Order Button — solid blue */
  newOrderHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 5 },
  newOrderHeaderBtnPressed: { backgroundColor: '#1D4ED8' },
  newOrderHeaderText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  /* Account info strip */
  accountInfoStrip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 8, gap: 5, flexWrap: 'nowrap' },
  accountInfoId: { color: G.textSub, fontSize: 11, fontWeight: '600' },
  accountInfoText: { color: G.textMuted, fontSize: 11, fontWeight: '500', flexShrink: 1 },
  accountInfoDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: G.textMuted },

  /* P/L Section */
  plSection: { flex: 1 },
  floatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  floatingPositive: { color: G.up },
  floatingNegative: { color: G.down },
  trendBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  trendUp: { backgroundColor: 'rgba(74,222,128,0.1)' },
  trendDown: { backgroundColor: 'rgba(248,113,113,0.1)' },
  plMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },

  /* Balance quick panel */
  balanceQuick: { alignItems: 'flex-end', justifyContent: 'center' },
  balanceQuickLabel: { color: G.textSub, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  balanceQuickValue: { color: G.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  balanceQuickCurrency: { color: G.textSub, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  equityRow: { flexDirection: 'row', alignItems: 'center' },
  equityLabel: { color: G.textMuted, fontSize: 11, fontWeight: '600' },
  equityValue: { color: G.textSub, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  /* Exposure section */
  exposureSection: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.borderMedium,
    backgroundColor: G.glass2,
    padding: spacing.md,
  },
  exposureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  exposureSectionTitle: {
    color: G.textSub,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  exposureCount: {
    color: G.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  exposureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  exposureSymbol: {
    width: 50,
    color: G.text,
    fontSize: 12,
    fontWeight: '700',
  },
  exposureBarWrap: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 8,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  exposureBar: {
    height: 10,
    borderRadius: 5,
  },
  exposureNet: {
    width: 80,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
