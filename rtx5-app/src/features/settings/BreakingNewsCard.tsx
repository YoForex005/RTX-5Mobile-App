import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import type { NewsImpactLevel, NewsSentiment } from './newsViewModel';

export type BreakingNewsCardData = {
  id: string;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  impact_level: NewsImpactLevel;
  category: string;
  sentiment?: NewsSentiment;
  affected_symbols: string[];
};

type BreakingNewsCardProps = {
  breakingNews?: BreakingNewsCardData | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onSymbolPress?: (symbol: string) => void;
  isDark?: boolean;
};

const MAX_VISIBLE_SYMBOLS = 3;

type BreakingNewsTonePalette = {
  cardGradient: readonly [string, string, string, string];
  glassGradient: readonly [string, string, string];
  badgeGradient: readonly [string, string];
  borderColor: string;
  badgeBorderColor: string;
  iconColor: string;
  badgeTextColor: string;
  readMoreTextColor: string;
  readMoreBackgroundColor: string;
  readMoreBorderColor: string;
};

const BREAKING_NEWS_PALETTES: Record<'dark' | 'light', Record<NewsSentiment, BreakingNewsTonePalette>> = {
  dark: {
    negative: {
      cardGradient: ['rgba(30,37,57,0.96)', '#1B253A', '#142B44', '#1B2238'],
      glassGradient: ['rgba(239,68,68,0.045)', 'rgba(239,68,68,0.014)', 'rgba(239,68,68,0)'],
      badgeGradient: ['rgba(239,68,68,0.075)', 'rgba(255,255,255,0.035)'],
      borderColor: 'rgba(226,232,240,0.14)',
      badgeBorderColor: 'rgba(226,232,240,0.14)',
      iconColor: '#FF6B74',
      badgeTextColor: '#FFFFFF',
      readMoreTextColor: '#FCA5A5',
      readMoreBackgroundColor: 'rgba(239,68,68,0.045)',
      readMoreBorderColor: 'rgba(226,232,240,0.12)',
    },
    positive: {
      cardGradient: ['rgba(30,37,57,0.96)', '#1B253A', '#142B44', '#1B2238'],
      glassGradient: ['rgba(47,155,255,0.048)', 'rgba(47,155,255,0.016)', 'rgba(47,155,255,0)'],
      badgeGradient: ['rgba(47,155,255,0.08)', 'rgba(255,255,255,0.035)'],
      borderColor: 'rgba(226,232,240,0.14)',
      badgeBorderColor: 'rgba(226,232,240,0.14)',
      iconColor: '#7DD3FC',
      badgeTextColor: '#FFFFFF',
      readMoreTextColor: '#7DD3FC',
      readMoreBackgroundColor: 'rgba(47,155,255,0.045)',
      readMoreBorderColor: 'rgba(226,232,240,0.12)',
    },
    neutral: {
      cardGradient: ['rgba(30,37,57,0.96)', '#1B253A', '#142B44', '#1B2238'],
      glassGradient: ['rgba(148,163,184,0.035)', 'rgba(148,163,184,0.012)', 'rgba(148,163,184,0)'],
      badgeGradient: ['rgba(148,163,184,0.075)', 'rgba(255,255,255,0.035)'],
      borderColor: 'rgba(226,232,240,0.14)',
      badgeBorderColor: 'rgba(226,232,240,0.14)',
      iconColor: '#CBD5E1',
      badgeTextColor: '#FFFFFF',
      readMoreTextColor: '#CBD5E1',
      readMoreBackgroundColor: 'rgba(148,163,184,0.035)',
      readMoreBorderColor: 'rgba(226,232,240,0.12)',
    },
  },
  light: {
    negative: {
      cardGradient: ['#FFFFFF', '#F8FBFF', '#EFF6FF', '#FFFFFF'],
      glassGradient: ['rgba(239,68,68,0.034)', 'rgba(239,68,68,0.011)', 'rgba(239,68,68,0)'],
      badgeGradient: ['rgba(239,68,68,0.045)', 'rgba(255,255,255,0.86)'],
      borderColor: '#DCE6F3',
      badgeBorderColor: 'rgba(15,23,42,0.08)',
      iconColor: '#DC2626',
      badgeTextColor: '#B91C1C',
      readMoreTextColor: '#DC2626',
      readMoreBackgroundColor: 'rgba(239,68,68,0.03)',
      readMoreBorderColor: 'rgba(15,23,42,0.08)',
    },
    positive: {
      cardGradient: ['#FFFFFF', '#F8FBFF', '#EFF6FF', '#FFFFFF'],
      glassGradient: ['rgba(47,155,255,0.038)', 'rgba(47,155,255,0.012)', 'rgba(47,155,255,0)'],
      badgeGradient: ['rgba(47,155,255,0.05)', 'rgba(255,255,255,0.88)'],
      borderColor: '#DCE6F3',
      badgeBorderColor: 'rgba(15,23,42,0.08)',
      iconColor: '#2563EB',
      badgeTextColor: '#1D4ED8',
      readMoreTextColor: '#2563EB',
      readMoreBackgroundColor: 'rgba(37,99,235,0.032)',
      readMoreBorderColor: 'rgba(15,23,42,0.08)',
    },
    neutral: {
      cardGradient: ['#FFFFFF', '#F8FBFF', '#EFF6FF', '#FFFFFF'],
      glassGradient: ['rgba(100,116,139,0.028)', 'rgba(100,116,139,0.009)', 'rgba(100,116,139,0)'],
      badgeGradient: ['rgba(100,116,139,0.038)', 'rgba(255,255,255,0.88)'],
      borderColor: '#DCE6F3',
      badgeBorderColor: 'rgba(15,23,42,0.08)',
      iconColor: '#475569',
      badgeTextColor: '#334155',
      readMoreTextColor: '#2563EB',
      readMoreBackgroundColor: 'rgba(37,99,235,0.028)',
      readMoreBorderColor: 'rgba(15,23,42,0.08)',
    },
  },
};

