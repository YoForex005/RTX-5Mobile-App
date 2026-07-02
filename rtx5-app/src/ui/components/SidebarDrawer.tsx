import { FastPressable as Pressable } from './FastPressable';
/**
 * Reusable React Native UI component: SidebarDrawer.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  Alert, Animated, BackHandler, Easing, Image, Linking, ScrollView, StyleSheet, Text, View,
  Platform
} from 'react-native';
import { GDark, GLight, ThemeColors } from '../theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import { useThemeMode } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { useBrokerConfig } from '../../query/broker';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import type { ThemeMode } from '../../state/userPreferences/types';
import { AppLogo } from './AppLogo';
import { resolveAppDisplayVersion } from '../../config/appDisplayVersion';
import { getConfiguredSupportEmail } from '../../config/legalLinks';
import { buildHelpMailto } from '../../features/settings/helpViewModel';
import { registerSidebarOpenHandler } from './sidebarDrawerController';
import { warmSidebarRouteModules } from '../../utils/sidebarRouteModuleWarmup';

// ─── Menu Items ──────────────────────────────────────────────────────────────
type MenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  action?: 'support-email';
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Trade', icon: 'stats-chart', route: '/trade' },
  { label: 'Journal', icon: 'reader-outline', route: '/settings/journal' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  { label: 'Economic Calendar', icon: 'calendar-outline', route: '/settings/economic-calendar' },
  { label: 'User Guide', icon: 'book-outline', route: '/settings/user-guide' },
  { label: 'Support', icon: 'headset-outline', action: 'support-email' },
  { label: 'Help', icon: 'chatbubble-ellipses-outline', route: '/settings/help' },
  { label: 'About', icon: 'information-circle-outline', route: '/settings/about' },
];

// ─── Props ───────────────────────────────────────────────────────────────────
// ─── Props ───────────────────────────────────────────────────────────────────
// DELETED Props so component handles its own state
const DRAWER_WIDTH = 310;
const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2;
const DRAWER_OPEN_ANIMATION_MS = 110;
const DRAWER_CLOSE_ANIMATION_MS = 90;
const SIDEBAR_MENU_ITEM_HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 } as const;
const SIDEBAR_PROFILE_ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 4 } as const;
const SIDEBAR_NAVIGATION_LOCK_MS = 50;
const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200;
const LOGGED_OUT_PREFETCH_ROUTES = ['/login'] as const;
const SIDEBAR_STACK_ROUTES = new Set<string>(LOGGED_OUT_PREFETCH_ROUTES);
const SIDEBAR_PUSH_ROUTE_PREFIXES = ['/settings/'] as const;
const SIDEBAR_PRIMARY_TAB_ROUTES = new Set<string>([
  '/quotes',
  '/chart',
  '/trade',
  '/history',
  '/settings',
]);
let lastSidebarDetailBasePath: string | null = null;

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

function scheduleAfterTapVisualFrame(action: () => void) {
  const runAfterFrame = () => setTimeout(action, 0);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }
  setTimeout(action, 0);
}

function normalizeSidebarPath(path: string) {
  return path.replace(/\/\([^)]*\)/g, '') || '/';
}

function shouldPushSidebarRoute(route: string) {
  return SIDEBAR_PUSH_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SidebarDrawer() {
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const onClose = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);
  const initialSidebarOpenRef = useRef(useUIState.getState().sidebarOpen);
  const [interactive, setInteractive] = useState(initialSidebarOpenRef.current);
  const router = useRouter();
  const pathname = usePathname();
  const themeMode = useThemeMode();
  const T = useMemo(() => (themeMode === 'light' ? GLight : GDark), [themeMode]);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const brokerLogoUrl = useUserPreferences((s) => s.brokerLogoUrl);
  const sidebarProfileDataActive = useDeferredActiveFlag(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS);
  const { data: brokerConfig } = useBrokerConfig(brokerId, sidebarProfileDataActive && !!brokerId);
  const isDark = themeMode === 'dark';
  const displayAccountName = accountDetails?.name?.trim() || (accountDetails?.id ? `Account ${accountDetails.id}` : '---');
  const supportEmail = getConfiguredSupportEmail();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Constants.expoConfig?.version ?? 'Local';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const activeBrokerLogoUrl = useMemo(
    () => (isLoggedIn ? brokerLogoUrl.trim() : ''),
    [brokerLogoUrl, isLoggedIn],
  );
  const [brokerLogoFailed, setBrokerLogoFailed] = useState(false);

  const slideAnim = useRef(new Animated.Value(initialSidebarOpenRef.current ? 0 : DRAWER_CLOSED_TRANSLATE_X)).current;
  const overlayAnim = useRef(new Animated.Value(initialSidebarOpenRef.current ? 1 : 0)).current;
  const isClosingRef = useRef(false);
  const animatedVisibleRef = useRef(initialSidebarOpenRef.current);
  const interactiveGenerationRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => warmSidebarRouteModules(), []);

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

  useEffect(() => {
    setBrokerLogoFailed(false);
  }, [activeBrokerLogoUrl]);

  /* Keep the drawer warm offscreen so opening only has to run native-driver motion. */
  const startOpenAnimation = useCallback(() => {
    animatedVisibleRef.current = true;
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
    ]).start(({ finished }) => {
      if (finished && animatedVisibleRef.current) {
        setSidebarOpen(true);
      }
    });
  }, [overlayAnim, setSidebarOpen, slideAnim]);

  const showInteractiveAfterVisualFrame = useCallback(() => {
    const generation = interactiveGenerationRef.current + 1;
    interactiveGenerationRef.current = generation;

    scheduleNextFrame(() => {
      if (interactiveGenerationRef.current === generation && animatedVisibleRef.current) {
        setInteractive(true);
      }
    });
  }, []);

  const hideInteractiveNow = useCallback(() => {
    interactiveGenerationRef.current += 1;
    setInteractive(false);
  }, []);

  useEffect(() => registerSidebarOpenHandler(() => {
    if (!animatedVisibleRef.current) {
      startOpenAnimation();
    }
    showInteractiveAfterVisualFrame();
  }), [showInteractiveAfterVisualFrame, startOpenAnimation]);

  const handleClose = useCallback((afterClose?: () => void) => {
    if (isClosingRef.current) return;
    animatedVisibleRef.current = false;
    isClosingRef.current = true;
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: DRAWER_CLOSED_TRANSLATE_X,
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
      hideInteractiveNow();
      isClosingRef.current = false;
      afterClose?.();
    });
  }, [hideInteractiveNow, onClose, overlayAnim, slideAnim]);

  useEffect(() => {
    const unsubscribe = useUIState.subscribe((state, previousState) => {
      if (state.sidebarOpen === previousState.sidebarOpen) {
        return;
      }

      if (state.sidebarOpen) {
        if (!animatedVisibleRef.current) {
          startOpenAnimation();
        }
        showInteractiveAfterVisualFrame();
        return;
      }

      if (!isClosingRef.current && animatedVisibleRef.current) {
        handleClose();
      }
    });

    return unsubscribe;
  }, [handleClose, showInteractiveAfterVisualFrame, startOpenAnimation]);

  useEffect(() => {
    if (!interactive) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => subscription.remove();
  }, [handleClose, interactive]);

  const unlockSidebarNavigation = useCallback(() => {
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
    }
    navigationUnlockTimerRef.current = setTimeout(() => {
      navigationLockedRef.current = false;
      navigationUnlockTimerRef.current = null;
    }, SIDEBAR_NAVIGATION_LOCK_MS);
  }, []);

  const snapClosedForNavigation = useCallback(() => {
    // Route taps should show the destination immediately. The drawer is below
    // pushed sidebar routes, so snap it closed before navigation instead of
    // making the tap wait for the close animation. Keep the global sidebarOpen
    // flag true until the navigation handoff has painted; flipping it here
    // wakes paused screen work in the tap frame.
    animatedVisibleRef.current = false;
    isClosingRef.current = false;
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    slideAnim.setValue(DRAWER_CLOSED_TRANSLATE_X);
    overlayAnim.setValue(0);
    interactiveGenerationRef.current += 1;
  }, [overlayAnim, slideAnim]);

  const runSidebarNavigation = useCallback((route: string) => {
    const currentPath = normalizeSidebarPath(pathname);

    if (SIDEBAR_PRIMARY_TAB_ROUTES.has(route) && shouldPushSidebarRoute(currentPath)) {
      const detailBasePath = lastSidebarDetailBasePath;
      if (detailBasePath) {
        lastSidebarDetailBasePath = null;
        router.back();
        if (detailBasePath !== route) {
          scheduleAfterTapVisualFrame(() => router.navigate(route as any));
        }
        return;
      }

      useUIState.getState().setSidebarOpen(false);
    }

    if (SIDEBAR_PRIMARY_TAB_ROUTES.has(currentPath)) {
      lastSidebarDetailBasePath = currentPath;
    }

    if (SIDEBAR_PRIMARY_TAB_ROUTES.has(route)) {
      lastSidebarDetailBasePath = null;
    }

    if (SIDEBAR_STACK_ROUTES.has(route) || shouldPushSidebarRoute(route)) {
      // Push detail routes over the (tabs) navigator so it, and the warm chart
      // WebView, stays mounted; BACK is then an instant pop, not a remount.
      router.push(route as any);
      return;
    }

    router.navigate(route as any);
  }, [pathname, router]);

  const navigateSidebarRoute = useCallback((route: string) => {
    if (navigationLockedRef.current) {
      return;
    }

    navigationLockedRef.current = true;

    const targetPath = normalizeSidebarPath(route);
    const currentPath = normalizeSidebarPath(pathname);
    const shouldNavigate = currentPath !== targetPath;

    if (!shouldNavigate) {
      handleClose(() => {
        unlockSidebarNavigation();
      });
      return;
    }

    snapClosedForNavigation();
    scheduleAfterTapVisualFrame(() => {
      try {
        onClose();
        runSidebarNavigation(route);
      } finally {
        scheduleAfterTapVisualFrame(() => {
          hideInteractiveNow();
          onClose();
          unlockSidebarNavigation();
        });
      }
    });
  }, [handleClose, hideInteractiveNow, onClose, pathname, runSidebarNavigation, snapClosedForNavigation, unlockSidebarNavigation]);

  const openSupportEmail = useCallback(async () => {
    const mailtoUrl = buildHelpMailto({
      appName,
      appVersion,
      platform: Platform.OS,
      supportEmail,
    });

    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      Alert.alert('Email support', `Please email ${supportEmail} from your mail app.`);
    }
  }, [appName, appVersion, supportEmail]);

  const openSupportEmailFromSidebar = useCallback(() => {
    if (navigationLockedRef.current) {
      return;
    }

    navigationLockedRef.current = true;
    snapClosedForNavigation();
    scheduleAfterTapVisualFrame(() => {
      hideInteractiveNow();
      onClose();
      void openSupportEmail().finally(() => {
        unlockSidebarNavigation();
      });
    });
  }, [hideInteractiveNow, onClose, openSupportEmail, snapClosedForNavigation, unlockSidebarNavigation]);

  const handleMenuItemPress = useCallback((item: MenuItem) => {
    if (item.action === 'support-email') {
      openSupportEmailFromSidebar();
      return;
    }

    if (item.route) {
      navigateSidebarRoute(item.route);
    }
  }, [navigateSidebarRoute, openSupportEmailFromSidebar]);

  const ds = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  return (
    <View
      pointerEvents={interactive ? 'auto' : 'none'}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!interactive}
      style={ds.container}
    >
        {/* Overlay */}
        <Animated.View
          pointerEvents="box-none"
          renderToHardwareTextureAndroid
          needsOffscreenAlphaCompositing
          style={[
            ds.overlay,
            { opacity: overlayAnim },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => handleClose()}
            activateOnTouchStart
            latencyLabel="sidebar.closeOverlay"
            unstable_pressDelay={0}
          />
        </Animated.View>

        {/* Drawer */}
        <Animated.View
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={[
            ds.drawer,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* ── Profile Header ── */}
          <View style={ds.profileHeader}>
            <View style={ds.profileRow}>
              <View style={ds.avatarWrap}>
                {activeBrokerLogoUrl && !brokerLogoFailed ? (
                  <Image
                    accessibilityLabel="Broker logo"
                    resizeMode="cover"
                    source={{ uri: activeBrokerLogoUrl }}
                    style={ds.avatarImage}
                    onError={() => setBrokerLogoFailed(true)}
                  />
                ) : (
                  <AppLogo style={ds.avatarImage} />
                )}
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
      backgroundColor: isDark ? T.bg : T.glass1,
      borderRightWidth: 1,
      borderRightColor: T.border,
      paddingTop: 58,
    },

    /* Profile */
    profileHeader: {
      paddingHorizontal: 18,
      // Keep the account block compact so the first menu rows sit higher on phone screens.
      paddingBottom: 8,
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
      marginBottom: 4,
    },
    manageBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 2,
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
