import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: NewsScreen
 *
 * Dynamic, API-ready market intelligence screen for breaking news,
 * AI summaries, economic events, latest updates, and watchlist news.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Keyboard, Modal, RefreshControl, ScrollView, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useMarketSymbols } from '../../query/market';
import { useUIState } from '../../state/uiState';
import { useUserPreferences } from '../../state/userPreferences';
import { runImmediateAction } from '../../utils/actionLatency';
import { resolveQuoteFeedSymbols } from '../quotes/quoteWatchlistDefaults';
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

const NEWS_SECONDARY_CONTENT_DELAY_MS = 320;

export function NewsScreen() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const watchlistSymbols = useUserPreferences((s) => s.quoteSymbols);
  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const savedNewsIds = useUserPreferences((s) => s.marketNewsSavedIds);
  const toggleSavedNews = useUserPreferences((s) => s.toggleMarketNewsSavedId);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  const actionSheet = useUIState((s) => s.actionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const isScreenFocused = useIsFocused();
  const { data: marketSymbols = [] } = useMarketSymbols(isScreenFocused);
  const styles = useMemo(() => makeNewsScreenStyles(T, isDark), [T, isDark]);
  const newsColors = useMemo(() => getNewsThemeColors(isDark), [isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const [status] = useState<NewsScreenStatus>('ready');
  const [selectedImpactFilter, setSelectedImpactFilter] = useState('filter-all');
  const [visibleCount, setVisibleCount] = useState(8);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEconomicEvent, setSelectedEconomicEvent] = useState<EconomicCalendarEvent | null>(null);
  const [selectedLatestNews, setSelectedLatestNews] = useState<LatestNewsItem | null>(null);
  const [selectedAiBrief, setSelectedAiBrief] = useState<AiMarketBrief | null>(null);
  const [selectedWatchlistNews, setSelectedWatchlistNews] = useState<WatchlistNewsItem | null>(null);
  const secondaryContentReady = useDeferredRouteContentReady(NEWS_SECONDARY_CONTENT_DELAY_MS);

  const previewData = useMemo(() => buildMarketNewsPreviewData(watchlistSymbols), [watchlistSymbols]);
  const data = useMemo(() => {
    const selectedData = applyMarketNewsSelection(previewData, 'category-all', selectedImpactFilter, watchlistSymbols);
    return applySavedNewsState(selectedData, savedNewsIds);
  }, [previewData, selectedImpactFilter, savedNewsIds, watchlistSymbols]);
  const latestNews = useMemo(() => {
    const filteredNews = filterLatestNews(data.latestNews, data.categories, data.impactFilters);
    return filterNewsByQuery(filteredNews, searchQuery).slice(0, visibleCount);
  }, [data.latestNews, data.categories, data.impactFilters, searchQuery, visibleCount]);
  const selectedLatestNewsItem = useMemo(
    () => (selectedLatestNews ? data.latestNews.find((item) => item.newsId === selectedLatestNews.newsId) ?? selectedLatestNews : null),
    [data.latestNews, selectedLatestNews],
  );
  const renderedLatestNews = useMemo(
    () => (secondaryContentReady ? latestNews : latestNews.slice(0, 3)),
    [latestNews, secondaryContentReady],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const goBack = useCallback(() => {
    router.replace('/(tabs)/settings');
  }, []);

  const openBreakingSymbolChart = useCallback((symbol: string) => {
    const [resolvedSymbol] = resolveQuoteFeedSymbols([symbol], marketSymbols);
    setChartSymbol(resolvedSymbol ?? symbol);
    router.push('/(tabs)/chart');
  }, [marketSymbols, setChartSymbol]);

  const openFilterMenu = useCallback(() => {
    const iconColor = newsColors.sub;
    const selectedIconColor = newsColors.cyan;
    const makeFilterAction = (filterId: string, label: string, iconName: ComponentProps<typeof Ionicons>['name']) => {
      const selected = selectedImpactFilter === filterId;

      return {
        label,
        icon: (
          <Ionicons
            name={selected ? 'checkmark-circle' : iconName}
            size={20}
            color={selected ? selectedIconColor : iconColor}
          />
        ),
        onPress: () => setSelectedImpactFilter(filterId),
      };
    };

    runImmediateAction('news.filterSheet.open', () =>
      showActionSheet({
        title: 'Filter news',
        actions: [
          makeFilterAction('filter-all', 'All news', 'newspaper-outline'),
          makeFilterAction('filter-high-impact', 'High impact', 'alert-circle-outline'),
          makeFilterAction('filter-watchlist', 'Watchlist', 'list-outline'),
          makeFilterAction('filter-saved', 'Bookmarks', 'bookmark-outline'),
        ],
        detent: 'adaptive',
        instantOpen: true,
      }),
    );
  }, [newsColors.cyan, newsColors.sub, selectedImpactFilter, showActionSheet]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchOpen(false);
  }, []);

  const closeEconomicEvent = useCallback(() => {
    setSelectedEconomicEvent(null);
  }, []);

  const closeLatestNews = useCallback(() => {
    setSelectedLatestNews(null);
  }, []);

  const closeAiBrief = useCallback(() => {
    setSelectedAiBrief(null);
  }, []);

  const closeWatchlistNews = useCallback(() => {
    setSelectedWatchlistNews(null);
  }, []);

  const dismissSearchFromContent = useCallback(() => {
    if (!searchOpen) return;
    closeSearch();
  }, [closeSearch, searchOpen]);

  const renderNewsCard = useCallback(
    ({ item }: ListRenderItemInfo<LatestNewsItem>) => (
      <NewsCard
        item={item}
        T={T}
        colors={newsColors}
        styles={styles}
        onOpenNews={setSelectedLatestNews}
        onToggleSaved={toggleSavedNews}
      />
    ),
    [T, newsColors, styles, toggleSavedNews],
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
        pointerEvents="none"
        style={styles.background}
      />

      <View style={[styles.fixedHeader, { paddingTop: insets.top + 18 }]}>
        <LinearGradient
          colors={newsColors.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={styles.headerGlassLayer}
        />
        {searchOpen ? (
          <NewsSearchHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={closeSearch}
            colors={newsColors}
            styles={styles}
          />
        ) : (
          <NewsHeader
            onBack={goBack}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenFilters={openFilterMenu}
            colors={newsColors}
            styles={styles}
          />
        )}
      </View>

      <FlatList
        style={styles.list}
        data={status === 'loading' ? [] : renderedLatestNews}
        keyExtractor={(item) => item.newsId}
        renderItem={renderNewsCard}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={80}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        onScrollBeginDrag={dismissSearchFromContent}
        onTouchStart={dismissSearchFromContent}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: 16, paddingBottom: insets.bottom + 28 },
        ]}
        ListHeaderComponent={
          <MarketNewsHeaderContent
            T={T}
            status={status}
            data={data}
            latestNewsCount={latestNews.length}
            onOpenBreakingSymbolChart={openBreakingSymbolChart}
            onOpenAiBrief={setSelectedAiBrief}
            onOpenEconomicEvent={setSelectedEconomicEvent}
            onOpenWatchlistNews={setSelectedWatchlistNews}
            styles={styles}
            colors={newsColors}
            isDark={isDark}
            secondaryContentReady={secondaryContentReady}
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
          secondaryContentReady ? (
          <MarketNewsFooterContent
            data={data}
            status={status}
            colors={newsColors}
            styles={styles}
          />
          ) : null
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

      {selectedEconomicEvent ? <EconomicEventDetailModal
        event={selectedEconomicEvent}
        visible={Boolean(selectedEconomicEvent)}
        onClose={closeEconomicEvent}
        T={T}
        colors={newsColors}
        styles={styles}
      /> : null}
      {selectedLatestNewsItem ? <LatestNewsDetailModal
        item={selectedLatestNewsItem}
        visible={Boolean(selectedLatestNewsItem)}
        onClose={closeLatestNews}
        T={T}
        colors={newsColors}
        styles={styles}
      /> : null}
      {selectedAiBrief ? <AiMarketBriefDetailModal
        brief={selectedAiBrief}
        visible={Boolean(selectedAiBrief)}
        onClose={closeAiBrief}
        colors={newsColors}
        styles={styles}
      /> : null}
      {selectedWatchlistNews ? <WatchlistNewsDetailModal
        item={selectedWatchlistNews}
        visible={Boolean(selectedWatchlistNews)}
        onClose={closeWatchlistNews}
        T={T}
        colors={newsColors}
        styles={styles}
      /> : null}

      {actionSheet !== null ? <ActionSheet
        visible={actionSheet !== null}
        title={actionSheet?.title}
        actions={actionSheet?.actions ?? []}
        onClose={hideActionSheet}
        searchable={actionSheet?.searchable}
        detent={actionSheet?.detent}
        minimumTopInset={actionSheet?.minimumTopInset}
        instantOpen={actionSheet?.instantOpen}
        runActionAfterClose={actionSheet?.runActionAfterClose}
      /> : null}
    </Screen>
  );
}

