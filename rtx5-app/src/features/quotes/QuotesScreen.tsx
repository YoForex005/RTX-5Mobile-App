/**
 * Quotes Watchlist Screen (aka 'Quotes' tab).
 *
 * Provides a real-time table/list view of financial instruments customized locally by the user.
 *
 * Key Features:
 * - Dynamic sub-rendering via fast-list to handle 100+ ticker updates reliably without lag.
 * - Deep integrations with `QuotesWebSocketService` for hardware-accelerated ticking.
 * - Supports List (Simple, Advanced) and Table (Grid) view modes, persisted to local storage.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useMemo,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { QuoteItem } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { quotesWsService } from '../../api/ws/quotesSocket';
import { useTradingState } from '../../state/tradingState';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMarketSymbols } from '../../query/market';
import { fmt } from '../../utils/format';
import { AppHeader } from '../../components/AppHeader';
import { useTranslation } from '../../i18n/useTranslation';

/* ───── Helpers ───── */

const LIVE_SYMBOL_STALE_MS = 45_000;

const hasFreshLiveQuote = (quote: QuoteItem | undefined, now = Date.now()) =>
  !!quote &&
  Number.isFinite(quote.bid) &&
  Number.isFinite(quote.ask) &&
  Number.isFinite(quote.lastTickAt) &&
  now - (quote.lastTickAt ?? 0) <= LIVE_SYMBOL_STALE_MS;

const pairLabel = (symbol: string) => fmt.symbol(symbol);

const volumeLabel = (volume?: number) => {
  if (!volume) return '--';
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

type QuotesRotationTheme = {
  fullscreenBackground: string;
  cardBackground: string;
};

type AnimatedColorValue = Animated.AnimatedInterpolation<string | number>;


// full quotes screen background color + card background color
const QUOTES_THEME_ROTATION_DARK: QuotesRotationTheme[] = [
  { fullscreenBackground: '#06080D', cardBackground: '#0E141F' },
];

const QUOTES_THEME_ROTATION_LIGHT: QuotesRotationTheme[] = [
  { fullscreenBackground: '#F2F4F8', cardBackground: '#FFFFFF' },
];

const QUOTES_THEME_ROTATION_INTERVAL_MS = 5_000;
const QUOTES_THEME_ROTATION_TRANSITION_MS = 900;

type QuotesPalette = {
  shellBg: string;
  shellBorder: string;
  shellHighlight: [string, string];
  searchBg: string;
  searchBorder: string;
  searchPlaceholder: string;
  cardBorder: string;
  metaBg: string;
  metaBorder: string;
  secondaryText: string;
  eyebrow: string;
  emptyBg: string;
  actionBg: string;
  actionBorder: string;
};

function getQuotesPalette(T: ThemeColors, isDark: boolean): QuotesPalette {
  if (isDark) {
    return {
      shellBg: '#07111d',
      shellBorder: 'rgba(132, 162, 201, 0.18)',
      shellHighlight: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'],
      searchBg: '#0E1A2A',
      searchBorder: 'rgba(132, 162, 201, 0.24)',
      searchPlaceholder: 'rgba(208, 219, 232, 0.62)',
      cardBorder: 'rgba(132, 162, 201, 0.16)',
      metaBg: 'rgba(255,255,255,0.035)',
      metaBorder: 'rgba(132, 162, 201, 0.12)',
      secondaryText: 'rgba(208, 219, 232, 0.72)',
      eyebrow: 'rgba(148, 175, 210, 0.74)',
      emptyBg: 'rgba(8, 19, 33, 0.84)',
      actionBg: 'rgba(255,255,255,0.04)',
      actionBorder: 'rgba(132, 162, 201, 0.16)',
    };
  }

  return {
    shellBg: T.glass2,
    shellBorder: T.border,
    shellHighlight: ['rgba(255,255,255,0.90)', 'rgba(255,255,255,0)'],
    searchBg: '#FFFFFF',
    searchBorder: T.border,
    searchPlaceholder: T.textMuted,
    cardBorder: T.border,
    metaBg: '#FFFFFF',
    metaBorder: T.border,
    secondaryText: T.textSub,
    eyebrow: T.textMuted,
    emptyBg: T.glass1,
    actionBg: T.glass1,
    actionBorder: T.border,
  };
}

/* ───── Animated Theme Rotation ───── */

function interpolateThemeColor(
  progress: Animated.Value,
  fromColor: string,
  toColor: string,
): AnimatedColorValue {
  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: [fromColor, toColor],
  });
}

