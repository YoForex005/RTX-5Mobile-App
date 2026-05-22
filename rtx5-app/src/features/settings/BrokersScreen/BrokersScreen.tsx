import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Settings Feature UI: BrokersScreen
 *
 * MT5-style searchable broker directory. Users tap the "+" on the Accounts
 * screen, search a broker by name, and proceed to the broker-detail screen
 * where they can open a demo / real account or sign into an existing one.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useTheme } from '../../../ui/theme/useTheme';
import type { ThemeColors } from '../../../ui/theme/glass';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTranslation } from '../../../i18n/useTranslation';
import { safeRouterBack } from '../../../utils/navigation';
import { useBrokerServers } from '../../../query/broker';
import type { BrokerServer } from '../../../api/broker';
import { normalizeBrokerServerUrl } from '../../../api/brokerRouting';
import { persistSelectedBrokerSession } from '../../../state/brokerSessionStorage';
import { formatServerFromName } from './brokerData';

// Always show this broker at the top when the search field is empty so the
// screen matches the MT5 default state (MetaQuotes-Demo entry point).
const PINNED_BROKER_NAMES = ['MetaQuotes Ltd.'];

type BrokerRow = {
  id: string;
  brokerId: string;
  name: string;
  server: string;
  serverUrl: string;
  logoUrl: string;
  region: string;
  protocol: string;
  domain?: string;
};

// Map a broker name to a logo domain when one is recognisable. This is
// best-effort branding; rows fall back to the generic icon when no domain
// is available or the logo CDN can't serve one.
const KNOWN_BROKER_DOMAINS: Record<string, string> = {
  flexymarkets: 'flexymarkets.com',
  metaquotes: 'metaquotes.net',
  alphatrading: 'alphatrading.com',
};

function resolveBrokerDomain(name: string): string | undefined {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [needle, domain] of Object.entries(KNOWN_BROKER_DOMAINS)) {
    if (key.includes(needle)) return domain;
  }
  return undefined;
}