/**
 * UI component that displays an important breaking news headline or alert within the settings or news section.
 */
export function BreakingNewsCard({
  breakingNews,
  isLoading = false,
  errorMessage,
  onRetry,
  onSymbolPress,
  isDark = true,
}: BreakingNewsCardProps) {
  if (isLoading) {
    return <BreakingNewsSkeleton isDark={isDark} />;
  }

  if (errorMessage) {
    return <BreakingNewsError message={errorMessage} onRetry={onRetry} isDark={isDark} />;
  }

  if (!breakingNews) {
    return null;
  }

  const tone = resolveBreakingNewsTone(breakingNews.sentiment);
  const palette = getBreakingNewsPalette(tone, isDark);

  return (
    <View style={styles.cardShadow}>
      <LinearGradient
        colors={palette.cardGradient}
        locations={[0, 0.28, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, !isDark && styles.cardLight, { borderColor: palette.borderColor }]}
      >
        <LinearGradient
          colors={palette.glassGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.7 }}
          pointerEvents="none"
          style={styles.cardGlassOverlay}
        />
        <View style={styles.topRow}>
          <BreakingBadge isDark={isDark} palette={palette} />
          <NewsMetaRow
            source={breakingNews.source}
            publishedAt={breakingNews.published_at}
            isDark={isDark}
          />
        </View>

        <View style={styles.leftColumn}>
          <NewsHeadline title={breakingNews.title} isDark={isDark} />
          <NewsSubheading text={breakingNews.summary} isDark={isDark} />
        </View>

        <BreakingContextRow
          impactLevel={breakingNews.impact_level}
          category={breakingNews.category}
          isDark={isDark}
          palette={palette}
        />

        <View style={[styles.divider, !isDark && styles.dividerLight]} />

        <View style={styles.bottomRow}>
          <AffectedSymbolsRow
            symbols={breakingNews.affected_symbols}
            isDark={isDark}
            onSymbolPress={onSymbolPress}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

function BreakingBadge({
  isDark,
  palette,
}: {
  isDark: boolean;
  palette: BreakingNewsTonePalette;
}) {
  return (
    <LinearGradient
      colors={palette.badgeGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.badge, !isDark && styles.badgeLight, { borderColor: palette.badgeBorderColor }]}
    >
      <Ionicons name="flash" size={14} color={palette.iconColor} />
      <Text style={[styles.badgeText, !isDark && styles.badgeTextLight, { color: palette.badgeTextColor }]}>
        BREAKING NEWS
      </Text>
    </LinearGradient>
  );
}

function NewsHeadline({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text style={[styles.headline, !isDark && styles.headlineLight]} numberOfLines={3}>
      {title}
    </Text>
  );
}

function NewsSubheading({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <Text style={[styles.subheading, !isDark && styles.subheadingLight]} numberOfLines={2}>
      {text}
    </Text>
  );
}

