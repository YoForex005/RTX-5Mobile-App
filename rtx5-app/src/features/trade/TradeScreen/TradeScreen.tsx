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
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { Text, View, FlatList } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { useTranslation } from '../../../i18n/useTranslation';
import { TradePositionRow } from '../../../ui/components/TradePositionRow';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useUserPreferences } from '../../../state/userPreferences';
import { useIsDarkTheme } from '../../../state/themeMode';
import { usePositionsState } from '../../../state/positionsState';
import { useTradingState } from '../../../state/tradingState';
import { resolveTradingLogin } from '../../../state/tradingLogin';
import { isRenderablePositionSymbol } from '../../../state/positionsMapper';
import { dedupePositionsById } from '../../../state/positionsState.helpers';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUIState } from '../../../state/uiState';
import { getTradingErrorOriginLabel } from '../../../api/tradingErrors';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import { runImmediateAction } from '../../../utils/actionLatency';
import { TradeSummaryHeader } from './SummaryHeader';
import { makeTradeScreenStyles } from './styles';

const TRADE_FOCUS_WORK_DELAY_MS = 650;

function scheduleTradeFocusWork(action: () => void) {
  let frameId: number | null = null;
  const timerId = setTimeout(() => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(action);
      return;
    }
    action();
  }, TRADE_FOCUS_WORK_DELAY_MS);

  return () => {
    clearTimeout(timerId);
    if (frameId !== null) {
      globalThis.cancelAnimationFrame?.(frameId);
    }
  };
}

export function TradeScreen() {
  const isScreenFocused = useIsFocused();
  const [focusWorkReady, setFocusWorkReady] = useState(false);
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const s = useMemo(() => makeTradeScreenStyles(T, isDark), [T, isDark]);

  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const showTradeActionSheet = useUIState((st) => st.showTradeActionSheet);

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

  useEffect(() => {
    if (!isScreenFocused) {
      setFocusWorkReady(false);
      return;
    }

    let cancelled = false;
    const cancelFocusWork = scheduleTradeFocusWork(() => {
      if (!cancelled) {
        setFocusWorkReady(true);
      }
    });

    return () => {
      cancelled = true;
      cancelFocusWork();
    };
  }, [isScreenFocused]);

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
    if (focusWorkReady && resolvedLogin) {
      fetchPositions();
    }
  }, [focusWorkReady, resolvedLogin, fetchPositions]);

  const pnlCurrency = useTradingState((state: any) => state.account?.currency || 'USD');
  const renderablePositions = useMemo(
    () => dedupePositionsById(positions.filter((position) => isRenderablePositionSymbol(position.symbol))),
    [positions],
  );
  const totalVolume = renderablePositions.reduce((sum, p) => sum + (p.volume || 0), 0);

  const navigateToBulkMode = useCallback((mode: string) => {
    router.push({ pathname: '/trade/bulk', params: { mode } });
  }, []);

  const bulkActionSheetConfig = useMemo<Parameters<typeof showTradeActionSheet>[0]>(() => {
    const actions: Parameters<typeof showTradeActionSheet>[0]['actions'] = [
      { label: t('Close All Positions'), danger: true, onPress: () => navigateToBulkMode('all') },
      { label: t('Close Profitable Positions'), danger: true, onPress: () => navigateToBulkMode('profitable') },
      { label: t('Close Losing Positions'), danger: true, onPress: () => navigateToBulkMode('losing') },
      { label: t('Close Buy Positions'), danger: true, onPress: () => navigateToBulkMode('buy') },
    ];

    return {
      title: t('Bulk Operations'),
      detent: 'auto',
      instantOpen: true,
      actions,
    };
  }, [navigateToBulkMode, showTradeActionSheet, t]);

  const showBulkSheet = useCallback(() => {
    runImmediateAction('trade.bulkSheet.open', () => showTradeActionSheet(bulkActionSheetConfig));
  }, [bulkActionSheetConfig, showTradeActionSheet]);

  const showPositionSheet = useCallback((item: PositionItem) => {
    runImmediateAction('trade.positionSheet.open', () =>
      showTradeActionSheet({
        title: `#${item.id} ${item.symbol.replace(/\//g, '')} ${item.side} ${(item.volume || 0).toFixed(2)}`,
        detent: 'adaptive',
        instantOpen: true,
        actions: [
          { label: t('Close position'), danger: true, onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/close-position', params: { positionId: item.id } }); } },
          { label: t('Close By'), danger: true, onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/close-by', params: { positionId: item.id } }); } },
          { label: t('Modify position'), onPress: () => { primePositionSnapshot(item); router.push({ pathname: '/trade/modify-position', params: { positionId: item.id } }); } },
          { label: t('Trade'), onPress: () => { prefetchOrderTicketData(String(resolvedLogin ?? ''), item.symbol); router.push({ pathname: '/trade/order-ticket', params: { symbol: item.symbol } }); } },
          { label: t('Chart'), onPress: () => { setChartSymbol(item.symbol); router.push('/(tabs)/chart'); } },
        ],
      }),
    );
  }, [primePositionSnapshot, resolvedLogin, setChartSymbol, showTradeActionSheet, t]);

  const renderPositionRow = useCallback(({ item }: { item: PositionItem }) => (
    <TradePositionRow
      item={item}
      onPress={showPositionSheet}
      onLongPress={showPositionSheet}
      onBulkPress={showBulkSheet}
      pnlCurrency={pnlCurrency}
    />
  ), [pnlCurrency, showBulkSheet, showPositionSheet]);

  if (!focusWorkReady) {
    return (
      <Screen noBottomInset style={isDark ? { backgroundColor: '#06080D' } : undefined}>
        <AppHeader title={t('Trade')} noBorder />
        <View style={[s.summaryBlock, { borderLeftWidth: 1, borderLeftColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
          <View style={s.summaryTop}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.textSub, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {t('Floating P/L')}
              </Text>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: T.up,
                  letterSpacing: 0,
                  fontVariant: ['tabular-nums'],
                  textAlign: 'right',
                }}
              >
                +0.00 {pnlCurrency}
              </Text>
            </View>
          </View>
        </View>
        <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
          <View style={s.positionsHeaderLeft}>
            <View style={[s.positionsAccentBar, { backgroundColor: T.accent }]} />
            <View>
              <View style={s.positionsTitleRow}>
                <Text style={[s.positionsTitle, { color: T.text }]}>{t('Positions')}</Text>
              </View>
              <Text style={[s.positionsMeta, { color: T.textMuted }]}>
                0 {t('open')} · 0.00 {t('lots')}
              </Text>
            </View>
          </View>
        </View>
      </Screen>
    );
  }

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
        active={focusWorkReady}
      />
      <FlatList
        keyboardShouldPersistTaps="always"
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
