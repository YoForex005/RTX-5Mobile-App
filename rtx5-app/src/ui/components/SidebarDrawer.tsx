import { FastPressable as Pressable } from './FastPressable';
/**
 * Reusable React Native UI component: SidebarDrawer.
 */

import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import {
  Animated, BackHandler, Easing, ScrollView, StyleSheet, Text, View,
  Platform
} from 'react-native';
import { GDark, GLight, ThemeColors } from '../theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import { useThemeMode } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { useBrokerConfig } from '../../query/broker';
import { useAccounts } from '../../query/accounts';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import type { ThemeMode } from '../../state/userPreferences/types';
import { AppLogo } from './AppLogo';

// ─── Menu Items ──────────────────────────────────────────────────────────────
type MenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Trade', icon: 'flash-outline', route: '/trade' },
  { label: 'News', icon: 'reader-outline', route: '/settings/news' },
  { label: 'Mailbox', icon: 'mail-outline', route: '/settings/mailbox' },
  { label: 'Journal', icon: 'book-outline', route: '/settings/journal' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  { label: 'Economic Calendar', icon: 'calendar-outline', route: '/settings/economic-calendar' },
  { label: 'Traders Community', icon: 'people-outline', route: '/settings/traders-community' },
  { label: 'MQL5 Algo Trading', icon: 'code-slash-outline', route: '/settings/mql5-algo-trading' },
  { label: 'User Guide', icon: 'help-circle-outline', route: '/settings/user-guide' },
  { label: 'About', icon: 'information-circle-outline', route: '/settings/about' },
];

// ─── Props ───────────────────────────────────────────────────────────────────
// ─── Props ───────────────────────────────────────────────────────────────────
// DELETED Props so component handles its own state
const DRAWER_WIDTH = 310;
const DRAWER_OPEN_ANIMATION_MS = 50;
const DRAWER_CLOSE_ANIMATION_MS = 50;
const SIDEBAR_MENU_ITEM_HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 } as const;
const SIDEBAR_PROFILE_ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 4 } as const;
const SIDEBAR_NAVIGATION_LOCK_MS = 50;
const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200;
const LOGGED_OUT_PREFETCH_ROUTES = ['/login'] as const;
const SIDEBAR_STACK_ROUTES = new Set<string>(LOGGED_OUT_PREFETCH_ROUTES);
const SIDEBAR_REPLACE_ROUTE_PREFIXES = ['/settings/'] as const;

type PrefetchRouter = {
  prefetch?: (href: string) => void;
};

function scheduleNextFrame(action: () => void) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(action);
    return;
  }
  setTimeout(action, 0);
}

function normalizeSidebarPath(path: string) {
  return path.replace(/\/\([^)]*\)/g, '') || '/';
}

