/**
 * Main active trading overview screen (aka the 'Trade' tab).
 * 
 * Displays:
 * 1. Global account summary (balance, equity, margin) derived from the real-time WebSocket.
 * 2. Flat list of all Open Positions and Pending Orders.
 * 3. Individual P&L per trade, plus aggregate floating P&L.
 * 
 * It relies on `usePositionsState` for synchronous, optimistic UI updates to ensure 
 * lightning-fast feedback when order states change locally without waiting for server-side replica sync.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { AppHeader } from '../../ui/components/AppHeader';
import { useTranslation } from '../../i18n/useTranslation';
import { TradePositionRow } from '../../ui/components/TradePositionRow';
import { PositionItem } from '../../dev/mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { useTradingState } from '../../state/tradingState';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { useMarketData } from '../../query/websocket';
import { useUIState } from '../../state/uiState';
import { getTradingErrorOriginLabel } from '../../api/tradingErrors';
import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
} from './accountSummary';
import { prefetchOrderTicketData } from '../../utils/navigationPrefetch';
import { traceUiInteraction } from '../../dev/uiInteractionDiagnostics';
import { useShallow } from 'zustand/shallow';

// ── Live PNL Header Component ─────────────────────────────────────────────
const LiveUnrealizedPnLHeader = React.memo(({ positions, account, s, T, isDark, totalVolume, onBulkPress }: any) => {
  const { t } = useTranslation();
  const safeBalance = Number.isFinite(account.balance) ? account.balance : 0;
  const safeFloating = Number.isFinite(account.floating) ? account.floating : 0;
  const safeEquity = Number.isFinite(account.equity) ? account.equity : 0;
  const safeMargin = Number.isFinite(account.margin) ? account.margin : 0;
  const safeFreeMargin = Number.isFinite(account.freeMargin) ? account.freeMargin : 0;
  const safeMarginLevel = Number.isFinite(account.marginLevel) ? account.marginLevel : 0;
  const tradeSummaryDetailsVisible = useUserPreferences((state) => state.tradeSummaryDetailsVisible);
  const setTradeSummaryDetailsVisible = useUserPreferences((state) => state.setTradeSummaryDetailsVisible);

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
  const toggleTradeSummaryDetails = useCallback(() => {
    setTradeSummaryDetailsVisible(!tradeSummaryDetailsVisible);
  }, [setTradeSummaryDetailsVisible, tradeSummaryDetailsVisible]);

  return (
    <>
      <View style={[s.summaryBlock, { borderLeftWidth: 1, borderLeftColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
        <Pressable
          onPress={() => traceUiInteraction('trade.summary.toggle', toggleTradeSummaryDetails)}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel="Toggle trade summary details"
          accessibilityState={{ expanded: tradeSummaryDetailsVisible }}
          style={[
            s.summaryTop,
            tradeSummaryDetailsVisible && {
              marginBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
            },
          ]}
        >
          {/* The Hero: Unrealized P/L */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.textSub, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {t('Floating P/L')}
            </Text>
            <Animated.Text
              style={{
                fontSize: 24,
                fontWeight: '700',
                color: safeFloating >= 0 ? T.up : T.down,
                opacity: pulseAnim,
                letterSpacing: -0.2,
                fontVariant: ['tabular-nums'],
                textAlign: 'right',
              }}>
              {fmt.pnlPrecise(safeFloating)} {account.currency || 'USD'}
            </Animated.Text>
          </View>
        </Pressable>
        {tradeSummaryDetailsVisible ? (
          <View style={s.summaryMetrics}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Balance')} <Text style={{ fontSize: 10, color: T.textFaint }}>({account.currency || 'USD'})</Text>
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeBalance)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Equity')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeEquity)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Margin')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeMargin)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Free Margin')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeFreeMargin)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Margin Level')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeMarginLevel)}%
              </Text>
            </View>

            {account.credit > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('Credit')}
                </Text>
                <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                  <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                    ....................................................................................................
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                  {fmt.decimal(Number.isFinite(account.credit) ? account.credit : 0)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
        <View style={s.positionsHeaderLeft}>
          <View style={[s.positionsAccentBar, { backgroundColor: T.accent }]} />
          <View>
            <View style={s.positionsTitleRow}>
              <Text style={[s.positionsTitle, { color: T.text }]}>{t('Positions')}</Text>
            </View>
            <Text style={[s.positionsMeta, { color: T.textMuted }]}>
              {positions.length} {t('open')} • {(totalVolume || 0).toFixed(2)} {t('lots')}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onBulkPress}
          style={({ pressed }) => [s.bulkButton, { borderColor: T.border, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}
        >
          <Text style={[s.bulkButtonText, { color: T.textMuted }]}>{t('Bulk')}</Text>
        </Pressable>
      </View>
    </>
  );
});

