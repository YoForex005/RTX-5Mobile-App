/**
 * Settings Feature UI: BrokersScreen
 * 
 * A searchable directory of supported brokers, allowing users to browse 
 * broker profiles, verify regulation status, and initiate a new Live or Demo 
 * connection routing to the Accounts screen.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../components/Screen';
import { brokers } from '../../mock/tradingData';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { spacing } from '../../theme';

type BrokerFilter = 'all' | 'popular' | 'regulated';

type BrokerRecord = {
  id: string;
  name: string;
  server: string;
  domain?: string;
  region: string;
  spread: string;
  minDeposit: string;
  popular: boolean;
  regulated: boolean;
};

const BROKER_OVERRIDES: Record<string, Partial<BrokerRecord>> = {
  'Exness Technologies Ltd': {
    domain: 'exness.com',
    region: 'Global',
    spread: 'from 0.1 pips',
    minDeposit: '$10',
    popular: true,
    regulated: true,
    server: 'Exness-MT5Trial14',
  },
  'GTC Global Trade Capital Co. Limited': {
    domain: 'gtcfx.com',
    region: 'MENA',
    spread: 'from 0.2 pips',
    minDeposit: '$50',
    popular: true,
    regulated: true,
    server: 'GTCGlobal-Live01',
  },
  'Trade Securities Limited': {
    domain: 'tradesecurities.com',
    region: 'Asia',
    spread: 'from 0.3 pips',
    minDeposit: '$100',
    popular: false,
    regulated: true,
    server: 'TradeSec-MT5Live',
  },
  'GTC Global SA (Pty) Ltd': {
    domain: 'gtcsa.co.za',
    region: 'South Africa',
    spread: 'from 0.2 pips',
    minDeposit: '$50',
    popular: false,
    regulated: true,
    server: 'GTC-SA-Live',
  },
  'Flexy Markets Limited': {
    domain: 'flexymarkets.com',
    region: 'Global',
    spread: 'from 0.4 pips',
    minDeposit: '$100',
    popular: false,
    regulated: true,
    server: 'Flexy-MT5-Live',
  },
  'Ascends Global Markets Limited': {
    domain: 'ascendsglobalmarkets.com',
    region: 'Global',
    spread: 'from 0.4 pips',
    minDeposit: '$100',
    popular: false,
    regulated: true,
    server: 'Ascends-MT5-Live',
  },
  'Equiti Brokerage (Seychelles) Limited': {
    domain: 'equiti.com',
    region: 'Global',
    spread: 'from 0.1 pips',
    minDeposit: '$100',
    popular: true,
    regulated: true,
    server: 'Equiti-Global-Live',
  },
  'Swissquote Bank SA': {
    domain: 'swissquote.com',
    region: 'Europe',
    spread: 'from 0.3 pips',
    minDeposit: '$1,000',
    popular: true,
    regulated: true,
    server: 'Swissquote-MT5',
  },
  'FP Markets LLC': {
    domain: 'fpmarkets.com',
    region: 'Global',
    spread: 'from 0.0 pips',
    minDeposit: '$100',
    popular: true,
    regulated: true,
    server: 'FPMarkets-Live',
  },
  'Vantage International Group Limited': {
    domain: 'vantagemarkets.com',
    region: 'Global',
    spread: 'from 0.1 pips',
    minDeposit: '$50',
    popular: true,
    regulated: true,
    server: 'Vantage-MT5-Live',
  },
  'AMarkets LLC': {
    domain: 'amarkets.com',
    region: 'Global',
    spread: 'from 0.3 pips',
    minDeposit: '$100',
    popular: false,
    regulated: true,
    server: 'AMarkets-Live',
  },
  'MetaQuotes Ltd.': {
    domain: 'metaquotes.net',
    region: 'Global',
    spread: 'n/a',
    minDeposit: 'n/a',
    popular: false,
    regulated: false,
    server: 'MetaQuotes-Demo',
  },
};

function formatServerFromName(name: string) {
  const compact = name.replace(/[^a-zA-Z0-9]/g, '');
  return `${compact.slice(0, 16)}-Live`;
}

export function BrokersScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BrokerFilter>('all');
  const [selectedBroker, setSelectedBroker] = useState<BrokerRecord | null>(null);
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const brokerRecords = useMemo<BrokerRecord[]>(
    () =>
      brokers.map((name, index) => {
        const override = BROKER_OVERRIDES[name] ?? {};
        return {
          id: `broker-${index + 1}`,
          name,
          server: override.server ?? formatServerFromName(name),
          domain: override.domain,
          region: override.region ?? 'Global',
          spread: override.spread ?? 'from 0.3 pips',
          minDeposit: override.minDeposit ?? '$100',
          popular: override.popular ?? false,
          regulated: override.regulated ?? true,
        };
      }),
    []
  );

  const visibleBrokers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return brokerRecords
      .filter((broker) => {
        if (!q) return true;
        return (
          broker.name.toLowerCase().includes(q) ||
          broker.server.toLowerCase().includes(q)
        );
      })
      .filter((broker) => {
        if (filter === 'popular') return broker.popular;
        if (filter === 'regulated') return broker.regulated;
        return true;
      });
  }, [brokerRecords, filter, search]);

  const connectBroker = (mode: 'live' | 'demo') => {
    if (!selectedBroker) return;

    const broker = selectedBroker;
    setSelectedBroker(null);
    router.push({
      pathname: '/settings/accounts',
      params: {
        broker: broker.name,
        server: broker.server,
        mode,
      },
    });
  };

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Brokers</Text>
          <Text style={styles.subtitle}>Select a company, review details, then connect your account</Text>

          <View style={styles.searchWrap}>
            <Ionicons name='search-outline' size={17} color='#7f93b2' />
            <TextInput
              style={styles.search}
              placeholder='Enter company or server name'
              placeholderTextColor={T.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length ? (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name='close-circle' size={18} color='#7f93b2' />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            <FilterPill label='All' active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterPill label='Popular' active={filter === 'popular'} onPress={() => setFilter('popular')} />
            <FilterPill label='Regulated' active={filter === 'regulated'} onPress={() => setFilter('regulated')} />
          </View>

          <Text style={styles.resultMeta}>{visibleBrokers.length} brokers available</Text>
        </View>

        <FlatList
          data={visibleBrokers}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.rowCard, pressed && styles.pressed]}
              onPress={() => setSelectedBroker(item)}
            >
              <BrokerLogo
                broker={item}
                failed={Boolean(item.domain && logoFailed[item.domain])}
                onError={(domain) => {
                  setLogoFailed((prev) => ({ ...prev, [domain]: true }));
                }}
              />

              <View style={styles.rowMain}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.popular ? (
                    <View style={[styles.badge, styles.badgeBlue]}>
                      <Text style={styles.badgeText}>Popular</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.server}>{item.server}</Text>

                <View style={styles.metaRow}>
                  <MetaBadge icon='earth-outline' label={item.region} />
                  <MetaBadge icon='stats-chart-outline' label={item.spread} />
                  {item.regulated ? <MetaBadge icon='shield-checkmark-outline' label='Regulated' /> : null}
                </View>
              </View>

              <Pressable
                style={styles.infoButton}
                onPress={() => setSelectedBroker(item)}
              >
                <Ionicons name='information-circle-outline' size={21} color='#0a84ff' />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Ionicons name='search-outline' size={20} color='#6f7f98' />
              <Text style={styles.emptyText}>No broker matched your search</Text>
            </View>
          )}
        />
      </View>

      <Modal
        visible={Boolean(selectedBroker)}
        transparent
        animationType='fade'
        onRequestClose={() => setSelectedBroker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBroker(null)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <View style={styles.modalHeader}>
              <BrokerLogo
                broker={selectedBroker}
                failed={Boolean(selectedBroker?.domain && logoFailed[selectedBroker.domain])}
                onError={(domain) => {
                  setLogoFailed((prev) => ({ ...prev, [domain]: true }));
                }}
              />

              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>{selectedBroker?.name}</Text>
                <Text style={styles.modalSub}>{selectedBroker?.server}</Text>
              </View>

              <Pressable onPress={() => setSelectedBroker(null)}>
                <Ionicons name='close-outline' size={24} color='#8ba0c1' />
              </Pressable>
            </View>

            <View style={styles.modalStatsRow}>
              <DetailStat label='Region' value={selectedBroker?.region ?? 'Global'} />
              <DetailStat label='Spread' value={selectedBroker?.spread ?? '-'} />
              <DetailStat label='Min Deposit' value={selectedBroker?.minDeposit ?? '-'} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={() => connectBroker('live')}
            >
              <Ionicons name='link-outline' size={16} color='#ebf5ff' />
              <Text style={styles.primaryButtonText}>Connect Live Account</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={() => connectBroker('demo')}
            >
              <Ionicons name='beaker-outline' size={16} color='#0a84ff' />
              <Text style={styles.secondaryButtonText}>Open Demo Account</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
              onPress={async () => {
                if (!selectedBroker?.domain) return;
                const url = `https://${selectedBroker.domain}`;
                const canOpen = await Linking.canOpenURL(url);
                if (canOpen) {
                  await Linking.openURL(url);
                }
              }}
            >
              <Ionicons name='open-outline' size={14} color='#89a1c4' />
              <Text style={styles.linkText}>Visit broker website</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterPill,
        active && styles.filterPillActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function MetaBadge({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.metaBadge}>
      <Ionicons name={icon} size={11} color='#7e97bc' />
      <Text style={styles.metaBadgeText}>{label}</Text>
    </View>
  );
}

function BrokerLogo({
  broker,
  failed,
  onError,
}: {
  broker: BrokerRecord | null;
  failed: boolean;
  onError: (domain: string) => void;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  if (!broker) {
    return <View style={styles.logoFallback} />;
  }

  if (!broker.domain || failed) {
    return (
      <View style={styles.logoFallback}>
        <Ionicons name='business-outline' size={20} color='#dbe9ff' />
      </View>
    );
  }

  return (
    <View style={styles.logoImageWrap}>
      <Image
        source={{ uri: `https://logo.clearbit.com/${broker.domain}` }}
        style={styles.logoImage}
        resizeMode='contain'
        onError={() => onError(broker.domain as string)}
      />
    </View>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.detailStat}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  page: {
    flex: 1,
  },
  headerCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass1,
    padding: spacing.md,
  },
  title: {
    color: T.text,
    fontSize: 31,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: T.textSub,
    fontSize: 12,
    textAlign: 'center',
  },
  searchWrap: {
    marginTop: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass2,
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  search: {
    flex: 1,
    marginLeft: 7,
    color: T.text,
    fontSize: 16,
    paddingVertical: 8,
  },
  filterRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    marginRight: -spacing.sm,
  },
  filterPill: {
    marginRight: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterPillActive: {
    borderColor: T.borderHi,
    backgroundColor: T.glass3,
  },
  filterLabel: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterLabelActive: {
    color: T.text,
  },
  resultMeta: {
    marginTop: spacing.sm,
    color: T.textSub,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl + spacing.md,
  },
  rowCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logoImageWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    color: T.text,
    fontSize: 19,
    fontWeight: '600',
    paddingRight: 8,
  },
  server: {
    marginTop: 2,
    color: T.textSub,
    fontSize: 13,
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaBadge: {
    marginRight: 6,
    marginBottom: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaBadgeText: {
    marginLeft: 4,
    color: T.textMuted,
    fontSize: 11,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeBlue: {
    backgroundColor: T.accentGlow,
  },
  badgeText: {
    color: T.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    marginTop: 28,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: T.textMuted,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.borderHi,
    backgroundColor: T.glass1,
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitleWrap: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  modalTitle: {
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSub: {
    marginTop: 2,
    color: T.textSub,
    fontSize: 12,
  },
  modalStatsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    marginRight: -spacing.sm,
  },
  detailStat: {
    flex: 1,
    marginRight: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.glass2,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  detailLabel: {
    color: T.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    marginTop: 3,
    color: T.text,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: spacing.md,
    borderRadius: 11,
    backgroundColor: T.accent,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    marginLeft: 6,
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: T.borderHi,
    backgroundColor: T.glass2,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    marginLeft: 6,
    color: T.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  linkRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkText: {
    marginLeft: 5,
    color: T.textSub,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
});
