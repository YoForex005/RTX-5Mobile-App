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
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type GestureResponderEvent,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useTheme } from '../../../ui/theme/useTheme';
import type { ThemeColors } from '../../../ui/theme/glass';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTranslation } from '../../../i18n/useTranslation';
import { safeRouterBack } from '../../../utils/navigation';
import { useBrokerServers } from '../../../query/broker';
import type { BrokerServer } from '../../../api/broker';
import { resolveBrokerServiceBaseUrl } from '../../../api/brokerRouting';
import { persistSelectedBrokerSession } from '../../../state/brokerSessionStorage';
import { formatServerFromName } from './brokerData';

// Always show this broker at the top when the search field is empty so the
// screen matches the MT5 default state (MetaQuotes-Demo entry point).
const PINNED_BROKER_NAMES = ['MetaQuotes Ltd.'];
const BROKER_ROW_PRESS_CANCEL_MOVE_PX = 14;

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

type BrokerPressPoint = {
  pageX: number;
  pageY: number;
};

type BrokerPressGesture = {
  start: BrokerPressPoint | null;
  handled: boolean;
  cancelled: boolean;
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

function formatBrokerInitials(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
  return initials || 'BR';
}

function isRawNetworkEndpoint(value: string) {
  const host = value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split('/')[0];

  return (
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(host)
  );
}

function formatVisibleServerName(broker: BrokerServer) {
  const server = broker.server?.trim() || '';
  if (!server || isRawNetworkEndpoint(server)) {
    return formatServerFromName(broker.broker_name);
  }

  return server;
}

function getBrokerPressPoint(event: GestureResponderEvent): BrokerPressPoint | null {
  const { pageX, pageY } = event.nativeEvent;
  if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) {
    return null;
  }
  return { pageX, pageY };
}