const TradeSummaryHeader = React.memo(({
  positions,
  hydratedLogin,
  resolvedLogin,
  s,
  T,
  isDark,
  totalVolume,
  onBulkPress,
}: {
  positions: PositionItem[];
  hydratedLogin: string | null;
  resolvedLogin: number | undefined;
  s: ReturnType<typeof makeStyles>;
  T: ThemeColors;
  isDark: boolean;
  totalVolume: number;
  onBulkPress: () => void;
}) => {
  const tradingAccount = useTradingState((state: any) => state.account);
  const liveAcc = useLiveAccountState(
    useShallow((state) => ({
      balance: state.balance,
      floating: state.floating,
      equity: state.equity,
      margin: state.margin,
      margin_free: state.margin_free,
      margin_level: state.margin_level,
    })),
  );
  const liveQuoteSymbols = useMemo(
    () => Array.from(new Set(positions.map((position) => position.symbol))),
    [positions],
  );
  const liveQuotes = useMarketData(liveQuoteSymbols);
  const account = useMemo(() => {
    const summary = buildTradeAccountSummary(liveAcc, tradingAccount);
    const floating = resolveTradeFloatingPnl(summary.floating, positions, hydratedLogin, resolvedLogin, liveQuotes);
    return resolveRenderableTradeAccountSummary(summary, floating);
  }, [hydratedLogin, liveAcc, liveQuotes, positions, resolvedLogin, tradingAccount]);

  return (
    <LiveUnrealizedPnLHeader
      positions={positions}
      account={account}
      s={s}
      T={T}
      isDark={isDark}
      totalVolume={totalVolume}
      onBulkPress={onBulkPress}
    />
  );
});

