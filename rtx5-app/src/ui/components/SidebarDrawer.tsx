/**
 * Reusable React Native UI component: SidebarDrawer.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useMemo } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ThemeColors } from '../theme/glass';
import { traceUiInteraction } from '../../dev/uiInteractionDiagnostics';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useTheme } from '../theme/useTheme';
import { useBrokerConfig } from '../../query/broker';
import { useAccounts } from '../../query/accounts';

// ─── Menu Items ──────────────────────────────────────────────────────────────
type MenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Trade', icon: 'flash-outline' },
  { label: 'News', icon: 'reader-outline' },
  { label: 'Mailbox', icon: 'mail-outline' },
  { label: 'Journal', icon: 'book-outline' },
  { label: 'Settings', icon: 'settings-outline' },
  { label: 'Economic Calendar', icon: 'calendar-outline' },
  { label: 'Traders Community', icon: 'people-outline' },
  { label: 'MQL5 Algo Trading', icon: 'code-slash-outline' },
  { label: 'User Guide', icon: 'help-circle-outline' },
  { label: 'About', icon: 'information-circle-outline' },
];

// ─── Props ───────────────────────────────────────────────────────────────────
// ─── Props ───────────────────────────────────────────────────────────────────
// DELETED Props so component handles its own state
const DRAWER_WIDTH = 310;

// ─── Component ───────────────────────────────────────────────────────────────
export function SidebarDrawer() {
  const visible = useUIState((s) => s.sidebarOpen);
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const onClose = () => setSidebarOpen(false);
  const router = useRouter();
  const T = useTheme();
  const themeMode = useUserPreferences((s) => s.themeMode);
  const setThemeMode = useUserPreferences((s) => s.setThemeMode);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const { data: brokerConfig } = useBrokerConfig(brokerId);
  const { data: accounts } = useAccounts(isLoggedIn);
  const isDark = themeMode === 'dark';
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeAccount = accounts?.find((account) => account.login === currentLogin) ?? accounts?.[0];
  const displayAccountName = activeAccount?.name?.trim() || (accountDetails?.id ? `Account ${accountDetails.id}` : '---');

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  /* Animate the drawer open when `visible` becomes true */
  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 85,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 85,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const closeImmediately = (afterClose?: () => void) => {
    slideAnim.stopAnimation();
    overlayAnim.stopAnimation();
    slideAnim.setValue(-DRAWER_WIDTH);
    overlayAnim.setValue(0);
    onClose();
    isClosingRef.current = false;
    afterClose?.();
  };

  /* Close handler: run actions immediately instead of waiting on drawer animation */
  const handleClose = (afterClose?: () => void) => {
    if (isClosingRef.current) return; // prevent double-close
    isClosingRef.current = true;

    if (afterClose) {
      closeImmediately(afterClose);
      return;
    }
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 85,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 85,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Animation finished → now tell parent to set sidebarOpen = false
      onClose();
      isClosingRef.current = false;
    });
  };

  const ds = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  if (!visible) {
    return null;
  }

  return (
    <View style={ds.container}>
        {/* Overlay */}
        <Animated.View
          style={[
            ds.overlay,
            { opacity: overlayAnim },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => traceUiInteraction('sidebar.closeOverlay', () => handleClose())}
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
                <Ionicons name="person-circle" size={48} color={T.accent} />
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
                    onPress={() =>
                      traceUiInteraction('sidebar.manageAccounts', () => handleClose(() => router.push('/settings/accounts')))
                    }
                    unstable_pressDelay={0}
                  >
                    <Text style={ds.manageText}>Manage accounts</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={ds.profileText}>
                  <Text style={ds.loginText}>Login to existing account or open demo account</Text>
                  <Pressable
                    style={ds.getStartedBtn}
                    onPress={() =>
                      traceUiInteraction('sidebar.getStarted', () => handleClose(() => router.push('/login')))
                    }
                    unstable_pressDelay={0}
                  >
                    <Text style={ds.getStartedText}>Get started</Text>
                  </Pressable>
                </View>
              )}
              <Pressable
                style={ds.closeBtn}
                onPress={() => traceUiInteraction('sidebar.closeButton', () => handleClose())}
                unstable_pressDelay={0}
              >
                <Ionicons name="close" size={20} color={T.text} />
              </Pressable>
            </View>
          </View>

          {/* ── Theme Toggle ── */}
          <View style={ds.themeSection}>
            <Text style={ds.themeLabel}>Theme</Text>
            <View style={ds.themePill}>
              <Pressable
                style={!isDark ? ds.themeOptActive : ds.themeOptInactive}
                onPress={() => traceUiInteraction('sidebar.themeLight', () => setThemeMode('light'))}
                unstable_pressDelay={0}
              >
                <Ionicons name="sunny-outline" size={13} color={!isDark ? T.text : T.textMuted} />
                <Text style={!isDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Light</Text>
              </Pressable>
              <Pressable
                style={isDark ? ds.themeOptActive : ds.themeOptInactive}
                onPress={() => traceUiInteraction('sidebar.themeDark', () => setThemeMode('dark'))}
                unstable_pressDelay={0}
              >
                <Ionicons name="moon-outline" size={13} color={isDark ? T.text : T.textMuted} />
                <Text style={isDark ? ds.themeOptTextActive : ds.themeOptTextInactive}>Dark</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Divider ── */}
          <View style={ds.divider} />

          {/* ── Menu Items ── */}
          <ScrollView
            style={ds.menuScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={ds.menuContent}
          >
            {MENU_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  ds.menuItem,
                  pressed && ds.menuItemPressed,
                ]}
                onPress={() =>
                  traceUiInteraction(`sidebar.menu.${item.label}`, () => handleClose(item.onPress))
                }
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
function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)',
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
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
      color: T.accent,
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
      paddingVertical: 6,
      borderRadius: 16,
      alignSelf: 'flex-start',
      marginTop: 8,
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