function useQuotesThemeRotation(isDark: boolean) {
  const QUOTES_THEME_ROTATION = isDark
    ? QUOTES_THEME_ROTATION_DARK
    : QUOTES_THEME_ROTATION_LIGHT;
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const transition = useRef(new Animated.Value(1)).current;
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentIndex = activeIndexRef.current;
      const nextIndex = (currentIndex + 1) % QUOTES_THEME_ROTATION.length;

      setPreviousIndex(currentIndex);
      setActiveIndex(nextIndex);
      activeIndexRef.current = nextIndex;

      transition.stopAnimation();
      transition.setValue(0);

      Animated.timing(transition, {
        toValue: 1,
        duration: QUOTES_THEME_ROTATION_TRANSITION_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, QUOTES_THEME_ROTATION_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      transition.stopAnimation();
    };
  }, [transition]);

  const previousTheme = QUOTES_THEME_ROTATION[previousIndex];
  const activeTheme = QUOTES_THEME_ROTATION[activeIndex];

  const animatedFullscreenBackground = interpolateThemeColor(
    transition,
    previousTheme.fullscreenBackground,
    activeTheme.fullscreenBackground,
  );

  const animatedCardBackground = interpolateThemeColor(
    transition,
    previousTheme.cardBackground,
    activeTheme.cardBackground,
  );

  return {
    activeTheme,
    animatedFullscreenBackground,
    animatedCardBackground,
  };
}

/* ───── QuoteCard ───── */

