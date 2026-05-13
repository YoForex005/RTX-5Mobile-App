/**
 * Settings Feature UI: NewsScreen
 *
 * Dynamic, API-ready market intelligence screen for breaking news,
 * AI summaries, economic events, latest updates, and watchlist news.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import { BreakingNewsCard, type BreakingNewsCardData } from './BreakingNewsCard';
import { getNewsThemeColors, makeNewsScreenStyles, type NewsScreenStyles, type NewsThemeColors } from './NewsScreen.styles';
import {
  applyMarketNewsSelection,
  buildMarketNewsPreviewData,
  filterLatestNews,
  type AiMarketBrief,
  type EconomicCalendarEvent,
  type ImpactFilter,
  type LatestNewsItem,
  type MarketNewsScreenData,
  type NewsCategory,
  type NewsImpactLevel,
  type NewsScreenStatus,
  type WatchlistNewsItem,
} from './newsViewModel';

export function NewsScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const watchlistSymbols = useUserPreferences((s) => s.quoteSymbols);
  const styles = useMemo(() => makeNewsScreenStyles(T, isDark), [T, isDark]);
  const newsColors = useMemo(() => getNewsThemeColors(isDark), [isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const [status] = useState<NewsScreenStatus>('ready');
  const [selectedCategory, setSelectedCategory] = useState('category-all');
  const [selectedImpactFilter, setSelectedImpactFilter] = useState('filter-high-impact');
  const [visibleCount, setVisibleCount] = useState(8);

  const previewData = useMemo(() => buildMarketNewsPreviewData(watchlistSymbols), [watchlistSymbols]);
  const data = useMemo(
    () => applyMarketNewsSelection(previewData, selectedCategory, selectedImpactFilter, watchlistSymbols),
    [previewData, selectedCategory, selectedImpactFilter, watchlistSymbols],
  );
  const latestNews = useMemo(
    () => filterLatestNews(data.latestNews, data.categories, data.impactFilters).slice(0, visibleCount),
    [data.latestNews, data.categories, data.impactFilters, visibleCount],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const renderNewsCard = useCallback(
    ({ item }: ListRenderItemInfo<LatestNewsItem>) => (
      <NewsCard item={item} T={T} colors={newsColors} styles={styles} />
    ),
    [T, newsColors, styles],
  );

  if (status === 'error') {
    return (
      <MarketNewsShell styles={styles} colors={newsColors}>
        <ErrorState styles={styles} onRetry={onRefresh} />
      </MarketNewsShell>
    );
  }

  return (
    <Screen noBottomInset style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={newsColors.screenGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />

      <FlatList
        style={styles.list}
        data={status === 'loading' ? [] : latestNews}
        keyExtractor={(item) => item.newsId}
        renderItem={renderNewsCard}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 },
        ]}
        ListHeaderComponent={
          <MarketNewsHeaderContent
            T={T}
            status={status}
            data={data}
            latestNewsCount={latestNews.length}
            selectedCategory={selectedCategory}
            selectedImpactFilter={selectedImpactFilter}
            setSelectedCategory={setSelectedCategory}
            setSelectedImpactFilter={setSelectedImpactFilter}
            styles={styles}
            colors={newsColors}
          />
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <NewsSkeletonLoader styles={styles} />
          ) : (
            <EmptyState
              title="No news found for this filter."
              subtitle="Try changing category or impact level."
              styles={styles}
            />
          )
        }
        ListFooterComponent={
          <MarketNewsFooterContent
            data={data}
            status={status}
            colors={newsColors}
            styles={styles}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={newsColors.sub}
            colors={[newsColors.cyan]}
            progressBackgroundColor={newsColors.refreshBg}
          />
        }
        onEndReached={() => setVisibleCount((count) => Math.min(count + 8, data.latestNews.length))}
        onEndReachedThreshold={0.45}
      />

    </Screen>
  );
}

function MarketNewsHeaderContent({
  T,
  status,
  data,
  latestNewsCount,
  selectedCategory,
  selectedImpactFilter,
  setSelectedCategory,
  setSelectedImpactFilter,
  styles,
  colors,
}: {
  T: ThemeColors;
  status: NewsScreenStatus;
  data: MarketNewsScreenData;
  latestNewsCount: number;
  selectedCategory: string;
  selectedImpactFilter: string;
  setSelectedCategory: (value: string) => void;
  setSelectedImpactFilter: (value: string) => void;
  styles: NewsScreenStyles;
  colors: NewsThemeColors;
}) {
  return (
    <View>
      <NewsHeader colors={colors} styles={styles} />

      {status === 'offline' ? <OfflineState colors={colors} styles={styles} /> : null}

      {status === 'loading' ? (
        <NewsSkeletonLoader styles={styles} compact />
      ) : data.breakingNews ? (
        <BreakingNewsCard breakingNews={toBreakingNewsCardData(data.breakingNews)} />
      ) : (
        <EmptyState
          title="No market news available right now."
          subtitle="Check back later or adjust your filters."
          styles={styles}
        />
      )}

      {data.aiMarketBrief ? (
        <AiMarketBriefCard brief={data.aiMarketBrief} colors={colors} styles={styles} />
      ) : null}

      <CategoryTabs
        categories={data.categories}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
        styles={styles}
      />

      <ImpactFilterChips
        filters={data.impactFilters}
        selectedFilter={selectedImpactFilter}
        onSelect={setSelectedImpactFilter}
        styles={styles}
      />

      <EconomicCalendarPreview events={data.economicEvents} T={T} colors={colors} styles={styles} />

      <WatchlistNewsSection items={data.watchlistNews} T={T} colors={colors} styles={styles} />

      <LatestNewsFeed count={latestNewsCount} styles={styles} />
    </View>
  );
}

function MarketNewsFooterContent({
  data,
  status,
  styles,
  colors,
}: {
  data: MarketNewsScreenData;
  status: NewsScreenStatus;
  styles: NewsScreenStyles;
  colors: NewsThemeColors;
}) {
  if (status === 'loading') return null;

  return (
    <View>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
        <Text style={styles.disclaimerText}>
          News is for information only. Always verify market conditions before trading.
        </Text>
      </View>
    </View>
  );
}

function NewsHeader({
  colors,
  styles,
}: {
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Market News</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          Real-time updates and market-moving events
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable style={styles.headerIconButton} hitSlop={8}>
          <Ionicons name="search" size={21} color={colors.sub} />
        </Pressable>
        <Pressable style={styles.headerIconButton} hitSlop={8}>
          <Ionicons name="filter" size={20} color={colors.sub} />
        </Pressable>
      </View>
    </View>
  );
}

function toBreakingNewsCardData(item: NonNullable<MarketNewsScreenData['breakingNews']>): BreakingNewsCardData {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    source: item.source,
    published_at: item.publishedAt,
    relative_time: item.relativeTime ?? item.publishedAt,
    affected_symbols: item.affectedSymbols,
    is_saved: item.isSaved,
    read_url: item.readUrl ?? '',
  };
}

function AiMarketBriefCard({
  brief,
  colors,
  styles,
}: {
  brief: AiMarketBrief;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <LinearGradient
      colors={colors.aiGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.aiCard}
    >
      <View style={styles.aiAccentLine} />
      <View style={styles.aiHeader}>
        <View style={styles.aiTitleBlock}>
          <View style={styles.aiIcon}>
            <Ionicons name="analytics-outline" size={16} color={colors.cyan} />
          </View>
          <View style={styles.aiTitleCopy}>
            <Text style={styles.aiKicker}>Market Intelligence</Text>
            <Text style={styles.aiTitle}>AI Market Brief</Text>
          </View>
        </View>
        <View style={styles.aiUpdatedPill}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.aiUpdatedText} numberOfLines={1}>{brief.updatedAt}</Text>
        </View>
      </View>

      <View style={styles.aiSummaryBlock}>
        <View style={styles.aiSummaryAccent} />
        <Text style={styles.aiSummary} numberOfLines={3}>{brief.summary}</Text>
      </View>

      <View style={styles.aiFooter}>
        <AiMarketChips markets={brief.affectedMarkets} styles={styles} />
        <View style={styles.aiSignalRail}>
          {brief.sentimentLabel ? (
            <View style={styles.aiSignalChip}>
              <Ionicons name="pulse-outline" size={12} color={colors.cyan} />
              <Text style={styles.aiSignalText}>{brief.sentimentLabel}</Text>
            </View>
          ) : null}
          {brief.confidenceLabel ? (
            <View style={styles.aiSignalChip}>
              <Ionicons name="shield-checkmark-outline" size={12} color={colors.gold} />
              <Text style={styles.aiSignalText}>{brief.confidenceLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );
}

function AiMarketChips({
  markets,
  styles,
}: {
  markets: string[];
  styles: NewsScreenStyles;
}) {
  if (markets.length === 0) return null;

  const visibleMarkets = markets.slice(0, 3);
  const overflowCount = Math.max(0, markets.length - visibleMarkets.length);

  return (
    <View style={styles.aiMarketRail}>
      {visibleMarkets.map((market) => (
        <View key={market} style={styles.aiMarketChip}>
          <Text style={styles.aiMarketText} numberOfLines={1}>{market}</Text>
        </View>
      ))}
      {overflowCount > 0 ? (
        <View style={styles.aiMarketChip}>
          <Text style={styles.aiMarketText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CategoryTabs({
  categories,
  selectedCategory,
  onSelect,
  styles,
}: {
  categories: NewsCategory[];
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
  styles: NewsScreenStyles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRail}>
      {categories.map((category) => {
        const selected = category.categoryId === selectedCategory || category.isSelected;

        return (
          <Pressable key={category.categoryId} onPress={() => onSelect(category.categoryId)} hitSlop={6}>
            {selected ? (
              <LinearGradient
                colors={['#38BDF8', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.tabChip, styles.tabChipActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>{category.categoryName}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.tabChip}>
                <Text style={styles.tabText}>{category.categoryName}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ImpactFilterChips({
  filters,
  selectedFilter,
  onSelect,
  styles,
}: {
  filters: ImpactFilter[];
  selectedFilter: string;
  onSelect: (filterId: string) => void;
  styles: NewsScreenStyles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRail}>
      {filters.map((filter) => {
        const selected = filter.filterId === selectedFilter || filter.isSelected;

        return (
          <Pressable
            key={filter.filterId}
            style={[styles.filterChip, selected && styles.filterChipActive]}
            onPress={() => onSelect(filter.filterId)}
            hitSlop={6}
          >
            <Text style={styles.filterText}>{filter.filterName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function EconomicCalendarPreview({
  events,
  T,
  colors,
  styles,
}: {
  events: EconomicCalendarEvent[];
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <View>
      <SectionHeader title="Upcoming Economic Events" styles={styles} />
      {events.length > 0 ? (
        <View style={styles.calendarCard}>
          {events.map((event, index) => (
            <EconomicEventRow
              key={event.eventId}
              event={event}
              T={T}
              colors={colors}
              styles={styles}
              showDivider={index > 0}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title="No upcoming economic events."
          subtitle="Calendar events will appear when provider data is available."
          styles={styles}
        />
      )}
    </View>
  );
}

function EconomicEventRow({
  event,
  T,
  colors,
  styles,
  showDivider,
}: {
  event: EconomicCalendarEvent;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  showDivider: boolean;
}) {
  return (
    <View style={[styles.eventRow, showDivider && styles.eventDivider]}>
      <View style={styles.currencyBadge}>
        <Text style={styles.currencyText}>{event.currency}</Text>
      </View>

      <View style={styles.eventBody}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.eventName}</Text>
        <View style={styles.eventMetaRow}>
          <Text style={styles.metaText}>{event.eventTime}</Text>
          {event.countdown ? (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{event.countdown}</Text>
            </>
          ) : null}
          {event.isLive ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.eventRightRail}>
        <ImpactBadge impact={event.impactLevel} T={T} styles={styles} compact hideDot />
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </View>
  );
}

function LatestNewsFeed({
  count,
  styles,
}: {
  count: number;
  styles: NewsScreenStyles;
}) {
  return <SectionHeader title="Latest Market News" action={count > 0 ? `${count} shown` : undefined} styles={styles} />;
}

function NewsCard({
  item,
  T,
  colors,
  styles,
}: {
  item: LatestNewsItem;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <LinearGradient
      colors={colors.breakingGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.newsCard}
    >
      <View style={styles.newsCardTop}>
        <View style={styles.newsSourceRow}>
          <Text style={styles.newsSourceText} numberOfLines={1}>{item.source}</Text>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>{item.category}</Text>
          </View>
        </View>
        <View style={styles.newsMetaActions}>
          <Text style={styles.metaText} numberOfLines={1}>{item.publishedAt}</Text>
          <Pressable style={styles.iconActionButton} hitSlop={8}>
            <Ionicons name={item.isSaved ? 'bookmark' : 'bookmark-outline'} size={15} color={colors.sub} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>

      <View style={styles.newsFooter}>
        <View style={styles.newsFooterInfo}>
          <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact hideDot />
          <SymbolRail symbols={item.affectedSymbols} styles={styles} maxVisible={2} />
        </View>
        <View style={styles.newsActions}>
          <Pressable style={styles.readIndicator} hitSlop={8}>
            <Text style={styles.readIndicatorText}>Read</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.cyan} />
          </Pressable>
          <Pressable style={styles.shareButton} hitSlop={8}>
            <Ionicons name="share-social-outline" size={14} color={colors.sub} />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

function WatchlistNewsSection({
  items,
  T,
  colors,
  styles,
}: {
  items: WatchlistNewsItem[];
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (items.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Watchlist News" action={`${items.length} matched`} styles={styles} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.watchlistRail}>
        {items.map((item) => (
          <WatchlistNewsCard
            key={`${item.userSymbol}-${item.publishedAt}`}
            item={item}
            T={T}
            colors={colors}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function WatchlistNewsCard({
  item,
  T,
  colors,
  styles,
}: {
  item: WatchlistNewsItem;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <LinearGradient
      colors={colors.watchlistGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.watchlistCard}
    >
      <View style={styles.watchlistAccent} />
      <View style={styles.watchlistTopRow}>
        <View style={styles.watchlistIdentity}>
          <View style={styles.watchlistSymbolPill}>
            <Text style={styles.watchlistSymbolText} numberOfLines={1}>{item.userSymbol}</Text>
          </View>
        </View>
        <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact hideDot />
      </View>
      <Text style={styles.watchlistTitle} numberOfLines={2}>{item.relatedNews}</Text>
      <View style={styles.watchlistBottomRow}>
        <View style={styles.watchlistTimeRow}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={styles.watchlistTimeText} numberOfLines={1}>{item.publishedAt}</Text>
        </View>
        <View style={styles.watchlistReadAction}>
          <Text style={styles.watchlistActionText}>Open</Text>
          <Ionicons name="arrow-forward" size={13} color={colors.cyan} />
        </View>
      </View>
    </LinearGradient>
  );
}

function NewsSkeletonLoader({
  styles,
  compact = false,
}: {
  styles: NewsScreenStyles;
  compact?: boolean;
}) {
  const cards = compact ? 1 : 4;

  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: cards }).map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={[styles.skeletonLine, { width: '42%' }]} />
          <View style={[styles.skeletonLine, { width: '86%' }]} />
          <View style={[styles.skeletonLine, { width: '64%' }]} />
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  title,
  subtitle,
  styles,
}: {
  title: string;
  subtitle: string;
  styles: NewsScreenStyles;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{subtitle}</Text>
    </View>
  );
}

function ErrorState({
  styles,
  onRetry,
}: {
  styles: NewsScreenStyles;
  onRetry: () => void;
}) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Unable to load market news.</Text>
        <Text style={styles.emptyText}>Check your connection or try again.</Text>
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OfflineState({ colors, styles }: { colors: NewsThemeColors; styles: NewsScreenStyles }) {
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.gold} />
      <Text style={styles.offlineText}>You are offline. Showing last updated news.</Text>
    </View>
  );
}

function MarketNewsShell({
  children,
  styles,
  colors,
}: {
  children: ReactNode;
  styles: NewsScreenStyles;
  colors: NewsThemeColors;
}) {
  return (
    <Screen noBottomInset style={styles.screen}>
      <LinearGradient
        colors={colors.screenGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />
      {children}
    </Screen>
  );
}

function SectionHeader({
  title,
  action,
  colors,
  styles,
}: {
  title: string;
  action?: string;
  colors?: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <View style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors?.sub ?? '#94A3B8'} />
        </View>
      ) : null}
    </View>
  );
}

function ImpactBadge({
  impact,
  T,
  styles,
  compact = false,
  hideDot = false,
}: {
  impact: NewsImpactLevel;
  T: ThemeColors;
  styles: NewsScreenStyles;
  compact?: boolean;
  hideDot?: boolean;
}) {
  const color = getImpactColor(impact, T);

  return (
    <View
      style={[
        styles.impactBadge,
        {
          borderColor: getImpactBorder(impact, T),
          backgroundColor: getImpactTint(impact, T),
          alignSelf: 'flex-start',
          minHeight: compact ? 24 : 27,
        },
      ]}
    >
      {hideDot ? null : <View style={[styles.impactDot, { backgroundColor: color }]} />}
      <Text style={[styles.impactBadgeText, { color }]}>{impact} Impact</Text>
    </View>
  );
}

function SymbolRail({
  symbols,
  styles,
  maxVisible = 4,
}: {
  symbols: string[];
  styles: NewsScreenStyles;
  maxVisible?: number;
}) {
  if (symbols.length === 0) return null;

  const visibleSymbols = symbols.slice(0, maxVisible);
  const remainingCount = Math.max(0, symbols.length - visibleSymbols.length);

  return (
    <View style={styles.symbolRail}>
      {visibleSymbols.map((symbol) => (
        <View key={symbol} style={styles.symbolChip}>
          <Text style={styles.symbolChipText}>{symbol}</Text>
        </View>
      ))}
      {remainingCount > 0 ? (
        <View style={styles.symbolChip}>
          <Text style={styles.symbolChipText}>+{remainingCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function getImpactColor(impact: NewsImpactLevel, T: ThemeColors): string {
  if (impact === 'High') return T.down;
  if (impact === 'Medium') return '#F5B642';
  if (impact === 'Low') return '#38BDF8';
  return T.textSub;
}

function getImpactTint(impact: NewsImpactLevel, T: ThemeColors): string {
  if (impact === 'High') return T.downGlow;
  if (impact === 'Medium') return 'rgba(245,182,66,0.14)';
  if (impact === 'Low') return 'rgba(56,189,248,0.12)';
  return 'rgba(148,163,184,0.12)';
}

function getImpactBorder(impact: NewsImpactLevel, T: ThemeColors): string {
  if (impact === 'High') return T.down;
  if (impact === 'Medium') return 'rgba(245,182,66,0.38)';
  if (impact === 'Low') return 'rgba(56,189,248,0.34)';
  return 'rgba(148,163,184,0.24)';
}
