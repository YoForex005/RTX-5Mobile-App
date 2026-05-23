import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/ui/components/ActionSheet';
import { SidebarDrawer } from '../../src/ui/components/SidebarDrawer';
import { SidebarRouteTransitionOverlay } from '../../src/ui/components/SidebarRouteTransitionOverlay';
import { useIsDarkTheme } from '../../src/state/themeMode';
import { useTheme } from '../../src/ui/theme/useTheme';
import { useTranslation } from '../../src/i18n/useTranslation';
import { warmActionRoutes } from '../../src/utils/actionRouteWarmup';
import { warmSidebarRouteModules } from '../../src/utils/sidebarRouteModuleWarmup';
import { resolveBottomTabBarHeight } from '../../src/ui/layout/bottomTabBar';

const icons = {
  quotes: 'swap-vertical-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const TAB_SWITCH_MAX_LATENCY_MS = 20;
const STALE_TAB_SWITCH_SAMPLE_MS = 5000;
type TabPressEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPress']>>[0];
type TabPressInEvent = Parameters<NonNullable<BottomTabBarButtonProps['onPressIn']>>[0];
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
    useUIState.getState().hideActionSheet();
    onPress?.(event as TabPressEvent);
    scheduleTabSwitchBudgetCheck(latencyLabel, startedAtMs, getNow());
  }, [latencyLabel, onPress]);

  const handlePressIn = useCallback((event: TabPressInEvent) => {
    pressStartedAtRef.current = getNow();
    onPressIn?.(event);
    if (!handledOnPressInRef.current) {
      handledOnPressInRef.current = true;
      runTabPress(event as unknown as TabPressEvent);
    }
  }, [onPressIn, runTabPress]);

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
    setTimeout(() => {
      handledOnPressInRef.current = false;
    }, 0);
  }, [onPressOut]);

  return (
    <PlatformPressable
      {...props}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onPressOut={handlePressOut}
      unstable_pressDelay={0}
    />
  );
});

export default function TabsLayout() {
  const actionSheet = useUIState((s) => s.actionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
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

  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');
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

  useEffect(() => warmActionRoutes(router), [router]);
  useEffect(() => warmSidebarRouteModules(), []);

  useEffect(() => {
    if (previousPathRef.current !== pathname && actionSheet !== null) {
      hideActionSheet();
    }
    previousPathRef.current = pathname;
  }, [actionSheet, hideActionSheet, pathname]);

  return (
    <View style={styles.root}>
      <Tabs
        // Keep every primary bottom tab mounted so taps never wait on cold route construction.
        // Inactive tab screens guard their own data work through focus/path checks.
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
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: isDark ? '#5A6B87' : T.textDimmed,
          tabBarIcon: ({ color, size }) => {
            if (route.name === 'chart') {
              return <MaterialIcons name="candlestick-chart" size={size + 2} color={color} />;
            }
            const name = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarLabelStyle: {
            fontSize: 12,
            marginBottom: 4,
            fontWeight: '600',
          },
          tabBarActiveBackgroundColor: 'transparent',
          tabBarItemStyle: { backgroundColor: 'transparent' },
          tabBarHideOnKeyboard: !isChartTab,
          tabBarButton: (props) => <FastTabBarButton {...props} latencyLabel={route.name} />,
          freezeOnBlur: false,
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

      <SidebarRouteTransitionOverlay />
      <SidebarDrawer />

      {/* Hamburger menu button is now inside AppHeader for consistent alignment */}

      {/* Action sheet – shared across all tabs, renders inside device frame */}
      <ActionSheet
        visible={actionSheet !== null}
        title={actionSheet?.title}
        actions={actionSheet?.actions ?? []}
        onClose={hideActionSheet}
        searchable={actionSheet?.searchable}
        detent={actionSheet?.detent}
        minimumTopInset={actionSheet?.minimumTopInset}
        instantOpen={actionSheet?.instantOpen}
        runActionAfterClose={actionSheet?.runActionAfterClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
