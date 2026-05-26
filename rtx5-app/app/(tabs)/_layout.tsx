import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/ui/components/ActionSheet';
import { SidebarDrawer } from '../../src/ui/components/SidebarDrawer';
import { useIsDarkTheme } from '../../src/state/themeMode';
import { useTheme } from '../../src/ui/theme/useTheme';
import { useTranslation } from '../../src/i18n/useTranslation';
import { warmActionRoutes } from '../../src/utils/actionRouteWarmup';
import { resolveBottomTabBarHeight } from '../../src/ui/layout/bottomTabBar';

const icons = {
  quotes: 'swap-vertical-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const tabPaths = {
  quotes: '/quotes',
  chart: '/chart',
  trade: '/trade',
  history: '/history',
  settings: '/settings',
} as const;

type BottomTabName = keyof typeof tabPaths;

const TAB_SWITCH_MAX_LATENCY_MS = 20;
const STALE_TAB_SWITCH_SAMPLE_MS = 5000;
type TabPressEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPress']>>[0];
type TabPressInEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0];
type TabTouchEvent = GestureResponderEvent;
type FastTabBarButtonProps = BottomTabBarButtonProps & {
  latencyLabel?: string;
  onNavigateStart?: () => void;
};

const getNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

const isBottomTabName = (value: string): value is BottomTabName =>
  Object.prototype.hasOwnProperty.call(tabPaths, value);

function resolveBottomTabName(pathname: string): BottomTabName {
  const normalizedPathname = pathname.replace(/^\/\(tabs\)/, '');
  const segment = normalizedPathname.split('/').filter(Boolean)[0];
  return segment && isBottomTabName(segment) ? segment : 'quotes';
}

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
    if (elapsedMs > TAB_SWITCH_MAX_LATENCY_MS) {
      const navigationMs = Math.max(0, navigationFinishedAtMs - startedAtMs);
      console.warn(
        `[Tabs] ${label} first frame took ${Math.round(elapsedMs)}ms; ` +
          `sync navigation ${Math.round(navigationMs)}ms; budget is ${TAB_SWITCH_MAX_LATENCY_MS}ms.`,
      );
    }
  });
}

