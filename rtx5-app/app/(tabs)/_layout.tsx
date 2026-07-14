import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import type { NavigationHelpers, ParamListBase } from '@react-navigation/native';
import { PlatformPressable } from '@react-navigation/elements';
import { usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
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
import { SidebarDestinationHost } from '../../src/ui/components/SidebarDestinationHost';
import {
  hideSidebarDestination,
  sidebarDestinationController,
} from '../../src/ui/components/sidebarDestinationHostController';
import { OrderTicketLaunchHost } from '../../src/features/trade/OrderTicketLaunchHost';
import { QuoteInfoLaunchHost } from '../../src/features/quotes/QuoteInfoLaunchHost';
import { BrokersLaunchHost } from '../../src/features/settings/BrokersLaunchHost';
import { FastTabs as Tabs } from '../../src/ui/navigation/FastTabNavigator';
import {
  scheduleFastTabNavigation,
  showFastTabVisual,
  TAB_BAR_NAVIGATION_SETTLE_DELAY_MS,
} from '../../src/ui/navigation/fastTabVisualController';

const icons = {
  quotes: 'swap-vertical-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const TAB_SWITCH_MAX_LATENCY_MS = 20;
const STALE_TAB_SWITCH_SAMPLE_MS = 5000;
const TAB_PRESS_DEDUP_WINDOW_MS = 1500;
const recentTabPresses = new Map<string, number>();
type TabPressEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPress']>>[0];
type TabPressInEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0];
type TabTouchEvent = GestureResponderEvent;
type FastTabBarButtonProps = BottomTabBarButtonProps & {
  latencyLabel?: string;
};

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
  }, [latencyLabel, onPress]);

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
      onTouchStart={handleTouchStart}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      unstable_pressDelay={0}
    />
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
  const activeConfig = actionSheet || scopedActionSheet || preloadConfig || scopedPreloadConfig;
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
      actions={activeConfig?.actions ?? []}
      onClose={handleClose}
      searchable={activeConfig?.searchable}
      searchPlaceholder={activeConfig?.searchPlaceholder}
      detent={activeConfig?.detent}
      minimumTopInset={activeConfig?.minimumTopInset}
      instantOpen={activeConfig?.instantOpen}
      runActionAfterClose={activeConfig?.runActionAfterClose}
      androidKeyboardAvoidance={activeConfig?.androidKeyboardAvoidance}
      keepFullHeightOnKeyboard={activeConfig?.keepFullHeightOnKeyboard}
    />
  );
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
      const previousPath = previousPathRef.current;
      const hostedDestination = sidebarDestinationController.getSnapshot();
      const isReturningFromBrokersToAccounts =
        previousPath === '/settings/brokers'
        && hostedDestination.activeDestination === 'accounts'
        && hostedDestination.source === 'route-sync';

      // A hosted sidebar page may push a normal stack route (for example,
      // About -> Privacy Policy). Reveal that real route as soon as its path
      // changes instead of leaving the independent fast host over it.
      // Brokers Back is the one inverse handoff: it deliberately restores the
      // retained Accounts screen underneath before the native route pops.
      if (!isReturningFromBrokersToAccounts) {
        hideSidebarDestination();
      }
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

const TabsLayoutInner = memo(function TabsLayoutInner({
  isChartTab,
}: {
  isChartTab: boolean;
}) {
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isChartInlineInputActive = useUIState((s) => s.isChartInlineInputActive);
  const chartTabBarKeyboardLift = useUIState((s) => s.chartTabBarKeyboardLift);
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const T = themeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
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
  const shouldLiftChartTabBar =
    isChartTab &&
    !shouldHideMenu &&
    chartTabBarKeyboardLift > 0;

  // Tab bar height adapts to the device's bottom inset (home indicator / pill)
  // Base: 56dp icon+label zone + real bottom inset + 2dp breathing room
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

  useEffect(() => warmActionRoutes(router), [router]);

  return (
    <View style={styles.root}>
      <Tabs
        layout={renderTabsLayout}
        // Back returns secondary tabs to Quotes without rebuilding the screens.
        backBehavior='firstRoute'
        // Keep all five main screens mounted, so taps and Back reuse them
        // instead of waiting for a screen to be created again.
        detachInactiveScreens={false}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: shouldHideMenu
            ? { display: 'none' }
            : [
              tabBarStyle,
              shouldLiftChartTabBar && {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: chartTabBarKeyboardLift + Math.max(insets.bottom, 0),
              },
            ],
          tabBarActiveTintColor: bottomTabActiveColor,
          tabBarInactiveTintColor: inactiveTabColor,
          tabBarIcon: ({ size, color }) => {
            if (route.name === 'chart') {
              return <MaterialIcons name="candlestick-chart" size={size + 2} color={color} />;
            }
            const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarLabel: ({ children, color }) => {
            return (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.tabLabel, isLandscape && styles.tabLabelLandscape, { color }]}
              >
                {children}
              </Text>
            );
          },
          tabBarActiveBackgroundColor: 'transparent',
          tabBarItemStyle: { backgroundColor: 'transparent' },
          tabBarHideOnKeyboard: !isChartTab,
          tabBarButton: (props) => (
            <FastTabBarButton
              {...props}
              latencyLabel={route.name}
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

      <SidebarDestinationHost />
      {/* Keep route handoff shells mounted so toolbar and symbol actions paint immediately. */}
      <BrokersLaunchHost />
      <OrderTicketLaunchHost />
      <QuoteInfoLaunchHost />

      {/* Hamburger menu button is now inside AppHeader for consistent alignment */}

      {/* Action sheet – shared across all tabs, renders inside device frame */}
      <GlobalActionSheetHost />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
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
