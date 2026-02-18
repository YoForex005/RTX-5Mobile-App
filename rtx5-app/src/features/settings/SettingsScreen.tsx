import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { settingsMenu } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';

type SettingItem = (typeof settingsMenu)[number];
type SectionItem = {
  title: string;
  data: SettingItem[];
};

type MenuMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
  badge?: string;
};

const MENU_META: Record<string, MenuMeta> = {
  'new-account': { icon: 'person-add-outline', color: '#72d88d', route: '/settings/brokers' },
  mailbox: { icon: 'mail-unread-outline', color: '#61a6ff', route: '/settings/mailbox' },
  news: { icon: 'newspaper-outline', color: '#f0b36d', route: '/settings/news' },
  tradays: { icon: 'calendar-outline', color: '#61d1ff' },
  chat: { icon: 'chatbubbles-outline', color: '#4f9dff', badge: '9' },
  community: { icon: 'people-outline', color: '#6f8fff' },
  algo: { icon: 'flash-outline', color: '#4ab0ff' },
  otp: { icon: 'shield-checkmark-outline', color: '#82d6a4' },
  interface: { icon: 'language-outline', color: '#9cb3d4' },
  charts: { icon: 'stats-chart-outline', color: '#6ea8ff' },
  journal: { icon: 'reader-outline', color: '#9fa9bc' },
  settings: { icon: 'settings-outline', color: '#99a5ba' },
};

const SECTION_GROUPS = [
  { title: 'Account', ids: ['new-account'] },
  { title: 'Market', ids: ['mailbox', 'news', 'tradays'] },
  { title: 'Community', ids: ['chat', 'community', 'algo'] },
  { title: 'Terminal', ids: ['otp', 'interface', 'charts', 'journal', 'settings'] },
] as const;

const ACCOUNT_CARD = {
  name: 'Standard',
  company: 'Exness Technologies Ltd',
  login: '415257556',
  server: 'Exness-MT5Trial14',
  accessPoint: 'Access Point #6',
  balance: 119701.53,
  currency: 'USD',
};

export function SettingsScreen() {
  const { quoteSymbols, chartDrawings, oneClickAccepted } = useUserPreferences();

  const sections = useMemo<SectionItem[]>(() => {
    const byId = new Map(settingsMenu.map((item) => [item.id, item]));

    return SECTION_GROUPS.map((group) => ({
      title: group.title,
      data: group.ids
        .map((id) => byId.get(id))
        .filter(Boolean) as SettingItem[],
    })).filter((section) => section.data.length > 0);
  }, []);

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Account, terminal and market preferences</Text>

            <Pressable
              style={({ pressed }) => [styles.accountCard, pressed && styles.pressed]}
              onPress={() => router.push('/settings/accounts')}
            >
              <View style={styles.accountHeader}>
                <View>
                  <Text style={styles.accountLabel}>Live Account</Text>
                  <Text style={styles.accountName}>{ACCOUNT_CARD.name}</Text>
                  <Text style={styles.accountBalance}>
                    {fmt.int(ACCOUNT_CARD.balance)} {ACCOUNT_CARD.currency}
                  </Text>
                </View>

                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Connected</Text>
                </View>
              </View>

              <View style={styles.accountDivider} />

              <Text style={styles.accountSub}>{ACCOUNT_CARD.company}</Text>
              <Text style={styles.accountSub}>#{ACCOUNT_CARD.login} · {ACCOUNT_CARD.server}</Text>
              <Text style={styles.accountSub}>{ACCOUNT_CARD.accessPoint}</Text>

              <View style={styles.chipsRow}>
                <MetaChip icon='server-outline' label='MT5' />
                <MetaChip icon='link-outline' label='Point #6' />
                <MetaChip icon='shield-checkmark-outline' label='Secure' />
              </View>
            </Pressable>

            <View style={styles.quickRow}>
              <QuickMetric label='Quotes' value={String(quoteSymbols.length)} />
              <QuickMetric label='Drawings' value={String(chartDrawings.length)} />
              <QuickMetric label='One-Click' value={oneClickAccepted ? 'On' : 'Off'} accent={oneClickAccepted} />
            </View>
          </>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item, index, section }) => {
          const meta = MENU_META[item.id] ?? { icon: 'ellipse-outline', color: '#7a8aa5' };
          const last = index === section.data.length - 1;
          const actionable = Boolean(meta.route);

          return (
            <Pressable
              disabled={!actionable}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowStacked,
                index === 0 && styles.rowTop,
                last && styles.rowBottom,
                !actionable && styles.rowDisabled,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                if (actionable && meta.route) {
                  router.push(meta.route as never);
                }
              }}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.rowIconWrap, { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}4d` }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>

                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  {item.sub ? <Text style={styles.rowSub}>{item.sub}</Text> : null}
                </View>
              </View>

              <View style={styles.rowRight}>
                {meta.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{meta.badge}</Text>
                  </View>
                ) : null}
                <Ionicons name='chevron-forward' size={18} color={actionable ? '#647793' : '#3f4f69'} />
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={<View style={styles.footerSpace} />}
      />
    </Screen>
  );
}

function MetaChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={11} color='#87a2c8' />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function QuickMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.quickMetric}>
      <Text style={styles.quickMetricLabel}>{label}</Text>
      <Text style={[styles.quickMetricValue, accent && styles.quickMetricValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: 38,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 4,
    color: '#7f93b3',
    fontSize: 13,
    textAlign: 'center',
  },
  accountCard: {
    marginTop: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263a59',
    backgroundColor: '#0d182a',
    padding: spacing.md,
    shadowColor: '#0a84ff',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  accountLabel: {
    color: '#7b92b5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  accountName: {
    marginTop: 3,
    color: '#eef4ff',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '700',
  },
  accountBalance: {
    marginTop: 4,
    color: '#60acff',
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f5f94',
    backgroundColor: '#122540',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#49dd86',
    marginRight: 6,
  },
  statusText: {
    color: '#cde2ff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  accountDivider: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    height: 1,
    backgroundColor: '#20324e',
  },
  accountSub: {
    color: '#a0b1ca',
    fontSize: 14,
    lineHeight: 19,
  },
  chipsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#304565',
    backgroundColor: '#12213a',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipText: {
    marginLeft: 4,
    color: '#c3d2ea',
    fontSize: 11,
    fontWeight: '600',
  },
  quickRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    marginRight: -spacing.sm,
  },
  quickMetric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#253a58',
    backgroundColor: '#0e192c',
    marginRight: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  quickMetricLabel: {
    color: '#7f93b3',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  quickMetricValue: {
    marginTop: 3,
    color: '#dce8f9',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  quickMetricValueAccent: {
    color: colors.positive,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: '#7f95b8',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '600',
  },
  row: {
    borderWidth: 1,
    borderColor: '#1f324d',
    backgroundColor: '#0b1424',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowStacked: {
    marginTop: -1,
  },
  rowDisabled: {
    opacity: 0.88,
  },
  rowTop: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  rowBottom: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    color: '#eef4ff',
    fontSize: 17,
    fontWeight: '500',
  },
  rowSub: {
    marginTop: 2,
    color: '#8e9fb8',
    fontSize: 13,
    lineHeight: 17,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    marginRight: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff4b42',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11,
  },
  pressed: {
    opacity: 0.88,
  },
  footerSpace: {
    height: 12,
  },
});
