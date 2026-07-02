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
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, {
  useCallback, useDeferredValue, useEffect, useRef, useMemo, useState,
} from 'react';
import {
  Animated, Easing, FlatList, ScrollView, StyleSheet, Text, TextInput, View, Modal, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useMarketSymbols } from '../../query/market';
import { useFeedStatusActiveSymbols } from '../../query/feedStatus';
import {
  useWatchlistQuery,
  useAddToWatchlistMutation,
  useRemoveWatchlistMutation,
  useReplaceWatchlistMutation,
} from '../../query/watchlist';
import { fmt } from '../../utils/format';
import { AppHeader } from '../../ui/components/AppHeader';
import { FastPressable, FastPressable as Pressable } from '../../ui/components/FastPressable';
import { useTranslation } from '../../i18n/useTranslation';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import { prefetchQuoteDetails } from '../../utils/navigationPrefetch';
import { prefetchOrderTicketData } from '../../utils/navigationPrefetch';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { runImmediateAction } from '../../utils/actionLatency';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { hasDisplayableLiveQuotePrice } from './liveQuoteSnapshot';
import {
  buildDefaultQuoteWatchlist,
  DEFAULT_QUOTE_WATCHLIST,
  isMarketSymbolCatalogScopedToWatchlist,
  resolveQuoteFeedSymbols,
} from './quoteWatchlistDefaults';
import { buildAddSymbolCatalog } from './addSymbolCatalog';
import {
  areLiveQuoteSnapshotNotificationsPaused,
  getLiveQuoteFreshnessAnchorForSymbols,
  pauseLiveQuoteSnapshotNotifications,
  subscribeLiveQuoteSnapshots,
  useLiveQuoteSnapshot,
  useWatchlistLiveQuotes,
} from './useLiveQuotes';

/* ───── Helpers ───── */

const LIVE_SYMBOL_STALE_MS = 45_000;
const QUOTE_SPEED_SAMPLE_INTERVAL_MS = 250;
const QUOTE_SPEED_WINDOW_MS = 1_000;
const QUOTE_ROW_HEIGHT = 88;
const QUOTE_ROW_SIMPLE_HEIGHT = 64;
const QUOTE_ROW_SPACING = 16;
const QUOTE_SHEET_OPEN_FEED_PAUSE_MS = 15_000;
const QUOTE_SHEET_OPTION_FEED_PAUSE_MS = 900;
const QUOTE_SHEET_ROUTE_FEED_PAUSE_MS = 2_500;

const QUOTES_DARK_BACKGROUND = '#000000';
const QUOTES_DARK_SURFACE = '#1C1C1E';
const QUOTES_DARK_SURFACE_RAISED = '#2C2C2E';
const QUOTES_DARK_BORDER = 'rgba(255,255,255,0.10)';
const QUOTES_DARK_BORDER_SUBTLE = 'rgba(255,255,255,0.08)';
const QUOTES_DARK_PRIMARY_TEXT = '#FFFFFF';
const QUOTES_DARK_MUTED_TEXT = 'rgba(235,235,245,0.62)';
const QUOTES_DARK_SUBTLE_TEXT = 'rgba(235,235,245,0.54)';
const QUOTES_DARK_ACCENT_SOFT = 'rgba(169,112,255,0.18)';
const QUOTES_DARK_ACCENT_BORDER = 'rgba(169,112,255,0.36)';
const QUOTES_DARK_CARD_HIGHLIGHT: [string, string] = [
  'rgba(255,255,255,0.035)',
  'rgba(255,255,255,0)',
];
const QUOTES_LIGHT_CARD_HIGHLIGHT: [string, string] = [
  'rgba(255,255,255,0.04)',
  'rgba(255,255,255,0)',
];

const pairLabel = (symbol: string) => fmt.symbol(symbol);

const volumeLabel = (volume?: number) => {
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0) return '--';
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  return volume.toLocaleString('en-US');
};

function scheduleQuoteSheetOptionAction(action: () => void, deferUntilNextFrame = false) {
  if (deferUntilNextFrame && typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        setTimeout(action, 0);
      });
    });
    return;
  }

  setTimeout(action, 0);
}

const gmtClock = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

type QuotesRotationTheme = {
  fullscreenBackground: string;
  cardBackground: string;
};

type AnimatedColorValue = Animated.AnimatedInterpolation<string | number>;

type QuoteSheetOptionOptions = {
  routeChange?: boolean;
};

