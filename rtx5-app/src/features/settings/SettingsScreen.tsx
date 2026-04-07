/**
 * Core User Preferences & Account Settings Screen (aka 'Settings' tab).
 * 
 * Manages local user configurations (Theme, Trading defaults, API connection states)
 * and handles secure authentication workflows (Login/Logout/Disconnect).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, Switch, TextInput, Keyboard } from 'react-native';
import { Screen } from '../../components/Screen';
import { AppHeader } from '../../components/AppHeader';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { QRScannerModal } from '../../components/QRScannerModal';

export function SettingsScreen() {
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, isDemoAccount, setIsDemoAccount, themeMode, setThemeMode, accountDetails } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const setSearchActive = useUIState((s) => s.setSearchActive);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, themeMode), [T, themeMode]);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => setSearchActive(false);
  }, [setSearchActive]);

  const enableSearch = () => {
    setIsSearching(true);
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const disableSearch = () => {
    setIsSearching(false);
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const SEARCHABLE_ITEMS = useMemo(() => [
    { title: 'New Account', sub: '', icon: 'person-outline' },
    { title: 'Mailbox', sub: 'High Importance News', icon: 'mail-outline' },
    { title: 'News', sub: 'WTI, US-Iran Talks, OPEC+', icon: 'newspaper-outline' },
    { title: 'Tradays', sub: 'Economic Calendar', icon: 'calendar-outline' },
    { title: 'Chat & Messages', sub: 'Sign in to MQL5.community', icon: 'chatbubble-outline' },
    { title: 'Traders Community', sub: '', icon: 'people-outline' },
    { title: 'MQL5 Algo Trading', sub: '', icon: 'flash-outline' },
    { title: 'Theme', sub: 'Light/Dark Mode toggle', icon: 'color-palette-outline' },
    { title: 'OTP', sub: 'Passcode Generator', icon: 'shield-checkmark-outline' },
    { title: 'QR Scanner', sub: 'Scan to connect or log in', icon: 'qr-code-outline' },
    { title: 'Interface', sub: 'English', icon: 'browsers-outline' },
    { title: 'Charts', sub: '', icon: 'stats-chart-outline' },
    { title: 'Journal', sub: '', icon: 'reader-outline' },
    { title: 'Support', sub: 'Contact our dedicated team', icon: 'help-buoy-outline' },
    { title: 'Help', sub: 'FAQs & Documentation', icon: 'information-circle-outline' },
  ], []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return SEARCHABLE_ITEMS;
    const q = searchQuery.toLowerCase();
    return SEARCHABLE_ITEMS.filter(it => it.title.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q));
  }, [searchQuery, SEARCHABLE_ITEMS]);

  const searchBarStyle: any = themeMode === 'dark' ? {
    backgroundColor: 'rgba(30, 41, 59, 0.55)', // Deep translucent slate glass
    borderTopColor: 'rgba(255, 255, 255, 0.12)', // Top edge light reflection
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
    borderRightColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomColor: 'rgba(0, 0, 0, 0.4)', // Bottom shadow sink
    borderWidth: 1, borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  } : {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1, borderRadius: 24,
  };

  return (
    <Screen>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isSearching ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <AppHeader title="Settings" noBorder />
            <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, width: '100%', gap: 10 }, searchBarStyle]}>
              <Ionicons name="search" size={20} color={T.textMuted} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search settings..."
                placeholderTextColor={themeMode === 'dark' ? 'rgba(255, 255, 255, 0.4)' : T.textMuted}
                style={[{ flex: 1, color: T.text, fontSize: 15, fontWeight: '500' }, { outlineStyle: 'none' } as any]}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <Pressable onPress={disableSearch}>
                <Ionicons name="close-circle" size={16} color={T.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : (
          <AppHeader
            title="Settings"
            noBorder
            rightActions={
              <Pressable onPress={enableSearch} hitSlop={12}>
                <Ionicons name="search" size={22} color={T.textMuted} />
              </Pressable>
            }
          />
        )}

        {isSearching ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={[styles.groupCard, styles.cardShadow, { marginTop: 8, marginHorizontal: 0 }]}>
              {searchResults.length > 0 ? searchResults.map((item, index) => (
                <View key={item.title}>
                  <SettingRow T={T} styles={styles} icon={item.icon as any} color="#1D4ED8" title={item.title} sub={item.sub} />
                  {index < searchResults.length - 1 && <View style={styles.dividerInner} />}
                </View>
              )) : (
                <View style={{ paddingTop: 60, paddingBottom: 60, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={48} color={T.borderMedium} />
                  <Text style={{ color: T.textMuted, marginTop: 16, fontSize: 16 }}>No settings found matching "{searchQuery}"</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View>
            {/* ── Main Account Card ─────────────────────────────────── */}
            <Pressable onPress={() => router.push('/settings/accounts')}>
              <View style={[styles.accountCard, styles.cardShadow]}>
                {/* Top-Left Diagonal Ribbon */}
                <View style={[styles.ribbonContainer, isDemoAccount ? styles.ribbonDemo : styles.ribbonLive]}>
                  <Text style={styles.ribbonText}>{isDemoAccount ? 'Demo' : 'Real'}</Text>
                </View>

                <LinearGradient
                  colors={themeMode === 'light' ? ['#4F46E5', '#3730A3'] : ['#0d1628', '#07101e']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Massive deep indigo circle on top left */}
                <View style={[styles.cardBubbleLeft, { backgroundColor: themeMode === 'light' ? '#6366F1' : '#0F162A' }]} />
                {/* Lighter indigo circle on top right (behind Connected) */}
                <View style={[styles.cardBubbleRight, { backgroundColor: themeMode === 'light' ? '#818CF8' : '#060B18' }]} />

                <View style={styles.accTopRow}>
                  <View style={styles.connectedPill}>
                    <View style={styles.greenDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                </View>

                <Text style={[styles.accName, themeMode === 'light' && { color: '#FFFFFF' }]}>Standard</Text>
                <Text style={[styles.accBalance, themeMode === 'light' && { color: '#FFFFFF' }]}>
                  119,701.53 <Text style={[styles.accCurrency, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>USD</Text>
                </Text>

                <View style={styles.accDivider} />

                <View style={styles.accDetailsWrap}>
                  <Text style={styles.accCompany}>RTX-5</Text>
                  <View style={styles.accServerRow}>
                    <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>
                      #{accountDetails?.id || '---'}
                    </Text>
                    <View style={styles.accServerDot} />
                    <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>
                      {accountDetails?.server || 'Server'}
                    </Text>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Ionicons name="server-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>MT5</Text>
                  </View>
                  <View style={styles.chip}>
                    <Ionicons name="shield-checkmark-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.chipText, { color: '#FFFFFF' }]}>Secure</Text>
                  </View>
                </View>
              </View>
            </Pressable>

            {/* ── Metrics Row ───────────────────────────────────────── */}
            <View style={styles.metricsRow}>
              {/* Quotes Block */}
              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="list" size={18} color="#1D4ED8" />
                  </View>
                  <Text style={styles.metricLabel}>Quotes</Text>
                </View>
                <Text style={styles.metricValue}>{quoteSymbols?.length || 0}</Text>
              </View>

              {/* Drawings Block */}
              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="analytics" size={18} color="#1D4ED8" />
                  </View>
                  <Text style={styles.metricLabel}>Drawings</Text>
                </View>
                <Text style={styles.metricValue}>{chartDrawings?.length || 0}</Text>
              </View>

              {/* One-Click Block */}
              <View style={styles.metricBlock}>
                <View style={styles.metricTopRow}>
                  <View style={[styles.metricIconCircle, oneClickAccepted && styles.metricIconCircleActive]}>
                    <Ionicons name="flash" size={18} color={oneClickAccepted ? '#3B82F6' : '#1D4ED8'} />
                  </View>
                  <Text style={styles.metricLabel}>One-Click</Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleText, oneClickAccepted && { color: '#3B82F6' }]}>{oneClickAccepted ? 'On' : 'Off'}</Text>
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

            {/* ── ACCOUNT SECTION ───────────────────────────────────── */}
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <Pressable style={[styles.singleRowCard, styles.cardShadow]} onPress={() => router.push('/register')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(29, 78, 216, 0.1)' }]}>
                <Ionicons name="person-outline" size={20} color="#1D4ED8" />
              </View>
              <Text style={styles.rowTitleSingle}>New Account</Text>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </Pressable>


            {/* ── MARKET & NEWS SECTION ─────────────────────────────── */}
            <Text style={styles.sectionTitle}>MARKET & NEWS</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles}
                icon="mail-outline" color="#1D4ED8"
                title="Mailbox" sub="High Importance News"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="newspaper-outline" color="#1D4ED8"
                title="News" sub="WTI, US-Iran Talks, OPEC+"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="calendar-outline" color="#1D4ED8"
                title="Tradays" sub="Economic Calendar"
                onPress={() => router.push('/settings/economic-calendar')}
              />
            </View>

            {/* ── COMMUNITY SECTION ─────────────────────────────────── */}
            <Text style={styles.sectionTitle}>COMMUNITY</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles}
                icon="chatbubble-outline" color="#1D4ED8"
                title="Chat & Messages" sub="Sign in to MQL5.community"
                badge="9"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="people-outline" color="#1D4ED8"
                title="Traders Community"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="flash-outline" color="#1D4ED8"
                title="MQL5 Algo Trading"
              />
            </View>

            {/* ── TERMINAL SECTION (Vertical List) ───────────────────── */}
            <Text style={styles.sectionTitle}>TERMINAL</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles}
                icon="color-palette-outline" color="#1D4ED8"
                title="Theme" sub={themeMode === 'light' ? 'Light Mode' : 'Dark Mode'}
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
              <SettingRow T={T} styles={styles}
                icon="shield-checkmark-outline" color="#1D4ED8"
                title="OTP" sub="Passcode Generator"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="qr-code-outline" color="#1D4ED8"
                title="QR Scanner" sub="Scan code to connect"
                onPress={() => setShowScanner(true)}
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="browsers-outline" color="#1D4ED8"
                title="Interface" sub="English"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="stats-chart-outline" color="#1D4ED8"
                title="Charts"
                onPress={() => router.push('/settings/charts')}
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="reader-outline" color="#1D4ED8"
                title="Journal"
              />
            </View>

            {/* ── SUPPORT SECTION ───────────────────────────────────── */}
            <Text style={styles.sectionTitle}>SUPPORT & HELP</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              <SettingRow T={T} styles={styles}
                icon="help-buoy-outline" color="#1D4ED8"
                title="Support" sub="Contact our dedicated team"
              />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles}
                icon="information-circle-outline" color="#1D4ED8"
                title="Help" sub="FAQs & Documentation"
              />
            </View>

            {/* ── LOGOUT SECTION ────────────────────────────────────── */}
            <View style={styles.logoutContainer}>
              <Pressable style={styles.singleRowCardLogout}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.rowTitleSingle, { color: '#EF4444' }]}>Logout</Text>
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
          // Small delay before alert to ensure modal closes smoothly first
          setTimeout(() => {
            Alert.alert('Scanned Success', data);
          }, 300);
        }} 
      />
    </Screen>
  );
}

