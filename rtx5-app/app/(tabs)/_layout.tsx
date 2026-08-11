import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import type { NavigationHelpers, ParamListBase } from '@react-navigation/native';
import { PlatformPressable } from '@react-navigation/elements';
import { usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { View, StyleSheet, Text, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/ui/components/ActionSheet';
import { useThemeMode } from '../../src/state/themeMode';
import { GDark, GLight } from '../../src/ui/theme/glass';
import { useTranslation } from '../../src/i18n/useTranslation';
import { warmActionRoutes } from '../../src/utils/actionRouteWarmup';
import { resolveBottomTabBarHeight } from '../../src/ui/layout/bottomTabBar';
import {
  registerSidebarTabNavigationHandler,
  type SidebarMountedTabPath,
} from '../../src/ui/components/sidebarDrawerController';
import {
  hideSidebarDestination,
  sidebarDestinationController,
} from '../../src/ui/components/sidebarDestinationHostController';
import { hideChartSettingsHost } from '../../src/features/chart/chartSettingsHostController';
import { hideChartConfigDestination } from '../../src/features/chart/chartConfigDestinationController';
import { hideAboutDetailDestination } from '../../src/features/settings/aboutDetailDestinationController';
import { hideHistoryFilterHost } from '../../src/features/history/historyFilterHostController';
import {
  hideTradePositionActionHost,
  tradePositionActionHostController,
} from '../../src/features/trade/tradePositionActionHostController';
import { OrderTicketLaunchHost } from '../../src/features/trade/OrderTicketLaunchHost';
import { TradeTabFloatingPnl } from '../../src/features/trade/TradeTabFloatingPnl';
import { QuotesSymbolActionSheetHost } from '../../src/features/quotes/QuotesSymbolActionSheet';
import { requestOrrnnDemoTradeAuth } from '../../src/features/trade/tradeAuthPrompt';
import { useUserPreferences } from '../../src/state/userPreferences';
import { prefetchChartSelectionHistory } from '../../src/utils/navigationPrefetch';
import { scheduleIdleWork } from '../../src/utils/startupScheduler';
import {
  ChartTradeFeedbackPortalHost,
  ChartTradeSheetPortalHost,
  ChartTradeSheetPortalProvider,
} from '../../src/ui/navigation/ChartTradeSheetPortal';

import { FastTabs as Tabs } from '../../src/ui/navigation/FastTabNavigator';
import {
  registerFastTabSidebarChromeApplier,
  scheduleFastTabNavigation,
  showFastTabVisual,
  TAB_BAR_NAVIGATION_SETTLE_DELAY_MS,
  type FastTabRouteName,
} from '../../src/ui/navigation/fastTabVisualController';

const icons = {
  quotes: 'swap-vertical-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const tabLabelKeys: Record<FastTabRouteName, string> = {
  quotes: 'Quotes',
  chart: 'Chart',
  trade: 'Trade',
  history: 'History',
  settings: 'Settings',
};

const TAB_SWITCH_MAX_LATENCY_MS = 20;
const STALE_TAB_SWITCH_SAMPLE_MS = 5000;
// Wide enough to absorb a double-fired press event from one physical tap,
// short enough that a deliberate return tap (A -> B -> A) is never swallowed.
// 1500ms silently dropped rapid back-and-forth switches on the bottom menu.
const TAB_PRESS_DEDUP_WINDOW_MS = 350;
const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS = 500;
const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS = 1500;
const recentTabPresses = new Map<string, number>();
type TabPressEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPress']>>[0];
type TabPressInEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0];
type TabTouchEvent = GestureResponderEvent;
type FastTabBarButtonProps = BottomTabBarButtonProps & {
  latencyLabel?: string;
  routeName: FastTabRouteName;
  label: string;
  activeColor: string;
  inactiveColor: string;
  isLandscape: boolean;
};

type FastTabVisualItemProps = {
  routeName: FastTabRouteName;
  label: string;
  activeColor: string;
  inactiveColor: string;
  isLandscape: boolean;
  initiallyActive: boolean;
};

const renderTabIcon = (routeName: FastTabRouteName, color: string) => routeName === 'chart'
  ? <MaterialIcons name="candlestick-chart" size={27} color={color} />
  : (
    <Ionicons
      name={icons[routeName as keyof typeof icons] ?? 'ellipse-outline'}
      size={25}
      color={color}
    />
  );

/**
 * Keeps each tab's icon and label inside the same native opacity layer.
 * A visual-route change can therefore never composite one as active without
 * the other, even when taps arrive faster than React Navigation can commit.
 */
const FastTabVisualItem = memo(function FastTabVisualItem({
  routeName,
  label,
  activeColor,
  inactiveColor,
  isLandscape,
  initiallyActive,
}: FastTabVisualItemProps) {
  const activeLayerRef = useRef<View>(null);
  const inactiveLayerRef = useRef<View>(null);
  const applyVisualRoute = useCallback((visualRouteName: FastTabRouteName) => {
    const active = visualRouteName === routeName;
    activeLayerRef.current?.setNativeProps({
      style: [
        styles.tabVisualItemLayer,
        isLandscape && styles.tabVisualItemLayerLandscape,
        { opacity: active ? 1 : 0 },
      ],
    });
    inactiveLayerRef.current?.setNativeProps({
      style: [
        styles.tabVisualItemLayer,
        isLandscape && styles.tabVisualItemLayerLandscape,
        { opacity: active ? 0 : 1 },
      ],
    });
  }, [isLandscape, routeName]);

  useLayoutEffect(
    () => registerFastTabSidebarChromeApplier(applyVisualRoute),
    [applyVisualRoute],
  );

  const renderPresentation = (color: string) => (
    <>
      <View style={styles.tabIconSlot}>
        {renderTabIcon(routeName, color)}
      </View>
      {routeName === 'trade' ? (
        // MT5 parity: with open positions the label reads the live floating
        // P/L (green/red); the word "Trade" returns when the account is flat.
        <TradeTabFloatingPnl
          fallbackLabel={label}
          fallbackColor={color}
          labelStyle={[
            styles.tabLabel,
            isLandscape && styles.tabLabelLandscape,
          ]}
        />
      ) : (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.tabLabel,
            isLandscape && styles.tabLabelLandscape,
            { color },
          ]}
        >
          {label}
        </Text>
      )}
    </>
  );

  return (
    <View
      collapsable={false}
      pointerEvents="none"
      style={styles.tabVisualItemRoot}
    >
      <View
        ref={inactiveLayerRef}
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.tabVisualItemLayer,
          isLandscape && styles.tabVisualItemLayerLandscape,
          { opacity: initiallyActive ? 0 : 1 },
        ]}
      >
        {renderPresentation(inactiveColor)}
      </View>
      <View
        ref={activeLayerRef}
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.tabVisualItemLayer,
          isLandscape && styles.tabVisualItemLayerLandscape,
          { opacity: initiallyActive ? 1 : 0 },
        ]}
      >
        {renderPresentation(activeColor)}
      </View>
    </View>
  );
});

const getNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

function scheduleTabSwitchBudgetCheck(label: string, startedAtMs: number, navigationFinishedAtMs: number) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  const runAfterFirstFrame: (callback: (time: number) => void) => number = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame
    : (callback) => {
      setTimeout(() => callback(getNow()), 16);
      return 0;
    };

  runAfterFirstFrame(() => {
    const elapsedMs = getNow() - startedAtMs;
    if (elapsedMs > STALE_TAB_SWITCH_SAMPLE_MS) {
      return;
    }
    console.info(`[TabTiming] ${label} first frame ${Math.round(elapsedMs)}ms`);
    if (elapsedMs > TAB_SWITCH_MAX_LATENCY_MS) {
      const navigationMs = Math.max(0, navigationFinishedAtMs - startedAtMs);
      console.warn(
        `[Tabs] ${label} first frame took ${Math.round(elapsedMs)}ms; ` +
        `sync navigation ${Math.round(navigationMs)}ms; budget is ${TAB_SWITCH_MAX_LATENCY_MS}ms.`,
      );
    }
  });
}

/**
 * Handles a bottom-menu tap as soon as the finger goes down.
 * It shows the selected screen first, then updates the real navigation route.
 */
const FastTabBarButton = memo(function FastTabBarButton({
  latencyLabel = 'bottom tab',
  routeName,
  label,
  activeColor,
  inactiveColor,
  isLandscape,
  children: _children,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: FastTabBarButtonProps) {
  const pressStartedAtRef = useRef<number | null>(null);
  const handledOnPressInRef = useRef(false);

  const runTabPress = useCallback((event: TabPressEvent) => {
    const startedAtMs = pressStartedAtRef.current ?? getNow();
    pressStartedAtRef.current = null;
    const lastHandledAtMs = recentTabPresses.get(latencyLabel);
    if (lastHandledAtMs !== undefined && startedAtMs - lastHandledAtMs < TAB_PRESS_DEDUP_WINDOW_MS) {
      return;
    }
    recentTabPresses.set(latencyLabel, startedAtMs);
    if (
      routeName === 'trade'
      && requestOrrnnDemoTradeAuth({ kind: 'trade-tab' })
    ) {
      return;
    }
    if (routeName === 'chart') {
      const preferences = useUserPreferences.getState();
      // Dispatch before the retained Chart route is revealed. This joins the
      // idle startup request when present and covers a very early first tap.
      void prefetchChartSelectionHistory(
        preferences.chartSymbol,
        preferences.chartTimeframe,
      );
    }
    useUIState.getState().hideActionSheet();
    // Step 1: show the already-mounted screen immediately.
    const visualRevision = showFastTabVisual(latencyLabel);
    (event as TabPressEvent & { persist?: () => void }).persist?.();
    if (visualRevision !== null) {
      // A bottom-menu tap has no drawer animation to wait for.
      // Step 2: after that screen paints, make the real route match it.
      scheduleFastTabNavigation(visualRevision, () => onPress?.(event), TAB_BAR_NAVIGATION_SETTLE_DELAY_MS);
    } else {
      onPress?.(event);
    }
    scheduleTabSwitchBudgetCheck(latencyLabel, startedAtMs, getNow());
  }, [latencyLabel, onPress, routeName]);

  const handleTouchStart = useCallback((_event: TabTouchEvent) => {
    handledOnPressInRef.current = false;
    pressStartedAtRef.current = getNow();
  }, []);

  const handlePressIn = useCallback((event: TabPressInEvent) => {
    pressStartedAtRef.current = pressStartedAtRef.current ?? getNow();
    onPressIn?.(event);
    // Start the tab change on touch-down instead of waiting for finger release.
    if (onPress && !handledOnPressInRef.current) {
      handledOnPressInRef.current = true;
      runTabPress(event as TabPressEvent);
    }
  }, [onPress, onPressIn, runTabPress]);

  const handlePress: NonNullable<BottomTabBarButtonProps['onPress']> = useCallback((event) => {
    if (handledOnPressInRef.current) {
      handledOnPressInRef.current = false;
      return;
    }
    runTabPress(event);
  }, [runTabPress]);

  const handlePressOut: NonNullable<BottomTabBarButtonProps['onPressOut']> = useCallback((event) => {
    onPressOut?.(event);
    pressStartedAtRef.current = null;
  }, [onPressOut]);

  return (
    <PlatformPressable
      {...props}
      accessibilityLabel={label}
      onTouchStart={handleTouchStart}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      unstable_pressDelay={0}
    >
      <FastTabVisualItem
        routeName={routeName}
        label={label}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
        isLandscape={isLandscape}
        initiallyActive={props['aria-selected'] === true}
      />
    </PlatformPressable>
  );
});

const GlobalActionSheetHost = memo(function GlobalActionSheetHost() {
  const actionSheet = useUIState((s) => s.actionSheet);
  const preloadConfig = useUIState((s) => s.preloadedActionSheet);
  const scopedActionSheets = useUIState((s) => s.scopedActionSheets);
  const preloadedScopedActionSheets = useUIState((s) => s.preloadedScopedActionSheets);
  const actionSheetScope = useUIState((s) => s.actionSheetScope);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const hideScopedActionSheet = useUIState((s) => s.hideScopedActionSheet);

  const scopedActionSheet = actionSheetScope ? scopedActionSheets[actionSheetScope] : null;
  const scopedPreloadConfig = actionSheetScope
    ? preloadedScopedActionSheets[actionSheetScope]
    : Object.values(preloadedScopedActionSheets).find(Boolean) ?? null;
  const activeConfig = actionSheet || scopedActionSheet || scopedPreloadConfig || preloadConfig;
  const visible = actionSheet !== null || scopedActionSheet !== null;
  const handleClose = useCallback(() => {
    if (actionSheet !== null) {
      hideActionSheet();
      return;
    }
    if (actionSheetScope) {
      hideScopedActionSheet(actionSheetScope);
      return;
    }
    hideActionSheet();
  }, [actionSheet, actionSheetScope, hideActionSheet, hideScopedActionSheet]);

  return (
    <ActionSheet
      visible={visible}
      title={activeConfig?.title}
      titleAlign={activeConfig?.titleAlign}
      compactText={activeConfig?.compactText}
      presentation={activeConfig?.presentation}
      showActionIcons={activeConfig?.showActionIcons}
      deferOffscreenActions={activeConfig?.deferOffscreenActions}
      maximumVisibleActionRows={activeConfig?.maximumVisibleActionRows}
      actions={activeConfig?.actions ?? []}
      onClose={handleClose}
      searchable={activeConfig?.searchable}
      searchPlaceholder={activeConfig?.searchPlaceholder}
      detent={activeConfig?.detent}
      minimumTopInset={activeConfig?.minimumTopInset}
      instantOpen={activeConfig?.instantOpen}
      entryMotion={activeConfig?.entryMotion}
      immediateHostHideOnClose={activeConfig?.immediateHostHideOnClose}
      visualKey={activeConfig?.visualKey}
      runActionAfterClose={activeConfig?.runActionAfterClose}
      androidKeyboardAvoidance={activeConfig?.androidKeyboardAvoidance}
      keepFullHeightOnKeyboard={activeConfig?.keepFullHeightOnKeyboard}
    />
  );
});

/**
 * Starts the logged-out Chart baseline from the lightweight tabs shell.
 *
 * Keeping this outside the retained Chart tree means its network dispatch is
 * not delayed by that screen's large initial render. It also survives Chart
 * surface lifecycle changes while Quotes remains visible. QueryClient owns
 * deduplication, so a very early Chart press safely joins this same request.
 */
const AnonymousChartHistoryStartupPrefetch = memo(function AnonymousChartHistoryStartupPrefetch() {
  const hasHydrated = useUserPreferences((state) => state.hasHydrated);
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const chartSymbol = useUserPreferences((state) => state.chartSymbol);
  const chartTimeframe = useUserPreferences((state) => state.chartTimeframe);
  const dispatchedKeyRef = useRef('');

  useEffect(() => {
    const normalizedSymbol = chartSymbol.trim().toUpperCase();
    const normalizedTimeframe = chartTimeframe.trim().toUpperCase();
    if (isLoggedIn || !hasHydrated || !normalizedSymbol || !normalizedTimeframe) {
      return undefined;
    }

    const prefetchKey = `${normalizedSymbol}:${normalizedTimeframe}`;
    if (dispatchedKeyRef.current === prefetchKey) {
      return undefined;
    }

    return scheduleIdleWork(
      () => {
        // Mark the key only when work really starts. If an intervening state
        // change cancels the idle callback, the next effect can reschedule it.
        dispatchedKeyRef.current = prefetchKey;
        void prefetchChartSelectionHistory(normalizedSymbol, normalizedTimeframe);
      },
      {
        delayMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS,
        timeoutMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS,
      },
    );
  }, [chartSymbol, chartTimeframe, hasHydrated, isLoggedIn]);

  return null;
});

function SidebarTabNavigationRegistrar({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation: NavigationHelpers<ParamListBase>;
}) {
  useEffect(() => registerSidebarTabNavigationHandler((path: SidebarMountedTabPath) => {
    navigation.navigate(path.slice(1));
  }), [navigation]);

  return <>{children}</>;
}

// Thin wrapper: derive the tab-bar inputs from the path here so the memoized
// navigator below does not reconcile on every route change. Pushing a sidebar
// detail over an already-active detail keeps both props stable, so the whole
// Tabs subtree (5 mounted screens) skips reconciliation on those navigations.
/**
 * Main navigator configuring the bottom tab/menu bar. Handles routing between primary sections (Quotes, Chart, Trade, History, Settings).
 */
export default function TabsLayout() {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      const hostedDestination = sidebarDestinationController.getSnapshot();
      const isRestoringAccountsFromBrokerFlow =
        hostedDestination.activeDestination === 'accounts'
        && hostedDestination.source === 'route-sync';

      // A hosted sidebar page may push a normal stack route (for example,
      // About -> Privacy Policy). Reveal that real route as soon as its path
      // changes instead of leaving the independent fast host over it.
      // Broker-flow Back is the inverse handoff: it deliberately restores the
      // retained Accounts screen before the native route pops. The tabs tree
      // can be frozen while root-stack routes are above it, so its remembered
      // previous pathname is not reliable proof of that handoff. The explicit
      // route-sync ownership is the stable signal.
      if (!isRestoringAccountsFromBrokerFlow) {
        hideSidebarDestination();
      }
      // Chart Preferences is a retained overlay (no route push). Clear it when
      // the user leaves the chart tab / navigates elsewhere so it never sticks.
      hideChartConfigDestination();
      hideChartSettingsHost();
      hideAboutDetailDestination();
      hideHistoryFilterHost();
      hideTradePositionActionHost();
      const uiState = useUIState.getState();
      const visibleScopedActionSheet = uiState.actionSheetScope
        ? uiState.scopedActionSheets[uiState.actionSheetScope] !== null
        : false;

      if (uiState.actionSheet !== null || visibleScopedActionSheet) {
        useUIState.getState().hideActionSheet();
      }
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return (
    <TabsLayoutInner isChartTab={isChartTab} />
  );
}

/**
 * Theme-dependent tab chrome only. Kept outside the retained tab screens and
 * launch hosts so a theme tap does not re-render Quotes/Chart/Trade trees.
 */
const ThemedTabsChrome = memo(function ThemedTabsChrome({
  isChartTab,
}: {
  isChartTab: boolean;
}) {
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isChartInlineInputActive = useUIState((s) => s.isChartInlineInputActive);
  const chartTabBarKeyboardLift = useUIState((s) => s.chartTabBarKeyboardLift);
  const tradePositionActionSnapshot = useSyncExternalStore(
    tradePositionActionHostController.subscribe,
    tradePositionActionHostController.getSnapshot,
    tradePositionActionHostController.getSnapshot,
  );
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const T = themeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const renderTabsLayout = useCallback(({
    children,
    navigation,
  }: {
    children: ReactNode;
    navigation: NavigationHelpers<ParamListBase>;
  }) => (
    <SidebarTabNavigationRegistrar navigation={navigation}>
      {children}
    </SidebarTabNavigationRegistrar>
  ), []);

  const isLandscape = width > height;
  const shouldHideMenu =
    (isChartFullscreen && isChartTab) ||
    (isChartTab && isChartInlineInputActive) ||
    isSearchActive;
  const shouldConcealMenuForTradeAction = tradePositionActionSnapshot.visible;
  const shouldLiftChartTabBar =
    isChartTab &&
    !shouldHideMenu &&
    chartTabBarKeyboardLift > 0;

  const tabBarHeight = resolveBottomTabBarHeight({
    safeAreaBottom: insets.bottom,
    isChartTab,
    isLandscape,
  });

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: isDark ? T.bg : '#ffffff',
      borderTopColor: isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)',
      borderTopWidth: 1,
      height: tabBarHeight,
      paddingTop: isLandscape ? 4 : 8,
      paddingBottom: Math.max(insets.bottom, isLandscape ? 4 : 8),
    }),
    [T.bg, T.borderSubtle, insets.bottom, isDark, isLandscape, tabBarHeight],
  );
  const inactiveTabColor = isDark ? T.textMuted : T.textDimmed;
  const bottomTabActiveColor = T.trading.buy.primary;

  useEffect(() => warmActionRoutes(), []);

  return (
    <Tabs
      layout={renderTabsLayout}
      backBehavior='firstRoute'
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: shouldHideMenu
          ? { display: 'none' }
          : [
            tabBarStyle,
            shouldConcealMenuForTradeAction && {
              opacity: 0,
              transform: [{ translateY: tabBarHeight }],
            },
            shouldLiftChartTabBar && {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: chartTabBarKeyboardLift + Math.max(insets.bottom, 0),
            },
          ],
        tabBarActiveTintColor: bottomTabActiveColor,
        tabBarInactiveTintColor: inactiveTabColor,
        tabBarIcon: () => null,
        tabBarLabel: () => null,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarItemStyle: { backgroundColor: 'transparent' },
        tabBarHideOnKeyboard: !isChartTab,
        tabBarButton: (props) => (
          <FastTabBarButton
            {...props}
            latencyLabel={route.name}
            routeName={route.name as FastTabRouteName}
            label={t(tabLabelKeys[route.name as FastTabRouteName])}
            activeColor={bottomTabActiveColor}
            inactiveColor={inactiveTabColor}
            isLandscape={isLandscape}
          />
        ),
        lazy: false,
      })}
    >
      <Tabs.Screen name='quotes' options={{ title: t('Quotes') }} />
      <Tabs.Screen
        name='chart'
        options={{
          title: t('Chart'),
          lazy: false,
        }}
      />
      <Tabs.Screen name='trade' options={{ title: t('Trade') }} />
      <Tabs.Screen name='history' options={{ title: t('History') }} />
      <Tabs.Screen name='settings' options={{ title: t('Settings') }} />
    </Tabs>
  );
});

const TabsLayoutInner = memo(function TabsLayoutInner({
  isChartTab,
}: {
  isChartTab: boolean;
}) {
  // Theme is confined to ThemedTabsChrome so launch hosts and tab bodies are
  // not reconciled on every light/dark press.
  return (
    <View style={styles.root}>
      <ChartTradeSheetPortalProvider>
        <AnonymousChartHistoryStartupPrefetch />
        <ThemedTabsChrome isChartTab={isChartTab} />
        <ChartTradeSheetPortalHost />
        {/* Trade receipts / result dialogs stack above the sheet entry. */}
        <ChartTradeFeedbackPortalHost />
        <OrderTicketLaunchHost />
        <GlobalActionSheetHost />
        <QuotesSymbolActionSheetHost />
      </ChartTradeSheetPortalProvider>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabVisualItemRoot: {
    alignSelf: 'stretch',
    flex: 1,
  },
  tabVisualItemLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  tabVisualItemLayerLandscape: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  tabIconSlot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 31,
  },
  tabLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabLabelLandscape: {
    marginBottom: 0,
  },
});