function shouldReplaceSidebarRoute(route: string) {
  return SIDEBAR_REPLACE_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SidebarDrawer() {
  const visible = useUIState((s) => s.sidebarOpen);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const onClose = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);
  const router = useRouter();
  const pathname = usePathname();
  const themeMode = useThemeMode();
  const T = useMemo(() => (themeMode === 'light' ? GLight : GDark), [themeMode]);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const sidebarProfileDataActive = useDeferredActiveFlag(visible && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS);
  const { data: brokerConfig } = useBrokerConfig(brokerId, sidebarProfileDataActive && !!brokerId);
  const { data: accounts } = useAccounts(sidebarProfileDataActive);
  const isDark = themeMode === 'dark';
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeAccount = accounts?.find((account) => account.login === currentLogin) ?? accounts?.[0];
  const displayAccountName = activeAccount?.name?.trim() || (accountDetails?.id ? `Account ${accountDetails.id}` : '---');

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const navigationLockedRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keepDrawerMounted, setKeepDrawerMounted] = useState(false);
  const shouldRenderDrawer = visible || keepDrawerMounted;

  useEffect(() => {
    if (isLoggedIn) {
      return;
    }

    scheduleNextFrame(() => {
      const prefetch = (router as PrefetchRouter).prefetch;
      if (typeof prefetch !== 'function') {
        return;
      }
      for (const route of LOGGED_OUT_PREFETCH_ROUTES) {
        try {
          prefetch(route);
        } catch {
          // Login warm-up must never affect first paint or drawer taps.
        }
      }
    });
  }, [isLoggedIn, router]);

  useEffect(() => () => {
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
      navigationUnlockTimerRef.current = null;
    }
  }, []);

  /* Keep the drawer mounted only while visible/closing so closed tabs stay lean. */
  useLayoutEffect(() => {
    if (visible) {
      setKeepDrawerMounted(true);
      isClosingRef.current = false;
      slideAnim.stopAnimation();
      overlayAnim.stopAnimation();
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: DRAWER_OPEN_ANIMATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: DRAWER_OPEN_ANIMATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // When visible switches to false while NOT closing (e.g. external state
    // change), snap to hidden immediately while keeping the touch tree warm.
    if (!isClosingRef.current) {
      slideAnim.stopAnimation();
      overlayAnim.stopAnimation();
      slideAnim.setValue(-DRAWER_WIDTH);
      overlayAnim.setValue(0);
      setKeepDrawerMounted(false);
    }
  }, [overlayAnim, slideAnim, visible]);

  const closeImmediately = useCallback((afterClose?: () => void) => {
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    slideAnim.setValue(-DRAWER_WIDTH);
    overlayAnim.setValue(0);
    onClose();
    isClosingRef.current = false;
    setKeepDrawerMounted(false);
    if (afterClose) {
      afterClose();
    }
  }, [onClose, overlayAnim, slideAnim]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeImmediately();
      return true;
    });

    return () => subscription.remove();
  }, [closeImmediately, visible]);

  const handleClose = useCallback((afterClose?: () => void) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: DRAWER_CLOSE_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: DRAWER_CLOSE_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      isClosingRef.current = false;
      setKeepDrawerMounted(false);
      afterClose?.();
    });
  }, [onClose, overlayAnim, slideAnim]);

  const unlockSidebarNavigation = useCallback(() => {
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
    }
    navigationUnlockTimerRef.current = setTimeout(() => {
      navigationLockedRef.current = false;
      navigationUnlockTimerRef.current = null;
    }, SIDEBAR_NAVIGATION_LOCK_MS);
  }, []);

  const navigateSidebarRoute = useCallback((route: string) => {
    if (navigationLockedRef.current) {
      return;
    }

    navigationLockedRef.current = true;

    const targetPath = normalizeSidebarPath(route);
    const currentPath = normalizeSidebarPath(pathname);
    const shouldNavigate = currentPath !== targetPath;

    closeImmediately();

    if (shouldNavigate) {
      if (SIDEBAR_STACK_ROUTES.has(route)) {
        router.push(route as any);
      } else if (shouldReplaceSidebarRoute(route)) {
        router.replace(route as any);
      } else {
        router.navigate(route as any);
      }
    }

    unlockSidebarNavigation();
  }, [closeImmediately, pathname, router, unlockSidebarNavigation]);

  const handleMenuItemPress = useCallback((item: MenuItem) => {
    navigateSidebarRoute(item.route);
  }, [navigateSidebarRoute]);

  const ds = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  if (!shouldRenderDrawer) {
    return null;
  }

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[ds.container, !visible && ds.containerHidden]}
    >
        {/* Overlay */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            ds.overlay,
            { opacity: overlayAnim },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => handleClose()}
            activateOnPressIn
            latencyLabel="sidebar.closeOverlay"
            unstable_pressDelay={0}
          />
        </Animated.View>

        {/* Drawer */}
        <Animated.View
          style={[
            ds.drawer,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* ── Profile Header ── */}
          <View style={ds.profileHeader}>
            <View style={ds.profileRow}>
              <View style={ds.avatarWrap}>
                <AppLogo style={ds.avatarImage} />
              </View>
              {isLoggedIn && accountDetails ? (
                <View style={ds.profileText}>
                  <Text style={ds.userName} numberOfLines={1}>{displayAccountName}</Text>
                  <Text style={ds.accountDetails} numberOfLines={1}>{accountDetails.id} — {brokerConfig?.server_name || accountDetails.server}</Text>
                  {brokerConfig?.broker_name ? (
                    <Text style={[ds.accountDetails, { marginTop: 0, marginBottom: 4 }]} numberOfLines={1}>{brokerConfig.broker_name}</Text>
                  ) : null}
                  <Pressable
                    style={ds.manageBtn}
                    onPress={() => navigateSidebarRoute('/settings/accounts')}
                    activateOnPressIn
                    hitSlop={SIDEBAR_PROFILE_ACTION_HIT_SLOP}
                    latencyLabel="sidebar.manageAccounts"
                    unstable_pressDelay={0}
                  >
                    <Text style={ds.manageText}>Manage accounts</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={ds.profileText}
                  onPress={() => navigateSidebarRoute('/login')}
                  activateOnPressIn
                  hitSlop={SIDEBAR_PROFILE_ACTION_HIT_SLOP}
                  latencyLabel="sidebar.getStarted"
                  unstable_pressDelay={0}
                  accessibilityRole="button"
                >
                  <Text style={ds.loginText}>Login to an existing account</Text>
                  <View style={ds.getStartedBtn}>
                    <Text style={ds.getStartedText}>Get started</Text>
                  </View>
                </Pressable>
              )}
              <Pressable
                style={ds.closeBtn}
                onPress={() => handleClose()}
                activateOnPressIn
                latencyLabel="sidebar.closeButton"
                unstable_pressDelay={0}
              >
                <Ionicons name="close" size={20} color={T.text} />
              </Pressable>
            </View>
          </View>

          {/* ── Theme Toggle ── */}
          <SidebarThemeSelector ds={ds} T={T} />

          {/* ── Divider ── */}
          <View style={ds.divider} />

          {/* ── Menu Items ── */}
          <ScrollView
            style={ds.menuScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            contentContainerStyle={ds.menuContent}
          >
            {MENU_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  ds.menuItem,
                  pressed && ds.menuItemPressed,
                ]}
                onPress={() => handleMenuItemPress(item)}
                activateOnPressIn
                hitSlop={SIDEBAR_MENU_ITEM_HIT_SLOP}
                latencyLabel={`sidebar.menu.${item.label}`}
                unstable_pressDelay={0}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={T.textSub}
                  style={ds.menuIcon}
                />
                <Text style={ds.menuText}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

        </Animated.View>
      </View>
  );
}