function QuoteCard({
  symbol,
  T,
  isDark,
  cardBackground,
  onPress,
  onLongPress,
}: {
  symbol: string;
  T: ThemeColors;
  isDark: boolean;
  cardBackground: AnimatedColorValue | string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const liveItem = useTradingState((state) => state.quotes[symbol]);
  const noData = !hasFreshLiveQuote(liveItem);

  if (noData) {
    const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : T.border;

    return (
      <View
        style={[
          sc.card,
          {
            height: 74,
            paddingVertical: 0,
            paddingLeft: 24,
            justifyContent: 'center',
            borderColor: cardBorder,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            sc.cardFill,
            { backgroundColor: cardBackground },
          ]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: T.textMuted,
              marginRight: 8,
              opacity: 0.5,
            }}
          />
          <Text
            style={{ color: T.text, fontSize: 16, fontWeight: '700' }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {pairLabel(symbol)}
          </Text>
          <Text
            style={{
              color: T.textMuted,
              fontSize: 13,
              marginLeft: 'auto',
              fontStyle: 'italic',
            }}
          >
            Connecting...
          </Text>
        </View>
      </View>
    );
  }

  const item: any =
    liveItem || {
      symbol,
      bid: 0,
      ask: 0,
      changePct: 0,
      spread: 0,
      volume: 0,
      digits: 5,
    };

  const isUp = item.changePct >= 0;
  const POSITIVE = T.trading.profit;
  const NEGATIVE = T.trading.loss;
  const color = isUp ? POSITIVE : NEGATIVE;

  const displaySymbol = pairLabel(item.symbol);
  const pct = `${isUp ? '+' : ''}${(item.changePct || 0).toFixed(2)}%`;

  const bidDirection = item.prevBid
    ? item.bid > item.prevBid
      ? 'up'
      : item.bid < item.prevBid
        ? 'down'
        : 'neutral'
    : 'neutral';

  const askDirection = item.prevAsk
    ? item.ask > item.prevAsk
      ? 'up'
      : item.ask < item.prevAsk
        ? 'down'
        : 'neutral'
    : 'neutral';

  const bidColor = noData
    ? T.textMuted
    : bidDirection === 'up'
      ? POSITIVE
      : bidDirection === 'down'
        ? NEGATIVE
        : color;

  const askColor = noData
    ? T.textMuted
    : askDirection === 'up'
      ? POSITIVE
      : askDirection === 'down'
        ? NEGATIVE
        : color;

  const showBidCaret = !noData && (bidDirection !== 'neutral' || !item.prevBid);
  const showAskCaret = !noData && (askDirection !== 'neutral' || !item.prevAsk);

  const bidCaret = bidDirection !== 'neutral' ? bidDirection : isUp ? 'up' : 'down';
  const askCaret = askDirection !== 'neutral' ? askDirection : isUp ? 'up' : 'down';

  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : T.border;

  return (
    <Pressable
      style={({ pressed }) => [
        sc.card,
        { borderColor: cardBorder },
        !isDark && sc.cardShadowLight,
        isDark && sc.cardShadowDark,
        pressed && sc.cardPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          sc.cardFill,
          { backgroundColor: cardBackground },
        ]}
      />

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
      />

      <View style={sc.cardInner}>
        <View style={sc.symbolCol}>
          <View style={sc.cardRow1}>
            <Text
              style={[sc.symbolText, { color: T.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displaySymbol}
            </Text>

            <View style={sc.changePill}>
              <Text
                style={[
                  sc.changePillText,
                  { color: noData ? T.textMuted : color },
                ]}
              >
                {noData ? '--' : pct}
              </Text>
            </View>
          </View>

          <View style={sc.cardRow2}>
            <Text
              style={[sc.volText, { color: T.textSub, flexShrink: 1 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Vol <Text style={[sc.statValue, { color: T.text }]}>{volumeLabel(item.volume)}</Text>
            </Text>

            <View style={[sc.statDot, { backgroundColor: T.textMuted }]} />

            <Text
              style={[sc.spreadText, { color: T.textSub, flexShrink: 1 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Spread{' '}
              <Text style={[sc.statValue, { color: T.text }]}>
                {(item.spread || 0).toFixed(1)}
              </Text>
            </Text>
          </View>
        </View>

        <View style={sc.pricesRow}>
          <View style={sc.priceBlock}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: T.textMuted }]}>BID</Text>
              {showBidCaret && (
                <Ionicons
                  name={bidCaret === 'up' ? 'caret-up' : 'caret-down'}
                  size={9}
                  color={bidCaret === 'up' ? POSITIVE : NEGATIVE}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
            <Text
              style={[sc.priceValue, { color: bidColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {noData ? '--' : (item.bid || 0).toFixed(2)}
            </Text>
          </View>

          <View style={sc.priceBlock}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: T.textMuted }]}>ASK</Text>
              {showAskCaret && (
                <Ionicons
                  name={askCaret === 'up' ? 'caret-up' : 'caret-down'}
                  size={9}
                  color={askCaret === 'up' ? POSITIVE : NEGATIVE}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
            <Text
              style={[sc.priceValue, { color: askColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {noData ? '--' : (item.ask || 0).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EditQuoteRow({
  symbol,
  index,
  total,
  T,
  isDark,
  cardBackground,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  symbol: string;
  index: number;
  total: number;
  T: ThemeColors;
  isDark: boolean;
  cardBackground: AnimatedColorValue;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : T.border;

  return (
    <View
      style={[
        sc.card,
        {
          borderColor: cardBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 16,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          sc.cardFill,
          { backgroundColor: cardBackground },
        ]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onRemove} style={{ padding: 4 }}>
          <Ionicons name="remove-circle" size={24} color={T.down} />
        </Pressable>
        <Text style={[sc.symbolText, { color: T.text }]}>{fmt.symbol(symbol)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable
          onPress={onMoveUp}
          disabled={index === 0}
          style={{ opacity: index === 0 ? 0.3 : 1, padding: 4 }}
        >
          <Ionicons name="chevron-up-circle-outline" size={30} color={T.textSub} />
        </Pressable>
        <Pressable
          onPress={onMoveDown}
          disabled={index === total - 1}
          style={{ opacity: index === total - 1 ? 0.3 : 1, padding: 4 }}
        >
          <Ionicons name="chevron-down-circle-outline" size={30} color={T.textSub} />
        </Pressable>
      </View>
    </View>
  );
}

function AddSymbolModal({
  visible,
  onClose,
  onAdd,
  T,
  isDark,
  existingSymbols,
  cardBackground,
}: any) {
  const { data: apiSymbols, isLoading } = useMarketSymbols();
  const [query, setQuery] = useState('');
  const palette = useMemo(() => getQuotesPalette(T, isDark), [T, isDark]);

  // Build the existing-symbols set so we can mark already-added items in the
  // list (instead of filtering them out — that left the picker empty when the
  // initial seed populated the watchlist with every symbol the backend offers).
  const existingBasesSet = useMemo(
    () => new Set((existingSymbols || []).map((s: string) => s.toLowerCase())),
    [existingSymbols],
  );

  const available = useMemo(() => {
    const all = apiSymbols || [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((sym) => sym.toLowerCase().includes(q));
  }, [query, apiSymbols]);

  if (!visible) return null;

  const content = (
    <View
      style={{
        flex: 1,
        backgroundColor: isDark ? 'rgba(2, 6, 13, 0.80)' : 'rgba(15, 23, 42, 0.44)',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: Platform.OS === 'web' ? 430 : '100%',
          height: '80%',
          backgroundColor: palette.shellBg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 16,
          borderWidth: 1,
          borderColor: palette.shellBorder,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={palette.shellHighlight}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: T.text }}>Add Asset</Text>
          <Pressable
            onPress={onClose}
            style={[
              s.headerActionButton,
              { backgroundColor: palette.actionBg, borderColor: palette.actionBorder },
            ]}
          >
            <Ionicons name="close" size={18} color={T.text} />
          </Pressable>
        </View>

        <View
          style={[
            s.searchBar,
            { borderColor: palette.searchBorder, backgroundColor: palette.searchBg },
          ]}
        >
          <Ionicons name="search" size={18} color={T.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isLoading ? 'Loading assets...' : 'Search available assets...'}
            placeholderTextColor={palette.searchPlaceholder}
            style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
            autoCapitalize="characters"
          />
        </View>

        <FlatList
          data={available}
          keyExtractor={(sym) => sym}
          renderItem={({ item: sym }) => {
            const alreadyAdded = existingBasesSet.has(sym.toLowerCase());
            return (
            <Pressable
              onPress={() => { if (!alreadyAdded) onAdd(sym); }}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 14,
                paddingHorizontal: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderRadius: 18,
                borderColor: palette.cardBorder,
                overflow: 'hidden',
                opacity: alreadyAdded ? 0.55 : 1,
              }}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: cardBackground },
                ]}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>
                    {fmt.symbol(sym)}
                  </Text>
                  <Text style={{ fontSize: 12, color: palette.secondaryText }}>
                    {alreadyAdded ? 'Already in your watchlist' : 'Add to live quotes desk'}
                  </Text>
                </View>
              </View>

              <Ionicons
                name={alreadyAdded ? 'checkmark-circle' : 'add-circle'}
                size={26}
                color={alreadyAdded ? T.textMuted : T.trading.profit}
              />
            </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text
              style={{
                textAlign: 'center',
                color: palette.secondaryText,
                marginTop: 40,
                fontSize: 15,
              }}
            >
              {isLoading ? 'Fetching markets...' : 'No matching assets available.'}
            </Text>
          }
        />
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>{content}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

/* ───── QuotesScreen ───── */

export function QuotesScreen() {
  const router = useRouter();
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const palette = useMemo(() => getQuotesPalette(T, isDark), [T, isDark]);

  const {
    animatedFullscreenBackground,
    animatedCardBackground,
  } = useQuotesThemeRotation(isDark);

  const quoteSymbols = useUserPreferences((st) => st.quoteSymbols);
  const addQuoteSymbol = useUserPreferences((st) => st.addQuoteSymbol);
  const removeQuoteSymbol = useUserPreferences((st) => st.removeQuoteSymbol);
  const setQuoteSymbols = useUserPreferences((st) => st.setQuoteSymbols);
  const setChartSymbol = useUserPreferences((st) => st.setChartSymbol);

  const showActionSheet = useUIState((s) => s.showActionSheet);
  const { data: apiSymbols = [], refetch: refetchSymbols } = useMarketSymbols();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Re-subscribe to the quote stream and refetch the symbols list.
      quotesWsService.setSubscriptions(quoteSymbols);
      await refetchSymbols();
    } finally {
      setRefreshing(false);
    }
  }, [quoteSymbols, refetchSymbols]);

  const hasSetInitialSymbols = useUserPreferences((st) => st.hasSetInitialSymbols);
  const setHasSetInitialSymbols = useUserPreferences((st) => st.setHasSetInitialSymbols);

  useEffect(() => {
    if (apiSymbols.length > 0) {
      const DEFAULT_WATCHLIST = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'];
      // Detect and repair the legacy bloated-watchlist state. Earlier
      // versions of the seed effect copied the entire instrument catalog
      // into quoteSymbols on first launch, which left the Add Asset picker
      // marking every symbol as "Already in your watchlist" while the
      // Quotes screen could not realistically render the full 60-symbol
      // dump. If we still see a watchlist that contains ≥80% of the
      // catalog, treat it as bloated and reset to the curated default.
      const bloated =
        hasSetInitialSymbols &&
        quoteSymbols.length >= Math.max(20, Math.floor(apiSymbols.length * 0.8));

      if (!hasSetInitialSymbols || bloated) {
        const seed = DEFAULT_WATCHLIST.filter((sym) => apiSymbols.includes(sym));
        setQuoteSymbols(seed.length > 0 ? seed : apiSymbols.slice(0, 5));
        setHasSetInitialSymbols(true);
      } else {
        const validSymbols = quoteSymbols.filter((sym) => apiSymbols.includes(sym));
        if (validSymbols.length < quoteSymbols.length) {
          setQuoteSymbols(validSymbols);
        }
      }
    }
  }, [
    apiSymbols,
    quoteSymbols,
    setQuoteSymbols,
    hasSetInitialSymbols,
    setHasSetInitialSymbols,
  ]);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(new Date());
  const trackedSymbols = quoteSymbols;

  const toggleEditMode = () => {
    if (!isEditing) setSearch('');
    setIsEditing(!isEditing);
  };

  const moveQuote = (fromIndex: number, toIndex: number) => {
    const newQueue = [...quoteSymbols];
    const element = newQueue.splice(fromIndex, 1)[0];
    newQueue.splice(toIndex, 0, element);
    setQuoteSymbols(newQueue);
  };

  useEffect(() => {
    const id = setInterval(() => setUpdatedAt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    quotesWsService.connect();
    quotesWsService.setSubscriptions(trackedSymbols);
    return () => {
      quotesWsService.unsubscribe(trackedSymbols);
    };
  }, [trackedSymbols]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    // Always show every subscribed symbol — never hide a row just because
    // its most recent tick is older than LIVE_SYMBOL_STALE_MS. The row
    // component already handles the stale/no-data state via the `noData`
    // flag (line 234), which renders the appropriate placeholder. Hiding
    // entire rows caused the "only 2 symbols visible after fresh app open"
    // bug: on a cold start, the WebSocket has just connected and only the
    // 1-2 most actively trading symbols have ticked yet, so every quieter
    // symbol got filtered out of the list entirely until its first tick
    // arrived. TradingView / Dhan / MT5 all show every subscribed symbol
    // immediately and render the last-known price with a "stale" indicator
    // until the live tick arrives.
    return quoteSymbols.filter((sym) => sym.toLowerCase().includes(q));
  }, [quoteSymbols, deferredSearch]);

  const goDetail = (sym: string) => {
    setChartSymbol(sym);
    router.push({ pathname: '/quotes/details', params: { symbol: sym } });
  };

  return (
    <View style={s.root}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: animatedFullscreenBackground },
        ]}
      />

      <View style={s.safe}>
        <View style={[s.screen, { paddingTop: 0 }]}>
          <AppHeader
            title={t('Quotes')}
            noBorder
            rightActions={
              <View style={s.headerActions}>
                <Pressable
                  onPress={() => setShowAddModal(true)}
                  hitSlop={12}
                  style={[
                    s.headerActionButton,
                    { backgroundColor: palette.actionBg, borderColor: palette.actionBorder },
                  ]}
                >
                  <Ionicons name="add-outline" size={20} color={T.text} />
                </Pressable>

                <Pressable
                  onPress={toggleEditMode}
                  hitSlop={12}
                  style={[
                    s.headerActionButton,
                    { backgroundColor: palette.actionBg, borderColor: palette.actionBorder },
                  ]}
                >
                  <Ionicons
                    name={isEditing ? 'checkmark-done-outline' : 'pencil-outline'}
                    size={18}
                    color={T.text}
                  />
                </Pressable>
              </View>
            }
          />

          <View style={s.subheaderRow}>
            <Text style={[s.subLeft, { color: palette.secondaryText }]}>
              Updated: {gmtClock(updatedAt)} GMT
            </Text>

            <View style={{ alignItems: 'flex-end' }}>
              <TickCounter T={T} palette={palette} />
            </View>
          </View>
          <View
            style={[
              s.searchBar,
              { backgroundColor: palette.searchBg, borderColor: palette.searchBorder },
            ]}
          >
            <Ionicons name="search" size={18} color={T.textMuted} />
            <TextInput
              value={search}
              onChangeText={(text) => startTransition(() => setSearch(text))}
              style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
              placeholder="Search symbols ..."
              placeholderTextColor={palette.searchPlaceholder}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={T.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(sym) => sym}
            extraData={isEditing}
            renderItem={({ item: sym }) => {
              if (isEditing) {
                const globalIndex = quoteSymbols.indexOf(sym);
                return (
                  <EditQuoteRow
                    symbol={sym}
                    index={globalIndex}
                    total={quoteSymbols.length}
                    T={T}
                    isDark={isDark}
                    cardBackground={animatedCardBackground}
                    onRemove={() => removeQuoteSymbol(sym)}
                    onMoveUp={() => moveQuote(globalIndex, globalIndex - 1)}
                    onMoveDown={() => moveQuote(globalIndex, globalIndex + 1)}
                  />
                );
              }

              return (
                <QuoteCard
                  symbol={sym}
                  T={T}
                  isDark={isDark}
                  cardBackground={animatedCardBackground}
                  onPress={() => goDetail(sym)}
                  onLongPress={() =>
                    showActionSheet({
                      title: sym,
                      actions: [
                        {
                          label: 'Chart',
                          onPress: () => {
                            setChartSymbol(sym);
                            router.push('/(tabs)/chart');
                          },
                        },
                        { label: 'Details', onPress: () => goDetail(sym) },
                        {
                          label: 'Hide',
                          danger: true,
                          onPress: () => removeQuoteSymbol(sym),
                        },
                      ],
                    })
                  }
                />
              );
            }}
            style={s.list}
            contentContainerStyle={s.listPad}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={isDark ? '#D1D4DC' : '#131722'}
                colors={[isDark ? '#D1D4DC' : '#131722']}
                progressBackgroundColor={isDark ? '#0E141F' : '#FFFFFF'}
              />
            }
            ListEmptyComponent={
              <View
                style={[
                  s.emptyWrap,
                  { backgroundColor: palette.emptyBg, borderColor: palette.cardBorder },
                ]}
              >
                <Text style={[s.emptyTitle, { color: T.text }]}>
                  {search.trim()
                    ? 'No matching instruments'
                    : isEditing
                      ? 'Watchlist is empty'
                      : 'Awaiting live instruments'}
                </Text>
                <Text style={[s.emptyText, { color: palette.secondaryText }]}>
                  {search.trim()
                    ? 'Try a broader search term or add another instrument to the desk.'
                    : isEditing
                      ? 'Add instruments to start building the quotes watchlist.'
                      : 'Instruments will appear here as soon as fresh quotes start streaming.'}
                </Text>
              </View>
            }
          />
        </View>
      </View>

      <AddSymbolModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(sym: string) => {
          addQuoteSymbol(sym);
          setShowAddModal(false);
        }}
        T={T}
        isDark={isDark}
        existingSymbols={quoteSymbols}
        cardBackground={animatedCardBackground}
      />
    </View>
  );
}

/* ───── Styles ───── */

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 4,
  },

  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  subheaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 2,
    marginBottom: 14,
  },

  subLeft: { fontSize: 12, fontWeight: '600' },

  subRight: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },

  subGrey: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  subLive: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  searchBar: {
    borderWidth: 1,
    borderRadius: 20,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },

  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

  list: { flex: 1 },
  listPad: { paddingBottom: 32 },

  emptyWrap: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    textAlign: 'center',
  },
});

/* ───── Card Styles ───── */

const sc = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 22,
    paddingLeft: 24,
    paddingRight: 20,
    overflow: 'hidden',
  },

  cardFill: StyleSheet.absoluteFillObject,

  cardShadowLight: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 0,
  },

  cardShadowDark: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 0,
  },

  cardPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },

  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  symbolCol: { flex: 1 },

  cardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },

  symbolText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  changePill: {
    paddingVertical: 2,
    marginLeft: -2,
  },

  changePillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  cardRow2: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  volText: { fontSize: 12, fontWeight: '600' },
  spreadText: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 12, fontWeight: '700' },

  statDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: 6,
    marginRight: 3,
  },

  pricesRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },

  priceBlock: {
    alignItems: 'flex-end',
    minWidth: 68,
  },

  labelWithTick: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },

  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  priceValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});