// ── Shared Row Component ────────────────────────────────────────

function SettingRow({ icon, color, title, sub, badge, rightElement, onPress, T, styles }: { icon: any, color: string, title: string, sub?: string, badge?: string, rightElement?: React.ReactNode, onPress?: () => void, T: ThemeColors, styles: any }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowRight}>
        {rightElement ? rightElement : (
          <>
            {badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
          </>
        )}
      </View>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const makeStyles = (T: ThemeColors, themeMode: 'light' | 'dark') => StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  content: { paddingBottom: 100 },

  cardShadow: {
    shadowColor: themeMode === 'light' ? '#0F172A' : '#2563EB',
    shadowOffset: { width: 0, height: themeMode === 'light' ? 8 : 6 },
    shadowOpacity: themeMode === 'light' ? 0.04 : 0.08,
    shadowRadius: themeMode === 'light' ? 24 : 20,
    elevation: themeMode === 'light' ? 0 : 6,
  },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.borderMedium,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '600' },
  headerSub: { color: T.textSub, fontSize: 13, fontWeight: '500', marginTop: 2 },
  searchBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.borderMedium,
  },

  // Account Card
  accountCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(79,70,229,0.1)' : 'rgba(59,130,246,0.25)', overflow: 'hidden', position: 'relative',
    shadowColor: themeMode === 'light' ? '#4F46E5' : '#2563EB',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: themeMode === 'light' ? 0.15 : 0.08, shadowRadius: 32, elevation: 8,
  },
  cardBubbleLeft: {
    position: 'absolute', top: -70, left: -20, width: 220, height: 220,
    borderRadius: 110, opacity: themeMode === 'light' ? 0.15 : 0,
  },
  cardBubbleRight: {
    position: 'absolute', top: -80, right: -60, width: 200, height: 200,
    borderRadius: 100, opacity: themeMode === 'light' ? 0.15 : 0,
  },

  ribbonContainer: {
    position: 'absolute', top: 18, left: -42, width: 150, height: 26,
    justifyContent: 'center', alignItems: 'center',
    transform: [{ rotate: '-45deg' }], zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  ribbonDemo: { backgroundColor: '#10B981' },
  ribbonLive: { backgroundColor: '#3B82F6' },
  ribbonText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },

  accTopRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 },

  connectedPill: { flexDirection: 'row', alignItems: 'center' },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6', marginRight: 6 },
  connectedText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' },

  accName: { color: themeMode === 'light' ? '#FFF' : T.text, fontSize: 28, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },
  accBalance: { color: '#3b82f6', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  accCurrency: { fontSize: 26, fontWeight: '800', color: '#3b82f6' },

  accDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 20, marginBottom: 16 },

  accDetailsWrap: { marginBottom: 16 },
  accCompany: { color: themeMode === 'light' ? 'rgba(255,255,255,0.9)' : '#CBD5E1', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  accServer: { color: T.textMuted, fontSize: 12, fontWeight: '500', letterSpacing: 0.1 },
  accServerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  accServerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: themeMode === 'light' ? 'rgba(255,255,255,0.6)' : T.textMuted, marginLeft: 14, marginRight: 2 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipText: { color: T.textSub, fontSize: 11, fontWeight: '700' },

  // Metrics Row
  metricsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 },
  metricBlock: {
    flex: 1,
    backgroundColor: T.glass2,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
    position: 'relative',
    gap: 4,
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricBlockActive: {
    borderColor: T.trading.buy.primary,
    backgroundColor: T.glass2,
    shadowColor: T.trading.buy.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: themeMode === 'light' ? 0 : 6,
  },
  metricIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconCircleActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  metricLabel: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  metricValue: {
    color: T.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34 },
  toggleText: { color: T.text, fontSize: 15, fontWeight: '700' },

  // Sections
  sectionTitle: { color: T.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginLeft: 20, marginTop: 28, marginBottom: 8, textTransform: 'uppercase' },
  singleRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass1, marginHorizontal: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : T.border, overflow: 'hidden' },
  singleRowCardLogout: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : T.border, overflow: 'hidden' },
  rowTitleSingle: { flex: 1, color: T.text, fontSize: 15, fontWeight: '600', marginLeft: 16, zIndex: 1 },

  groupCard: { backgroundColor: T.glass1, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : T.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, zIndex: 1 },
  dividerInner: { height: 1, backgroundColor: T.borderMedium, marginLeft: 72, zIndex: 1 },

  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  rowTextWrap: { flex: 1, marginLeft: 14, zIndex: 1 },
  rowTitle: { color: T.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: T.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  badge: { backgroundColor: '#dc2626', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  radialHighlight: {
    position: 'absolute', top: -50, right: -50, width: 150, height: 150,
    backgroundColor: T.trading.buy.primary, borderRadius: 75, opacity: 0.05,
  },
  logoutContainer: {
    marginTop: 24, marginBottom: 24, paddingHorizontal: 16,
  },
});
