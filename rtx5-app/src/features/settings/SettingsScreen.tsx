import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, Switch } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { G } from '../../theme/glass';

export function SettingsScreen() {
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, isDemoAccount, setIsDemoAccount } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
            <Ionicons name="menu" size={24} color="#CBD5E1" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSub}>Account, Terminal & Market Preferences</Text>
          </View>
          <Pressable style={styles.searchBtn}>
            <Ionicons name="search" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* ── Main Account Card ─────────────────────────────────── */}
        <Pressable onPress={() => router.push('/settings/accounts')}>
          <View style={[styles.accountCard, styles.cardShadow]}>
            <LinearGradient
              colors={['#0d1628', '#07101e']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Massive deep blue circle on top left */}
            <View style={styles.cardBubbleLeft} />
            {/* Darker deep blue circle on top right (behind Connected) */}
            <View style={styles.cardBubbleRight} />

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

            <Text style={styles.accName}>Standard</Text>
            <Text style={styles.accBalance}>
              119,701.53 <Text style={styles.accCurrency}>USD</Text>
            </Text>

            <View style={styles.accDivider} />

            <View style={styles.accDetailsWrap}>
              <Text style={styles.accCompany}>Exness Technologies Ltd</Text>
              <Text style={styles.accServer}>#415257556 • Exness-MT5 Trial 14 • Access Point #6</Text>
            </View>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Ionicons name="server-outline" size={12} color="#94A3B8" />
                <Text style={styles.chipText}>MT5</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="cloud-done-outline" size={12} color="#94A3B8" />
                <Text style={styles.chipText}>Point #6</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#94A3B8" />
                <Text style={styles.chipText}>Secure</Text>
              </View>
            </View>
          </View>
        </Pressable>

        {/* ── Metrics Row ───────────────────────────────────────── */}
        <View style={styles.metricsRow}>
          {/* Quotes Block */}
          <View style={styles.metricBlock}>
            <View style={styles.metricLabelRow}>
              <Ionicons name="list" size={12} color="#64748B" style={styles.metricIcon} />
              <Text style={styles.metricLabel}>Quotes</Text>
            </View>
            <Text style={styles.metricValue}>108</Text>
          </View>

          {/* Drawings Block */}
          <View style={styles.metricBlock}>
            <View style={styles.metricLabelRow}>
              <Ionicons name="analytics" size={12} color="#64748B" style={styles.metricIcon} />
              <Text style={styles.metricLabel}>Drawings</Text>
            </View>
            <Text style={styles.metricValue}>0</Text>
          </View>

          {/* One-Click Block */}
          <View style={[styles.metricBlock, { alignItems: 'center' }]}>
            <Text style={styles.metricLabelCenter}>One-Click</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>{oneClickAccepted ? 'On' : 'Off'}</Text>
              <Switch
                value={oneClickAccepted}
                onValueChange={setOneClickAccepted}
                trackColor={{ false: '#1E293B', true: '#3B82F6' }}
                thumbColor={'#FFFFFF'}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
        </View>

        {/* ── ACCOUNT SECTION ───────────────────────────────────── */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Pressable style={[styles.singleRowCard, styles.cardShadow]}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
            <Ionicons name="person-outline" size={20} color="#22C55E" />
          </View>
          <Text style={styles.rowTitleSingle}>New Account</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </Pressable>

        {/* ── MARKET & NEWS SECTION ─────────────────────────────── */}
        <Text style={styles.sectionTitle}>MARKET & NEWS</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow
            icon="mail-outline" color="#1D4ED8"
            title="Mailbox" sub="High Importance News"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="newspaper-outline" color="#F59E0B"
            title="News" sub="WTI, US-Iran Talks, OPEC+"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="calendar-outline" color="#22C55E"
            title="Tradays" sub="Economic Calendar"
          />
        </View>

        {/* ── COMMUNITY SECTION ─────────────────────────────────── */}
        <Text style={styles.sectionTitle}>COMMUNITY</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow
            icon="chatbubble-outline" color="#1D4ED8"
            title="Chat & Messages" sub="Sign in to MQL5.community"
            badge="9"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="people-outline" color="#1D4ED8"
            title="Traders Community"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="flash-outline" color="#10B981"
            title="MQL5 Algo Trading"
          />
        </View>

        {/* ── TERMINAL SECTION (Vertical List) ───────────────────── */}
        <Text style={styles.sectionTitle}>TERMINAL</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow
            icon="shield-checkmark-outline" color="#22C55E"
            title="OTP" sub="Passcode Generator"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="browsers-outline" color="#64748B"
            title="Interface" sub="English"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="stats-chart-outline" color="#1D4ED8"
            title="Charts"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="reader-outline" color="#64748B"
            title="Journal"
          />
        </View>

        {/* ── SUPPORT SECTION ───────────────────────────────────── */}
        <Text style={styles.sectionTitle}>SUPPORT & HELP</Text>
        <View style={[styles.groupCard, styles.cardShadow]}>
          <SettingRow
            icon="help-buoy-outline" color="#3B82F6"
            title="Support" sub="Contact our dedicated team"
          />
          <View style={styles.dividerInner} />
          <SettingRow
            icon="information-circle-outline" color="#10B981"
            title="Help" sub="FAQs & Documentation"
          />
        </View>

        {/* ── LOGOUT SECTION ────────────────────────────────────── */}
        <View style={styles.logoutContainer}>
          <Pressable style={styles.singleRowCard}>
            <View style={styles.iconBox}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitleSingle, { color: '#EF4444' }]}>Logout</Text>
          </Pressable>
        </View>

      </ScrollView>
    </Screen>
  );
}