function BreakingContextRow({
  impactLevel,
  category,
  isDark,
  palette,
}: {
  impactLevel: NewsImpactLevel;
  category: string;
  isDark: boolean;
  palette: BreakingNewsTonePalette;
}) {
  return (
    <View style={styles.contextRow}>
      <View style={[styles.contextChip, !isDark && styles.contextChipLight]}>
        <Text style={[styles.contextText, !isDark && styles.contextTextLight]} numberOfLines={1}>
          {category}
        </Text>
      </View>
      <View
        style={[
          styles.contextChip,
          !isDark && styles.contextChipLight,
          { borderColor: palette.readMoreBorderColor },
        ]}
      >
        <View style={[styles.impactDot, { backgroundColor: palette.iconColor }]} />
        <Text style={[styles.contextText, { color: palette.readMoreTextColor }]} numberOfLines={1}>
          {impactLevel} Impact
        </Text>
      </View>
    </View>
  );
}

function NewsMetaRow({
  source,
  publishedAt,
  isDark,
}: {
  source: string;
  publishedAt: string;
  isDark: boolean;
}) {
  const metaIconColor = isDark ? '#C8CED8' : '#64748B';

  return (
    <View style={styles.metaRow}>
      <Ionicons name="globe-outline" size={15} color={metaIconColor} />
      <Text
        style={[styles.metaText, !isDark && styles.metaTextLight, styles.metaSourceText]}
        numberOfLines={1}
      >
        {source}
      </Text>
      <View style={[styles.metaDivider, !isDark && styles.metaDividerLight]} />
      <Ionicons name="time-outline" size={15} color={metaIconColor} />
      <Text
        style={[styles.metaText, !isDark && styles.metaTextLight, styles.metaTimeText]}
        numberOfLines={1}
      >
        {publishedAt}
      </Text>
    </View>
  );
}