// ─── Dynamic Styles ──────────────────────────────────────────────────────────
type SidebarThemeSelectorProps = {
  ds: ReturnType<typeof makeStyles>;
  T: ThemeColors;
};

function SidebarThemeSelector({ ds, T }: SidebarThemeSelectorProps) {
  const appliedThemeMode = useThemeMode();
  const setThemeMode = useUserPreferences((s) => s.setThemeMode);
  const [pendingThemeMode, setPendingThemeMode] = useState<ThemeMode | null>(null);
  const selectedThemeMode = pendingThemeMode ?? appliedThemeMode;
  const selectedIsDark = selectedThemeMode === 'dark';

  useEffect(() => {
    if (pendingThemeMode === appliedThemeMode) {
      setPendingThemeMode(null);
    }
  }, [appliedThemeMode, pendingThemeMode]);

  const handleThemeModePress = useCallback((nextMode: ThemeMode) => {
    if (selectedThemeMode === nextMode && appliedThemeMode === nextMode) {
      return;
    }

    setPendingThemeMode(nextMode);
    setThemeMode(nextMode);
  }, [
    appliedThemeMode,
    selectedThemeMode,
    setThemeMode,
  ]);

  return (
    <View style={ds.themeSection}>
      <Text style={ds.themeLabel}>Theme</Text>
      <View style={ds.themePill}>
        <Pressable
          style={!selectedIsDark ? ds.themeOptActive : ds.themeOptInactive}
          onPress={() => handleThemeModePress('light')}
          activateOnPressIn
          latencyLabel="sidebar.themeLight"
          unstable_pressDelay={0}
        >
          <Ionicons name="sunny-outline" size={13} color={!selectedIsDark ? T.text : T.textMuted} />
          <Text style={!selectedIsDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Light</Text>
        </Pressable>
        <Pressable
          style={selectedIsDark ? ds.themeOptActive : ds.themeOptInactive}
          onPress={() => handleThemeModePress('dark')}
          activateOnPressIn
          latencyLabel="sidebar.themeDark"
          unstable_pressDelay={0}
        >
          <Ionicons name="moon-outline" size={13} color={selectedIsDark ? T.text : T.textMuted} />
          <Text style={selectedIsDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Dark</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },
    containerHidden: {
      opacity: 0,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: DRAWER_WIDTH,
      backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)',
      zIndex: 0,
      elevation: 0,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 1,
      elevation: 1,
      width: DRAWER_WIDTH,
      backgroundColor: isDark ? '#0a0a0a' : T.glass1,
      borderRightWidth: 1,
      borderRightColor: T.border,
      paddingTop: 48,
    },

    /* Profile */
    profileHeader: {
      paddingHorizontal: 18,
      paddingBottom: 14,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    avatarWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: T.glass2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    profileText: {
      flex: 1,
      marginLeft: 12,
    },
    userName: {
      color: T.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 3,
    },
    accountDetails: {
      color: T.textSub,
      fontSize: 14,
      marginBottom: 8,
    },
    manageBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    manageText: {
      color: '#2563EB',
      fontSize: 15,
      fontWeight: '700',
    },
    loginText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    getStartedBtn: {
      backgroundColor: T.accent,
      paddingHorizontal: 16,
      minHeight: 44,
      borderRadius: 22,
      alignSelf: 'flex-start',
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    getStartedText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: T.glass2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: T.border,
    },

    /* Theme */
    themeSection: {
      paddingHorizontal: 18,
      paddingBottom: 14,
    },
    themeLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    themePill: {
      flexDirection: 'row',
      backgroundColor: T.glass2,
      borderRadius: 20,
      padding: 3,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: T.border,
    },
    themeOptInactive: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 18,
      gap: 5,
    },
    themeOptTextInactive: {
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    themeOptActive: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 18,
      backgroundColor: T.glass3,
      gap: 5,
    },
    themeOptTextActive: {
      color: T.text,
      fontSize: 12,
      fontWeight: '700',
    },

    /* Divider */
    divider: {
      height: 1,
      backgroundColor: T.border,
      marginHorizontal: 18,
    },

    /* Menu */
    menuScroll: {
      flex: 1,
    },
    menuContent: {
      paddingVertical: 8,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 10,
      marginHorizontal: 6,
    },
    menuItemPressed: {
      backgroundColor: T.glass2,
    },
    menuIcon: {
      width: 28,
    },
    menuText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.1,
    },

  });
}