function MarketNewsHeaderContent({
  T,
  status,
  data,
  latestNewsCount,
  onOpenBreakingSymbolChart,
  onOpenAiBrief,
  onOpenEconomicEvent,
  onOpenWatchlistNews,
  styles,
  colors,
  isDark,
  secondaryContentReady,
}: {
  T: ThemeColors;
  status: NewsScreenStatus;
  data: MarketNewsScreenData;
  latestNewsCount: number;
  onOpenBreakingSymbolChart: (symbol: string) => void;
  onOpenAiBrief: (brief: AiMarketBrief) => void;
  onOpenEconomicEvent: (event: EconomicCalendarEvent) => void;
  onOpenWatchlistNews: (item: WatchlistNewsItem) => void;
  styles: NewsScreenStyles;
  colors: NewsThemeColors;
  isDark: boolean;
  secondaryContentReady: boolean;
}) {
  return (
    <View>
      {status === 'offline' ? <OfflineState colors={colors} styles={styles} /> : null}
      <FreshnessRow updatedAt={data.lastUpdatedAt} colors={colors} styles={styles} />

      {status === 'loading' ? (
        <NewsSkeletonLoader styles={styles} compact />
      ) : data.breakingNews ? (
        <BreakingNewsCard
          breakingNews={toBreakingNewsCardData(data.breakingNews)}
          isDark={isDark}
          onSymbolPress={onOpenBreakingSymbolChart}
        />
      ) : (
        <EmptyState
          title="No market news available right now."
          subtitle="Check back later or adjust your filters."
          styles={styles}
        />
      )}

      {secondaryContentReady && data.aiMarketBrief ? (
        <AiMarketBriefCard
          brief={data.aiMarketBrief}
          colors={colors}
          styles={styles}
          onOpenDetails={onOpenAiBrief}
        />
      ) : null}

      {secondaryContentReady ? <EconomicCalendarPreview
        events={data.economicEvents}
        colors={colors}
        styles={styles}
        onOpenEvent={onOpenEconomicEvent}
      /> : null}

      {secondaryContentReady ? <WatchlistNewsSection
        items={data.watchlistNews}
        T={T}
        colors={colors}
        styles={styles}
        onOpenItem={onOpenWatchlistNews}
      /> : null}

      <LatestNewsFeed count={latestNewsCount} filterLabel={getSelectedFilterLabel(data.impactFilters)} styles={styles} />
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
      <LinearGradient
        colors={colors.panelGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.disclaimer}
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
        <Text style={styles.disclaimerText}>
          News is for information only. Always verify market conditions before trading.
        </Text>
      </LinearGradient>
    </View>
  );
}

