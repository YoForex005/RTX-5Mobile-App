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
import { FlatList, Linking, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../../../ui/components/Screen';
import { brokers } from '../../../dev/mock/tradingData';
import { useTheme } from '../../../ui/theme/useTheme';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  BROKER_OVERRIDES,
  type BrokerFilter,
  type BrokerRecord,
  formatServerFromName,
  translateBrokerRegion,
  translateBrokerSpread,
} from './brokerData';
import { BrokerLogo, DetailStat, FilterPill, MetaBadge } from './BrokerSubComponents';
import { makeBrokersStyles } from './styles';

export function BrokersScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BrokerFilter>('all');
  const [selectedBroker, setSelectedBroker] = useState<BrokerRecord | null>(null);
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  const T = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeBrokersStyles(T), [T]);

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
      params: { broker: broker.name, server: broker.server, mode },
    });
  };

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>{t('Brokers')}</Text>
          <Text style={styles.subtitle}>{t('Select a company, review details, then connect your account')}</Text>

          <View style={styles.searchWrap}>
            <Ionicons name='search-outline' size={17} color='#7f93b2' />
            <TextInput
              style={styles.search}
              placeholder={t('Enter company or server name')}
              placeholderTextColor={T.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name='close-circle' size={18} color='#7f93b2' />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            <FilterPill label={t('All')} active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterPill label={t('Popular')} active={filter === 'popular'} onPress={() => setFilter('popular')} />
            <FilterPill label={t('Regulated')} active={filter === 'regulated'} onPress={() => setFilter('regulated')} />
          </View>

          <Text style={styles.resultMeta}>{visibleBrokers.length} {t('brokers available')}</Text>
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
                      <Text style={styles.badgeText}>{t('Popular')}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.server}>{item.server}</Text>

                <View style={styles.metaRow}>
                  <MetaBadge icon='earth-outline' label={translateBrokerRegion(item.region, t)} />
                  <MetaBadge icon='stats-chart-outline' label={translateBrokerSpread(item.spread, t)} />
                  {item.regulated ? <MetaBadge icon='shield-checkmark-outline' label={t('Regulated')} /> : null}
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
              <Text style={styles.emptyText}>{t('No broker matched your search')}</Text>
            </View>
          )}
        />
      </View>

      <Modal
        visible={Boolean(selectedBroker)}
        transparent
        animationType='fade'
        {...OVERLAY_MODAL_PROPS}
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
              <DetailStat label={t('Region')} value={translateBrokerRegion(selectedBroker?.region ?? 'Global', t)} />
              <DetailStat label={t('Spread')} value={selectedBroker ? translateBrokerSpread(selectedBroker.spread, t) : '-'} />
              <DetailStat label={t('Min Deposit')} value={selectedBroker?.minDeposit ?? '-'} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={() => connectBroker('live')}
            >
              <Ionicons name='link-outline' size={16} color='#ebf5ff' />
              <Text style={styles.primaryButtonText}>{t('Connect Live Account')}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={() => connectBroker('demo')}
            >
              <Ionicons name='beaker-outline' size={16} color='#0a84ff' />
              <Text style={styles.secondaryButtonText}>{t('Open Demo Account')}</Text>
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
              <Text style={styles.linkText}>{t('Visit broker website')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