function AffectedSymbolsRow({
  symbols,
  isDark,
  onSymbolPress,
}: {
  symbols: string[];
  isDark: boolean;
  onSymbolPress?: (symbol: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (symbols.length === 0) return null;

  const visibleSymbols = symbols.slice(0, MAX_VISIBLE_SYMBOLS);
  const overflowCount = Math.max(0, symbols.length - visibleSymbols.length);

  const handleSymbolPress = (symbol: string) => {
    setShowAll(false);
    onSymbolPress?.(symbol);
  };

  return (
    <View style={styles.symbolBlock}>
      <Text style={[styles.symbolLabel, !isDark && styles.symbolLabelLight]}>
        Affected Symbols
      </Text>
      <ScrollView
        keyboardShouldPersistTaps="always"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.symbolRail}
        style={styles.symbolScroller}
      >
        {visibleSymbols.map((symbol) => (
          <Pressable
            key={symbol}
            accessibilityRole="button"
            accessibilityLabel={`Open ${symbol} chart`}
            disabled={!onSymbolPress}
            hitSlop={6}
            onPress={() => onSymbolPress?.(symbol)}
            style={[styles.symbolChip, !isDark && styles.symbolChipLight]}
          >
            <Text style={[styles.symbolText, !isDark && styles.symbolTextLight]} numberOfLines={1}>
              {symbol}
            </Text>
          </Pressable>
        ))}
        {overflowCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show all ${symbols.length} affected symbols`}
            hitSlop={6}
            onPress={() => setShowAll(true)}
            style={[styles.symbolChip, styles.symbolOverflowChip, !isDark && styles.symbolOverflowChipLight]}
          >
            <Text style={[styles.symbolText, styles.symbolOverflowText, !isDark && styles.symbolOverflowTextLight]}>
              +{overflowCount}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <AllSymbolsModal
        visible={showAll}
        symbols={symbols}
        isDark={isDark}
        onClose={() => setShowAll(false)}
        onSymbolPress={onSymbolPress ? handleSymbolPress : undefined}
      />
    </View>
  );
}

function AllSymbolsModal({
  visible,
  symbols,
  isDark,
  onClose,
  onSymbolPress,
}: {
  visible: boolean;
  symbols: string[];
  isDark: boolean;
  onClose: () => void;
  onSymbolPress?: (symbol: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.allSymbolsOverlay, !isDark && styles.allSymbolsOverlayLight]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.allSymbolsSheet, !isDark && styles.allSymbolsSheetLight]}>
          <View style={[styles.allSymbolsHandle, !isDark && styles.allSymbolsHandleLight]} />
          <View style={styles.allSymbolsHeader}>
            <View style={styles.allSymbolsHeaderCopy}>
              <Text style={[styles.allSymbolsTitle, !isDark && styles.allSymbolsTitleLight]}>
                Affected Symbols
              </Text>
              <Text style={[styles.allSymbolsSubtitle, !isDark && styles.allSymbolsSubtitleLight]}>
                {symbols.length} symbol{symbols.length === 1 ? '' : 's'} impacted by this story
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close affected symbols"
              hitSlop={8}
              onPress={onClose}
              style={[styles.allSymbolsCloseButton, !isDark && styles.allSymbolsCloseButtonLight]}
            >
              <Ionicons name="close" size={18} color={isDark ? '#E2E8F0' : '#334155'} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.allSymbolsGrid}
          >
            {symbols.map((symbol) => (
              <Pressable
                key={symbol}
                accessibilityRole="button"
                accessibilityLabel={`Open ${symbol} chart`}
                disabled={!onSymbolPress}
                hitSlop={4}
                onPress={() => onSymbolPress?.(symbol)}
                style={[styles.allSymbolsChip, !isDark && styles.allSymbolsChipLight]}
              >
                <Text
                  style={[styles.allSymbolsChipText, !isDark && styles.allSymbolsChipTextLight]}
                  numberOfLines={1}
                >
                  {symbol}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function resolveBreakingNewsTone(sentiment?: NewsSentiment): NewsSentiment {
  if (sentiment === 'positive' || sentiment === 'neutral') return sentiment;
  return 'negative';
}

function getBreakingNewsPalette(tone: NewsSentiment, isDark: boolean): BreakingNewsTonePalette {
  return BREAKING_NEWS_PALETTES[isDark ? 'dark' : 'light'][tone];
}

function BreakingNewsSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <View style={[styles.card, !isDark && styles.cardLight]}>
      <View style={[styles.skeletonBlock, !isDark && styles.skeletonBlockLight, styles.skeletonBadge]} />
      <View
        style={[
          styles.skeletonLine,
          !isDark && styles.skeletonBlockLight,
          { width: '28%', marginTop: 24 },
        ]}
      />
      <View
        style={[
          styles.skeletonLine,
          !isDark && styles.skeletonBlockLight,
          { width: '58%', height: 22, marginTop: 14 },
        ]}
      />
      <View
        style={[
          styles.skeletonLine,
          !isDark && styles.skeletonBlockLight,
          { width: '48%', height: 22, marginTop: 8 },
        ]}
      />
      <View
        style={[
          styles.skeletonLine,
          !isDark && styles.skeletonBlockLight,
          { width: '54%', marginTop: 18 },
        ]}
      />
      <View style={[styles.divider, !isDark && styles.dividerLight]} />
      <View style={styles.bottomRow}>
        <View
          style={[
            styles.skeletonBlock,
            !isDark && styles.skeletonBlockLight,
            { width: 130, height: 34 },
          ]}
        />
      </View>
    </View>
  );
}

function BreakingNewsError({
  message,
  onRetry,
  isDark,
}: {
  message: string;
  onRetry?: () => void;
  isDark: boolean;
}) {
  return (
    <View style={[styles.card, !isDark && styles.cardLight, styles.stateCard]}>
      <Text style={[styles.stateTitle, !isDark && styles.stateTitleLight]}>
        Breaking news unavailable
      </Text>
      <Text style={[styles.stateText, !isDark && styles.stateTextLight]}>{message}</Text>
      {onRetry ? (
        <Pressable style={[styles.retryButton, !isDark && styles.retryButtonLight]} onPress={onRetry}>
          <Text style={[styles.retryText, !isDark && styles.retryTextLight]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    width: '100%',
    height: 290,
    borderRadius: 22,
    shadowColor: '#FF3347',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  card: {
    width: '100%',
    height: 290,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.14)',
    backgroundColor: '#17233A',
  },
  cardLight: {
    borderColor: '#DCE6F3',
    backgroundColor: '#FFFFFF',
  },
  cardGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 108,
    opacity: 1,
  },
  topRow: {
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  badge: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.14)',
    shadowColor: '#FF2C45',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  badgeLight: {
    borderColor: 'rgba(15,23,42,0.08)',
    shadowOpacity: 0,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  badgeTextLight: {
    color: '#B91C1C',
  },
  leftColumn: {
    zIndex: 3,
    width: '100%',
  },
  headline: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: 0,
  },
  headlineLight: {
    color: '#0F172A',
  },
  subheading: {
    marginTop: 7,
    color: '#C5CAD3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  subheadingLight: {
    color: '#475569',
  },
  metaRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  metaText: {
    color: '#C5CAD3',
    fontSize: 11,
    fontWeight: '500',
  },
  metaTextLight: {
    color: '#64748B',
  },
  metaSourceText: {
    maxWidth: 78,
  },
  metaTimeText: {
    maxWidth: 48,
  },
  metaDivider: {
    width: 1,
    height: 14,
    marginHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  metaDividerLight: {
    backgroundColor: 'rgba(15,23,42,0.14)',
  },
  contextRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 70,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  contextChip: {
    minHeight: 25,
    maxWidth: 142,
    paddingHorizontal: 9,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(5,11,20,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(190,200,220,0.24)',
  },
  contextChipLight: {
    backgroundColor: 'rgba(241,245,249,0.9)',
    borderColor: 'rgba(15,23,42,0.1)',
  },
  contextText: {
    color: '#DDE7F6',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  contextTextLight: {
    color: '#334155',
  },
  impactDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  divider: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 64,
    zIndex: 2,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dividerLight: {
    backgroundColor: 'rgba(15,23,42,0.1)',
  },
  bottomRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
    zIndex: 3,
  },
  symbolBlock: {
    paddingRight: 0,
  },
  symbolLabel: {
    marginBottom: 6,
    color: '#AEB6C4',
    fontSize: 12,
    fontWeight: '500',
  },
  symbolLabelLight: {
    color: '#64748B',
  },
  symbolScroller: {
    marginRight: -16,
  },
  symbolRail: {
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  symbolChip: {
    height: 24,
    minWidth: 48,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(5,11,20,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(190,200,220,0.42)',
  },
  symbolChipLight: {
    backgroundColor: 'rgba(241,245,249,0.92)',
    borderColor: 'rgba(15,23,42,0.1)',
  },
  symbolText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  symbolTextLight: {
    color: '#334155',
  },
  symbolOverflowChip: {
    backgroundColor: 'rgba(56,189,248,0.16)',
    borderColor: 'rgba(125,211,252,0.5)',
  },
  symbolOverflowChipLight: {
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderColor: 'rgba(37,99,235,0.32)',
  },
  symbolOverflowText: {
    color: '#7DD3FC',
  },
  symbolOverflowTextLight: {
    color: '#1D4ED8',
  },
  allSymbolsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  allSymbolsOverlayLight: {
    backgroundColor: 'rgba(15,23,42,0.34)',
  },
  allSymbolsSheet: {
    marginHorizontal: 16,
    marginBottom: 24,
    maxHeight: '70%',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    borderRadius: 24,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.36,
    shadowRadius: 26,
    elevation: 10,
  },
  allSymbolsSheetLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15,23,42,0.1)',
    shadowOpacity: 0.12,
  },
  allSymbolsHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
    backgroundColor: 'rgba(148,163,184,0.34)',
  },
  allSymbolsHandleLight: {
    backgroundColor: 'rgba(100,116,139,0.24)',
  },
  allSymbolsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.16)',
  },
  allSymbolsHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  allSymbolsTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  allSymbolsTitleLight: {
    color: '#0F172A',
  },
  allSymbolsSubtitle: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  allSymbolsSubtitleLight: {
    color: '#64748B',
  },
  allSymbolsCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  allSymbolsCloseButtonLight: {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.1)',
  },
  allSymbolsGrid: {
    paddingTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  allSymbolsChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  allSymbolsChipLight: {
    backgroundColor: 'rgba(241,245,249,0.92)',
    borderColor: 'rgba(15,23,42,0.1)',
  },
  allSymbolsChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  allSymbolsChipTextLight: {
    color: '#0F172A',
  },
  readMoreChip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.12)',
  },
  readMoreChipLight: {
    backgroundColor: 'rgba(37,99,235,0.06)',
    borderColor: 'rgba(15,23,42,0.08)',
  },
  readMoreText: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '600',
  },
  readMoreTextLight: {
    color: '#2563EB',
  },
  skeletonBlock: {
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.16)',
  },
  skeletonBlockLight: {
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  skeletonBadge: {
    width: 170,
    height: 38,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(148,163,184,0.16)',
  },
  stateCard: {
    minHeight: 180,
    justifyContent: 'center',
  },
  stateTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stateTitleLight: {
    color: '#0F172A',
  },
  stateText: {
    marginTop: 6,
    color: '#C5CAD3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  stateTextLight: {
    color: '#64748B',
  },
  retryButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,91,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.45)',
  },
  retryButtonLight: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderColor: 'rgba(37,99,235,0.2)',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  retryTextLight: {
    color: '#2563EB',
  },
});