function TickCounter({ T, palette }: { T: ThemeColors; palette: QuotesPalette }) {
  const [tps, setTps] = useState(0);
  const tickCountRef = useRef(useTradingState.getState().tickCount);

  useEffect(() => {
    const unsub = useTradingState.subscribe((state) => {
      tickCountRef.current = state.tickCount;
    });
    return unsub;
  }, []);

  useEffect(() => {
    let lastTicks = tickCountRef.current;
    const interval = setInterval(() => {
      const current = tickCountRef.current;
      setTps(current - lastTicks);
      lastTicks = current;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[s.subRight, { backgroundColor: palette.metaBg, borderColor: palette.metaBorder }]}>
      <Text style={[s.subGrey, { color: palette.secondaryText }]}>Speed</Text>
      <Text style={[s.subLive, { color: T.trading.profit }]}>{tps} tps</Text>
      <Text style={[s.subGrey, { color: palette.secondaryText }]}>Status</Text>
      <Text style={[s.subLive, { color: T.trading.profit }]}>LIVE</Text>
    </View>
  );
}

function useActiveSymbols(quoteSymbols: string[]) {
  // Compute the active set from the CURRENT trading state on every render so
  // the very first paint already includes every symbol that has live data.
  // No "wait 1 second for the interval" delay.
  const computeActive = useCallback(() => {
    const stateQuotes = useTradingState.getState().quotes;
    const now = Date.now();
    return quoteSymbols.filter((sym) => hasFreshLiveQuote(stateQuotes[sym], now));
  }, [quoteSymbols]);

  const [activeSymbols, setActiveSymbols] = useState<string[]>(() => computeActive());

  // Re-compute whenever the quote stream emits new ticks. We subscribe to
  // tickCount (incremented by the WebSocket on every batch) so a stale list
  // catches up within ~16ms instead of the previous 1000ms polling delay.
  useEffect(() => {
    // Recompute once immediately after subscriptions change so we never
    // start from an empty list.
    setActiveSymbols((prev) => {
      const next = computeActive();
      if (prev.length === next.length && prev.every((s, i) => s === next[i])) return prev;
      return next;
    });

    const unsubscribe = useTradingState.subscribe((state, prevState) => {
      if (state.tickCount === prevState.tickCount) return;
      const next = computeActive();
      setActiveSymbols((prev) => {
        if (prev.length === next.length && prev.every((s, i) => s === next[i])) return prev;
        return next;
      });
    });

    // Periodic stale-purge: a symbol that hasn't ticked in
    // LIVE_SYMBOL_STALE_MS should drop out even if no new ticks arrive.
    // This is the only thing the interval is for now.
    const stalePurge = setInterval(() => {
      const next = computeActive();
      setActiveSymbols((prev) => {
        if (prev.length === next.length && prev.every((s, i) => s === next[i])) return prev;
        return next;
      });
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(stalePurge);
    };
  }, [computeActive]);

  return activeSymbols;
}