const FastTabBarButton = memo(function FastTabBarButton({
  latencyLabel = 'bottom tab',
  onNavigateStart,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: FastTabBarButtonProps) {
  const pressStartedAtRef = useRef<number | null>(null);

  const primeTabNavigation = useCallback(() => {
    onNavigateStart?.();
  }, [onNavigateStart]);

  const runTabPress = useCallback((event: TabPressEvent) => {
    const startedAtMs = pressStartedAtRef.current ?? getNow();
    pressStartedAtRef.current = null;
    useUIState.getState().hideActionSheet();
    onPress?.(event);
    scheduleTabSwitchBudgetCheck(latencyLabel, startedAtMs, getNow());
  }, [latencyLabel, onPress]);

  const handleTouchStart = useCallback((_event: TabTouchEvent) => {
    pressStartedAtRef.current = getNow();
    primeTabNavigation();
  }, [primeTabNavigation]);

  const handlePressIn = useCallback((event: TabPressInEvent) => {
    pressStartedAtRef.current = pressStartedAtRef.current ?? getNow();
    primeTabNavigation();
    onPressIn?.(event);
  }, [onPressIn, primeTabNavigation]);

  const handlePress: NonNullable<BottomTabBarButtonProps['onPress']> = useCallback((event) => {
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
  const hideActionSheet = useUIState((s) => s.hideActionSheet);

  return (
    <ActionSheet
      visible={actionSheet !== null}
      title={actionSheet?.title}
      actions={actionSheet?.actions ?? []}
      onClose={hideActionSheet}
      searchable={actionSheet?.searchable}
      searchPlaceholder={actionSheet?.searchPlaceholder}
      detent={actionSheet?.detent}
      minimumTopInset={actionSheet?.minimumTopInset}
      instantOpen={actionSheet?.instantOpen}
      runActionAfterClose={actionSheet?.runActionAfterClose}
    />
  );
});

export default function TabsLayout() {
  const isChartFullscreen = useUIState((s) => s.isChartFullscreen);
  const isSearchActive = useUIState((s) => s.isSearchActive);
  const isChartInlineInputActive = useUIState((s) => s.isChartInlineInputActive);
  const chartTabBarKeyboardLift = useUIState((s) => s.chartTabBarKeyboardLift);
  const isDark = useIsDarkTheme();
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const previousPathRef = useRef(pathname);
  const optimisticTabClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticTabName, setOptimisticTabName] = useState<BottomTabName | null>(null);

  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');
  const activeTabName = useMemo(() => resolveBottomTabName(pathname), [pathname]);
  const visualActiveTabName = optimisticTabName ?? activeTabName;
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
  });

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: isDark ? '#040609' : '#ffffff',
      borderTopColor: isDark ? '#131722' : 'rgba(0,0,0,0.05)',
      borderTopWidth: 1,
      height: tabBarHeight,
      paddingTop: 8,
      paddingBottom: Math.max(insets.bottom, 8),
    }),
    [insets.bottom, isDark, tabBarHeight],
  );
  const inactiveTabColor = isDark ? '#5A6B87' : T.textDimmed;

  const markTabNavigationStarted = useCallback((routeName: string) => {
    if (!isBottomTabName(routeName)) {
      return;
    }

    if (optimisticTabClearTimerRef.current !== null) {
      clearTimeout(optimisticTabClearTimerRef.current);
    }

    setOptimisticTabName(routeName);

    optimisticTabClearTimerRef.current = setTimeout(() => {
      setOptimisticTabName((current) => (current === routeName ? null : current));
      optimisticTabClearTimerRef.current = null;
    }, 800);
  }, []);

  useEffect(() => warmActionRoutes(router), [router]);

  useEffect(() => {
    if (optimisticTabName === activeTabName) {
      if (optimisticTabClearTimerRef.current !== null) {
        clearTimeout(optimisticTabClearTimerRef.current);
        optimisticTabClearTimerRef.current = null;
      }
      setOptimisticTabName(null);
    }
  }, [activeTabName, optimisticTabName]);

  useEffect(
    () => () => {
      if (optimisticTabClearTimerRef.current !== null) {
        clearTimeout(optimisticTabClearTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (previousPathRef.current !== pathname && useUIState.getState().actionSheet !== null) {
      useUIState.getState().hideActionSheet();
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return (
    <View style={styles.root}>
      <Tabs
        // Keep primary tab routes eagerly mounted so taps never wait on cold route construction,
        // while detached/frozen inactive native views keep the active frame tree MT-style lean.
        detachInactiveScreens={true}
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
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: inactiveTabColor,
          tabBarIcon: ({ size }) => {
            const tabName = isBottomTabName(route.name) ? route.name : 'quotes';
            const color = visualActiveTabName === tabName ? T.accent : inactiveTabColor;
            if (route.name === 'chart') {
              return <MaterialIcons name="candlestick-chart" size={size + 2} color={color} />;
            }
            const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarLabel: ({ children }) => {
            const tabName = isBottomTabName(route.name) ? route.name : 'quotes';
            const color = visualActiveTabName === tabName ? T.accent : inactiveTabColor;
            return (
              <Text allowFontScaling={false} numberOfLines={1} style={[styles.tabLabel, { color }]}>
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
              onNavigateStart={() => markTabNavigationStarted(route.name)}
            />
          ),
          freezeOnBlur: true,
          lazy: false,
          animation: 'none',
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

      <SidebarDrawer />

      {/* Hamburger menu button is now inside AppHeader for consistent alignment */}

      {/* Action sheet – shared across all tabs, renders inside device frame */}
      <GlobalActionSheetHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
});
