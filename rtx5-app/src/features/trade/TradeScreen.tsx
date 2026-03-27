import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MetricRow } from '../../components/MetricRow';
import { Screen } from '../../components/Screen';
import { TradePositionRow } from '../../components/TradePositionRow';
import { PositionItem } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { fmt } from '../../utils/format';
import { useUIState } from '../../state/uiState';
import { useMarketData } from '../../query/websocket';

// ── Live PNL Header Component ─────────────────────────────────────────────
const LiveUnrealizedPnLHeader = React.memo(({ positions, account, s, T, isDark }: any) => {
  const activeSymbols = useMemo(() => Array.from(new Set(positions.map((p: any) => p.symbol))) as string[], [positions]);
  const quotesStore = useMarketData(activeSymbols);

  const dynamicFloating = useMemo(() => {
    let total = 0;
    positions.forEach((p: any) => {
      const liveQuote = quotesStore[p.symbol];
      const liveBid = liveQuote?.bid || p.currentPrice;
      const liveAsk = liveQuote?.ask || liveBid + (p.symbol.includes('JPY') ? 0.015 : 0.00015);
      const isBuy = p.side === 'buy';
      const livePrice = isBuy ? liveBid : liveAsk;
      
      const isJpy = p.symbol.includes('JPY');
      const contractSize = isJpy ? 1000 : 100000;
      const priceDiff = isBuy ? (livePrice - p.openPrice) : (p.openPrice - livePrice);
      const livePnl = priceDiff * (p.volume || 0.01) * contractSize;
      total += livePnl;
    });
    return total;
  }, [positions, quotesStore]);

  // Use dynamic floating to infer true Equity and Margin Level based on Balance and used Margin.
  const dynamicEquity = (account.balance || 0) + dynamicFloating;
  const dynamicMarginLevel = account.margin > 0 ? (dynamicEquity / account.margin) * 100 : 0;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.82, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={[s.summaryBlock, isDark && {
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    }]}>
      <View style={s.summaryTop}>
        <View style={s.plSection}>
          <Text style={[s.summaryLabel, { color: T.text }]}>UNREALIZED P/L</Text>
          <View style={s.floatingRow}>
            <Animated.Text style={[s.floating, { color: dynamicFloating >= 0 ? T.up : T.down, opacity: pulseAnim }]}>
              {fmt.pnl(dynamicFloating)}
            </Animated.Text>
          </View>
          <View style={s.plMeta}>
            <Text style={[s.summaryHint, { color: T.textSub }]}>Margin level {fmt.decimal(dynamicMarginLevel)}%</Text>
          </View>
        </View>
        <View style={s.balanceQuick}>
          <Text style={[s.balanceQuickLabel, { color: T.textSub }]}>BALANCE</Text>
          <Text style={[s.balanceQuickValue, { color: T.text, opacity: 0.9, fontWeight: '700' }]}>{fmt.int(account.balance)}</Text>
          <Text style={[s.balanceQuickCurrency, { color: T.textSub }]}>{account.currency}</Text>
        </View>
      </View>

      <View style={[s.metricsCard, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : T.border, backgroundColor: 'transparent' }]}>
        <View style={[s.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
          <View style={[s.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="lock-closed-outline" size={13} color={isDark ? 'rgba(148,163,184,0.45)' : T.textMuted} />
              <Text style={[s.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Margin:</Text>
            </View>
            <Text style={[s.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.decimal(account.margin, 3)}</Text>
          </View>
          <View style={s.gridCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="lock-open-outline" size={13} color={isDark ? 'rgba(148,163,184,0.45)' : T.textMuted} />
              <Text style={[s.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Free Margin:</Text>
            </View>
            <Text style={[s.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.decimal(account.freeMargin, 3)}</Text>
          </View>
        </View>

        <View style={s.gridRow}>
          <View style={[s.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="speedometer-outline" size={13} color={isDark ? 'rgba(148,163,184,0.45)' : T.textMuted} />
              <Text style={[s.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Margin Level:</Text>
            </View>
            <Text style={[s.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.decimal(dynamicMarginLevel, 3)}</Text>
          </View>
          <View style={s.gridCol}>
            {account.credit > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="card-outline" size={13} color={isDark ? 'rgba(148,163,184,0.45)' : T.textMuted} />
                  <Text style={[s.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Credit:</Text>
                </View>
                <Text style={[s.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.int(account.credit)}</Text>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="briefcase-outline" size={13} color={isDark ? 'rgba(148,163,184,0.45)' : T.textMuted} />
                  <Text style={[s.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>Equity:</Text>
                </View>
                <Text style={[s.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.int(dynamicEquity)}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

export function TradeScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const { oneClickAccepted, setChartSymbol } = useUserPreferences();
  const setSidebarOpen = useUIState((st) => st.setSidebarOpen);
  const showActionSheet = useUIState((st) => st.showActionSheet);

  // ── Pull-to-refresh & Live Fetch ────────────────────────────────────────
  const { positions, refreshPositions, isLoading, lastFetchLogin, lastError } = usePositionsState();
  const [refreshing, setRefreshing] = useState(false);
  const resolvedLogin = resolveTradingLogin();

  const fetchPositions = useCallback(async () => {
    const mt5Login = resolveTradingLogin();
    if (!mt5Login) return;

    setRefreshing(true);
    try {
      await refreshPositions(String(mt5Login));
    } finally {
      setRefreshing(false);
    }
  }, [refreshPositions]);

  const onRefresh = useCallback(() => {
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    if (resolvedLogin) {
      fetchPositions();
    }
  }, [resolvedLogin, fetchPositions]);

  useFocusEffect(
    useCallback(() => {
      fetchPositions();
      const iv = setInterval(fetchPositions, 5000);
      return () => clearInterval(iv);
    }, [fetchPositions])
  );

  // pulseAnim has been moved to LiveUnrealizedPnLHeader

  const liveAcc = useLiveAccountState();
  const account = {
    balance: liveAcc.balance || 0, credit: 0, floating: liveAcc.floating || 0, equity: liveAcc.equity || 0,
    margin: liveAcc.margin || 0, freeMargin: liveAcc.margin_free || 0, marginLevel: liveAcc.margin_level || 0, currency: 'USD',
  };
  const totalVolume = positions.reduce((sum, p) => sum + (p.volume || 0), 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

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
      title: `#${item.id} ${item.symbol.replace(/\//g, '')} ${item.side} ${(item.volume || 0).toFixed(2)}`,
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
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={(
          <>
            <View style={{ height: 48, marginTop: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: T.text, textAlign: 'center' }}>Trade</Text>
            </View>
            
            <LiveUnrealizedPnLHeader positions={positions} account={account} s={s} T={T} isDark={isDark} />

            <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
              <View style={s.positionsHeaderLeft}>
                <View style={[s.positionsAccentBar, { backgroundColor: T.accent }]} />
                <View>
                  <View style={s.positionsTitleRow}>
                    <Text style={[s.positionsTitle, { color: T.text }]}>Positions</Text>
                    {positions.length > 0 && (
                      <View style={[s.totalPnlBadge, { backgroundColor: totalPnl >= 0 ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)' }]}>
                        <Text style={[s.totalPnlText, { color: totalPnl >= 0 ? T.up : T.down }]}>
                          {fmt.pnl(totalPnl)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.positionsMeta, { color: T.textMuted }]}>
                    {positions.length} open • {(totalVolume || 0).toFixed(2)} lots
                  </Text>
                </View>
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
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={T.textDimmed} />
            <Text style={[s.emptyTitle, { color: T.textMuted }]}>
              {isLoading ? 'Loading positions...' : 'No open positions'}
            </Text>
            <Text style={[s.emptySub, { color: T.textDimmed }]}>
              {lastError
                ? `Account ${lastFetchLogin ?? resolvedLogin ?? 'unknown'}: ${lastError}`
                : resolvedLogin
                  ? `Account ${resolvedLogin}: your active trades will appear here`
                  : 'Waiting for active trading account'}
            </Text>
          </View>
        }
        ListFooterComponent={positions.length > 0 ? (
          <>

            {/* ── Top Exposures ── */}

          </>
        ) : null}
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
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#2563EB' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.08,
      shadowRadius: isDark ? 16 : 24, elevation: 4, overflow: 'hidden',
    },
    summaryTop: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: 'transparent',
    },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floating: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 28, marginTop: 4, fontVariant: ['tabular-nums'] },
    floatingPositive: { color: T.up },
    floatingNegative: { color: T.down },
    summaryHint: { marginTop: 4, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    metricsCard: { borderTopWidth: 1, borderColor: T.borderSubtle, backgroundColor: T.glass1, overflow: 'hidden' },
    gridRow: { flexDirection: 'row' },
    gridCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gridLabel: { fontSize: 12, fontWeight: '500' },
    gridValue: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.2 },
    positionsHeader: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1,
    },
    positionsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    positionsAccentBar: { width: 3, height: 32, borderRadius: 2 },
    positionsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    totalPnlBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    totalPnlText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
    positionsTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    positionsMeta: { marginTop: 2, fontSize: 12, fontWeight: '500' },
    bulkButton: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    /* Empty state */
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
    emptySub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
    bulkButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    oneClick: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md,
      borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      shadowColor: isDark ? '#2563EB' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.08,
      shadowRadius: isDark ? 16 : 24, elevation: 4,
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
    exposureSection: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: spacing.md, backgroundColor: cardBg,
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