// full quotes screen background color + card background color
// Dark theme mirrors the Settings screen palette, scoped to Quotes only.
const QUOTES_THEME_ROTATION_DARK: QuotesRotationTheme[] = [
  { fullscreenBackground: QUOTES_DARK_BACKGROUND, cardBackground: QUOTES_DARK_SURFACE },
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
      shellBg: QUOTES_DARK_SURFACE,
      shellBorder: QUOTES_DARK_BORDER,
      shellHighlight: QUOTES_DARK_CARD_HIGHLIGHT,
      searchBg: QUOTES_DARK_SURFACE,
      searchBorder: 'rgba(255,255,255,0.12)',
      searchPlaceholder: 'rgba(235,235,245,0.46)',
      cardBorder: QUOTES_DARK_BORDER,
      metaBg: QUOTES_DARK_SURFACE_RAISED,
      metaBorder: QUOTES_DARK_BORDER_SUBTLE,
      secondaryText: QUOTES_DARK_MUTED_TEXT,
      eyebrow: QUOTES_DARK_SUBTLE_TEXT,
      emptyBg: QUOTES_DARK_SURFACE,
      actionBg: QUOTES_DARK_SURFACE_RAISED,
      actionBorder: QUOTES_DARK_BORDER,
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

function useQuotesThemeRotation(isDark: boolean, enabled: boolean) {
  const QUOTES_THEME_ROTATION = isDark
    ? QUOTES_THEME_ROTATION_DARK
    : QUOTES_THEME_ROTATION_LIGHT;
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const transition = useRef(new Animated.Value(1)).current;
  const activeIndexRef = useRef(0);
  const rotationLength = QUOTES_THEME_ROTATION.length;

  useEffect(() => {
    if (!enabled || rotationLength <= 1) {
      // The current palettes contain one stable color. Avoid running a forever
      // interval and JS-driven color animation when there is nothing to rotate.
      transition.stopAnimation();
      transition.setValue(1);
      return () => {
        transition.stopAnimation();
      };
    }

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
  }, [enabled, rotationLength, transition]);

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

const QuoteCard = React.memo(function QuoteCard({
  symbol,
  feedSymbol,
  T,
  isDark,
  cardBackground,
  viewMode,
  liveUpdatesActive = true,
  onPress,
  onPressIn,
  onLongPress,
  suppressPressFeedback = false,
}: {
  symbol: string;
  feedSymbol?: string;
  T: ThemeColors;
  isDark: boolean;
  cardBackground: AnimatedColorValue | string;
  viewMode: 'list' | 'table' | 'edit';
  liveUpdatesActive?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onLongPress: () => void;
  suppressPressFeedback?: boolean;
}) {
  const { t } = useTranslation();
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const isSimpleMode = viewMode === 'table';
  const liveSymbol = feedSymbol ?? symbol;
  const liveItem = useLiveQuoteSnapshot(liveSymbol, liveUpdatesActive);
  const noData = !hasDisplayableLiveQuotePrice(liveItem);

  if (!isSimpleMode && noData && (!liveItem || typeof liveItem.bid !== 'number' || typeof liveItem.ask !== 'number')) {
    const cardBorder = isDark ? QUOTES_DARK_BORDER : T.border;
    const cardHighlight = isDark ? QUOTES_DARK_CARD_HIGHLIGHT : QUOTES_LIGHT_CARD_HIGHLIGHT;
    const primaryText = isDark ? QUOTES_DARK_PRIMARY_TEXT : T.text;
    const mutedText = isDark ? QUOTES_DARK_MUTED_TEXT : T.textMuted;

    return (
      <Pressable
        style={({ pressed }) => [
          sc.card,
          isSimpleMode && sc.cardSimple,
          {
            height: isSimpleMode ? QUOTE_ROW_SIMPLE_HEIGHT : QUOTE_ROW_HEIGHT,
            paddingVertical: 0,
            paddingLeft: 24,
            justifyContent: 'center',
            borderColor: cardBorder,
          },
          pressed && !suppressPressFeedback && sc.cardPressed,
          pressed && suppressPressFeedback && sc.cardPressedNoShrink,
        ]}
        unstable_pressDelay={0}
        onPressIn={onPressIn}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={260}
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
          colors={cardHighlight}
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
              backgroundColor: mutedText,
              marginRight: 8,
              opacity: 0.5,
            }}
          />
          <Text
            style={{ color: primaryText, fontSize: 16, fontWeight: '600' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {pairLabel(normalizedSymbol || symbol)}
          </Text>
          <Text
            style={{
              color: mutedText,
              fontSize: 13,
              marginLeft: 'auto',
              fontStyle: 'italic',
            }}
          >
            {t('Connecting...')}
          </Text>
        </View>
      </Pressable>
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
  const cardBorder = isDark ? QUOTES_DARK_BORDER : T.border;
  const cardHighlight = isDark ? QUOTES_DARK_CARD_HIGHLIGHT : QUOTES_LIGHT_CARD_HIGHLIGHT;
  const primaryText = isDark ? QUOTES_DARK_PRIMARY_TEXT : T.text;
  const mutedText = isDark ? QUOTES_DARK_MUTED_TEXT : T.textMuted;
  const secondaryText = isDark ? QUOTES_DARK_SUBTLE_TEXT : T.textSub;

  const displaySymbol = pairLabel(item.symbol);
  const pct = `${isUp ? '+' : ''}${(item.changePct || 0).toFixed(2)}%`;
  const priceDigits =
    typeof item.digits === 'number' && Number.isFinite(item.digits)
      ? item.digits
      : 2;

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
    ? mutedText
    : bidDirection === 'up'
      ? POSITIVE
      : bidDirection === 'down'
        ? NEGATIVE
        : color;

  const askColor = noData
    ? mutedText
    : askDirection === 'up'
      ? POSITIVE
      : askDirection === 'down'
        ? NEGATIVE
        : color;

  const showBidCaret = !noData && (bidDirection !== 'neutral' || !item.prevBid);
  const showAskCaret = !noData && (askDirection !== 'neutral' || !item.prevAsk);

  const bidCaret = bidDirection !== 'neutral' ? bidDirection : isUp ? 'up' : 'down';
  const askCaret = askDirection !== 'neutral' ? askDirection : isUp ? 'up' : 'down';

  return (
    <Pressable
      style={({ pressed }) => [
        sc.card,
        isSimpleMode && sc.cardSimple,
        { borderColor: cardBorder },
        !isDark && sc.cardShadowLight,
        isDark && sc.cardShadowDark,
        pressed && !suppressPressFeedback && sc.cardPressed,
        pressed && suppressPressFeedback && sc.cardPressedNoShrink,
      ]}
      unstable_pressDelay={0}
      onPressIn={onPressIn}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
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
        colors={cardHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
      />

      <View style={[sc.cardInner, isSimpleMode && sc.cardInnerSimple]}>
        <View style={sc.symbolCol}>
          <View style={[sc.cardRow1, isSimpleMode && sc.cardRowSimple]}>
            <Text
              style={[sc.symbolText, { color: primaryText }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {displaySymbol}
            </Text>

            {!isSimpleMode && (
              <View style={sc.changePill}>
                <Text
                  style={[
                    sc.changePillText,
                    { color: noData ? mutedText : color },
                  ]}
                >
                  {noData ? '--' : pct}
                </Text>
              </View>
            )}
          </View>

          {!isSimpleMode && (
            <View style={sc.cardRow2}>
              <Text
                style={[sc.volText, { color: secondaryText, flexShrink: 1 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('Vol')}: <Text style={[sc.statValue, { color: primaryText }]}>{volumeLabel(item.volume ?? item.cachedVolume)}</Text>
              </Text>

              <Text
                style={[sc.spreadText, { color: secondaryText, flexShrink: 1 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('Spread')}:{' '}
                <Text style={[sc.statValue, { color: primaryText }]}>
                  {(item.spread || 0).toFixed(1)}
                </Text>
              </Text>
            </View>
          )}
        </View>

        <View style={[sc.pricesRow, isSimpleMode && sc.pricesRowSimple]}>
          <View style={[sc.priceBlock, isSimpleMode && sc.priceBlockSimple]}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: mutedText }]}>{t('BID')}</Text>
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
              minimumFontScale={0.82}
            >
              {noData ? '--' : fmt.price(item.bid, priceDigits)}
            </Text>
            {!isSimpleMode && !noData && item.low > 0 && (
              <Text style={[sc.lowHighText, { color: mutedText }]}>
                L: {fmt.price(item.low, priceDigits)}
              </Text>
            )}
          </View>

          <View style={[sc.priceBlock, isSimpleMode && sc.priceBlockSimple]}>
            <View style={sc.labelWithTick}>
              <Text style={[sc.priceLabel, { color: mutedText }]}>{t('ASK')}</Text>
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
              minimumFontScale={0.82}
            >
              {noData ? '--' : fmt.price(item.ask, priceDigits)}
            </Text>
            {!isSimpleMode && !noData && item.high > 0 && (
              <Text style={[sc.lowHighText, { color: mutedText }]}>
                H: {fmt.price(item.high, priceDigits)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
});

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
  const cardBorder = isDark ? QUOTES_DARK_BORDER : T.border;
  const cardHighlight = isDark ? QUOTES_DARK_CARD_HIGHLIGHT : QUOTES_LIGHT_CARD_HIGHLIGHT;
  const primaryText = isDark ? QUOTES_DARK_PRIMARY_TEXT : T.text;
  const mutedText = isDark ? QUOTES_DARK_MUTED_TEXT : T.textSub;

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
        colors={cardHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onRemove} style={{ padding: 4 }}>
          <Ionicons name="remove-circle" size={24} color={T.down} />
        </Pressable>
        <Text style={[sc.symbolText, { color: primaryText }]}>{fmt.symbol(symbol)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable
          onPress={onMoveUp}
          disabled={index === 0}
          style={{ opacity: index === 0 ? 0.3 : 1, padding: 4 }}
        >
          <Ionicons name="chevron-up-circle-outline" size={30} color={mutedText} />
        </Pressable>
        <Pressable
          onPress={onMoveDown}
          disabled={index === total - 1}
          style={{ opacity: index === total - 1 ? 0.3 : 1, padding: 4 }}
        >
          <Ionicons name="chevron-down-circle-outline" size={30} color={mutedText} />
        </Pressable>
      </View>
    </View>
  );
}

function LegacyAddSymbolModal({
  visible,
  onClose,
  onAdd,
  T,
  isDark,
  existingSymbols,
  cardBackground,
}: any) {
  const { data: apiSymbols, isLoading } = useMarketSymbols(visible);
  const { t } = useTranslation();
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: T.text }}>{t('Add Asset')}</Text>
          <FastPressable
            onPress={onClose}
            latencyLabel="quotes.addAsset.close"
            style={[
              s.headerActionButton,
              { backgroundColor: palette.actionBg, borderColor: palette.actionBorder },
            ]}
          >
            <Ionicons name="close" size={18} color={T.text} />
          </FastPressable>
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
            placeholder={isLoading ? t('Loading assets...') : t('Search available assets...')}
            placeholderTextColor={palette.searchPlaceholder}
            style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
            autoCapitalize="characters"
          />
        </View>

        <FlatList
          keyboardShouldPersistTaps="always"
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
                  colors={isDark ? QUOTES_DARK_CARD_HIGHLIGHT : QUOTES_LIGHT_CARD_HIGHLIGHT}
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
                      {alreadyAdded ? t('Already in your watchlist') : t('Add to live quotes desk')}
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
              {isLoading ? t('Fetching markets...') : t('No matching assets available.')}
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
    <Modal
      visible={visible}
      transparent
      animationType="none"
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

/* ───── QuotesScreen ───── */

/* Add symbol tree: MT5-style folders derived from broker symbols. */
type AddSymbolLeafCategory = 'commodities' | 'cryptocurrenciesMtt' | 'forexMarket' | 'indices' | 'metalsMtt';
type AddSymbolFolderKey = 'root' | 'forex' | 'metals' | 'quotes' | AddSymbolLeafCategory;
type SymbolKind = 'forex' | 'metal' | 'crypto' | 'commodity' | 'index' | 'other';

type AddSymbolFolderRow = {
  key: AddSymbolFolderKey;
  label: string;
  symbols: string[];
};
type AddSymbolListItem = string | AddSymbolFolderRow;
type AddSymbolFolderLogoMeta = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconSize?: number;
};

const ADD_SYMBOL_FOLDER_LOGO_META: Record<AddSymbolFolderKey, AddSymbolFolderLogoMeta> = {
  root: {
    icon: 'home',
  },
  quotes: {
    icon: 'stats-chart',
  },
  forex: {
    icon: 'earth',
  },
  metals: {
    icon: 'diamond',
  },
  commodities: {
    icon: 'flame',
  },
  cryptocurrenciesMtt: {
    icon: 'logo-bitcoin',
    iconSize: 24,
  },
  forexMarket: {
    icon: 'earth',
  },
  indices: {
    icon: 'bar-chart',
  },
  metalsMtt: {
    icon: 'diamond',
  },
};

function AddSymbolFolderLogo({ folderKey, isDark }: { folderKey: AddSymbolFolderKey; isDark: boolean }) {
  const meta = ADD_SYMBOL_FOLDER_LOGO_META[folderKey];

  return (
    <View
      style={[
        addSymbolStyles.folderLogoBox,
        {
          backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F8FAFC',
          borderColor: isDark ? 'rgba(148,163,184,0.24)' : '#E2E8F0',
          shadowColor: isDark ? '#000000' : '#CBD5E1',
        },
      ]}
    >
      <Ionicons name={meta.icon} size={meta.iconSize ?? 23} color={isDark ? '#E5E7EB' : '#111827'} />
    </View>
  );
}

const FX_CODES = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNH', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
  'HUF', 'ILS', 'INR', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'RUB', 'SEK',
  'SGD', 'TRY', 'USD', 'ZAR',
]);

const CURRENCY_NAMES: Record<string, string> = {
  AUD: 'Australian Dollar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNH: 'Chinese Yuan',
  CZK: 'Czech Koruna',
  DKK: 'Danish Krone',
  EUR: 'Euro',
  GBP: 'British Pound',
  HKD: 'Hong Kong Dollar',
  HUF: 'Hungarian Forint',
  ILS: 'Israeli Shekel',
  INR: 'Indian Rupee',
  JPY: 'Japanese Yen',
  MXN: 'Mexican Peso',
  NOK: 'Norwegian Krone',
  NZD: 'New Zealand Dollar',
  PLN: 'Polish Zloty',
  RUB: 'Russian Ruble',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  TRY: 'Turkish Lira',
  USD: 'US Dollar',
  ZAR: 'South African Rand',
};

const CRYPTO_CODES = new Set([
  'ADA', 'ALGO', 'ATOM', 'AVAX', 'BCH', 'BNB', 'BTC', 'DOGE', 'DOT',
  'ETH', 'FIL', 'LINK', 'LTC', 'MATIC', 'NEAR', 'SOL', 'UNI', 'XLM',
  'XRP',
]);

const CRYPTO_NAMES: Record<string, string> = {
  ADA: 'Cardano',
  ALGO: 'Algorand',
  ATOM: 'Cosmos',
  AVAX: 'Avalanche',
  BCH: 'Bitcoin Cash',
  BNB: 'BNB',
  BTC: 'Bitcoin',
  DOGE: 'Dogecoin',
  DOT: 'Polkadot',
  ETH: 'Ethereum',
  FIL: 'Filecoin',
  LINK: 'Chainlink',
  LTC: 'Litecoin',
  MATIC: 'Polygon',
  NEAR: 'Near Protocol',
  SOL: 'Solana',
  UNI: 'Uniswap',
  XLM: 'Stellar',
  XRP: 'Ripple',
};

const METAL_NAMES: Record<string, string> = {
  XAG: 'Silver',
  XAU: 'Gold',
  XPD: 'Palladium',
  XPT: 'Platinum',
};

const METAL_ALIASES: Record<string, string> = {
  GOLD: 'Gold',
  SILVER: 'Silver',
  PALLADIUM: 'Palladium',
  PLATINUM: 'Platinum',
};

const QUOTE_ASSET_CODES = ['USDT', 'USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH'];

const QUOTES_CATEGORY_DEFS: Array<{ key: AddSymbolLeafCategory; label: string }> = [
  { key: 'commodities', label: 'Commodities' },
  { key: 'cryptocurrenciesMtt', label: 'Cryptocurrencies MTT' },
  { key: 'forexMarket', label: 'Forex Market' },
  { key: 'indices', label: 'Indices' },
  { key: 'metalsMtt', label: 'Metals MTT' },
];

const ADD_SYMBOL_FOLDER_LABELS: Record<AddSymbolFolderKey, string> = {
  root: '',
  forex: 'Forex',
  metals: 'Metals',
  quotes: 'Quotes',
  commodities: 'Commodities',
  cryptocurrenciesMtt: 'Cryptocurrencies MTT',
  forexMarket: 'Forex Market',
  indices: 'Indices',
  metalsMtt: 'Metals MTT',
};

const stripTransportSuffix = (symbol: string) =>
  symbol.trim().toUpperCase().replace(/[\/\s]+/g, '').replace(/[._-].*$/, '');

const stripLegacySuffix = (symbol: string) =>
  symbol.endsWith('M') && symbol.length > 3 ? symbol.slice(0, -1) : symbol;

const splitQuotedAsset = (symbol: string): { asset: string; quote: string } | null => {
  for (const quote of QUOTE_ASSET_CODES) {
    if (symbol.length > quote.length && symbol.endsWith(quote)) {
      return { asset: symbol.slice(0, -quote.length), quote };
    }
  }
  return null;
};

const resolveMetalName = (symbol: string): string | null => {
  const metalCode = symbol.slice(0, 3);
  if (METAL_NAMES[metalCode]) {
    return METAL_NAMES[metalCode];
  }

  const aliasKey = Object.keys(METAL_ALIASES).find((alias) => symbol.startsWith(alias));
  return aliasKey ? METAL_ALIASES[aliasKey] : null;
};

function classifyCleanSymbol(symbol: string): SymbolKind {
  const fxBase = symbol.slice(0, 3);
  const fxQuote = symbol.slice(3, 6);
  if (symbol.length === 6 && FX_CODES.has(fxBase) && FX_CODES.has(fxQuote)) {
    return 'forex';
  }

  if (resolveMetalName(symbol)) {
    return 'metal';
  }

  const quotedAsset = splitQuotedAsset(symbol);
  if (quotedAsset && CRYPTO_CODES.has(quotedAsset.asset)) {
    return 'crypto';
  }

  if (/(?:OIL|BRENT|WTI|GAS|COPPER|COFFEE|COCOA|WHEAT|CORN|SUGAR|COTTON)/.test(symbol)) {
    return 'commodity';
  }

  if (/\d/.test(symbol) || /(?:INDEX|IDX|DAX|DOW|NASDAQ|NIKKEI|SPX|NAS|GER|FRA|HK|JPN|AUS)/.test(symbol)) {
    return 'index';
  }

  return 'other';
}

const resolveSymbolAnalysisBase = (symbol: string) => {
  const direct = stripTransportSuffix(symbol);
  const withoutLegacySuffix = stripLegacySuffix(direct);
  return classifyCleanSymbol(direct) === 'other' ? withoutLegacySuffix : direct;
};

const classifyMarketSymbol = (symbol: string): SymbolKind =>
  classifyCleanSymbol(resolveSymbolAnalysisBase(symbol));

const describeMarketSymbol = (symbol: string): string => {
  const base = resolveSymbolAnalysisBase(symbol);
  const kind = classifyCleanSymbol(base);

  if (kind === 'forex') {
    const baseCode = base.slice(0, 3);
    const quoteCode = base.slice(3, 6);
    return `${CURRENCY_NAMES[baseCode] ?? baseCode} vs ${CURRENCY_NAMES[quoteCode] ?? quoteCode}`;
  }

  if (kind === 'metal') {
    const metalName = resolveMetalName(base) ?? 'Metal';
    const metalPrefix = base.startsWith('X') ? base.slice(0, 3) : Object.keys(METAL_ALIASES).find((alias) => base.startsWith(alias)) ?? '';
    const quoteCode = metalPrefix ? base.slice(metalPrefix.length) : '';
    return quoteCode ? `${metalName} vs ${CURRENCY_NAMES[quoteCode] ?? quoteCode}` : `${metalName} Spot`;
  }

  if (kind === 'crypto') {
    const quotedAsset = splitQuotedAsset(base);
    if (quotedAsset) {
      return `${CRYPTO_NAMES[quotedAsset.asset] ?? quotedAsset.asset} / ${CURRENCY_NAMES[quotedAsset.quote] ?? quotedAsset.quote}`;
    }
  }

  if (kind === 'commodity') {
    if (/(?:BRENT|UKOIL)/.test(base)) return 'CFD based on spot on UK Oil';
    if (/(?:WTI|USOIL)/.test(base)) return 'CFD based on spot on US Oil';
    if (/(?:NGAS|NATGAS|GAS)/.test(base)) return 'CFD based on spot on Natural Gas';
    return 'Commodity CFD';
  }

  if (kind === 'index') {
    return 'Cash index CFD';
  }

  return `${fmt.symbol(symbol)} Instrument`;
};

const getAddSymbolParentFolder = (folder: AddSymbolFolderKey): AddSymbolFolderKey | null => {
  if (folder === 'root') return null;
  if (folder === 'forex' || folder === 'metals') return 'quotes';
  if (folder === 'quotes') return null;
  return 'quotes';
};

const getAddSymbolBreadcrumb = (folder: AddSymbolFolderKey): AddSymbolFolderKey[] => {
  if (folder === 'root') return [];
  if (folder === 'forex' || folder === 'metals' || folder === 'quotes') return [folder];
  return ['quotes', folder];
};

type AddSymbolPalette = {
  screenBg: string;
  headerBorder: string;
  searchBg: string;
  searchBorder: string;
  rowBg: string;
  rowBorder: string;
  rowPressed: string;
  iconBg: string;
  chipBg: string;
  chipBorder: string;
  mutedText: string;
  actionBg: string;
  actionAddedBg: string;
};

function getAddSymbolPalette(T: ThemeColors, isDark: boolean): AddSymbolPalette {
  if (isDark) {
    return {
      // Dark theme mirrors the Settings screen palette, scoped to Quotes only.
      screenBg: QUOTES_DARK_BACKGROUND,
      headerBorder: QUOTES_DARK_BORDER_SUBTLE,
      searchBg: QUOTES_DARK_SURFACE,
      searchBorder: 'rgba(255,255,255,0.12)',
      rowBg: QUOTES_DARK_SURFACE,
      rowBorder: QUOTES_DARK_BORDER,
      rowPressed: QUOTES_DARK_SURFACE_RAISED,
      iconBg: QUOTES_DARK_SURFACE_RAISED,
      chipBg: 'rgba(169,112,255,0.16)',
      chipBorder: QUOTES_DARK_ACCENT_BORDER,
      mutedText: QUOTES_DARK_MUTED_TEXT,
      actionBg: QUOTES_DARK_ACCENT_SOFT,
      actionAddedBg: 'rgba(16,185,129,0.14)',
    };
  }

  return {
    screenBg: '#F4F6FA',
    headerBorder: '#E5E7EB',
    searchBg: '#FFFFFF',
    searchBorder: '#E1E7F0',
    rowBg: '#FFFFFF',
    rowBorder: '#E3E8F0',
    rowPressed: '#F1F5F9',
    iconBg: '#F3F6FB',
    chipBg: '#EEF4FF',
    chipBorder: '#C7D8FA',
    mutedText: T.textMuted,
    actionBg: '#EEF4FF',
    actionAddedBg: '#EAF8F1',
  };
}

const SYMBOL_KIND_META: Record<SymbolKind, { label: string; accent: string; tintDark: string; tintLight: string }> = {
  forex: { label: 'FX', accent: '#2563EB', tintDark: 'rgba(37,99,235,0.16)', tintLight: '#EEF4FF' },
  metal: { label: 'METAL', accent: '#D97706', tintDark: 'rgba(217,119,6,0.18)', tintLight: '#FFF7ED' },
  crypto: { label: 'CRYPTO', accent: '#7C3AED', tintDark: 'rgba(124,58,237,0.18)', tintLight: '#F5F3FF' },
  commodity: { label: 'CFD', accent: '#059669', tintDark: 'rgba(5,150,105,0.18)', tintLight: '#ECFDF5' },
  index: { label: 'INDEX', accent: '#0F766E', tintDark: 'rgba(15,118,110,0.18)', tintLight: '#F0FDFA' },
  other: { label: 'SYMBOL', accent: '#64748B', tintDark: 'rgba(148,163,184,0.14)', tintLight: '#F8FAFC' },
};

function AddSymbolModal({
  visible,
  onClose,
  onAdd,
  T,
  isDark,
  existingSymbols,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (symbol: string) => void;
  T: ThemeColors;
  isDark: boolean;
  existingSymbols: string[];
  cardBackground?: AnimatedColorValue;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<AddSymbolFolderKey>('quotes');
  const { data: apiSymbols, isLoading } = useMarketSymbols(visible);
  const addPalette = useMemo(() => getAddSymbolPalette(T, isDark), [T, isDark]);

  useEffect(() => {
    if (!visible) return;
    setFolder('quotes');
    setQuery('');
  }, [visible]);

  const allSymbols = useMemo(
    () => buildAddSymbolCatalog(apiSymbols, existingSymbols),
    [apiSymbols, existingSymbols],
  );

  const existingSymbolKeys = useMemo(() => {
    const keys = new Set<string>();
    (existingSymbols ?? []).forEach((symbol) => {
      keys.add(stripTransportSuffix(symbol).toLowerCase());
      keys.add(resolveSymbolAnalysisBase(symbol).toLowerCase());
    });
    return keys;
  }, [existingSymbols]);

  const isSymbolAdded = useCallback(
    (symbol: string) =>
      existingSymbolKeys.has(stripTransportSuffix(symbol).toLowerCase()) ||
      existingSymbolKeys.has(resolveSymbolAnalysisBase(symbol).toLowerCase()),
    [existingSymbolKeys],
  );

  const groupedSymbols = useMemo(() => {
    const groups: Record<AddSymbolLeafCategory, string[]> = {
      commodities: [],
      cryptocurrenciesMtt: [],
      forexMarket: [],
      indices: [],
      metalsMtt: [],
    };

    // The picker mirrors MT5 folders from broker symbols, with a typed local
    // catalog only when the broker catalog is unavailable in dev/offline mode.
    allSymbols.forEach((symbol) => {
      const kind = classifyMarketSymbol(symbol);
      if (kind === 'forex') groups.forexMarket.push(symbol);
      else if (kind === 'metal') groups.metalsMtt.push(symbol);
      else if (kind === 'crypto') groups.cryptocurrenciesMtt.push(symbol);
      else if (kind === 'commodity') groups.commodities.push(symbol);
      else if (kind === 'index') groups.indices.push(symbol);
    });

    return groups;
  }, [allSymbols]);

  const quoteBranchSymbols = useMemo(
    () => Array.from(new Set(QUOTES_CATEGORY_DEFS.flatMap((entry) => groupedSymbols[entry.key]))),
    [groupedSymbols],
  );

  const currentScopeSymbols = useMemo(() => {
    if (folder === 'root') return allSymbols;
    if (folder === 'forex') return groupedSymbols.forexMarket;
    if (folder === 'metals') return groupedSymbols.metalsMtt;
    if (folder === 'quotes') return quoteBranchSymbols;
    return groupedSymbols[folder];
  }, [allSymbols, folder, groupedSymbols, quoteBranchSymbols]);

  const visibleSymbols = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currentScopeSymbols;
    return currentScopeSymbols.filter((symbol) => {
      const label = fmt.symbol(symbol).toLowerCase();
      const description = describeMarketSymbol(symbol).toLowerCase();
      return label.includes(q) || description.includes(q);
    });
  }, [currentScopeSymbols, query]);

  const countAdded = useCallback(
    (symbols: string[]) => symbols.reduce((count, symbol) => count + (isSymbolAdded(symbol) ? 1 : 0), 0),
    [isSymbolAdded],
  );

  const folderRows = useMemo<AddSymbolFolderRow[]>(() => {
    if (query.trim()) return [];
    if (folder === 'root') {
      return [
        { key: 'forex', label: 'Forex', symbols: groupedSymbols.forexMarket },
        { key: 'metals', label: 'Metals', symbols: groupedSymbols.metalsMtt },
        { key: 'quotes', label: 'Quotes', symbols: quoteBranchSymbols },
      ];
    }
    if (folder === 'quotes') {
      return QUOTES_CATEGORY_DEFS.map((entry) => ({
        key: entry.key,
        label: entry.label,
        symbols: groupedSymbols[entry.key],
      }));
    }
    return [];
  }, [folder, groupedSymbols, query, quoteBranchSymbols]);

  const shouldShowSymbols = query.trim().length > 0 || (folder !== 'root' && folder !== 'quotes');
  const listData = useMemo<AddSymbolListItem[]>(
    () => (shouldShowSymbols ? visibleSymbols : folderRows),
    [folderRows, shouldShowSymbols, visibleSymbols],
  );
  const breadcrumb = getAddSymbolBreadcrumb(folder);
  const parentFolder = getAddSymbolParentFolder(folder);
  const activeFolderLabel = folder === 'root' ? t('All symbols') : t(ADD_SYMBOL_FOLDER_LABELS[folder]);
  const activeScopeAdded = countAdded(currentScopeSymbols);

  const handleHeaderBack = () => {
    if (parentFolder) {
      setFolder(parentFolder);
      setQuery('');
      return;
    }
    onClose();
  };

  if (!visible) return null;

  const content = (
    <View
      style={[
        addSymbolStyles.root,
        {
          paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 16 : 28),
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: addPalette.screenBg,
        },
      ]}
    >
      <View style={[addSymbolStyles.header, { borderBottomColor: addPalette.headerBorder }]}>
        <FastPressable
          onPress={handleHeaderBack}
          activateOnPressIn
          latencyLabel="quotes.addSymbol.back"
          hitSlop={12}
          style={({ pressed }) => [
            addSymbolStyles.backButton,
            { backgroundColor: addPalette.iconBg, borderColor: addPalette.rowBorder },
            pressed && { backgroundColor: addPalette.rowPressed },
          ]}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </FastPressable>
        <View style={addSymbolStyles.titleBlock}>
          <Text style={[addSymbolStyles.title, { color: T.text }]}>{t('Add symbol')}</Text>
          <Text style={[addSymbolStyles.subtitle, { color: addPalette.mutedText }]} numberOfLines={1}>
            {activeFolderLabel}
          </Text>
        </View>
        <View
          style={[
            addSymbolStyles.headerCountPill,
            { backgroundColor: addPalette.chipBg, borderColor: addPalette.chipBorder },
          ]}
        >
          <Text style={[addSymbolStyles.headerCountText, { color: T.accent }]}>
            {activeScopeAdded}/{currentScopeSymbols.length}
          </Text>
        </View>
      </View>

      <View
        style={[
          addSymbolStyles.searchRow,
          { backgroundColor: addPalette.searchBg, borderColor: addPalette.searchBorder },
        ]}
      >
        <Ionicons name="search" size={21} color={addPalette.mutedText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={isLoading && allSymbols.length === 0 ? t('Loading assets...') : t('Find symbols')}
          placeholderTextColor={isDark ? 'rgba(226,232,240,0.48)' : '#B8B8B8'}
          style={[addSymbolStyles.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => setQuery('')}
          disabled={query.length === 0}
          hitSlop={8}
          activateOnPressIn
          latencyLabel="quotes.addSymbol.search.clear"
          unstable_pressDelay={0}
          style={[addSymbolStyles.searchClearButton, query.length === 0 && addSymbolStyles.searchClearButtonHidden]}
        >
          <Ionicons name="close-circle" size={18} color={addPalette.mutedText} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={addSymbolStyles.breadcrumbScroll}
        contentContainerStyle={addSymbolStyles.breadcrumbRow}
      >
        <Pressable
          onPress={() => {
            setFolder('quotes');
            setQuery('');
          }}
          hitSlop={10}
          activateOnPressIn
          latencyLabel="quotes.addSymbol.breadcrumb.root"
          unstable_pressDelay={0}
          style={[
            addSymbolStyles.breadcrumbChip,
            {
              backgroundColor: addPalette.iconBg,
              borderColor: addPalette.rowBorder,
            },
          ]}
        >
          <Ionicons name="home-outline" size={19} color={addPalette.mutedText} />
        </Pressable>
        {breadcrumb.map((item) => (
          <React.Fragment key={item}>
            <Ionicons name="chevron-forward" size={14} color={addPalette.mutedText} />
            <Pressable
              onPress={() => {
                setFolder(item);
                setQuery('');
              }}
              activateOnPressIn
              latencyLabel={`quotes.addSymbol.breadcrumb.${item}`}
              unstable_pressDelay={0}
              style={[
                addSymbolStyles.breadcrumbChip,
                {
                  backgroundColor: item === folder ? addPalette.chipBg : addPalette.iconBg,
                  borderColor: item === folder ? addPalette.chipBorder : addPalette.rowBorder,
                },
              ]}
            >
              <Text
                style={[
                  addSymbolStyles.breadcrumbText,
                  { color: item === folder ? T.accent : addPalette.mutedText },
                ]}
              >
                {t(ADD_SYMBOL_FOLDER_LABELS[item])}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}
      </ScrollView>

      <FlatList
        data={listData}
        keyExtractor={(item) => (typeof item === 'string' ? item : item.key)}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          addSymbolStyles.listContent,
          { paddingBottom: Math.max(insets.bottom + 28, 40) },
        ]}
        renderItem={({ item }) => {
          if (typeof item !== 'string') {
            const added = countAdded(item.symbols);
            const disabled = item.symbols.length === 0;
            return (
              <Pressable
                onPress={() => {
                  if (disabled) return;
                  setFolder(item.key);
                  setQuery('');
                }}
                activateOnPressIn
                latencyLabel={`quotes.addSymbol.folder.${item.key}`}
                unstable_pressDelay={0}
                disabled={disabled}
                style={({ pressed }) => [
                  addSymbolStyles.folderRow,
                  {
                    backgroundColor: addPalette.rowBg,
                    borderColor: addPalette.rowBorder,
                    opacity: disabled ? 0.52 : 1,
                  },
                  pressed && !disabled && { backgroundColor: addPalette.rowPressed },
                ]}
              >
                <View style={addSymbolStyles.folderLeft}>
                  <AddSymbolFolderLogo folderKey={item.key} isDark={isDark} />
                  <View style={addSymbolStyles.folderTextCol}>
                    <Text style={[addSymbolStyles.folderTitle, { color: T.text }]}>{t(item.label)}</Text>
                    <Text style={[addSymbolStyles.folderMeta, { color: addPalette.mutedText }]}>
                      {item.symbols.length} {t('symbols')}
                    </Text>
                  </View>
                </View>
                <View style={addSymbolStyles.folderRight}>
                  <View
                    style={[
                      addSymbolStyles.folderCountPill,
                      { backgroundColor: addPalette.chipBg, borderColor: addPalette.chipBorder },
                    ]}
                  >
                    <Text style={[addSymbolStyles.folderCount, { color: T.accent }]}>
                      {added}/{item.symbols.length}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={addPalette.mutedText} />
                </View>
              </Pressable>
            );
          }

          const alreadyAdded = isSymbolAdded(item);
          const kind = classifyMarketSymbol(item);
          const kindMeta = SYMBOL_KIND_META[kind];
          return (
            <Pressable
              onPress={() => {
                if (!alreadyAdded) onAdd(item);
              }}
              activateOnPressIn
              latencyLabel={`quotes.addSymbol.asset.${item}`}
              unstable_pressDelay={0}
              disabled={alreadyAdded}
              style={({ pressed }) => [
                addSymbolStyles.symbolRow,
                {
                  backgroundColor: addPalette.rowBg,
                  borderColor: addPalette.rowBorder,
                  opacity: alreadyAdded ? 0.72 : 1,
                },
                pressed && !alreadyAdded && { backgroundColor: addPalette.rowPressed },
              ]}
            >
              <View style={[addSymbolStyles.symbolRail, { backgroundColor: kindMeta.accent }]} />
              <View style={addSymbolStyles.symbolTextCol}>
                <View style={addSymbolStyles.symbolNameRow}>
                  <Text style={[addSymbolStyles.symbolName, { color: T.text }]}>{fmt.symbol(item)}</Text>
                  <View
                    style={[
                      addSymbolStyles.symbolKindPill,
                      {
                        backgroundColor: isDark ? kindMeta.tintDark : kindMeta.tintLight,
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                      },
                    ]}
                  >
                    <Text style={[addSymbolStyles.symbolKindText, { color: kindMeta.accent }]}>
                      {kindMeta.label}
                    </Text>
                  </View>
                </View>
                <Text style={[addSymbolStyles.symbolDescription, { color: T.textMuted }]} numberOfLines={1}>
                  {describeMarketSymbol(item)}
                </Text>
              </View>
              <View
                style={[
                  addSymbolStyles.symbolActionButton,
                  { backgroundColor: alreadyAdded ? addPalette.actionAddedBg : addPalette.actionBg },
                ]}
              >
                <Ionicons
                  name={alreadyAdded ? 'checkmark' : 'add'}
                  size={20}
                  color={alreadyAdded ? T.trading.profit : T.accent}
                />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View
            style={[
              addSymbolStyles.emptyCard,
              { backgroundColor: addPalette.rowBg, borderColor: addPalette.rowBorder },
            ]}
          >
            <Ionicons name="search-outline" size={28} color={addPalette.mutedText} />
            <Text style={[addSymbolStyles.emptyText, { color: T.textMuted }]}>
              {isLoading && allSymbols.length === 0 ? t('Fetching markets...') : t('No matching assets available.')}
            </Text>
          </View>
        }
      />
    </View>
  );

  if (Platform.OS === 'web') {
    return <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>{content}</View>;
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={handleHeaderBack}
    >
      {content}
    </Modal>
  );
}

const QuotesScreenInner = React.memo(function QuotesScreenInner({ isQuotesRouteActive }: { isQuotesRouteActive: boolean }) {
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const palette = useMemo(() => getQuotesPalette(T, isDark), [T, isDark]);

  const {
    animatedFullscreenBackground,
    animatedCardBackground,
  } = useQuotesThemeRotation(isDark, isScreenFocused);

  const quoteSymbols = useUserPreferences((st) => st.quoteSymbols);
  const addQuoteSymbol = useUserPreferences((st) => st.addQuoteSymbol);
  const removeQuoteSymbol = useUserPreferences((st) => st.removeQuoteSymbol);
  const setQuoteSymbols = useUserPreferences((st) => st.setQuoteSymbols);
  const setChartSymbol = useUserPreferences((st) => st.setChartSymbol);

  const showQuotesActionSheet = useUIState((s) => s.showQuotesActionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const [quoteSheetRouteActionPending, setQuoteSheetRouteActionPending] = useState(false);
  const quoteSheetFeedPauseReleaseRef = useRef<(() => void) | null>(null);
  // isQuotesRouteActive (the /quotes path match) comes from the thin wrapper so
  // this screen only re-renders when its own focus or route-active state flips,
  // not on every unrelated tab switch (usePathname re-renders on any path change).
  const quoteRouteActive = isScreenFocused || isQuotesRouteActive;
  const quoteCatalogActive = quoteRouteActive && !quoteSheetRouteActionPending;
  const quoteWatchlistActive = quoteCatalogActive && isLoggedIn;
  const { data: apiSymbols = [] } = useMarketSymbols(quoteCatalogActive);
  const { data: activeFeedSymbols = [] } = useFeedStatusActiveSymbols(quoteCatalogActive);
  const feedAwareSymbols = useMemo(
    () => activeFeedSymbols.length > 0
      ? Array.from(new Set([...activeFeedSymbols, ...apiSymbols]))
      : apiSymbols,
    [activeFeedSymbols, apiSymbols],
  );

  // ── Server-side watchlist sync ──────────────────────────────────────────
  // Fetch the server watchlist and sync mutations. Local Zustand state stays
  // as the primary UI source of truth (instant updates); the server is kept
  // in sync fire-and-forget so the watchlist persists across devices/sessions.
  const { data: serverWatchlist } = useWatchlistQuery(quoteWatchlistActive);
  const { mutate: serverAdd } = useAddToWatchlistMutation();
  const { mutate: serverRemove } = useRemoveWatchlistMutation();
  const { mutate: serverReplace } = useReplaceWatchlistMutation();
  const syncServerAdd = useCallback((symbol: string) => {
    if (isLoggedIn) {
      serverAdd(symbol);
    }
  }, [isLoggedIn, serverAdd]);
  const syncServerRemove = useCallback((symbol: string) => {
    if (isLoggedIn) {
      serverRemove(symbol);
    }
  }, [isLoggedIn, serverRemove]);
  const syncServerReplace = useCallback((symbols: string[]) => {
    if (isLoggedIn) {
      serverReplace(symbols);
    }
  }, [isLoggedIn, serverReplace]);

  const hasSetInitialSymbols = useUserPreferences((st) => st.hasSetInitialSymbols);
  const setHasSetInitialSymbols = useUserPreferences((st) => st.setHasSetInitialSymbols);

  useEffect(() => {
    // Clear any legacy sticky watchlist subscriptions. Quotes rows already
    // subscribe through focused-screen effects and detail/chart hooks, so
    // leaving sticky symbols behind only causes unnecessary global quote fan-out.
    quotesWsService.setSubscriptions([]);
    return () => {
      quotesWsService.setSubscriptions([]);
    };
  }, []);

  // Read quoteSymbols via a ref so the seeding effect can access the current
  // value without listing it as a dependency — listing it caused an infinite
  // loop: setQuoteSymbols → quoteSymbols changes → effect re-runs → repeat.
  const quoteSymbolsRef = useRef(quoteSymbols);
  quoteSymbolsRef.current = quoteSymbols;

  // Track whether the server watchlist seed has already been applied this
  // session so the Priority-1 branch only fires once even as the query
  // result reference changes between renders.
  const serverSeedDoneRef = useRef(false);

  useEffect(() => {
    const currentSymbols = quoteSymbolsRef.current;
    const availableSymbolsSet = new Set(feedAwareSymbols);
    const resolveAvailableSymbols = (symbols: readonly string[]) => (
      resolveQuoteFeedSymbols(symbols, feedAwareSymbols)
        .filter((symbol) => availableSymbolsSet.has(symbol))
    );

    if (feedAwareSymbols.length === 0) {
      if (!hasSetInitialSymbols && currentSymbols.length === 0) {
        setQuoteSymbols([...DEFAULT_QUOTE_WATCHLIST]);
        setHasSetInitialSymbols(true);
      }
      return;
    }

    // ── Already initialised: never let the server override local state ───
    // hasSetInitialSymbols is persisted in Zustand so it survives restarts,
    // logouts, and tab navigations. Once the user's list is established the
    // server watchlist is only used as a fire-and-forget sync target — it
    // must never silently replace the user's curated list. Without this guard
    // every component remount (tab switch, background→foreground) re-ran the
    // server seed because serverSeedDoneRef reset to false, overwriting local
    // symbols with whatever the server returned at that moment.
    if (hasSetInitialSymbols) {
      // If the user removed every symbol (or state is empty after a bug),
      // re-seed with curated defaults so the screen is never permanently blank.
      if (currentSymbols.length === 0) {
        setQuoteSymbols(buildDefaultQuoteWatchlist(feedAwareSymbols));
        return;
      }
      // Fix bloated legacy state (old versions seeded the entire catalog)
      const bloated = currentSymbols.length >= Math.max(20, Math.floor(feedAwareSymbols.length * 0.8));
      if (bloated) {
        setQuoteSymbols(buildDefaultQuoteWatchlist(feedAwareSymbols));
        return;
      }
      if (isMarketSymbolCatalogScopedToWatchlist(feedAwareSymbols, currentSymbols)) {
        return;
      }
      // Strip any symbols the broker has since delisted and migrate legacy
      // lowercase/local display symbols to the broker's live feed casing.
      const valid = [...new Set(resolveAvailableSymbols(currentSymbols))];
      if (
        valid.length < currentSymbols.length ||
        valid.some((sym, index) => sym !== currentSymbols[index])
      ) {
        setQuoteSymbols(valid);
      }
      return; // ← critical: no server override after first init
    }

    // ── First launch only: seed from server watchlist if available ───────
    // serverSeedDoneRef prevents the block from running twice within the same
    // mount cycle if both apiSymbols and serverWatchlist resolve simultaneously.
    if (!serverSeedDoneRef.current && serverWatchlist && serverWatchlist.length > 0) {
      const sorted = [...serverWatchlist].sort((a, b) => a.sort_order - b.sort_order);
      const validFromServer = resolveAvailableSymbols(sorted.map((item) => item.symbol));
      const uniqueFromServer = [...new Set(validFromServer)];
      if (uniqueFromServer.length > 0) {
        // If server has too few symbols (e.g. leftover from a previous bug),
        // supplement with curated defaults so the user always starts with a
        // useful set of at least 5 instruments.
        let finalList = uniqueFromServer;
        if (finalList.length < 5) {
          const extras = resolveAvailableSymbols([...DEFAULT_QUOTE_WATCHLIST]).filter(
            (sym) => !finalList.includes(sym),
          );
          finalList = [...finalList, ...extras].slice(0, 5);
        }
        setQuoteSymbols(finalList);
        setHasSetInitialSymbols(true);
        serverSeedDoneRef.current = true;
        return;
      }
    }

    // ── First launch fallback: curated defaults ───────────────────────────
    setQuoteSymbols(buildDefaultQuoteWatchlist(feedAwareSymbols));
    setHasSetInitialSymbols(true);
  }, [
    feedAwareSymbols,
    serverWatchlist,
    setQuoteSymbols,
    hasSetInitialSymbols,
    setHasSetInitialSymbols,
  ]);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // The route wrapper already keeps this screen mounted only for the Quotes
  // route family. Do not gate the actual market-data subscription on this
  // nested focus value: React Navigation can briefly report false during tab
  // transitions and pushed quote sub-screens, which leaves the visible Quotes
  // list mounted but unsubscribed.
  const quoteFeedSymbols = useMemo(
    () => resolveQuoteFeedSymbols(quoteSymbols, feedAwareSymbols),
    [quoteSymbols, feedAwareSymbols],
  );
  const quoteFeedSymbolByDisplay = useMemo(() => {
    const entries = quoteSymbols.map((symbol, index) => [
      symbol,
      quoteFeedSymbols[index] ?? symbol,
    ] as const);
    return new Map(entries);
  }, [quoteSymbols, quoteFeedSymbols]);
  const quoteStickyFeedActive = quoteCatalogActive;
  const quoteRestFallbackActive = quoteCatalogActive;
  const quoteFeedSymbolsKey = quoteFeedSymbols.join('|');

  useEffect(() => {
    if (!quoteStickyFeedActive || quoteFeedSymbols.length === 0) {
      quotesWsService.setSubscriptions([]);
      return;
    }

    quotesWsService.setSubscriptions(quoteFeedSymbols);
    return () => {
      quotesWsService.setSubscriptions([]);
    };
  }, [quoteStickyFeedActive, quoteFeedSymbols, quoteFeedSymbolsKey]);

  useWatchlistLiveQuotes(quoteFeedSymbols, quoteStickyFeedActive, {
    restFallbackActive: quoteRestFallbackActive,
  });

  const pauseQuoteSheetFeed = useCallback((durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS) => {
    quotesWsService.deferReconnectForInteraction?.(durationMs);
    const release = pauseLiveQuoteSnapshotNotifications(durationMs);
    quoteSheetFeedPauseReleaseRef.current?.();
    quoteSheetFeedPauseReleaseRef.current = release;
  }, []);

  const releaseQuoteSheetFeedPause = useCallback(() => {
    quoteSheetFeedPauseReleaseRef.current?.();
    quoteSheetFeedPauseReleaseRef.current = null;
  }, []);

  const toggleEditMode = () => {
    if (!isEditing) setSearch('');
    setIsEditing(!isEditing);
  };

  const closeAddSymbolModal = useCallback(() => {
    setShowAddModal(false);
  }, []);

  const openAddSymbolModal = useCallback(() => {
    hideActionSheet();
    setShowAddModal(true);
  }, [hideActionSheet]);

  useEffect(() => {
    if (showAddModal) {
      hideActionSheet();
    }
  }, [hideActionSheet, showAddModal]);

  const moveQuote = useCallback((fromIndex: number, toIndex: number) => {
    const newQueue = [...quoteSymbols];
    const element = newQueue.splice(fromIndex, 1)[0];
    newQueue.splice(toIndex, 0, element);
    // Update local state immediately for instant UI response, then sync to server
    setQuoteSymbols(newQueue);
    syncServerReplace(newQueue);
  }, [quoteSymbols, setQuoteSymbols, syncServerReplace]);

  // Clock timer moved into isolated GmtClock component to prevent
  // the 1-second interval from re-rendering the entire QuotesScreen
  // (parent re-render forces all FlatList items to re-evaluate).

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

  const quoteViewMode = useUserPreferences((st) => st.quoteViewMode);
  const setQuoteViewMode = useUserPreferences((st) => st.setQuoteViewMode);
  const preloadQuotesActionSheet = useUIState((s) => s.preloadQuotesActionSheet);

  useEffect(() => {
    setQuoteSheetRouteActionPending(false);
  }, [isQuotesRouteActive]);

  useEffect(() => {
    if (!quoteSheetRouteActionPending) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setQuoteSheetRouteActionPending(false);
    }, 2500);

    return () => clearTimeout(timeoutId);
  }, [quoteSheetRouteActionPending]);

  useEffect(() => {
    return releaseQuoteSheetFeedPause;
  }, [releaseQuoteSheetFeedPause]);

  const runQuoteSheetOption = useCallback((action: () => void, options?: QuoteSheetOptionOptions) => {
    const routeChange = options?.routeChange === true;
    pauseQuoteSheetFeed(routeChange ? QUOTE_SHEET_ROUTE_FEED_PAUSE_MS : QUOTE_SHEET_OPTION_FEED_PAUSE_MS);
    if (routeChange) {
      React.startTransition(() => {
        setQuoteSheetRouteActionPending(true);
      });
    }
    scheduleQuoteSheetOptionAction(action, routeChange);
  }, [pauseQuoteSheetFeed]);

  const goDetail = useCallback((sym: string) => {
    runQuoteSheetOption(() => {
      prefetchQuoteDetails(sym);
      setChartSymbol(sym);
      router.push({ pathname: '/quotes/details', params: { symbol: sym } });
    }, { routeChange: true });
  }, [router, runQuoteSheetOption, setChartSymbol]);

  const quoteTapActionSheetConfigs = useMemo(() => {
    const configs = new Map<string, Parameters<typeof showQuotesActionSheet>[0]>();

    quoteSymbols.forEach((sym) => {
      const displayName = fmt.symbol(sym);
      configs.set(sym, {
        title: `${displayName}: ${describeMarketSymbol(sym)}`,
        presentation: 'mt5Plain',
        detent: 'auto',
        instantOpen: true,
        runActionAfterClose: true,
        actions: [
          {
            label: t('New Order'),
            activateOnPressIn: true,
            onPress: () => {
              runQuoteSheetOption(() => {
                prefetchOrderTicketData(resolveTradingLoginString(), sym);
                router.push({ pathname: '/trade/order-ticket', params: { symbol: sym } });
              }, { routeChange: true });
            },
          },
          {
            label: t('Chart'),
            activateOnPressIn: true,
            onPress: () => {
              runQuoteSheetOption(() => {
                setChartSymbol(sym);
                router.push('/(tabs)/chart');
              }, { routeChange: true });
            },
          },
          {
            label: t('Properties'),
            activateOnPressIn: true,
            onPress: () => goDetail(sym),
          },
          {
            label: t('Market Statistics'),
            activateOnPressIn: true,
            onPress: () => {
              runQuoteSheetOption(() => {
                router.push({ pathname: '/quotes/market-statistics', params: { symbol: sym } });
              }, { routeChange: true });
            },
          },
          // Both view modes are listed; the currently-active one is shown
          // disabled (via `selected`) and you tap the other to switch.
          // The quotes rows treat viewMode === 'table' as the simple view.
          {
            label: t('Simple view mode'),
            activateOnPressIn: true,
            selected: quoteViewMode === 'table',
            onPress: () => {
              runQuoteSheetOption(() => {
                setQuoteViewMode('table');
              });
            },
          },
          {
            label: t('Advanced view mode'),
            activateOnPressIn: true,
            selected: quoteViewMode === 'list',
            onPress: () => {
              runQuoteSheetOption(() => {
                setQuoteViewMode('list');
              });
            },
          },
        ],
      });
    });

    return configs;
  }, [goDetail, quoteSymbols, quoteViewMode, router, runQuoteSheetOption, setChartSymbol, setQuoteViewMode, showQuotesActionSheet, t]);

  const quoteLongPressActionSheetConfigs = useMemo(() => {
    const configs = new Map<string, Parameters<typeof showQuotesActionSheet>[0]>();

    quoteSymbols.forEach((sym) => {
      configs.set(sym, {
        title: fmt.symbol(sym),
        presentation: 'mt5Plain',
        detent: 'auto',
        instantOpen: true,
        runActionAfterClose: true,
        actions: [
          {
            label: t('Chart'),
            activateOnPressIn: true,
            onPress: () => {
              runQuoteSheetOption(() => {
                setChartSymbol(sym);
                router.push('/(tabs)/chart');
              }, { routeChange: true });
            },
          },
          { label: t('Properties'), activateOnPressIn: true, onPress: () => goDetail(sym) },
          {
            label: t('Hide'),
            danger: true,
            activateOnPressIn: true,
            onPress: () => {
              runQuoteSheetOption(() => {
                removeQuoteSymbol(sym);
                syncServerRemove(sym);
              });
            },
          },
        ],
      });
    });

    return configs;
  }, [goDetail, quoteSymbols, removeQuoteSymbol, router, runQuoteSheetOption, setChartSymbol, showQuotesActionSheet, syncServerRemove, t]);

  useEffect(() => {
    const firstSym = quoteSymbols[0];
    if (firstSym) {
      const config = quoteTapActionSheetConfigs.get(firstSym);
      if (config) {
        preloadQuotesActionSheet(config);
      }
    }
  }, [quoteSymbols, quoteTapActionSheetConfigs, preloadQuotesActionSheet]);

  const handleSymbolTap = useCallback((sym: string) => {
    if (showAddModal) return;
    const config = quoteTapActionSheetConfigs.get(sym);
    if (config) {
      runImmediateAction('quotes.symbolSheet.tap.open', () => {
        pauseQuoteSheetFeed();
        showQuotesActionSheet(config);
      });
    }
  }, [pauseQuoteSheetFeed, quoteTapActionSheetConfigs, showQuotesActionSheet, showAddModal]);

  const handleSymbolLongPress = useCallback((sym: string) => {
    if (showAddModal) return;
    const config = quoteLongPressActionSheetConfigs.get(sym);
    if (config) {
      runImmediateAction('quotes.symbolSheet.longPress.open', () => {
        pauseQuoteSheetFeed();
        showQuotesActionSheet(config);
      });
    }
  }, [pauseQuoteSheetFeed, quoteLongPressActionSheetConfigs, showQuotesActionSheet, showAddModal]);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
  }, []);

  const renderQuoteItem = useCallback(({ item: sym }: { item: string }) => {
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
          onRemove={() => { removeQuoteSymbol(sym); syncServerRemove(sym); }}
          onMoveUp={() => moveQuote(globalIndex, globalIndex - 1)}
          onMoveDown={() => moveQuote(globalIndex, globalIndex + 1)}
        />
      );
    }

    return (
      <QuoteCard
        symbol={sym}
        feedSymbol={quoteFeedSymbolByDisplay.get(sym) ?? sym}
        T={T}
        isDark={isDark}
        cardBackground={animatedCardBackground}
        viewMode={quoteViewMode}
        liveUpdatesActive={quoteStickyFeedActive}
        onPressIn={() => pauseQuoteSheetFeed()}
        onPress={() => handleSymbolTap(sym)}
        suppressPressFeedback
        onLongPress={() => handleSymbolLongPress(sym)}
      />
    );
  }, [
    T,
    animatedCardBackground,
    handleSymbolLongPress,
    handleSymbolTap,
    isDark,
    isEditing,
    moveQuote,
    pauseQuoteSheetFeed,
    quoteSymbols,
    quoteFeedSymbolByDisplay,
    quoteViewMode,
    quoteStickyFeedActive,
    removeQuoteSymbol,
    syncServerRemove,
  ]);
  const getQuoteItemLayout = useCallback((_: ArrayLike<string> | null | undefined, index: number) => {
    const rowHeight = !isEditing && quoteViewMode === 'table'
      ? QUOTE_ROW_SIMPLE_HEIGHT
      : QUOTE_ROW_HEIGHT;
    const length = rowHeight + QUOTE_ROW_SPACING;
    return { length, offset: length * index, index };
  }, [isEditing, quoteViewMode]);

  return (
    <View style={s.root}>
      <Animated.View
        pointerEvents="none"
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
                <FastPressable
                  onPress={openAddSymbolModal}
                  activateOnPressIn
                  latencyLabel="quotes.addAsset.open"
                  hitSlop={12}
                  style={[
                    s.headerActionButton,
                    { backgroundColor: palette.actionBg, borderColor: palette.actionBorder },
                  ]}
                >
                  <Ionicons name="add-outline" size={20} color={T.text} />
                </FastPressable>

                <FastPressable
                  onPress={toggleEditMode}
                  activateOnPressIn
                  latencyLabel="quotes.editMode.toggle"
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
                </FastPressable>
              </View>
            }
          />

          <View style={s.subheaderRow}>
            <GmtClock style={[s.subLeft, { color: palette.secondaryText }]} active />

            <View style={{ alignItems: 'flex-end' }}>
              <TickCounter T={T} palette={palette} active={quoteStickyFeedActive} symbols={quoteFeedSymbols} />
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
              onChangeText={handleSearchChange}
              style={[s.searchInput, { color: T.text }, { outlineStyle: 'none' } as any]}
              placeholder={t('Search symbols ...')}
              placeholderTextColor={palette.searchPlaceholder}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <FastPressable
              onPress={() => setSearch('')}
              latencyLabel="quotes.search.clear"
              disabled={search.length === 0}
              style={[s.searchClearButton, search.length === 0 && s.searchClearButtonHidden]}
            >
              <Ionicons name="close-circle" size={16} color={T.textMuted} />
            </FastPressable>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(sym) => sym}
            extraData={`${isEditing ? 'edit' : 'view'}:${quoteViewMode}`}
            renderItem={renderQuoteItem}
            getItemLayout={getQuoteItemLayout}
            style={s.list}
            contentContainerStyle={s.listPad}
            showsVerticalScrollIndicator={false}
            // Quotes are websocket-driven, so pull-to-refresh is intentionally
            // removed. These FlatList limits keep row mounting work bounded so
            // Android's touch responder is not starved during heavy tick flow.
            keyboardShouldPersistTaps="always"
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            ListEmptyComponent={
              <View
                style={[
                  s.emptyWrap,
                  { backgroundColor: palette.emptyBg, borderColor: palette.cardBorder },
                ]}
              >
                <Text style={[s.emptyTitle, { color: T.text }]}>
                  {search.trim()
                    ? t('No matching instruments')
                    : isEditing
                      ? t('Watchlist is empty')
                      : t('Awaiting live instruments')}
                </Text>
                <Text style={[s.emptyText, { color: palette.secondaryText }]}>
                  {search.trim()
                    ? t('Try a broader search term or add another instrument to the desk.')
                    : isEditing
                      ? t('Add instruments to start building the quotes watchlist.')
                      : t('Instruments will appear here as soon as fresh quotes start streaming.')}
                </Text>
              </View>
            }
          />
        </View>
      </View>

      <AddSymbolModal
        visible={showAddModal}
        onClose={closeAddSymbolModal}
        onAdd={(sym: string) => {
          addQuoteSymbol(sym);
          syncServerAdd(sym);
        }}
        T={T}
        isDark={isDark}
        existingSymbols={quoteSymbols}
        cardBackground={animatedCardBackground}
      />
    </View>
  );
});

// Thin wrapper: derive the quotes-route boolean from the path here so the heavy
// memoized QuotesScreen above does not reconcile on every bottom-tab switch — it
// only re-renders when its own focus or the quotes-route active state changes.
export function QuotesScreen() {
  const pathname = usePathname();
  const isQuotesRouteActive =
    pathname === '/quotes' ||
    pathname.startsWith('/quotes/') ||
    pathname === '/(tabs)/quotes' ||
    pathname.startsWith('/(tabs)/quotes/');
  return <QuotesScreenInner isQuotesRouteActive={isQuotesRouteActive} />;
}

/* ───── Styles ───── */

const addSymbolStyles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
  },
  headerCountPill: {
    minWidth: 62,
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCountText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  searchRow: {
    minHeight: 54,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 17,
    fontWeight: '600',
  },
  searchClearButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearButtonHidden: {
    opacity: 0,
  },
  breadcrumbScroll: {
    flexGrow: 0,
    height: 60,
    marginTop: -6,
    marginBottom: 0,
  },
  breadcrumbRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breadcrumbChip: {
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  breadcrumbText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  folderRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  folderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  folderLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  folderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  folderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  folderMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  folderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  folderCountPill: {
    minWidth: 62,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCount: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  symbolRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    overflow: 'hidden',
  },
  symbolRail: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  symbolTextCol: {
    flex: 1,
    paddingRight: 12,
    minWidth: 0,
  },
  symbolNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  symbolName: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    flexShrink: 1,
  },
  symbolKindPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  symbolKindText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  symbolDescription: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  symbolActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    minHeight: 140,
    marginTop: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  emptyText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  screen: { flex: 1, paddingTop: 16 },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 4,
  },

  headerActionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  subheaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 16,
  },

  subLeft: { fontSize: 13, fontWeight: '500' },

  subRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },

  subGrey: { fontSize: 12, fontWeight: '500', letterSpacing: 0 },
  subLive: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },

  searchBar: {
    borderWidth: 1,
    borderRadius: 20,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },

  searchInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '500' },
  searchClearButton: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearButtonHidden: {
    opacity: 0,
  },

  list: { flex: 1, paddingHorizontal: 16 },
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
    height: QUOTE_ROW_HEIGHT,
    marginBottom: QUOTE_ROW_SPACING,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 22,
    paddingLeft: 24,
    paddingRight: 20,
    overflow: 'hidden',
  },

  cardSimple: {
    height: QUOTE_ROW_SIMPLE_HEIGHT,
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 18,
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 0,
  },

  cardPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  cardPressedNoShrink: { opacity: 0.8, backgroundColor: 'rgba(128,128,128,0.1)' },

  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  cardInnerSimple: {
    minHeight: 40,
  },

  symbolCol: { flex: 1 },

  cardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },

  cardRowSimple: {
    marginBottom: 0,
  },

  symbolText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },

  changePill: {
    paddingVertical: 2,
    marginLeft: -2,
  },

  changePillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  cardRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  volText: { fontSize: 13, fontWeight: '500' },
  spreadText: { fontSize: 13, fontWeight: '500' },
  statValue: { fontSize: 13, fontWeight: '600' },

  pricesRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },

  pricesRowSimple: {
    gap: 10,
  },

  priceBlock: {
    alignItems: 'flex-end',
    minWidth: 68,
  },

  priceBlockSimple: {
    minWidth: 62,
  },

  labelWithTick: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },

  priceLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },

  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },

  lowHighRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 2,
  },

  lowHighText: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});

