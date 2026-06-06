/**
 * Core User Preferences & Account Settings Screen (aka 'Settings' tab).
 *
 * Manages local user configurations (Theme, Trading defaults, API connection states)
 * and handles secure authentication workflows (Login/Logout/Disconnect).
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  Alert,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { FastPressable } from '../../../ui/components/FastPressable';
import { useDeferredRouteContentReady } from '../../../ui/components/DeferredRouteMount';
import { useDeferredActiveFlag } from '../../../hooks/useDeferredActiveFlag';
import { useUserPreferences } from '../../../state/userPreferences';
import { useThemeMode } from '../../../state/themeMode';
import { clearAuthSessionTokens } from '../../../state/brokerSessionStorage';
import { useUIState } from '../../../state/uiState';
import { fmt } from '../../../utils/format';
import { useTheme } from '../../../ui/theme/useTheme';
import { useTranslation } from '../../../i18n/useTranslation';
import { SUPPORTED_LANGUAGES, translateAccountCardName } from '../../../i18n/translations';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useBrokerConfig } from '../../../query/broker';
import { useAccountDetails, useAccounts } from '../../../query/accounts';
import { resolveAppDisplayVersion } from '../../../config/appDisplayVersion';
import { getConfiguredSupportEmail } from '../../../config/legalLinks';
import { accountWsService } from '../../../api/ws/accountSocket';
import { candlesWsService } from '../../../domain/candles/ws/candlesSocket';
import { buildHelpMailto } from '../helpViewModel';
import { SettingRow } from './SettingRow';
import { makeSettingsStyles } from './styles';

const SETTINGS_LOWER_CONTENT_DELAY_MS = 80;
const SETTINGS_ROUTE_LOCK_MS = 250;
const SETTINGS_ROUTE_PREFETCH_DELAY_MS = 80;
const SETTINGS_READY_ROUTE_PATHS = [
  '/settings/accounts',
  '/register',
  '/settings/economic-calendar',
  '/settings/interface',
  '/settings/journal',
  '/settings/help',
] as const;
const SETTINGS_DETAIL_REPLACE_ROUTES = new Set<string>([
  '/settings/accounts',
  '/settings/economic-calendar',
  '/settings/interface',
  '/settings/journal',
  '/settings/help',
]);

type SettingsReadyRoute = (typeof SETTINGS_READY_ROUTE_PATHS)[number];
type PrefetchRouter = {
  prefetch?: (href: string) => void;
};
type SearchableSettingsItem = {
  title: string;
  sub: string;
  icon: string;
  routePath?: SettingsReadyRoute;
  action?: 'support-email';
};

export function SettingsScreen() {
  const isScreenFocused = useIsFocused();
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, isDemoAccount, setThemeMode, accountDetails } = useUserPreferences(
    useShallow((state) => ({
      quoteSymbols: state.quoteSymbols,
      chartDrawings: state.chartDrawings,
      oneClickAccepted: state.oneClickAccepted,
      setOneClickAccepted: state.setOneClickAccepted,
      isDemoAccount: state.isDemoAccount,
      setThemeMode: state.setThemeMode,
      accountDetails: state.accountDetails,
    })),
  );
  const themeMode = useThemeMode();
  const brokerId = useUserPreferences((s) => s.brokerId);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const liveLogin = useLiveAccountState((s) => s.login);
  const liveBalance = useLiveAccountState((s) => s.balance);
  const liveHasBalance = useLiveAccountState((s) => s.metricFlags.balance);
  const settingsDataActive = useDeferredActiveFlag(isLoggedIn && isScreenFocused);
  const { data: brokerConfig } = useBrokerConfig(brokerId, settingsDataActive);
  const { data: accounts } = useAccounts(settingsDataActive);
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const listedAccount = accounts?.find((a) => a.login === currentLogin) ?? accounts?.[0];
  const activeLogin = listedAccount?.login ?? currentLogin;
  const { data: activeAccountDetails } = useAccountDetails(activeLogin, settingsDataActive && !!activeLogin);
  const activeAccount = activeAccountDetails ?? listedAccount;
  const rawAccountName = activeAccount?.name ?? 'Account';
  const displayEmail = accountDetails?.name ?? '---';
  const fallbackBalance = activeAccount?.balance;
  const liveMatchesActiveAccount = liveLogin !== 0 && (!activeAccount || liveLogin === activeAccount.login);
  const balanceToDisplay = liveHasBalance && liveMatchesActiveAccount ? liveBalance : fallbackBalance;
  const displayBalance = balanceToDisplay !== undefined ? fmt.price(balanceToDisplay) : '---';
  const displayCurrency = activeAccount?.currency ?? 'USD';
  const displayBrokerName = brokerConfig?.broker_name ?? '---';
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const setSearchActive = useUIState((s) => s.setSearchActive);
  const T = useTheme();
  const { t, language } = useTranslation();
  const displayAccountName = translateAccountCardName(rawAccountName, t);
  const currentLanguageNative = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName ?? 'English';
  const supportEmail = getConfiguredSupportEmail();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Constants.expoConfig?.version ?? 'Local';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const styles = useMemo(() => makeSettingsStyles(T, themeMode), [T, themeMode]);
  const lowerSettingsReady = useDeferredRouteContentReady(SETTINGS_LOWER_CONTENT_DELAY_MS);
  const toggleThemeMode = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [setThemeMode, themeMode]);

  void setSidebarOpen;
  void activeAccount;

  const logout = useUserPreferences((s) => s.logout);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const routeLockRef = useRef(false);
  const routeUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    Alert.alert(
      t('Logout'),
      t('Are you sure you want to logout? You will need to sign in again.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Logout'),
          style: 'destructive',
          onPress: () => {
            accountWsService.disconnect();
            candlesWsService.disconnect();
            useLiveAccountState.getState().resetMetrics();
            logout();
            void clearAuthSessionTokens();
            router.replace('/login');
          },
        },
      ],
    );
  };
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => {
      setSearchActive(false);
      if (routeUnlockTimerRef.current) {
        clearTimeout(routeUnlockTimerRef.current);
        routeUnlockTimerRef.current = null;
      }
    };
  }, [setSearchActive]);

  useEffect(() => {
    if (!isScreenFocused) {
      return undefined;
    }

    const prefetch = (router as PrefetchRouter).prefetch;
    if (typeof prefetch !== 'function') {
      return undefined;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;

    const warmRoutes = () => {
      timerId = setTimeout(() => {
        timerId = null;
        if (cancelled) {
          return;
        }
        SETTINGS_READY_ROUTE_PATHS.forEach((routePath) => {
          try {
            prefetch(routePath);
          } catch {
            // Expo Router prefetch can throw before a dev-client route is registered.
          }
        });
      }, SETTINGS_ROUTE_PREFETCH_DELAY_MS);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(() => {
        frameId = null;
        warmRoutes();
      });
    } else {
      timerId = setTimeout(warmRoutes, 16);
    }

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, [isScreenFocused]);

  const unlockSettingsRoute = useCallback(() => {
    if (routeUnlockTimerRef.current) {
      clearTimeout(routeUnlockTimerRef.current);
    }
    routeUnlockTimerRef.current = setTimeout(() => {
      routeLockRef.current = false;
      routeUnlockTimerRef.current = null;
    }, SETTINGS_ROUTE_LOCK_MS);
  }, []);

  const openReadySettingsRoute = useCallback((routePath: SettingsReadyRoute) => {
    if (routeLockRef.current) {
      return;
    }

    routeLockRef.current = true;
    if (SETTINGS_DETAIL_REPLACE_ROUTES.has(routePath)) {
      router.replace(routePath as any);
    } else {
      router.push(routePath as any);
    }
    unlockSettingsRoute();
  }, [unlockSettingsRoute]);

  const enableSearch = () => {
    setIsSearching(true);
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const disableSearch = () => {
    setIsSearching(false);
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const handleEmailSupport = useCallback(async () => {
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

  const SEARCHABLE_ITEMS = useMemo<SearchableSettingsItem[]>(() => [
    { title: 'Accounts', sub: 'Manage trading accounts', icon: 'server-outline', routePath: '/settings/accounts' },
    { title: 'New Account', sub: '', icon: 'person-outline', routePath: '/register' },
    { title: 'Economic Calender', sub: '', icon: 'calendar-outline', routePath: '/settings/economic-calendar' },
    { title: 'Theme', sub: themeMode === 'light' ? 'Light Mode' : 'Dark Mode', icon: 'color-palette-outline' },
    { title: 'Language Preference', sub: currentLanguageNative, icon: 'browsers-outline', routePath: '/settings/interface' },
    { title: 'Journal', sub: '', icon: 'reader-outline', routePath: '/settings/journal' },
    { title: 'Support', sub: supportEmail, icon: 'help-buoy-outline', action: 'support-email' },
    { title: 'Help', sub: 'FAQ', icon: 'information-circle-outline', routePath: '/settings/help' },
  ], [currentLanguageNative, supportEmail, themeMode]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return SEARCHABLE_ITEMS;
    const q = searchQuery.toLowerCase();
    return SEARCHABLE_ITEMS.filter((it) => (
      it.title.toLowerCase().includes(q) ||
      it.sub.toLowerCase().includes(q) ||
      t(it.title).toLowerCase().includes(q) ||
      t(it.sub).toLowerCase().includes(q)
    ));
  }, [searchQuery, SEARCHABLE_ITEMS, t]);

  const handleSearchResultPress = useCallback((item: SearchableSettingsItem) => {
    if (!item.routePath && !item.action) {
      return;
    }

    setIsSearching(false);
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();

    if (item.action === 'support-email') {
      void handleEmailSupport();
      return;
    }

    if (item.routePath) {
      openReadySettingsRoute(item.routePath);
    }
  }, [handleEmailSupport, openReadySettingsRoute, setSearchActive]);

  const searchBarStyle: any = themeMode === 'dark' ? {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
    borderRightColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1, borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  } : {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1, borderRadius: 24,
  };

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={styles.headerWrap}>
        <AppHeader
          title={t('Settings')}
          noBorder
          paddingBottom={isSearching ? 8 : 12}
          rightActions={
            !isSearching ? (
              <FastPressable onPress={enableSearch} latencyLabel="settings.search.open" hitSlop={12}>
                <Ionicons name="search" size={22} color={T.textMuted} />
              </FastPressable>
            ) : null
          }
        />
        {isSearching && (
          <View style={styles.searchBarWrap}>
            <View style={[styles.searchBar, searchBarStyle]}>
              <Ionicons name="search" size={20} color={T.textMuted} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('Search settings')}
                placeholderTextColor={themeMode === 'dark' ? 'rgba(255, 255, 255, 0.4)' : T.textMuted}
                style={[{ flex: 1, color: T.text, fontSize: 15, fontWeight: '500' }, { outlineStyle: 'none' } as any]}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <FastPressable onPress={disableSearch} latencyLabel="settings.search.close" hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={T.textMuted} />
              </FastPressable>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        removeClippedSubviews={Platform.OS === 'android'}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Search results overlay — kept mounted alongside the main settings
            tree so the Pressables in the main tree don't lose their refs (and
            their guard state) every time the user opens/closes search. */}
        {isSearching ? (
          <View style={{ paddingHorizontal: 16 }} pointerEvents="auto">
            <View style={[styles.groupCard, styles.cardShadow, { marginTop: 8, marginHorizontal: 0 }]}>
              {searchResults.length > 0 ? searchResults.map((item, index) => {
                const isThemeItem = item.title === 'Theme';

                return (
                <View key={item.title}>
                  <SettingRow
                    T={T}
                    styles={styles}
                    icon={item.icon as any}
                    color="#1D4ED8"
                    title={t(item.title)}
                    sub={item.sub ? t(item.sub) : item.sub}
                    rightElement={
                      isThemeItem ? (
                        <View pointerEvents="none">
                          <Switch
                            value={themeMode === 'light'}
                            onValueChange={(val) => setThemeMode(val ? 'light' : 'dark')}
                            trackColor={{ false: T.borderMedium, true: 'rgba(59, 130, 246, 0.5)' }}
                            thumbColor={themeMode === 'light' ? '#3b82f6' : '#f4f3f4'}
                            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                            {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: themeMode === 'light' ? '#3b82f6' : '#f4f3f4' } as any)}
                          />
                        </View>
                      ) : undefined
                    }
                    onPress={isThemeItem ? toggleThemeMode : item.routePath || item.action ? () => handleSearchResultPress(item) : undefined}
                    activateOnPressIn={isThemeItem}
                  />
                  {index < searchResults.length - 1 && <View style={styles.dividerInner} />}
                </View>
                );
              }) : (
                <View style={{ paddingTop: 60, paddingBottom: 60, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={48} color={T.borderMedium} />
                  <Text style={{ color: T.textMuted, marginTop: 16, fontSize: 16 }}>{t('No settings found matching')} "{searchQuery}"</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
        <View
          style={{ display: isSearching ? 'none' : 'flex' }}
          pointerEvents={isSearching ? 'none' : 'auto'}
        >
            <FastPressable
              onPress={() => openReadySettingsRoute('/settings/accounts')}
              unstable_pressDelay={0}
              latencyLabel="settings.accounts.open"
            >
              <View style={[styles.accountCard, styles.cardShadow]}>
                <View style={[styles.ribbonContainer, isDemoAccount ? styles.ribbonDemo : styles.ribbonLive]}>
                  <Text style={styles.ribbonText}>{isDemoAccount ? t('Demo') : t('Real')}</Text>
                </View>

                <LinearGradient
                  colors={themeMode === 'light' ? ['#4F46E5', '#3730A3'] : ['#0d1628', '#07101e']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={[styles.cardBubbleLeft, { backgroundColor: themeMode === 'light' ? '#6366F1' : '#0F162A' }]} />
                <View style={[styles.cardBubbleRight, { backgroundColor: themeMode === 'light' ? '#818CF8' : '#060B18' }]} />

                <View style={styles.accTopRow}>
                  <Text style={[styles.accEmail, themeMode === 'light' && { color: 'rgba(255,255,255,0.9)' }]} ellipsizeMode="tail" numberOfLines={1}>
                    {displayEmail}
                  </Text>
                  <View style={styles.connectedPill}>
                    <View style={styles.greenDot} />
                    <Text style={styles.connectedText}>{t('Connected')}</Text>
                  </View>
                </View>

                <Text style={[styles.accName, themeMode === 'light' && { color: '#FFFFFF' }]}>{displayAccountName}</Text>
                <Text style={[styles.accBalance, themeMode === 'light' && { color: '#FFFFFF' }]}>
                  {displayBalance} <Text style={[styles.accCurrency, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>{displayCurrency}</Text>
                </Text>

                <View style={styles.accDivider} />

                <View style={styles.accDetailsWrap}>
                  <Text style={styles.accCompany}>{displayBrokerName}</Text>
                  <View style={styles.accServerRow}>
                    <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>
                      #{accountDetails?.id || '---'}
                    </Text>
                    <View style={styles.accServerDot} />
                    <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>
                      {accountDetails?.server || t('Server')}
                    </Text>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Ionicons name="server-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>Orrnn</Text>
                  </View>
                  <View style={styles.chip}>
                    <Ionicons name="shield-checkmark-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>{t('Secure')}</Text>
                  </View>
                </View>
              </View>
            </FastPressable>

            <View style={styles.metricsRow}>
              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="list" size={18} color="#1D4ED8" />
                  </View>
                  <Text style={styles.metricLabel}>{t('Quotes')}</Text>
                </View>
                <Text style={styles.metricValue}>{quoteSymbols?.length || 0}</Text>
              </View>

              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="analytics" size={18} color="#1D4ED8" />
                  </View>
                  <Text style={styles.metricLabel}>{t('Drawings')}</Text>
                </View>
                <Text style={styles.metricValue}>{chartDrawings?.length || 0}</Text>
              </View>

              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={[styles.metricIconCircle, oneClickAccepted && styles.metricIconCircleActive]}>
                    <Ionicons name="flash" size={18} color={oneClickAccepted ? '#3B82F6' : '#1D4ED8'} />
                  </View>
                  <Text style={styles.metricLabel}>{t('One-Click')}</Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleText, oneClickAccepted && { color: '#3B82F6' }]}>{oneClickAccepted ? t('On') : t('Off')}</Text>
                  <Switch
                    value={oneClickAccepted}
                    onValueChange={setOneClickAccepted}
                    trackColor={{ false: '#1E293B', true: 'rgba(59, 130, 246, 0.5)' }}
                    thumbColor={oneClickAccepted ? '#3b82f6' : '#f4f3f4'}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: oneClickAccepted ? '#3b82f6' : '#f4f3f4' } as any)}
                  />
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t('TRADING & ACCOUNT')}</Text>
            <FastPressable
              style={[styles.singleRowCard, styles.cardShadow]}
              onPress={() => openReadySettingsRoute('/register')}
              unstable_pressDelay={0}
              latencyLabel="settings.register.open"
            >
              <View style={[styles.iconBox, { backgroundColor: 'rgba(29, 78, 216, 0.1)' }]}>
                <Ionicons name="person-outline" size={20} color="#1D4ED8" />
              </View>
              <Text style={styles.rowTitleSingle}>{t('New Account')}</Text>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </FastPressable>

            {lowerSettingsReady ? (
              <>
                <Text style={styles.sectionTitle}>{t('MARKET UPDATES')}</Text>
                <View style={[styles.groupCard, styles.cardShadow]}>
                  <SettingRow T={T} styles={styles} icon="calendar-outline" color="#1D4ED8" title={t('Economic Calender')} sub="" onPress={() => openReadySettingsRoute('/settings/economic-calendar')} />
                </View>

                <Text style={styles.sectionTitle}>{t('PREFERENCES & TOOLS')}</Text>
                <View style={[styles.groupCard, styles.cardShadow]}>
                  <SettingRow
                    T={T}
                    styles={styles}
                    icon="color-palette-outline"
                    color="#1D4ED8"
                    title={t('Theme')}
                    sub={themeMode === 'light' ? t('Light Mode') : t('Dark Mode')}
                    onPress={toggleThemeMode}
                    activateOnPressIn
                    rightElement={
                      <View pointerEvents="none">
                        <Switch
                          value={themeMode === 'light'}
                          onValueChange={(val) => setThemeMode(val ? 'light' : 'dark')}
                          trackColor={{ false: T.borderMedium, true: 'rgba(59, 130, 246, 0.5)' }}
                          thumbColor={themeMode === 'light' ? '#3b82f6' : '#f4f3f4'}
                          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                          {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: themeMode === 'light' ? '#3b82f6' : '#f4f3f4' } as any)}
                        />
                      </View>
                    }
                  />
                  <View style={styles.dividerInner} />
                  <SettingRow T={T} styles={styles} icon="browsers-outline" color="#1D4ED8" title={t('Language Preference')} sub={currentLanguageNative} onPress={() => openReadySettingsRoute('/settings/interface')} />
                  <View style={styles.dividerInner} />
                  <SettingRow T={T} styles={styles} icon="reader-outline" color="#1D4ED8" title={t('Journal')} onPress={() => openReadySettingsRoute('/settings/journal')} />
                </View>

                <Text style={styles.sectionTitle}>{t('SUPPORT & HELP')}</Text>
                <View style={[styles.groupCard, styles.cardShadow]}>
                  <SettingRow T={T} styles={styles} icon="help-buoy-outline" color="#1D4ED8" title={t('Support')} sub={supportEmail} onPress={handleEmailSupport} />
                  <View style={styles.dividerInner} />
                  <SettingRow T={T} styles={styles} icon="information-circle-outline" color="#1D4ED8" title={t('Help')} sub={t('FAQ')} onPress={() => openReadySettingsRoute('/settings/help')} />
                </View>

                <View style={styles.logoutContainer}>
                  <FastPressable
                    style={styles.singleRowCardLogout}
                    onPress={handleLogout}
                    latencyLabel="settings.logout.prompt"
                  >
                    <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                      <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                    </View>
                    <Text style={[styles.rowTitleSingle, { color: '#EF4444' }]}>{t('Logout')}</Text>
                  </FastPressable>
                </View>
              </>
            ) : null}
        </View>
      </ScrollView>

    </Screen>
  );
}