function NewsHeader({
  onBack,
  onOpenSearch,
  onOpenFilters,
  colors,
  styles,
}: {
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenFilters: () => void;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <Pressable style={styles.headerIconButton} onPress={onBack} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.sub} />
        </Pressable>
      </View>

      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Market News</Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable
          style={styles.headerIconButton}
          onPress={onOpenSearch}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          accessibilityLabel="Search market news"
          unstable_pressDelay={0}
        >
          <Ionicons name="search" size={21} color={colors.sub} />
        </Pressable>
        <Pressable
          style={styles.headerIconButton}
          onPress={onOpenFilters}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          accessibilityLabel="Open news filters"
          unstable_pressDelay={0}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.sub} />
        </Pressable>
      </View>
    </View>
  );
}

function NewsSearchHeader({
  searchQuery,
  onSearchChange,
  onClose,
  colors,
  styles,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  return (
    <View style={styles.searchHeader}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder="Search market news, symbols, sources..."
        placeholderTextColor={colors.muted}
        selectionColor={colors.cyan}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
        accessibilityLabel="Search market news"
      />
      <Pressable style={styles.searchCloseButton} onPress={onClose} hitSlop={8} accessibilityLabel="Close search">
        <Ionicons name="close" size={18} color={colors.sub} />
      </Pressable>
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
    impact_level: item.impactLevel,
    category: item.category,
    sentiment: item.sentiment,
    affected_symbols: item.affectedSymbols,
  };
}

function applySavedNewsState(data: MarketNewsScreenData, savedNewsIds: readonly string[]): MarketNewsScreenData {
  const savedIds = new Set(savedNewsIds);

  return {
    ...data,
    latestNews: data.latestNews.map((item) => ({
      ...item,
      isSaved: savedIds.has(item.newsId),
    })),
    uiState: {
      ...data.uiState,
      savedNewsIds: [...savedIds],
    },
  };
}

function filterNewsByQuery(news: LatestNewsItem[], query: string): LatestNewsItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return news;

  return news.filter((item) => {
    const searchableText = [
      item.title,
      item.summary,
      item.source,
      item.category,
      item.impactLevel,
      item.affectedSymbols.join(' '),
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

function getSelectedFilterLabel(filters: ImpactFilter[]): string {
  const selectedFilter = filters.find((filter) => filter.isSelected);
  if (!selectedFilter) return 'All';
  if (selectedFilter.filterName === 'Saved') return 'Bookmarks';
  if (selectedFilter.filterName === 'High Impact') return 'High impact';
  return selectedFilter.filterName;
}

function AiMarketBriefCard({
  brief,
  colors,
  styles,
  onOpenDetails,
}: {
  brief: AiMarketBrief;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  onOpenDetails: (brief: AiMarketBrief) => void;
}) {
  const currentRead = brief.currentRead ?? brief.summary;

  return (
    <LinearGradient
      colors={colors.aiGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.aiCard}
    >
      <LinearGradient
        colors={colors.aiGlassHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        pointerEvents="none"
        style={styles.aiGlassHighlight}
      />

      <View style={styles.aiHeader}>
        <View style={styles.aiTitleBlock}>
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles-outline" size={16} color={colors.cyan} />
          </View>
          <View style={styles.aiTitleCopy}>
            <Text style={styles.aiTitle}>AI Market Brief</Text>
          </View>
        </View>
        <View style={styles.aiUpdatedPill}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.aiUpdatedText} numberOfLines={1}>{brief.updatedAt}</Text>
        </View>
      </View>

      <View style={styles.aiSummaryBlock}>
        <View style={styles.aiSummaryCopy}>
          <Text style={styles.aiSummaryLabel}>Current read</Text>
          <Text style={styles.aiSummary} numberOfLines={2}>{currentRead}</Text>
        </View>
      </View>

      <View style={styles.aiCompactFooter}>
        <View style={styles.aiCompactMeta}>
          <Ionicons name="shield-checkmark-outline" size={12} color={colors.muted} />
          <Text style={styles.aiCompactMetaText}>Market brief</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open AI market brief details"
          hitSlop={8}
          style={styles.aiDetailsButton}
          onPress={() => onOpenDetails(brief)}
        >
          <Text style={styles.aiDetailsButtonText}>Details</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.cyan} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function AiMarketBriefDetailModal({
  brief,
  visible,
  onClose,
  colors,
  styles,
}: {
  brief: AiMarketBrief | null;
  visible: boolean;
  onClose: () => void;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (!brief) return null;

  const confidenceValue = brief.confidenceLabel?.replace(/^confidence\s*/i, '');
  const visibleMarkets = brief.affectedMarkets.slice(0, 6);
  const remainingMarkets = Math.max(0, brief.affectedMarkets.length - visibleMarkets.length);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.aiDetailModalOverlay}>
        <Pressable style={styles.aiDetailModalBackdrop} onPress={onClose} />
        <View style={styles.aiDetailModalSheet}>
          <View style={styles.eventModalHandle} />

          <View style={styles.aiDetailHeader}>
            <View style={styles.aiTitleBlock}>
              <View style={styles.aiIcon}>
                <Ionicons name="sparkles-outline" size={16} color={colors.cyan} />
              </View>
              <View style={styles.aiTitleCopy}>
                <Text style={styles.aiTitle}>AI Market Brief</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close AI market brief details"
              style={styles.eventModalCloseButton}
              hitSlop={8}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={colors.sub} />
            </Pressable>
          </View>

          <View style={styles.aiDetailUpdatedRow}>
            <Ionicons name="time-outline" size={13} color={colors.muted} />
            <Text style={styles.aiUpdatedText} numberOfLines={1}>{brief.updatedAt}</Text>
          </View>

          <View style={styles.aiDetailSummaryPanel}>
            <Text style={styles.aiSummaryLabel}>Full read</Text>
            <Text style={styles.aiDetailSummaryText}>{brief.summary}</Text>
          </View>

          <View style={styles.aiSignalRail}>
            {brief.sentimentLabel ? (
              <View style={styles.aiSignalChip}>
                <Ionicons name="pulse-outline" size={13} color={colors.cyan} />
                <View style={styles.aiSignalCopy}>
                  <Text style={styles.aiSignalLabel}>Bias</Text>
                  <Text style={styles.aiSignalValue} numberOfLines={1}>{brief.sentimentLabel}</Text>
                </View>
              </View>
            ) : null}
            {confidenceValue ? (
              <View style={styles.aiSignalChip}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.gold} />
                <View style={styles.aiSignalCopy}>
                  <Text style={styles.aiSignalLabel}>Confidence</Text>
                  <Text style={styles.aiSignalValue} numberOfLines={1}>{confidenceValue}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {visibleMarkets.length > 0 ? (
            <View style={styles.aiDetailMarketsPanel}>
              <Text style={styles.aiMarketFocusLabel}>Focus markets</Text>
              <View style={styles.aiMarketRail}>
                {visibleMarkets.map((market) => (
                  <View key={market} style={styles.aiMarketChip}>
                    <Text style={styles.aiMarketText} numberOfLines={1}>{market}</Text>
                  </View>
                ))}
                {remainingMarkets > 0 ? (
                  <View style={styles.aiMarketChip}>
                    <Text style={styles.aiMarketText}>+{remainingMarkets}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.eventModalNotice}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.muted} />
            <Text style={styles.eventModalNoticeText}>
              AI-generated market context only. Use it with price action, risk limits, and official calendar data.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
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
    <ScrollView
      keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRail}>
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
    <ScrollView
      keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRail}>
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
  colors,
  styles,
  onOpenEvent,
}: {
  events: EconomicCalendarEvent[];
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  onOpenEvent: (event: EconomicCalendarEvent) => void;
}) {
  return (
    <View>
      <SectionHeader title="Upcoming Economic Events" styles={styles} />
      {events.length > 0 ? (
        <LinearGradient
          colors={colors.panelGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.calendarCard}
        >
          {events.map((event, index) => (
            <EconomicEventRow
              key={event.eventId}
              event={event}
              colors={colors}
              styles={styles}
              showDivider={index > 0}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </LinearGradient>
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
  colors,
  styles,
  showDivider,
  onOpenEvent,
}: {
  event: EconomicCalendarEvent;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  showDivider: boolean;
  onOpenEvent: (event: EconomicCalendarEvent) => void;
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${event.eventName} details`}
          style={styles.eventChevronButton}
          hitSlop={8}
          onPress={() => onOpenEvent(event)}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function EconomicEventDetailModal({
  event,
  visible,
  onClose,
  T,
  colors,
  styles,
}: {
  event: EconomicCalendarEvent | null;
  visible: boolean;
  onClose: () => void;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (!event) return null;

  const valueItems = [
    { label: 'Previous', value: event.previousValue ?? '--' },
    { label: 'Forecast', value: event.forecastValue ?? '--' },
    { label: 'Actual', value: event.actualValue ?? '--' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.eventModalOverlay}>
        <Pressable style={styles.eventModalBackdrop} onPress={onClose} />
        <View style={styles.eventModalSheet}>
          <View style={styles.eventModalHandle} />

          <View style={styles.eventModalHeader}>
            <View style={styles.eventModalIdentity}>
              <View style={styles.eventModalCurrencyBadge}>
                <Text style={styles.currencyText}>{event.currency}</Text>
              </View>
              <View style={styles.eventModalHeaderCopy}>
                <Text style={styles.eventModalLabel}>Economic Event</Text>
                <Text style={styles.eventModalTime} numberOfLines={1}>
                  {event.eventTime}{event.countdown ? ` - ${event.countdown}` : ''}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close event details"
              style={styles.eventModalCloseButton}
              hitSlop={8}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={colors.sub} />
            </Pressable>
          </View>

          <Text style={styles.eventModalTitle}>{event.eventName}</Text>

          <View style={styles.eventSchedulePanel}>
            <View style={styles.eventScheduleItem}>
              <Text style={styles.eventScheduleLabel}>Time</Text>
              <Text style={styles.eventScheduleValue} numberOfLines={1}>{event.eventTime}</Text>
            </View>
            <View style={styles.eventScheduleDivider} />
            <View style={styles.eventScheduleItem}>
              <Text style={styles.eventScheduleLabel}>Countdown</Text>
              <Text style={styles.eventScheduleValue} numberOfLines={1}>{event.countdown ?? '--'}</Text>
            </View>
          </View>

          <View style={styles.eventImpactPanel}>
            <View style={styles.eventImpactCopy}>
              <Text style={styles.eventModalLabel}>Market Impact</Text>
              <Text style={styles.eventImpactDescription}>
                Expected sensitivity around the release window.
              </Text>
            </View>
            <ImpactBadge impact={event.impactLevel} T={T} styles={styles} />
          </View>

          <View style={styles.eventValueGrid}>
            {valueItems.map((item) => (
              <View key={item.label} style={styles.eventValueCard}>
                <Text style={styles.eventValueLabel}>{item.label}</Text>
                <Text style={styles.eventValueText} numberOfLines={1}>{item.value}</Text>
              </View>
            ))}
          </View>

          {event.isLive ? (
            <View style={styles.eventLiveNotice}>
              <View style={styles.liveDot} />
              <Text style={styles.eventLiveNoticeText}>Live event in progress</Text>
            </View>
          ) : null}

          <View style={styles.eventModalNotice}>
            <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
            <Text style={styles.eventModalNoticeText}>
              Review spread, slippage, and volatility conditions before trading around this event.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LatestNewsFeed({
  count,
  filterLabel,
  styles,
}: {
  count: number;
  filterLabel: string;
  styles: NewsScreenStyles;
}) {
  const action = filterLabel === 'All'
    ? `${count} shown`
    : `${filterLabel} - ${count} shown`;

  return <SectionHeader title="Latest Market News" action={count > 0 ? action : undefined} styles={styles} />;
}

function NewsCard({
  item,
  T,
  colors,
  styles,
  onOpenNews,
  onToggleSaved,
}: {
  item: LatestNewsItem;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  onOpenNews: (item: LatestNewsItem) => void;
  onToggleSaved: (newsId: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      hitSlop={4}
      onPress={() => onOpenNews(item)}
      style={({ pressed }) => (pressed ? styles.newsCardPressed : undefined)}
    >
      <LinearGradient
        colors={colors.breakingGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.newsCard}
      >
        <LinearGradient
          colors={colors.cardGlassHighlight}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={styles.cardGlassHighlight}
        />
        <View style={styles.newsCardTop}>
          <View style={styles.newsSourceBlock}>
            <Text style={styles.newsSourceText} numberOfLines={1}>{item.source}</Text>
            <View style={styles.newsTimeRow}>
              <Ionicons name="time-outline" size={12} color={colors.muted} />
              <Text style={styles.metaText} numberOfLines={1}>{item.publishedAt}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.isSaved ? 'Remove saved news' : 'Save news'}
            hitSlop={8}
            style={[styles.newsBookmarkButton, item.isSaved && styles.newsBookmarkButtonSaved]}
            onPress={() => onToggleSaved(item.newsId)}
          >
            <Ionicons
              name={item.isSaved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={item.isSaved ? colors.gold : colors.sub}
            />
          </Pressable>
        </View>

        <View style={styles.newsChipRow}>
          <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact />
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText} numberOfLines={1}>{item.category}</Text>
          </View>
        </View>

        <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>

        <View style={styles.newsFooter}>
          <SymbolRail symbols={item.affectedSymbols} styles={styles} maxVisible={3} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function LatestNewsDetailModal({
  item,
  visible,
  onClose,
  T,
  colors,
  styles,
}: {
  item: LatestNewsItem | null;
  visible: boolean;
  onClose: () => void;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.latestNewsModalOverlay}>
        <Pressable style={styles.latestNewsModalBackdrop} onPress={onClose} />
        <View style={styles.latestNewsModalSheet}>
          <View style={styles.eventModalHandle} />

          <View style={styles.latestNewsModalHeader}>
            <View style={styles.latestNewsSourceBlock}>
              <Text style={styles.latestNewsSourceText} numberOfLines={1}>{item.source}</Text>
              <View style={styles.newsTimeRow}>
                <Ionicons name="time-outline" size={12} color={colors.muted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.publishedAt}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close news details"
              style={styles.eventModalCloseButton}
              hitSlop={8}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={colors.sub} />
            </Pressable>
          </View>

          <Text style={styles.latestNewsModalTitle}>{item.title}</Text>

          <View style={styles.latestNewsMetaPanel}>
            <View style={styles.latestNewsChipRow}>
              <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact />
              <View style={styles.categoryTag}>
                <Text style={styles.categoryTagText}>{item.category}</Text>
              </View>
              {item.isSaved ? (
                <View style={styles.latestNewsSavedPill}>
                  <Ionicons name="bookmark" size={12} color={colors.gold} />
                  <Text style={styles.latestNewsSavedText}>Saved</Text>
                </View>
              ) : null}
            </View>
          </View>

          {item.affectedSymbols.length > 0 ? (
            <View style={styles.latestNewsSymbolsBlock}>
              <Text style={styles.latestNewsLabel}>Affected Symbols</Text>
              <SymbolRail symbols={item.affectedSymbols} styles={styles} maxVisible={6} />
            </View>
          ) : null}

          <View style={styles.latestNewsSummaryPanel}>
            <Text style={styles.latestNewsLabel}>Summary</Text>
            <Text style={styles.latestNewsModalSummary}>{item.summary}</Text>
          </View>

          <View style={styles.eventModalNotice}>
            <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
            <Text style={styles.eventModalNoticeText}>
              Use this update as context only. Confirm liquidity, spread, and chart structure before taking action.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function WatchlistNewsSection({
  items,
  T,
  colors,
  styles,
  onOpenItem,
}: {
  items: WatchlistNewsItem[];
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  onOpenItem: (item: WatchlistNewsItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Watchlist News" action={`${items.length} matched`} styles={styles} />
      <ScrollView
        keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.watchlistRail}>
        {items.map((item) => (
          <WatchlistNewsCard
            key={`${item.userSymbol}-${item.publishedAt}`}
            item={item}
            T={T}
            colors={colors}
            styles={styles}
            onOpenItem={onOpenItem}
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
  onOpenItem,
}: {
  item: WatchlistNewsItem;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
  onOpenItem: (item: WatchlistNewsItem) => void;
}) {
  return (
    <LinearGradient
      colors={colors.watchlistGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.watchlistCard}
    >
      <LinearGradient
        colors={colors.cardGlassHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        style={styles.cardGlassHighlight}
      />
      <View style={styles.watchlistTopRow}>
        <View style={styles.watchlistIdentity}>
          <View style={styles.watchlistSymbolPill}>
            <Text style={styles.watchlistSymbolText} numberOfLines={1}>{item.userSymbol}</Text>
          </View>
          <Text style={styles.watchlistMatchText} numberOfLines={1}>Watchlist match</Text>
        </View>
        <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact hideDot />
      </View>
      <Text style={styles.watchlistTitle} numberOfLines={2}>{item.relatedNews}</Text>
      <View style={styles.watchlistBottomRow}>
        <View style={styles.watchlistTimeRow}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={styles.watchlistTimeText} numberOfLines={1}>{item.publishedAt}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${item.userSymbol} watchlist news`}
          hitSlop={8}
          style={styles.watchlistReadAction}
          onPress={() => onOpenItem(item)}
        >
          <Text style={styles.watchlistActionText}>View</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.cyan} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function WatchlistNewsDetailModal({
  item,
  visible,
  onClose,
  T,
  colors,
  styles,
}: {
  item: WatchlistNewsItem | null;
  visible: boolean;
  onClose: () => void;
  T: ThemeColors;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.latestNewsModalOverlay}>
        <Pressable style={styles.latestNewsModalBackdrop} onPress={onClose} />
        <View style={styles.latestNewsModalSheet}>
          <View style={styles.eventModalHandle} />

          <View style={styles.watchlistDetailHeader}>
            <View style={styles.watchlistDetailIdentity}>
              <View style={styles.watchlistSymbolPill}>
                <Text style={styles.watchlistSymbolText} numberOfLines={1}>{item.userSymbol}</Text>
              </View>
              <View style={styles.watchlistDetailHeaderCopy}>
                <Text style={styles.watchlistDetailKicker}>Watchlist Match</Text>
                <Text style={styles.watchlistDetailTime} numberOfLines={1}>{item.publishedAt}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close watchlist news details"
              style={styles.eventModalCloseButton}
              hitSlop={8}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={colors.sub} />
            </Pressable>
          </View>

          <Text style={styles.watchlistDetailTitle}>{item.relatedNews}</Text>

          <View style={styles.watchlistDetailMetaGrid}>
            <View style={styles.watchlistDetailMetaCard}>
              <Text style={styles.watchlistDetailLabel}>Symbol</Text>
              <Text style={styles.watchlistDetailValue} numberOfLines={1}>{item.userSymbol}</Text>
            </View>
            <View style={styles.watchlistDetailMetaCard}>
              <Text style={styles.watchlistDetailLabel}>Impact</Text>
              <ImpactBadge impact={item.impactLevel} T={T} styles={styles} compact hideDot />
            </View>
          </View>

          <View style={styles.watchlistDetailPanel}>
            <Text style={styles.watchlistDetailLabel}>Why this appeared</Text>
            <Text style={styles.watchlistDetailText}>
              This update matched a symbol saved in your local watchlist. Review the symbol before acting on the news.
            </Text>
          </View>

          <View style={styles.eventModalNotice}>
            <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
            <Text style={styles.eventModalNoticeText}>
              Check spreads, volatility, and chart structure before placing a trade from watchlist news.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
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

function FreshnessRow({
  updatedAt,
  colors,
  styles,
}: {
  updatedAt?: string;
  colors: NewsThemeColors;
  styles: NewsScreenStyles;
}) {
  if (!updatedAt) return null;

  return (
    <View style={styles.freshnessRow}>
      <Ionicons name="refresh" size={13} color={colors.muted} />
      <Text style={styles.freshnessText} numberOfLines={1}>{updatedAt}</Text>
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
