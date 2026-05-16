import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../src/state/uiState';
import { ActionSheet } from '../../src/ui/components/ActionSheet';
import { SidebarDrawer } from '../../src/ui/components/SidebarDrawer';
import { useUserPreferences } from '../../src/state/userPreferences';
import { useTheme } from '../../src/ui/theme/useTheme';
import { useTranslation } from '../../src/i18n/useTranslation';
import { warmActionRoutes } from '../../src/utils/actionRouteWarmup';

const icons = {
  quotes: 'swap-vertical-outline',
  chart: 'stats-chart-outline',
  trade: 'trending-up-outline',
  history: 'time-outline',
  settings: 'settings-outline',
} as const;

const TAB_SWITCH_MAX_LATENCY_MS = 20;
const TAB_PRESS_GUARD_RESET_MS = 120;

const getNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

function scheduleTabSwitchBudgetCheck(startedAtMs: number) {
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
    if (elapsedMs > TAB_SWITCH_MAX_LATENCY_MS) {
      console.warn(
        `[Tabs] Bottom navigation first frame took ${Math.round(elapsedMs)}ms; budget is ${TAB_SWITCH_MAX_LATENCY_MS}ms.`,
      );
    }
  });
}

const FastTabBarButton = memo(function FastTabBarButton({
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: BottomTabBarButtonProps) {
  const handledOnPressInRef = useRef(false);
  const clearHandledTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clearHandledTimeoutRef.current) {
      clearTimeout(clearHandledTimeoutRef.current);
      clearHandledTimeoutRef.current = null;
    }
  }, []);

  const handlePressIn: NonNullable<BottomTabBarButtonProps['onPressIn']> = useCallback((event) => {
    const startedAtMs = getNow();
    if (clearHandledTimeoutRef.current) {
      clearTimeout(clearHandledTimeoutRef.current);
      clearHandledTimeoutRef.current = null;
    }
    handledOnPressInRef.current = true;
    onPressIn?.(event);
    onPress?.(event);
    scheduleTabSwitchBudgetCheck(startedAtMs);
  }, [onPress, onPressIn]);

  const handlePress: NonNullable<BottomTabBarButtonProps['onPress']> = useCallback((event) => {
    if (handledOnPressInRef.current) {
      handledOnPressInRef.current = false;
      return;
    }

    onPress?.(event);
  }, [onPress]);

  const handlePressOut: NonNullable<BottomTabBarButtonProps['onPressOut']> = useCallback((event) => {
    onPressOut?.(event);
    const clearHandledFlag = () => {
      handledOnPressInRef.current = false;
      clearHandledTimeoutRef.current = null;
    };

    clearHandledTimeoutRef.current = setTimeout(clearHandledFlag, TAB_PRESS_GUARD_RESET_MS);
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
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const isChartTab = pathname === '/chart' || pathname.startsWith('/chart');
  const shouldHideMenu =
    (isChartFullscreen && isChartTab) ||
    (isChartTab && isChartInlineInputActive) ||
    isSearchActive;

  // Tab bar height adapts to the device's bottom inset (home indicator / pill)
  // Base: 56dp icon+label zone + real bottom inset + 2dp breathing room
  const tabBarHeight = 56 + insets.bottom + 2;

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

  return (
    <View style={styles.root}>
      <Tabs
        // Keep every primary tab hot after startup so switching never waits for
        // mount, detach, animation, or react-native-screens thaw work.
        detachInactiveScreens={false}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: shouldHideMenu ? { display: 'none' } : tabBarStyle,
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: isDark ? '#5A6B87' : T.textDimmed,
          tabBarIcon: ({ color, size }) => {
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
          tabBarButton: (props) => <FastTabBarButton {...props} />,
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
