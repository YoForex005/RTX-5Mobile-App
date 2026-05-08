/**
 * Core User Preferences & Account Settings Screen (aka 'Settings' tab).
 *
 * Manages local user configurations (Theme, Trading defaults, API connection states)
 * and handles secure authentication workflows (Login/Logout/Disconnect).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { useUserPreferences } from '../../../state/userPreferences';
import { useUIState } from '../../../state/uiState';
import { fmt } from '../../../utils/format';
import { useTheme } from '../../../ui/theme/useTheme';
import { QRScannerModal } from '../../../ui/components/QRScannerModal';
import { useTranslation } from '../../../i18n/useTranslation';
import { SUPPORTED_LANGUAGES, translateAccountCardName } from '../../../i18n/translations';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useBrokerConfig } from '../../../query/broker';
import { useAccounts } from '../../../query/accounts';
import { accountWsService } from '../../../api/ws/accountSocket';
import { candlesWsService } from '../../../domain/candles/ws/candlesSocket';
import { traceUiInteraction } from '../../../dev/uiInteractionDiagnostics';
import { SettingRow } from './SettingRow';
import { makeSettingsStyles } from './styles';

export function SettingsScreen() {
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, isDemoAccount, themeMode, setThemeMode, accountDetails } = useUserPreferences(
    useShallow((state) => ({
      quoteSymbols: state.quoteSymbols,
      chartDrawings: state.chartDrawings,
      oneClickAccepted: state.oneClickAccepted,
      setOneClickAccepted: state.setOneClickAccepted,
      isDemoAccount: state.isDemoAccount,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      accountDetails: state.accountDetails,
    })),
  );
  const brokerId = useUserPreferences((s) => s.brokerId);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const liveBalance = useLiveAccountState((s) => s.balance);
  const { data: brokerConfig } = useBrokerConfig(brokerId);
  const { data: accounts } = useAccounts(isLoggedIn);
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeAccount = accounts?.find((a) => a.login === currentLogin) ?? accounts?.[0];
  const rawAccountName = activeAccount?.name ?? 'Account';
  const displayEmail = accountDetails?.name ?? '---';
  const displayBalance = liveBalance > 0 ? fmt.price(liveBalance) : '---';
  const displayCurrency = 'USD';
  const displayBrokerName = brokerConfig?.broker_name ?? '---';
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const setSearchActive = useUIState((s) => s.setSearchActive);
  const T = useTheme();
  const { t, language } = useTranslation();
  const displayAccountName = translateAccountCardName(rawAccountName, t);
  const currentLanguageNative = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName ?? 'English';
  const styles = useMemo(() => makeSettingsStyles(T, themeMode), [T, themeMode]);

  void setSidebarOpen;
  void activeAccount;

  const logout = useUserPreferences((s) => s.logout);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);

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
            router.replace('/login');
          },
        },
      ],
    );
  };
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => setSearchActive(false);
  }, [setSearchActive]);

  const enableSearch = () => {
    traceUiInteraction('settings.search.open', () => {
      setIsSearching(true);
      setSearchActive(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    });
  };

  const disableSearch = () => {
    traceUiInteraction('settings.search.close', () => {
      setIsSearching(false);
      setSearchActive(false);
      setSearchQuery('');
      Keyboard.dismiss();
    });
  };

  const SEARCHABLE_ITEMS = useMemo(() => [
    { title: 'New Account', sub: '', icon: 'person-outline' },
    { title: 'Mailbox', sub: 'High Importance News', icon: 'mail-outline' },
    { title: 'News', sub: 'WTI, US-Iran Talks, OPEC+', icon: 'newspaper-outline' },
    { title: 'Economic Calender', sub: '', icon: 'calendar-outline' },
    { title: 'Chat & Messages', sub: 'Sign in to MQL5.community', icon: 'chatbubble-outline' },
    { title: 'Traders Community', sub: '', icon: 'people-outline' },
    { title: 'MQL5 Algo Trading', sub: '', icon: 'flash-outline' },
    { title: 'Theme', sub: 'Light/Dark Mode toggle', icon: 'color-palette-outline' },
    { title: 'OTP', sub: 'Passcode Generator', icon: 'shield-checkmark-outline' },
    { title: 'QR Scanner', sub: 'Scan to connect or log in', icon: 'qr-code-outline' },
    { title: 'Language Preference', sub: currentLanguageNative, icon: 'browsers-outline' },
    { title: 'Journal', sub: '', icon: 'reader-outline' },
    { title: 'Support', sub: 'Contact our dedicated team', icon: 'help-buoy-outline' },
    { title: 'Help', sub: 'FAQs & Documentation', icon: 'information-circle-outline' },
  ], [currentLanguageNative]);

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
    <Screen noBottomInset>
      <View style={styles.headerWrap}>
        <AppHeader
          title={t('Settings')}
          noBorder
          paddingBottom={isSearching ? 8 : 12}
          rightActions={
            !isSearching ? (
              <Pressable onPress={enableSearch} hitSlop={12} unstable_pressDelay={0}>
                <Ionicons name="search" size={22} color={T.textMuted} />
              </Pressable>
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
              <Pressable onPress={disableSearch} hitSlop={10} unstable_pressDelay={0}>
                <Ionicons name="close-circle" size={18} color={T.textMuted} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isSearching ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={[styles.groupCard, styles.cardShadow, { marginTop: 8, marginHorizontal: 0 }]}>
              {searchResults.length > 0 ? searchResults.map((item, index) => (
                <View key={item.title}>
                  <SettingRow T={T} styles={styles} icon={item.icon as any} color="#1D4ED8" title={t(item.title)} sub={item.sub ? t(item.sub) : item.sub} />
                  {index < searchResults.length - 1 && <View style={styles.dividerInner} />}
                </View>
              )) : (
                <View style={{ paddingTop: 60, paddingBottom: 60, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={48} color={T.borderMedium} />
                  <Text style={{ color: T.textMuted, marginTop: 16, fontSize: 16 }}>{t('No settings found matching')} "{searchQuery}"</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View>
            <Pressable
              onPress={() => traceUiInteraction('settings.accounts.open', () => router.push('/settings/accounts'))}
              unstable_pressDelay={0}
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
            </Pressable>

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
            <Pressable
              style={[styles.singleRowCard, styles.cardShadow]}
              onPress={() => traceUiInteraction('settings.register.open', () => router.push('/register'))}
              unstable_pressDelay={0}
            >
              <View style={[styles.iconBox, { backgroundColor: 'rgba(29, 78, 216, 0.1)' }]}>
                <Ionicons name="person-outline" size={20} color="#1D4ED8" />
              </View>
              <Text style={styles.rowTitleSingle}>{t('New Account')}</Text>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </Pressable>

            <Text style={styles.sectionTitle}>{t('SOCIAL & ALGO')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles} icon="mail-outline" color="#1D4ED8" title={t('Mailbox')} sub={t('High Importance News')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="newspaper-outline" color="#1D4ED8" title={t('News')} sub="WTI, US-Iran Talks, OPEC+" />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="calendar-outline" color="#1D4ED8" title={t('Economic Calender')} sub="" onPress={() => router.push('/settings/economic-calendar')} />
            </View>

            <Text style={styles.sectionTitle}>{t('SOCIAL & ALGO')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles} icon="chatbubble-outline" color="#1D4ED8" title={t('Chat & Messages')} sub={t('Sign in to MQL5.community')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="people-outline" color="#1D4ED8" title={t('Traders Community')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="flash-outline" color="#1D4ED8" title={t('MQL5 Algo Trading')} />
            </View>

            <Text style={styles.sectionTitle}>{t('PREFERENCES & TOOLS')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles} icon="color-palette-outline" color="#1D4ED8" title={t('Theme')} sub={themeMode === 'light' ? t('Light Mode') : t('Dark Mode')}
                rightElement={
                  <Switch
                    value={themeMode === 'light'}
                    onValueChange={(val) => setThemeMode(val ? 'light' : 'dark')}
                    trackColor={{ false: T.borderMedium, true: 'rgba(59, 130, 246, 0.5)' }}
                    thumbColor={themeMode === 'light' ? '#3b82f6' : '#f4f3f4'}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: themeMode === 'light' ? '#3b82f6' : '#f4f3f4' } as any)}
                  />
                }
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="shield-checkmark-outline" color="#1D4ED8" title={t('OTP')} sub={t('Passcode Generator')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="qr-code-outline" color="#1D4ED8" title={t('QR Scanner')} sub={t('Scan code to connect')} onPress={() => setShowScanner(true)} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="browsers-outline" color="#1D4ED8" title={t('Language Preference')} sub={currentLanguageNative} onPress={() => router.push('/settings/interface')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="reader-outline" color="#1D4ED8" title={t('Journal')} onPress={() => router.push('/settings/journal')} />
            </View>

            <Text style={styles.sectionTitle}>{t('SUPPORT & HELP')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles} icon="help-buoy-outline" color="#1D4ED8" title={t('Support')} sub={t('Contact our dedicated team')} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="information-circle-outline" color="#1D4ED8" title={t('Help')} sub={t('FAQs & Documentation')} />
            </View>

            <View style={styles.logoutContainer}>
              <Pressable
                style={styles.singleRowCardLogout}
                onPress={() => traceUiInteraction('settings.logout.prompt', handleLogout)}
                unstable_pressDelay={0}
              >
                <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.rowTitleSingle, { color: '#EF4444' }]}>{t('Logout')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(data) => {
          setShowScanner(false);
          setTimeout(() => {
            Alert.alert(t('Scanned Success'), data);
          }, 300);
        }}
      />
    </Screen>
  );
}