export function BrokersScreen() {
  const [search, setSearch] = useState('');
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const routerInstance = useRouter();
  const setBrokerConnection = useUserPreferences((s) => s.setBrokerConnection);
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);

  // ── GET /broker/servers — live broker directory ──────────────────────────
  // The endpoint is public, so the query is always enabled. The screen is
  // reachable from the Accounts "+" icon both before and after login, and
  // either way the user needs the full broker list to pick from.
  const { data: brokerServers, isLoading, isError, error, refetch, isFetching } = useBrokerServers(true);

  const brokerRecords = useMemo<BrokerRow[]>(() => {
    const rows = (brokerServers ?? []).filter((b: BrokerServer) => b.enabled !== false);
    // Deduplicate broker_id entries — the API exposes one row per server, but
    // the user only needs to pick a broker. We keep the first (lowest id)
    // occurrence and the remaining server hosts become BrokerDetailScreen
    // alternates via its built-in Demo/Live variant generator.
    const seen = new Set<string>();
    const deduped: BrokerServer[] = [];
    for (const r of rows) {
      if (seen.has(r.broker_id)) continue;
      seen.add(r.broker_id);
      deduped.push(r);
    }
    return deduped.map((b) => ({
      id: `srv-${b.id ?? b.broker_id}`,
      brokerId: b.broker_id,
      name: b.broker_name,
      server: b.server?.trim() || formatServerFromName(b.broker_name),
      serverUrl: normalizeBrokerServerUrl(
        b.server_url || (b.protocol && b.server ? `${b.protocol}://${b.server}` : ''),
      ),
      logoUrl: b.logo_url?.trim() || '',
      region: b.region,
      protocol: b.protocol,
      domain: resolveBrokerDomain(b.broker_name) ?? resolveBrokerDomain(b.broker_id),
    }));
  }, [brokerServers]);

  const trimmedQuery = search.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const visibleBrokers = useMemo(() => {
    if (!isSearching) {
      // Show the full directory by default. Pinned brokers (e.g. MetaQuotes
      // Ltd.) bubble to the top when present so the screen mirrors MT5's
      // landing state, but we never hide the rest of the list.
      const pinnedSet = new Set(PINNED_BROKER_NAMES.map((n) => n.toLowerCase()));
      return [...brokerRecords].sort((a, b) => {
        const aPinned = pinnedSet.has(a.name.toLowerCase()) ? 0 : 1;
        const bPinned = pinnedSet.has(b.name.toLowerCase()) ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        return a.name.localeCompare(b.name);
      });
    }
    return brokerRecords.filter((broker) => {
      return (
        broker.name.toLowerCase().includes(trimmedQuery) ||
        broker.brokerId.toLowerCase().includes(trimmedQuery) ||
        broker.server.toLowerCase().includes(trimmedQuery) ||
        (broker.region ?? '').toLowerCase().includes(trimmedQuery)
      );
    });
  }, [brokerRecords, isSearching, trimmedQuery]);

  const handleSelectBroker = (broker: BrokerRow) => {
    setBrokerConnection(broker.brokerId, broker.serverUrl, broker.logoUrl);
    void persistSelectedBrokerSession({
      brokerId: broker.brokerId,
      serverUrl: broker.serverUrl,
      logoUrl: broker.logoUrl,
    });
    routerInstance.push({
      pathname: '/settings/broker-detail',
      params: {
        brokerId: broker.brokerId,
        brokerName: broker.name,
        brokerServer: broker.server,
        brokerServerUrl: broker.serverUrl,
        brokerLogoUrl: broker.logoUrl,
        brokerDomain: broker.domain ?? '',
      },
    });
  };

  const handleScanQR = () => {
    // QR-driven broker selection is not yet supported; surface a friendly
    // hint instead of leaving the icon as a dead control.
    routerInstance.push({
      pathname: '/settings/broker-detail',
      params: {
        brokerId: 'qr',
        brokerName: t('Scan QR Code'),
        brokerServer: '',
        brokerServerUrl: '',
        brokerLogoUrl: '',
        brokerDomain: '',
      },
    });
  };

  const handleBack = () => safeRouterBack(routerInstance, '/settings/accounts');

  return (
    <Screen>
      <View style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={handleBack}
            activateOnPressIn
            latencyLabel="brokers.back"
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={26} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Brokers')}</Text>
          <Pressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={handleScanQR}
            activateOnPressIn
            latencyLabel="brokers.qr"
            unstable_pressDelay={0}
          >
            <Ionicons name="qr-code-outline" size={22} color={T.text} />
          </Pressable>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={20} color={T.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Find broker')}
            placeholderTextColor={T.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={10}
              activateOnPressIn
              latencyLabel="brokers.search.clear"
              unstable_pressDelay={0}
            >
              <Ionicons name="close-circle" size={18} color={T.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.divider} />

        {/* ── Results ── */}
        <FlatList
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={false}
          style={styles.brokerList}
          data={visibleBrokers}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.brokerRow}
              onPress={() => handleSelectBroker(item)}
              activateOnPressIn
              latencyLabel={`brokers.row.${item.brokerId}`}
              unstable_pressDelay={0}
            >
              <BrokerAvatar
                broker={item}
                failed={Boolean((item.logoUrl || item.domain) && logoFailed[item.logoUrl || item.domain || ''])}
                onError={(logoKey) => setLogoFailed((prev) => ({ ...prev, [logoKey]: true }))}
                styles={styles}
                T={T}
              />
              <View style={styles.brokerInfo}>
                <Text style={styles.brokerName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.brokerSub} numberOfLines={1}>{item.brokerId}</Text>
              </View>
              <Pressable
                style={styles.infoBtn}
                hitSlop={10}
                onPress={() => handleSelectBroker(item)}
                activateOnPressIn
                latencyLabel={`brokers.info.${item.brokerId}`}
                unstable_pressDelay={0}
              >
                <Ionicons name="information-circle-outline" size={22} color={T.textMuted} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState} pointerEvents="box-none">
              {isLoading || isFetching ? (
                <>
                  <ActivityIndicator size="large" color={T.accent} />
                  <Text style={styles.emptyTitle}>{t('Loading brokers…')}</Text>
                </>
              ) : isError ? (
                <>
                  <Ionicons name="cloud-offline-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('Failed to load brokers')}</Text>
                  <Text style={styles.emptyText}>{error?.message || t('Please try again.')}</Text>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => refetch()}
                    activateOnPressIn
                    latencyLabel="brokers.retry"
                    unstable_pressDelay={0}
                  >
                    <Text style={styles.retryText}>{t('Retry')}</Text>
                  </Pressable>
                </>
              ) : isSearching ? (
                <>
                  <Ionicons name="search-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('No broker matched your search')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('Use search to find a company')}</Text>
                  <Text style={styles.emptyText}>
                    {t('The application may feature brokerage companies which may not be regulated in your country. Exercise caution and responsibility before opening an account with any brokerage company.')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {t('Contact details are provided for each company. Use them to further research their regulatory status and services. We may not possess complete and updated information about the regulation status of brokerage companies in particular countries and does not guarantee their reliability or reputation.')}
                  </Text>
                </>
              )}
            </View>
          }
        />

        {/* ── Footer ── */}
        <Pressable
          style={styles.footerBtn}
          onPress={() => routerInstance.push({
            pathname: '/settings/broker-detail',
            params: {
              brokerId: 'custom',
              brokerName: t("Can't find your broker?"),
              brokerServer: '',
              brokerServerUrl: '',
              brokerLogoUrl: '',
              brokerDomain: '',
            },
          })}
          activateOnPressIn
          latencyLabel="brokers.custom"
          unstable_pressDelay={0}
        >
          <Text style={styles.footerText}>{t("CAN'T FIND YOUR BROKER?")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function BrokerAvatar({
  broker,
  failed,
  onError,
  styles,
  T,
}: {
  broker: BrokerRow;
  failed: boolean;
  onError: (logoKey: string) => void;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  const logoUri = broker.logoUrl || (broker.domain ? `https://logo.clearbit.com/${broker.domain}` : '');
  if (!logoUri || failed) {
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <Ionicons name="business-outline" size={20} color={T.textMuted} />
      </View>
    );
  }
  return (
    <View style={styles.avatar}>
      <Image
        source={{ uri: logoUri }}
        style={styles.avatarImage}
        resizeMode="contain"
        onError={() => onError(logoUri)}
      />
    </View>
  );
}

const MT5_BLUE = '#0a84ff';

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  // Use a pure-white surface in light mode (matches MT5's broker list) and
  // the existing dark slate in dark mode. Dividers/borders adapt accordingly.
  const pageBg = isDark ? T.bgRoot : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const subtleSurface = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const footerBg = isDark ? '#0E1420' : '#F5F5F5';
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: pageBg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 12,
      gap: 8,
      backgroundColor: pageBg,
    },
    iconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: T.text,
      fontSize: 20,
      fontWeight: '600',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      gap: 12,
      backgroundColor: pageBg,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      paddingVertical: 6,
      backgroundColor: 'transparent',
    },
    divider: {
      height: 1,
      backgroundColor: dividerColor,
      marginHorizontal: 20,
    },
    brokerList: {
      flex: 1,
      backgroundColor: pageBg,
    },
    listContent: {
      paddingBottom: 24,
      backgroundColor: pageBg,
      flexGrow: 1,
    },
    brokerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
      backgroundColor: pageBg,
    },
    rowDivider: {
      height: 1,
      backgroundColor: dividerColor,
      marginLeft: 64,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: subtleSurface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarFallback: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
    },
    avatarImage: {
      width: 32,
      height: 32,
    },
    brokerInfo: {
      flex: 1,
    },
    brokerName: {
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
    },
    brokerSub: {
      color: MT5_BLUE,
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    infoBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      borderWidth: 1,
      borderColor: dividerColor,
    },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 56,
      gap: 16,
    },
    emptyTitle: {
      color: T.textSub,
      fontSize: 16,
      fontWeight: '500',
      textAlign: 'center',
    },
    emptyText: {
      color: T.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: 8,
      backgroundColor: MT5_BLUE,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 22,
    },
    retryText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    footerBtn: {
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: 1,
      borderTopColor: dividerColor,
      backgroundColor: footerBg,
    },
    footerText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
  });
};

// Preserve the original named export for any legacy router.push references.
export default BrokersScreen;