/** Isolated 1-second clock so the timer doesn't re-render the parent QuotesScreen. */
function GmtClock({ style, active }: { style: any; active: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return <Text style={style}>{t('Updated')}: {gmtClock(now)} GMT</Text>;
}

function TickCounter({
  T,
  palette,
  active,
  symbols,
}: {
  T: ThemeColors;
  palette: QuotesPalette;
  active: boolean;
  symbols: string[];
}) {
  const { t } = useTranslation();
  const [tps, setTps] = useState(0);
  const [hasFreshFeed, setHasFreshFeed] = useState(false);
  // Speed is based on the same direct symbol subscriptions that feed the rows.
  // A rolling one-second window prevents a fast feed from being displayed as
  // "1 tps" just because the React timer sampled at the wrong moment.
  const tickTimesRef = useRef<number[]>([]);
  const snapshotTimesRef = useRef<number[]>([]);
  const lastTickAtRef = useRef(0);
  const symbolsKey = symbols.join('|');
  const trackedSymbols = useMemo(
    () => Array.from(new Set(symbols.map((entry) => normalizeQuoteSymbolKey(entry)).filter(Boolean))),
    [symbolsKey],
  );
  const latestSnapshotAtRef = useRef(0);

  useEffect(() => {
    if (!active || trackedSymbols.length === 0) {
      return;
    }

    const listener = (tick: QuoteTickEvent) => {
      if (areLiveQuoteSnapshotNotificationsPaused()) {
        return;
      }

      const ts =
        typeof tick.receivedAt === 'number' && Number.isFinite(tick.receivedAt)
          ? tick.receivedAt
          : Date.now();
      lastTickAtRef.current = ts;
      tickTimesRef.current.push(ts);
    };

    const unsubscribers = trackedSymbols.map((symbol) =>
      quotesWsService.subscribeToSymbol(symbol, listener),
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [active, trackedSymbols, trackedSymbols.length]);

  useEffect(() => {
    if (!active || trackedSymbols.length === 0) {
      return;
    }

    latestSnapshotAtRef.current = getLiveQuoteFreshnessAnchorForSymbols(trackedSymbols);

    return subscribeLiveQuoteSnapshots(trackedSymbols, () => {
      const receivedAt = Date.now();
      latestSnapshotAtRef.current = receivedAt;
      snapshotTimesRef.current.push(receivedAt);
    });
  }, [active, trackedSymbols, trackedSymbols.length]);

  useEffect(() => {
    if (!active || trackedSymbols.length === 0) {
      tickTimesRef.current = [];
      snapshotTimesRef.current = [];
      lastTickAtRef.current = 0;
      latestSnapshotAtRef.current = 0;
      setTps(0);
      setHasFreshFeed(false);
      return;
    }
    const readHasFreshFeed = () => {
      const last = Math.max(lastTickAtRef.current, latestSnapshotAtRef.current);
      return last > 0 && Date.now() - last <= LIVE_SYMBOL_STALE_MS;
    };
    // Reset the counter when the symbol set or focus changes so TPS reflects
    // the current window, not a count carried over from a previous session.
    tickTimesRef.current = [];
    snapshotTimesRef.current = [];
    lastTickAtRef.current = 0;
    latestSnapshotAtRef.current = getLiveQuoteFreshnessAnchorForSymbols(trackedSymbols);
    setTps(0);
    setHasFreshFeed(readHasFreshFeed());
    const interval = setInterval(() => {
      if (areLiveQuoteSnapshotNotificationsPaused()) {
        return;
      }

      const cutoff = Date.now() - QUOTE_SPEED_WINDOW_MS;
      tickTimesRef.current = tickTimesRef.current.filter((time) => time >= cutoff);
      snapshotTimesRef.current = snapshotTimesRef.current.filter((time) => time >= cutoff);
      const visibleUpdateCount =
        tickTimesRef.current.length > 0
          ? tickTimesRef.current.length
          : snapshotTimesRef.current.length;
      setTps(Math.max(0, visibleUpdateCount));
      setHasFreshFeed(readHasFreshFeed());
    }, QUOTE_SPEED_SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, trackedSymbols.length, symbolsKey]);

  const statusColor = hasFreshFeed ? T.trading.profit : palette.secondaryText;

  return (
    <View style={s.subRight}>
      <Text style={[s.subGrey, { color: palette.secondaryText }]}>{t('Speed')}:</Text>
      <Text style={[s.subLive, { color: statusColor }]}>{tps} tps</Text>
      <Text style={[s.subGrey, { color: palette.secondaryText }]}>{t('Status')}:</Text>
      <Text style={[s.subLive, { color: statusColor }]}>
        {hasFreshFeed ? t('LIVE') : t('Connecting...')}
      </Text>
    </View>
  );
}
