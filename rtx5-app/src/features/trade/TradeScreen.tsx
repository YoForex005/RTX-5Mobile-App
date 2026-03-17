import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { PositionItem, positions, account as mockAccount } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { useUIState } from '../../state/uiState';

export function TradeScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { oneClickAccepted, setChartSymbol, accountDetails, isDemoAccount } = useUserPreferences();
  const setSidebarOpen = useUIState((st) => st.setSidebarOpen);
  const showActionSheet = useUIState((st) => st.showActionSheet);

  const account = {
    balance: mockAccount.balance, credit: 0, floating: mockAccount.floating, equity: mockAccount.equity,
    margin: mockAccount.margin, freeMargin: mockAccount.freeMargin, marginLevel: mockAccount.marginLevel, currency: mockAccount.currency,
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
                {isDark && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(37,99,235,0.08)' }]} />}
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
              <View style={[s.metricsCard, { borderTopColor: T.border }]}>
                <View style={[s.gridRow, { borderBottomWidth: 1, borderBottomColor: T.border }]}>
                  <View style={[s.gridCol, { borderRightWidth: 1, borderRightColor: T.border }]}>
                    <Text style={[s.gridLabel, { color: T.textSub }]}>Margin:</Text>
                    <Text style={[s.gridValue, { color: T.text }]}>{fmt.int(account.margin)}</Text>
                  </View>
                  <View style={s.gridCol}>
                    <Text style={[s.gridLabel, { color: T.textSub }]}>Free Margin:</Text>
                    <Text style={[s.gridValue, { color: T.text }]}>{fmt.int(account.freeMargin)}</Text>
                  </View>
                </View>

                <View style={s.gridRow}>
                  <View style={[s.gridCol, { borderRightWidth: 1, borderRightColor: T.border }]}>
                    <Text style={[s.gridLabel, { color: T.textSub }]}>Margin Level (%):</Text>
                    <Text style={[s.gridValue, { color: T.text }]}>{fmt.int(account.marginLevel)}</Text>
                  </View>
                  <View style={s.gridCol}>
                    <Text style={[s.gridLabel, { color: T.textSub }]}>Credit:</Text>
                    <Text style={[s.gridValue, { color: T.text }]}>{fmt.int(account.credit || 0)}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
              <View>
                <Text style={[s.positionsTitle, { color: T.text }]}>Positions</Text>
                <Text style={[s.positionsMeta, { color: T.textMuted }]}>
                  {positions.length} open • {(totalVolume || 0).toFixed(2)} lots
                </Text>
              </View>
              <Pressable
                onPress={showBulkSheet}
                style={({ pressed }) => [s.bulkButton, { borderColor: T.border, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}
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
                { backgroundColor: T.glass2, borderColor: T.border },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
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

          </>
        )}
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = T.glass2;
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: spacing.xl + spacing.md },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 20,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 24, elevation: 4, overflow: 'hidden',
    },
    summaryTop: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: 'transparent',
    },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floating: { fontSize: 42, fontWeight: '800', letterSpacing: -1, lineHeight: 46, marginTop: 4, fontVariant: ['tabular-nums'] },
    floatingPositive: { color: T.up },
    floatingNegative: { color: T.down },
    summaryHint: { marginTop: 4, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    metricsCard: { borderTopWidth: 1, borderColor: T.borderSubtle, backgroundColor: T.glass1, overflow: 'hidden' },
    gridRow: { flexDirection: 'row' },
    gridCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gridLabel: { fontSize: 13, fontWeight: '500' },
    gridValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.2 },
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
      borderRadius: 20, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 24, elevation: 4,
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
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerIconBtn: {
      width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
      borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center',
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
    exposureSection: { marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: spacing.md, backgroundColor: cardBg,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4,
    },
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
