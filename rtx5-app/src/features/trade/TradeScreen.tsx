import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { PositionItem, positions } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useAccountSummary } from '../../query/account';
import { useExposure } from '../../query/exposure';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { useLiveAccount } from '../../query/websocket';
import { useUIState } from '../../state/uiState';

export function TradeScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { oneClickAccepted, setChartSymbol, accountDetails, isDemoAccount } = useUserPreferences();
  const liveAccountWS = useLiveAccount(accountDetails?.id || '');
  const { data: exposureData } = useExposure();
  const setSidebarOpen = useUIState((st) => st.setSidebarOpen);
  const showActionSheet = useUIState((st) => st.showActionSheet);

  const account = liveAccountWS || {
    balance: 0, credit: 0, floating: 0, equity: 0,
    margin: 0, freeMargin: 0, marginLevel: 0, currency: 'USD',
  };
  const totalVolume = positions.reduce((sum, p) => sum + (p.volume || 0), 0);

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
        style={s.list}
        data={positions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            {/* ── Professional Header ── */}
            <View style={s.headerGrad}>
              <View style={s.headerRow}>
                <Pressable style={s.menuBtn} onPress={() => setSidebarOpen(true)}>
                  <Ionicons name="menu" size={22} color={T.text} />
                </Pressable>

                <View style={{ flex: 1 }} />

                <View style={s.headerActions}>
                  <Pressable style={s.headerIconBtn}>
                    <Ionicons name="notifications-outline" size={19} color={T.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/trade/order-ticket')}
                    style={({ pressed }) => [s.newOrderHeaderBtn, pressed && s.newOrderHeaderBtnPressed]}
                  >
                    <Ionicons name="add" size={15} color="#fff" />
                    <Text style={s.newOrderHeaderText}>Order</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* ── Summary Block ── */}
            <View style={s.summaryBlock}>
              <View style={s.summaryTop}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(37,99,235,0.08)' : 'rgba(37,99,235,0.04)' }]} />
                <View style={s.plSection}>
                  <Text style={[s.summaryLabel, { color: T.text }]}>Unrealized P/L</Text>
                  <View style={s.floatingRow}>
                    <Text style={[s.floating, account.floating >= 0 ? s.floatingPositive : s.floatingNegative]}>
                      {fmt.pnl(account.floating)}
                    </Text>
                    <View style={[s.trendBadge, account.floating >= 0 ? s.trendUp : s.trendDown]}>
                      <Ionicons
                        name={account.floating >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                        size={18}
                        color={account.floating >= 0 ? T.up : T.down}
                      />
                    </View>
                  </View>
                  <View style={s.plMeta}>
                    <Text style={[s.summaryHint, { color: T.textSub }]}>Margin level {fmt.int(account.marginLevel)}%</Text>
                  </View>
                </View>
                <View style={s.balanceQuick}>
                  <Text style={[s.balanceQuickLabel, { color: T.textSub }]}>Balance</Text>
                  <Text style={[s.balanceQuickValue, { color: T.text }]}>{fmt.int(account.balance)}</Text>
                  <Text style={[s.balanceQuickCurrency, { color: T.textSub }]}>{account.currency}</Text>
                  <View style={s.equityRow}>
                    <Text style={[s.equityLabel, { color: T.textMuted }]}>Equity </Text>
                    <Text style={[s.equityValue, { color: T.textSub }]}>{fmt.int(account.equity)}</Text>
                  </View>
                </View>
              </View>
              <View style={[s.metricsCard, { borderTopColor: T.borderMedium }]}>
                <MetricRow label='Margin:' value={fmt.int(account.margin)} compact withDivider white />
                <MetricRow label='Free Margin:' value={fmt.int(account.freeMargin)} compact withDivider white />
                <MetricRow label='Margin Level (%):' value={fmt.int(account.marginLevel)} compact withDivider white />
                <MetricRow label='Credit:' value={fmt.int(account.credit || 0)} compact white />
              </View>
            </View>

            <View style={[s.positionsHeader, { borderBottomColor: T.borderMedium }]}>
              <View>
                <Text style={[s.positionsTitle, { color: T.text }]}>Positions</Text>
                <Text style={[s.positionsMeta, { color: T.textMuted }]}>
                  {positions.length} open • {(totalVolume || 0).toFixed(2)} lots
                </Text>
              </View>
              <Pressable
                onPress={showBulkSheet}
                style={({ pressed }) => [s.bulkButton, { borderColor: T.borderMedium, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}
              >
                <Text style={[s.bulkButtonText, { color: T.textMuted }]}>Bulk</Text>
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
              style={({ pressed }) => [
                s.oneClick,
                { backgroundColor: isDark ? T.glass2 : '#ffffff', borderColor: T.borderMedium },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push('/trade/one-click-terms')}
            >
              <View>
                <Text style={[s.oneClickTitle, { color: T.text }]}>One Click Trading</Text>
                <Text style={[s.oneClickSub, { color: T.textMuted }]}>
                  {oneClickAccepted ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <View style={[
                s.statusPill,
                oneClickAccepted
                  ? { borderColor: T.upGlow, backgroundColor: T.upGlow }
                  : { borderColor: T.downGlow, backgroundColor: T.downGlow },
              ]}>
                <Text style={[
                  s.statusPillText,
                  oneClickAccepted ? { color: T.up } : { color: T.down },
                ]}>
                  {oneClickAccepted ? 'ACTIVE' : 'SETUP'}
                </Text>
              </View>
            </Pressable>

            {/* ── Top Exposures ── */}
            {exposureData?.exposure && exposureData.exposure.filter(e => e.volume_net !== 0).length > 0 && (
              <View style={[s.exposureSection, { borderColor: T.borderMedium, backgroundColor: isDark ? T.glass2 : '#ffffff' }]}>
                <View style={s.exposureHeader}>
                  <Text style={[s.exposureSectionTitle, { color: T.textSub }]}>TOP EXPOSURES</Text>
                  <Text style={[s.exposureCount, { color: T.textMuted }]}>
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
                      <View key={exp.symbol} style={s.exposureRow}>
                        <Text style={[s.exposureSymbol, { color: T.text }]}>{exp.symbol}</Text>
                        <View style={[s.exposureBarWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)' }]}>
                          <View style={[s.exposureBar, { width: `${barWidth}%`, backgroundColor: isPositive ? 'rgba(52,199,89,0.4)' : 'rgba(255,59,48,0.4)' }]} />
                        </View>
                        <Text style={[s.exposureNet, { color: isPositive ? T.up : T.down }]}>
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

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? T.glass2 : '#ffffff';
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: spacing.xl + spacing.md },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 18,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.borderMedium,
      shadowColor: T.trading.buy.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.05 : 0.1,
      shadowRadius: 16, elevation: 4, overflow: 'hidden',
    },
    summaryTop: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floating: { fontSize: 42, fontWeight: '800', letterSpacing: -1, lineHeight: 46, marginTop: 4, fontVariant: ['tabular-nums'] },
    floatingPositive: { color: T.up },
    floatingNegative: { color: T.down },
    summaryHint: { marginTop: 4, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    metricsCard: { borderTopWidth: 1, backgroundColor: 'transparent', overflow: 'hidden' },
    positionsHeader: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1,
    },
    positionsTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    positionsMeta: { marginTop: 2, fontSize: 12, fontWeight: '500' },
    bulkButton: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    bulkButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    oneClick: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md,
      borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      shadowColor: T.trading.buy.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.05 : 0.08,
      shadowRadius: 16, elevation: 4,
    },
    oneClickTitle: { fontSize: 15, fontWeight: '700' },
    oneClickSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
    statusPill: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
    /* Header */
    headerGrad: { paddingBottom: 0 },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    },
    menuBtn: {
      width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.borderMedium,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerIconBtn: {
      width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
      borderWidth: 1, borderColor: T.borderMedium, alignItems: 'center', justifyContent: 'center',
    },
    newOrderHeaderBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB',
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 5,
    },
    newOrderHeaderBtnPressed: { backgroundColor: '#1D4ED8' },
    newOrderHeaderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    /* P/L Section */
    plSection: { flex: 1 },
    floatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    trendBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    trendUp: { backgroundColor: 'rgba(74,222,128,0.1)' },
    trendDown: { backgroundColor: 'rgba(248,113,113,0.1)' },
    plMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    /* Balance */
    balanceQuick: { alignItems: 'flex-end', justifyContent: 'center' },
    balanceQuickLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
    balanceQuickValue: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
    balanceQuickCurrency: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
    equityRow: { flexDirection: 'row', alignItems: 'center' },
    equityLabel: { fontSize: 12, fontWeight: '600' },
    equityValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    /* Exposure */
    exposureSection: { marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 12, borderWidth: 1, padding: spacing.md },
    exposureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    exposureSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    exposureCount: { fontSize: 11, fontWeight: '600' },
    exposureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    exposureSymbol: { width: 50, fontSize: 12, fontWeight: '700' },
    exposureBarWrap: { flex: 1, height: 10, borderRadius: 5, marginHorizontal: 8, overflow: 'hidden', justifyContent: 'center' },
    exposureBar: { height: 10, borderRadius: 5 },
    exposureNet: { width: 80, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' },
  });
}