// ── Shared Row Component ────────────────────────────────────────

function SettingRow({ icon, color, title, sub, badge }: { icon: any, color: string, title: string, sub?: string, badge?: string }) {
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
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
      </View>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { paddingBottom: 100 },

  cardShadow: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  menuBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: G.glass1,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.borderMedium,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: G.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  headerSub: { color: G.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  searchBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: G.glass1,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: G.borderMedium,
  },

  // Account Card
  accountCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', overflow: 'hidden', position: 'relative',
  },
  cardBubbleLeft: {
    position: 'absolute', top: -70, left: -20, width: 220, height: 220,
    backgroundColor: '#0F162A', borderRadius: 110, opacity: 0,
  },
  cardBubbleRight: {
    position: 'absolute', top: -80, right: -60, width: 200, height: 200,
    backgroundColor: '#060B18', borderRadius: 100, opacity: 0,
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

  accName: { color: G.text, fontSize: 28, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },
  accBalance: { color: '#3b82f6', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  accCurrency: { fontSize: 16, fontWeight: '700', color: '#3b82f6' },

  accDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 20, marginBottom: 16 },

  accDetailsWrap: { marginBottom: 16 },
  accCompany: { color: G.textSub, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  accServer: { color: G.textMuted, fontSize: 11, fontWeight: '500', letterSpacing: 0.1 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipText: { color: G.textSub, fontSize: 11, fontWeight: '700' },

  // Metrics Row
  metricsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 },
  metricBlock: { flex: 1, backgroundColor: '#0c1018', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 14, overflow: 'hidden', position: 'relative' },
  metricBlockActive: {
    borderColor: G.trading.buy.primary,
    backgroundColor: '#0c1018',
    shadowColor: G.trading.buy.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'center' },
  metricIcon: { marginRight: 4 },
  dotsVertical: { marginRight: 4, gap: 2, height: 12, justifyContent: 'center' },
  tinyDot: { width: 2, height: 2, backgroundColor: G.trading.buy.hover, borderRadius: 1 },
  metricLabel: { color: G.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  metricLabelActive: { color: G.trading.buy.hover, fontSize: 11, fontWeight: '600' },
  metricValue: { color: G.text, fontSize: 22, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  metricLabelCenter: { color: G.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  toggleText: { color: G.text, fontSize: 14, fontWeight: '700' },

  // Sections
  sectionTitle: { color: '#4a5570', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginLeft: 20, marginTop: 28, marginBottom: 8, textTransform: 'uppercase' },
  singleRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1220', marginHorizontal: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  rowTitleSingle: { flex: 1, color: G.text, fontSize: 15, fontWeight: '600', marginLeft: 16, zIndex: 1 },

  groupCard: { backgroundColor: '#0d1220', marginHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, zIndex: 1 },
  dividerInner: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 72, zIndex: 1 },

  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  rowTextWrap: { flex: 1, marginLeft: 14, zIndex: 1 },
  rowTitle: { color: G.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: G.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  badge: { backgroundColor: '#dc2626', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  radialHighlight: {
    position: 'absolute', top: -50, right: -50, width: 150, height: 150,
    backgroundColor: G.trading.buy.primary, borderRadius: 75, opacity: 0.05,
  },
  logoutContainer: {
    marginTop: 24, marginBottom: 24, marginHorizontal: 16,
    borderRadius: 16, backgroundColor: '#0d1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
});
