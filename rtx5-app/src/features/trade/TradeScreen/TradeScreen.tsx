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
import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
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
import { useResolvedTradingLogin } from '../../../state/tradingLogin';
import { isRenderablePositionSymbol } from '../../../state/positionsMapper';
import { dedupePositionsById } from '../../../state/positionsState.helpers';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUIState } from '../../../state/uiState';
import { getTradingErrorOriginLabel } from '../../../api/tradingErrors';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import { runImmediateAction } from '../../../utils/actionLatency';
import { useDeferredActiveFlag } from '../../../hooks/useDeferredActiveFlag';
import { TradeSummaryHeader } from './SummaryHeader';
import { makeTradeScreenStyles } from './styles';

// Render only the first screenful of trade rows first. This prevents 15-30 open
// positions from all mounting and subscribing to live quotes before the user scrolls.
const TRADE_INITIAL_POSITION_RENDER_COUNT = 5;
const TRADE_POSITION_RENDER_BATCH_SIZE = 5;
const TRADE_POSITION_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 };
// Live WS quote subscriptions activate quickly so values tick almost immediately
// on open, MT5-style. Visible rows own their fast tick listeners; the header keeps
// a lightweight aggregate subscription for Floating P/L.
const TRADE_SCREEN_LIVE_DELAY_MS = 0;
// The REST positions re-fetch stays deferred so quick tab visits don't hammer the
// slow /positions endpoint on every focus (cached positions hydrate instantly).
const TRADE_SCREEN_FETCH_DELAY_MS = 8000;

function areStringSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }

  return true;
}

export function TradeScreen() {
  const isScreenFocused = useIsFocused();
  const [viewablePositionIds, setViewablePositionIds] = useState<Set<string>>(() => new Set());
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const s = useMemo(() => makeTradeScreenStyles(T, isDark), [T, isDark]);

  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const showTradeActionSheet = useUIState((st) => st.showTradeActionSheet);
  const sidebarOpen = useUIState((st) => st.sidebarOpen);

  const { positions, refreshPositions, hydrateCachedPositions, isLoading, lastFetchLogin, hydratedLogin, lastError } = usePositionsState(
    useShallow((state) => ({
      positions: state.positions,
      refreshPositions: state.refreshPositions,
      hydrateCachedPositions: state.hydrateCachedPositions,
      isLoading: state.isLoading,
      lastFetchLogin: state.lastFetchLogin,
      hydratedLogin: state.hydratedLogin,
      lastError: state.lastError,
    })),
  );
  const primePositionSnapshot = usePositionsState((state) => state.primePositionSnapshot);
  // Use the reactive login hook here. If the Trade tab is already mounted while
  // login state hydrates, this rerenders immediately and starts cache/fetch work.
  const resolvedLogin = useResolvedTradingLogin();

  const fetchPositions = useCallback(async () => {
    if (!resolvedLogin) {
      return;
    }

    await refreshPositions(String(resolvedLogin));
  }, [refreshPositions, resolvedLogin]);

  // Cache hydration is cheap and lets the Trade tab show the last known real
  // positions immediately, while the focused screen fetch below verifies them.
  useEffect(() => {
    if (resolvedLogin) {
      void hydrateCachedPositions(String(resolvedLogin));
    }
  }, [hydrateCachedPositions, resolvedLogin]);

  const [firstPaintReady, setFirstPaintReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    const markReady = () => {
      if (!cancelled) {
        setFirstPaintReady(true);
      }
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(markReady);
    } else {
      const timerId = setTimeout(markReady, 16);
      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, []);

  // Live quote subscriptions come alive fast; the slow REST re-fetch stays deferred.
  const tradeLiveActive = useDeferredActiveFlag(isScreenFocused && firstPaintReady && !sidebarOpen, TRADE_SCREEN_LIVE_DELAY_MS);
  const tradeFetchActive = useDeferredActiveFlag(isScreenFocused && firstPaintReady && !sidebarOpen, TRADE_SCREEN_FETCH_DELAY_MS);

  // Fetch only after the route has painted once so sidebar navigation is visual first,
  // then data refresh starts in the background.
  useEffect(() => {
    if (tradeFetchActive && resolvedLogin) {
      fetchPositions();
    }
  }, [tradeFetchActive, resolvedLogin, fetchPositions]);
  const positionRowsActive = tradeLiveActive;

  const pnlCurrency = useTradingState((state: any) => state.account?.currency || 'USD');
  const renderablePositions = useMemo(
    () => dedupePositionsById(positions.filter((position) => isRenderablePositionSymbol(position.symbol))),
    [positions],
  );
  const totalVolume = renderablePositions.reduce((sum, p) => sum + (p.volume || 0), 0);
  const rowActivationKey = useMemo(
    // FlatList rows are memoized, so this key tells them when their "live row"
    // status changed after scrolling.
    () => `${positionRowsActive ? '1' : '0'}:${Array.from(viewablePositionIds).sort().join('|')}`,
    [positionRowsActive, viewablePositionIds],
  );

  const handleViewablePositionRowsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: PositionItem | null }> }) => {
    // FlatList calls this as rows enter/leave the viewport. We store only the
    // visible ticket ids so newly visible rows can start live quote updates.
    const nextIds = new Set<string>();
    viewableItems.forEach(({ item }) => {
      if (item?.id !== undefined && item.id !== null) {
        nextIds.add(String(item.id));
      }
    });

    setViewablePositionIds((currentIds) => (
      areStringSetsEqual(currentIds, nextIds) ? currentIds : nextIds
    ));
  }).current;

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

  const renderPositionRow = useCallback(({ item, index }: { item: PositionItem; index: number }) => {
    // Keep the first visible batch live immediately; below-fold rows only start
    // quote subscriptions after FlatList reports that they are coming on screen.
    const rowActive = positionRowsActive && (
      index < TRADE_INITIAL_POSITION_RENDER_COUNT || viewablePositionIds.has(String(item.id))
    );

    return (
      <TradePositionRow
        item={item}
        onPress={showPositionSheet}
        onLongPress={showPositionSheet}
        onBulkPress={showBulkSheet}
        pnlCurrency={pnlCurrency}
        active={rowActive}
      />
    );
  }, [pnlCurrency, positionRowsActive, showBulkSheet, showPositionSheet, viewablePositionIds]);

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
        active={tradeLiveActive}
      />
      <FlatList
        keyboardShouldPersistTaps="always"
        style={s.list}
        data={renderablePositions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={TRADE_INITIAL_POSITION_RENDER_COUNT}
        maxToRenderPerBatch={TRADE_POSITION_RENDER_BATCH_SIZE}
        windowSize={2}
        updateCellsBatchingPeriod={80}
        removeClippedSubviews={true}
        viewabilityConfig={TRADE_POSITION_VIEWABILITY_CONFIG}
        onViewableItemsChanged={handleViewablePositionRowsChanged}
        extraData={rowActivationKey}
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
            {/* Top Exposures */}
          </>
        ) : null}
      />
    </Screen>
  );
}