export function TradeScreen() {
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const showActionSheet = useUIState((st) => st.showActionSheet);

  // ── Position Hydration & Live Fetch ─────────────────────────────────────
  const { positions, refreshPositions, isLoading, lastFetchLogin, hydratedLogin, lastError } = usePositionsState(
    useShallow((state) => ({
      positions: state.positions,
      refreshPositions: state.refreshPositions,
      isLoading: state.isLoading,
      lastFetchLogin: state.lastFetchLogin,
      hydratedLogin: state.hydratedLogin,
      lastError: state.lastError,
    })),
  );
  const primePositionSnapshot = usePositionsState((state) => state.primePositionSnapshot);
  const resolvedLogin = resolveTradingLogin();

  const fetchPositions = useCallback(async () => {
    const mt5Login = resolveTradingLogin();
    if (!mt5Login) {
      return;
    }

    await refreshPositions(String(mt5Login));
  }, [refreshPositions]);

  // Initial fetch when the account login is first available. After that,
  // live position updates flow through the websocket/store pipeline.
  useEffect(() => {
    if (resolvedLogin) {
      fetchPositions();
    }
  }, [resolvedLogin, fetchPositions]);

  const pnlCurrency = useTradingState((state: any) => state.account?.currency || 'USD');
  const totalVolume = positions.reduce((sum, p) => sum + (p.volume || 0), 0);

  const showBulkSheet = useCallback(() => {
    showActionSheet({
      title: t('Bulk Operations'),
      actions: [
        { label: t('Close All Positions'), danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'all' } }) },
        { label: t('Close Profitable Positions'), danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'profitable' } }) },
        { label: t('Close Losing Positions'), danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'losing' } }) },
        { label: t('Close Buy Positions'), danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'buy' } }) },
        { label: t('Close BTCUSD Positions'), danger: true, onPress: () => router.push({ pathname: '/trade/bulk', params: { mode: 'symbol:BTCUSD' } }) },
      ],
    });
  }, [showActionSheet, t]);

  const showPositionSheet = useCallback((item: PositionItem) => {
    showActionSheet({
      title: `#${item.id} ${item.symbol.replace(/\//g, '')} ${item.side} ${(item.volume || 0).toFixed(2)}`,
      actions: [
        { label: t('Close position'), danger: true, onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/close-position', params: { positionId: item.id } }); } },
        { label: t('Close By'), danger: true, onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/close-by', params: { positionId: item.id } }); } },
        { label: t('Modify position'), onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/modify-position', params: { positionId: item.id } }); } },
        { label: t('Trade'), onPress: () => { prefetchOrderTicketData(String(resolvedLogin ?? ''), item.symbol); router.push({ pathname: '/trade/order-ticket', params: { symbol: item.symbol } }); } },
        { label: t('Chart'), onPress: () => { setChartSymbol(item.symbol); router.push('/(tabs)/chart'); } },
        { label: t('Bulk Operations...'), onPress: () => showBulkSheet() },
      ],
    });
  }, [primePositionSnapshot, resolvedLogin, setChartSymbol, showActionSheet, showBulkSheet, t]);

  const renderPositionRow = useCallback(({ item }: { item: PositionItem }) => (
    <TradePositionRow
      item={item}
      onPress={showPositionSheet}
      onLongPress={showPositionSheet}
      onBulkPress={showBulkSheet}
      pnlCurrency={pnlCurrency}
    />
  ), [pnlCurrency, showBulkSheet, showPositionSheet]);

  return (
    <Screen noBottomInset style={isDark ? { backgroundColor: '#06080D' } : undefined}>
      <AppHeader title={t('Trade')} noBorder />
      <TradeSummaryHeader
        positions={positions}
        hydratedLogin={hydratedLogin}
        resolvedLogin={resolvedLogin}
        s={s}
        T={T}
        isDark={isDark}
        totalVolume={totalVolume}
        onBulkPress={showBulkSheet}
      />
      <FlatList
        style={s.list}
        data={positions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        renderItem={renderPositionRow}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={T.textDimmed} />
            <Text style={[s.emptyTitle, { color: T.textMuted }]}>
              {isLoading ? t('Loading positions...') : t('No open positions')}
            </Text>
            <Text style={[s.emptySub, { color: T.textDimmed }]}>
              {lastError
                ? `${t('Account')} ${lastFetchLogin ?? resolvedLogin ?? t('unknown')}: ${getTradingErrorOriginLabel(lastError.origin)}. ${lastError.title}: ${lastError.message}`
                : resolvedLogin
                  ? `${t('Account')} ${resolvedLogin}: ${t('your active trades will appear here')}`
                  : t('Waiting for active trading account')}
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
  // Premium dark palette: matches the QuotesScreen rotation. Deep slate-black
  // screen background with a subtly elevated card surface for clear depth.
  const cardBg = isDark ? '#0E141F' : T.glass2;
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: 32 },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#2563EB' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.08,
      shadowRadius: isDark ? 16 : 24, elevation: 4, overflow: 'hidden',
    },
    summaryTop: {
      paddingHorizontal: spacing.md, paddingVertical: 14,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: 'transparent',
    },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floating: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5, marginTop: 2 },
    floatingPositive: { color: T.up },
    floatingNegative: { color: T.down },
    summaryHint: { marginTop: 4, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    summaryMetrics: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
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
    positionsTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
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
    balanceQuickLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    balanceQuickValue: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5, marginTop: 2 },
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
