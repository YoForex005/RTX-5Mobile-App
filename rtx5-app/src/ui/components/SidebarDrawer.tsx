import { FastPressable as Pressable } from './FastPressable';
/**
 * Reusable React Native UI component: SidebarDrawer.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  Alert, Animated, BackHandler, Easing, Linking, ScrollView, StyleSheet, Text, View,
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

// ─── Menu Items ──────────────────────────────────────────────────────────────
type MenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  action?: 'support-email';
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Trade', icon: 'flash-outline', route: '/trade' },
  { label: 'Journal', icon: 'reader-outline', route: '/settings/journal' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  { label: 'Economic Calendar', icon: 'calendar-outline', route: '/settings/economic-calendar' },
  { label: 'User Guide', icon: 'help-circle-outline', route: '/settings/user-guide' },
  { label: 'Support', icon: 'help-buoy-outline', action: 'support-email' },
  { label: 'Help', icon: 'information-circle-outline', route: '/settings/help' },
  { label: 'About', icon: 'information-circle-outline', route: '/settings/about' },
];

// ─── Props ───────────────────────────────────────────────────────────────────
// ─── Props ───────────────────────────────────────────────────────────────────
// DELETED Props so component handles its own state
const DRAWER_WIDTH = 310;
const DRAWER_CLOSED_TRANSLATE_X = -DRAWER_WIDTH - 2;
const DRAWER_OPEN_ANIMATION_MS = 190;
const DRAWER_CLOSE_ANIMATION_MS = 160;
const SIDEBAR_MENU_ITEM_HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 } as const;
const SIDEBAR_PROFILE_ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 4 } as const;
const SIDEBAR_NAVIGATION_LOCK_MS = 50;
const SIDEBAR_PROFILE_DATA_DELAY_MS = 1200;
const LOGGED_OUT_PREFETCH_ROUTES = ['/login'] as const;
const SIDEBAR_STACK_ROUTES = new Set<string>(LOGGED_OUT_PREFETCH_ROUTES);
const SIDEBAR_PUSH_ROUTE_PREFIXES = ['/settings/'] as const;

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

function scheduleAfterPressPaint(action: () => void) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(action);
    });
    return;
  }
  setTimeout(action, 32);
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
  const sidebarProfileDataActive = useDeferredActiveFlag(interactive && isLoggedIn, SIDEBAR_PROFILE_DATA_DELAY_MS);
  const { data: brokerConfig } = useBrokerConfig(brokerId, sidebarProfileDataActive && !!brokerId);
  const isDark = themeMode === 'dark';
  const displayAccountName = accountDetails?.name?.trim() || (accountDetails?.id ? `Account ${accountDetails.id}` : '---');
  const supportEmail = getConfiguredSupportEmail();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Constants.expoConfig?.version ?? 'Local';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);

  const slideAnim = useRef(new Animated.Value(initialSidebarOpenRef.current ? 0 : DRAWER_CLOSED_TRANSLATE_X)).current;
  const overlayAnim = useRef(new Animated.Value(initialSidebarOpenRef.current ? 1 : 0)).current;
  const isClosingRef = useRef(false);
  const animatedVisibleRef = useRef(initialSidebarOpenRef.current);
  const interactiveGenerationRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    ]).start();
  }, [overlayAnim, slideAnim]);

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

  const navigateSidebarRoute = useCallback((route: string) => {
    if (navigationLockedRef.current) {
      return;
    }

    navigationLockedRef.current = true;

    const targetPath = normalizeSidebarPath(route);
    const currentPath = normalizeSidebarPath(pathname);
    const shouldNavigate = currentPath !== targetPath;

    handleClose(() => {
      unlockSidebarNavigation();

      if (shouldNavigate) {
        scheduleAfterPressPaint(() => {
          if (SIDEBAR_STACK_ROUTES.has(route) || shouldPushSidebarRoute(route)) {
            // Push detail routes over the (tabs) navigator so it, and the warm
            // chart WebView, stays mounted; BACK is then an instant pop, not a
            // full tab re-mount.
            router.push(route as any);
          } else {
            router.navigate(route as any);
          }
        });
      }
    });
  }, [handleClose, pathname, router, unlockSidebarNavigation]);

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

  const handleMenuItemPress = useCallback((item: MenuItem) => {
    if (item.action === 'support-email') {
      handleClose(() => {
        void openSupportEmail();
      });
      return;
    }

    if (item.route) {
      navigateSidebarRoute(item.route);
    }
  }, [handleClose, navigateSidebarRoute, openSupportEmail]);

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
                activateOnTouchStart
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
      paddingTop: 58,
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