function hasBrokerPressMovedBeyondThreshold(start: BrokerPressPoint, end: BrokerPressPoint) {
  const deltaX = end.pageX - start.pageX;
  const deltaY = end.pageY - start.pageY;
  return (
    deltaX * deltaX + deltaY * deltaY >
    BROKER_ROW_PRESS_CANCEL_MOVE_PX * BROKER_ROW_PRESS_CANCEL_MOVE_PX
  );
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
  const brokerPressGestureRef = useRef<BrokerPressGesture>({
    start: null,
    handled: false,
    cancelled: false,
  });
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
    // occurrence; BrokerDetailScreen fetches the same directory and exposes
    // the full broker/server list in its searchable picker.
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
      server: formatVisibleServerName(b),
      serverUrl: resolveBrokerServiceBaseUrl(b),
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

  const recordBrokerRowPressStart = (event: GestureResponderEvent) => {
    brokerPressGestureRef.current = {
      start: getBrokerPressPoint(event),
      handled: false,
      cancelled: false,
    };
  };

  const cancelBrokerRowPressForScroll = () => {
    const gesture = brokerPressGestureRef.current;
    if (!gesture.start && gesture.cancelled) {
      return;
    }

    brokerPressGestureRef.current = {
      start: null,
      handled: false,
      cancelled: true,
    };
  };

  const recordBrokerRowPressMove = (event: GestureResponderEvent) => {
    const gesture = brokerPressGestureRef.current;
    const current = getBrokerPressPoint(event);
    if (!gesture.start || !current) {
      return;
    }

    if (hasBrokerPressMovedBeyondThreshold(gesture.start, current)) {
      cancelBrokerRowPressForScroll();
    }
  };

  const shouldIgnoreBrokerRowPress = (event: GestureResponderEvent) => {
    const gesture = brokerPressGestureRef.current;
    if (gesture.cancelled || gesture.handled) {
      return true;
    }

    const end = getBrokerPressPoint(event);
    if (gesture.start && end && hasBrokerPressMovedBeyondThreshold(gesture.start, end)) {
      brokerPressGestureRef.current = {
        start: null,
        handled: false,
        cancelled: true,
      };
      return true;
    }

    brokerPressGestureRef.current = {
      start: null,
      handled: true,
      cancelled: false,
    };
    return false;
  };

  const handleBrokerRowPress = (broker: BrokerRow, event: GestureResponderEvent) => {
    if (shouldIgnoreBrokerRowPress(event)) {
      return;
    }
    handleSelectBroker(broker);
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
          <View style={styles.iconBtn} />
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
              style={styles.searchClearBtn}
              onPress={() => setSearch('')}
              hitSlop={10}
              activateOnPressIn
              latencyLabel="brokers.search.clear"
              unstable_pressDelay={0}
            >
              <Ionicons name="close" size={16} color={T.textMuted} />
            </Pressable>
          )}
        </View>

        {/* ── Results ── */}
        <FlatList
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          style={styles.brokerList}
          data={visibleBrokers}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onScrollBeginDrag={cancelBrokerRowPressForScroll}
          onMomentumScrollBegin={cancelBrokerRowPressForScroll}
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.brokerRow,
                pressed && styles.brokerRowPressed,
              ]}
              onPressIn={recordBrokerRowPressStart}
              onTouchMove={recordBrokerRowPressMove}
              onPress={(event) => handleBrokerRowPress(item, event)}
              latencyLabel={`brokers.row.${item.brokerId}`}
              unstable_pressDelay={0}
            >
              <BrokerAvatar
                broker={item}
                failed={Boolean((item.logoUrl || item.domain) && logoFailed[item.logoUrl || item.domain || ''])}
                onError={(logoKey) => setLogoFailed((prev) => ({ ...prev, [logoKey]: true }))}
                styles={styles}
              />
              <View style={styles.brokerInfo}>
                <Text style={styles.brokerName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.brokerIdRow}>
                  <Text style={styles.brokerIdLabel} numberOfLines={1}>{item.brokerId}</Text>
                </View>
              </View>
              <View
                style={styles.selectBtn}
                pointerEvents="none"
              >
                <Ionicons name="chevron-forward" size={20} color={T.textSub} />
              </View>
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
          <Ionicons name="add-circle-outline" size={19} color={T.text} />
          <Text style={styles.footerText}>{t("Can't find your broker?")}</Text>
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
}: {
  broker: BrokerRow;
  failed: boolean;
  onError: (logoKey: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const logoUri = broker.logoUrl || (broker.domain ? `https://logo.clearbit.com/${broker.domain}` : '');
  if (!logoUri || failed) {
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <Text style={styles.avatarInitials}>{formatBrokerInitials(broker.name)}</Text>
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
  const pageBg = isDark ? '#05070D' : '#F3F6FA';
  const surface = isDark ? '#0E1420' : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC';
  const dividerColor = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';
  const cardBorder = isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)';
  const cardShadowColor = isDark ? '#000000' : '#0F172A';
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: pageBg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: safeTop + 8,
      paddingBottom: 8,
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
      fontSize: 22,
      fontWeight: '800',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      marginHorizontal: 12,
      marginTop: 4,
      marginBottom: 10,
      paddingHorizontal: 12,
      gap: 12,
      borderRadius: 14,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      paddingVertical: 6,
      backgroundColor: 'transparent',
    },
    searchClearBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.16)',
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
      paddingHorizontal: 12,
      paddingBottom: 14,
      backgroundColor: pageBg,
      flexGrow: 1,
    },
    cardGap: {
      height: 10,
    },
    brokerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 76,
      padding: 12,
      gap: 12,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: cardShadowColor,
      shadowOpacity: isDark ? 0.16 : 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: isDark ? 2 : 1,
    },
    brokerRowPressed: {
      backgroundColor: isDark ? '#121B2A' : '#F8FAFC',
    },
    rowDivider: {
      height: 1,
      backgroundColor: dividerColor,
      marginLeft: 64,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: softSurface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarFallback: {
      backgroundColor: '#2563EB',
    },
    avatarInitials: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: 0,
    },
    avatarImage: {
      width: 36,
      height: 36,
    },
    brokerInfo: {
      flex: 1,
      minWidth: 0,
    },
    brokerName: {
      color: T.text,
      fontSize: 16,
      fontWeight: '800',
    },
    brokerIdRow: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      marginTop: 5,
      paddingHorizontal: 8,
      minHeight: 24,
      borderRadius: 12,
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)',
    },
    brokerIdLabel: {
      color: MT5_BLUE,
      fontSize: 12,
      fontWeight: '800',
    },
    selectBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: dividerColor,
      backgroundColor: softSurface,
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
      letterSpacing: 0,
    },
    footerBtn: {
      flexDirection: 'row',
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: dividerColor,
      backgroundColor: surface,
    },
    footerText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0,
    },
  });
};

// Preserve the original named export for any legacy router.push references.
export default BrokersScreen;
