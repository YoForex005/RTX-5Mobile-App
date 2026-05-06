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
import React, { useMemo, useEffect, useCallback } from 'react';
import { Text, View, FlatList } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { useTranslation } from '../../../i18n/useTranslation';
import { TradePositionRow } from '../../../ui/components/TradePositionRow';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useUserPreferences } from '../../../state/userPreferences';
import { usePositionsState } from '../../../state/positionsState';
import { useTradingState } from '../../../state/tradingState';
import { resolveTradingLogin } from '../../../state/tradingLogin';
import { isRenderablePositionSymbol } from '../../../state/positionsMapper';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUIState } from '../../../state/uiState';
import { getTradingErrorOriginLabel } from '../../../api/tradingErrors';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import { TradeSummaryHeader } from './SummaryHeader';
import { makeTradeScreenStyles } from './styles';

export function TradeScreen() {
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const s = useMemo(() => makeTradeScreenStyles(T, isDark), [T, isDark]);

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
  const renderablePositions = useMemo(
    () => positions.filter((position) => isRenderablePositionSymbol(position.symbol)),
    [positions],
  );
  const totalVolume = renderablePositions.reduce((sum, p) => sum + (p.volume || 0), 0);

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
        positions={renderablePositions}
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
        data={renderablePositions}
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
        ListFooterComponent={renderablePositions.length > 0 ? (
          <>
            {/* ── Top Exposures ── */}
          </>
        ) : null}
      />
    </Screen>
  );
}
