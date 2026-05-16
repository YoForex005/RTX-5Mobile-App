import { FastPressable as Pressable } from '../../ui/components/FastPressable';
﻿import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Switch } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useMemo } from 'react';

export function SettingsScreen() {
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, isDemoAccount, setIsDemoAccount, themeMode, setThemeMode } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, themeMode), [T, themeMode]);

  return (
    <Screen>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ height: 56, marginTop: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: T.text, textAlign: 'center' }}>Settings</Text>
          <Pressable style={{ position: 'absolute', right: 16, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="search" size={24} color={T.textMuted} />
          </Pressable>
        </View>

        {/* ΓöÇΓöÇ Main Account Card ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <Pressable onPress={() => router.push('/settings/accounts')}>
          <View style={[styles.accountCard, styles.cardShadow]}>
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
              <Pressable 
                onPress={() => setIsDemoAccount(!isDemoAccount)}
                style={[styles.accountBadge, isDemoAccount ? styles.badgeDemo : styles.badgeLive]}
              >
                <View style={[styles.indicatorGlow, isDemoAccount ? styles.glowDemo : styles.glowLive]}>
                  <View style={[styles.indicatorDot, isDemoAccount ? styles.dotDemo : styles.dotLive]} />
                </View>
                <Text style={[styles.accountTypeText, isDemoAccount ? styles.textDemo : styles.textLive]}>
                  {isDemoAccount ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
                </Text>
              </Pressable>
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
              <Text style={styles.accCompany}>Exness Technologies Ltd</Text>
              <View style={styles.accServerRow}>
                <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>#415257556</Text>
                <View style={styles.accServerDot} />
                <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>Exness-Orrnn Trial 14</Text>
                <View style={styles.accServerDot} />
                <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>Access Point #6</Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Ionicons name="server-outline" size={12} color="#FFFFFF" />
                <Text style={[styles.chipText, { color: '#FFFFFF' }]}>Orrnn</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="cloud-done-outline" size={12} color="#FFFFFF" />
                <Text style={[styles.chipText, { color: '#FFFFFF' }]}>Point #6</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#FFFFFF" />
                <Text style={[styles.chipText, { color: '#FFFFFF' }]}>Secure</Text>
              </View>
            </View>
          </View>
        </Pressable>

        {/* ΓöÇΓöÇ Metrics Row ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <View style={styles.metricsRow}>
          {/* Quotes Block */}
          <View style={styles.metricBlock}>
            <View style={styles.metricTopRow}>
              <View style={styles.metricIconCircle}>
                <Ionicons name="list" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.metricLabel}>Quotes</Text>
            </View>
            <Text style={styles.metricValue}>108</Text>
          </View>

          {/* Drawings Block */}
          <View style={styles.metricBlock}>
            <View style={styles.metricTopRow}>
              <View style={styles.metricIconCircle}>
                <Ionicons name="analytics" size={18} color="#F59E0B" />
              </View>
              <Text style={styles.metricLabel}>Drawings</Text>
            </View>
            <Text style={styles.metricValue}>0</Text>
          </View>

          {/* One-Click Block */}
          <View style={styles.metricBlock}>
            <View style={styles.metricTopRow}>
              <View style={[styles.metricIconCircle, oneClickAccepted && styles.metricIconCircleActive]}>
                <Ionicons name="flash" size={18} color={oneClickAccepted ? '#10B981' : '#64748B'} />
              </View>
              <Text style={styles.metricLabel}>One-Click</Text>
            </View>
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleText, oneClickAccepted && { color: '#10B981' }]}>{oneClickAccepted ? 'On' : 'Off'}</Text>
              <Switch
                value={oneClickAccepted}
                onValueChange={setOneClickAccepted}
                trackColor={{ false: '#1E293B', true: 'rgba(16,185,129,0.35)' }}
                thumbColor={oneClickAccepted ? '#10B981' : '#64748B'}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
          </View>
        </View>

        {/* ΓöÇΓöÇ ACCOUNT SECTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Pressable style={[styles.singleRowCard, styles.cardShadow]}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
            <Ionicons name="person-outline" size={20} color="#22C55E" />
          </View>
          <Text style={styles.rowTitleSingle}>New Account</Text>
          <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
        </Pressable>


        {/* ΓöÇΓöÇ MARKET & NEWS SECTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <Text style={styles.sectionTitle}>MARKET & NEWS</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow T={T} styles={styles}
            icon="mail-outline" color="#1D4ED8"
            title="Mailbox" sub="High Importance News"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="newspaper-outline" color="#F59E0B"
            title="News" sub="WTI, US-Iran Talks, OPEC+"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="calendar-outline" color="#22C55E"
            title="Economic Calender" sub=""
          />
        </View>

        {/* ΓöÇΓöÇ COMMUNITY SECTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
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
            icon="flash-outline" color="#10B981"
            title="MQL5 Algo Trading"
          />
        </View>

        {/* ΓöÇΓöÇ TERMINAL SECTION (Vertical List) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <Text style={styles.sectionTitle}>TERMINAL</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow T={T} styles={styles}
            icon="color-palette-outline" color="#F59E0B"
            title="Theme" sub={themeMode === 'light' ? 'Light Mode' : 'Dark Mode'}
            rightElement={
              <Switch
                value={themeMode === 'light'}
                onValueChange={(val) => setThemeMode(val ? 'light' : 'dark')}
                trackColor={{ false: T.borderMedium, true: 'rgba(245,158,11,0.35)' }}
                thumbColor={themeMode === 'light' ? '#F59E0B' : T.textMuted}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            }
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="shield-checkmark-outline" color="#22C55E"
            title="OTP" sub="Passcode Generator"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="browsers-outline" color="#64748B"
            title="Interface" sub="English"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="stats-chart-outline" color="#1D4ED8"
            title="Charts"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="reader-outline" color="#64748B"
            title="Journal"
          />
        </View>

        {/* ΓöÇΓöÇ SUPPORT SECTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <Text style={styles.sectionTitle}>SUPPORT & HELP</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow T={T} styles={styles}
            icon="help-buoy-outline" color="#3B82F6"
            title="Support" sub="Contact our dedicated team"
          />
          <View style={styles.dividerInner} />
          <SettingRow T={T} styles={styles}
            icon="information-circle-outline" color="#10B981"
            title="Help" sub="FAQs & Documentation"
          />
        </View>

        {/* ΓöÇΓöÇ LOGOUT SECTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <View style={styles.logoutContainer}>
          <Pressable style={styles.singleRowCardLogout}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitleSingle, { color: '#EF4444' }]}>Logout</Text>
          </Pressable>
        </View>

      </ScrollView>
    </Screen>
  );
}

// ΓöÇΓöÇ Shared Row Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function SettingRow({ icon, color, title, sub, badge, rightElement, T, styles }: { icon: any, color: string, title: string, sub?: string, badge?: string, rightElement?: React.ReactNode, T: ThemeColors, styles: any }) {
  return (
    <Pressable style={styles.row}>
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

// ΓöÇΓöÇ Styles ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
  headerTitle: { color: T.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
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
  accTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },

  accountBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, gap: 6 },
  badgeDemo: { backgroundColor: 'rgba(0, 230, 118, 0.12)', borderColor: 'rgba(0, 230, 118, 0.3)' },
  badgeLive: { backgroundColor: 'rgba(250, 204, 21, 0.12)', borderColor: 'rgba(250, 204, 21, 0.3)' },
  indicatorGlow: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  glowDemo: { backgroundColor: 'rgba(0, 230, 118, 0.2)' },
  glowLive: { backgroundColor: 'rgba(250, 204, 21, 0.2)' },
  indicatorDot: { width: 6, height: 6, borderRadius: 3 },
  dotDemo: { backgroundColor: '#00E676' },
  dotLive: { backgroundColor: '#FACC15' },
  accountTypeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  textDemo: { color: '#00E676' },
  textLive: { color: '#FACC15' },

  connectedPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)' },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399', marginRight: 6 },
  connectedText: { color: '#34D399', fontSize: 11, fontWeight: '700' },

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
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.25)',
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
