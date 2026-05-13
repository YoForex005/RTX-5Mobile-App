export type NewsImpactLevel = 'High' | 'Medium' | 'Low' | 'Neutral';
export type NewsScreenStatus = 'ready' | 'loading' | 'error' | 'offline';

export type BreakingNewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  relativeTime?: string;
  impactLevel: NewsImpactLevel;
  affectedSymbols: string[];
  category: string;
  imageOrChartPreview?: string;
  isSaved: boolean;
  readUrl?: string;
};

export type NewsCategory = {
  categoryId: string;
  categoryName: string;
  isSelected: boolean;
};

export type ImpactFilter = {
  filterId: string;
  filterName: string;
  impactLevel?: NewsImpactLevel | 'Watchlist' | 'Saved';
  isSelected: boolean;
};

export type AiMarketBrief = {
  summary: string;
  updatedAt: string;
  affectedMarkets: string[];
  confidenceLabel?: string;
  sentimentLabel?: string;
};

export type EconomicCalendarEvent = {
  eventId: string;
  currency: string;
  eventName: string;
  eventTime: string;
  impactLevel: NewsImpactLevel;
  countdown?: string;
  previousValue?: string;
  forecastValue?: string;
  actualValue?: string;
  isLive: boolean;
};

export type LatestNewsItem = {
  newsId: string;
  source: string;
  title: string;
  summary: string;
  publishedAt: string;
  affectedSymbols: string[];
  impactLevel: NewsImpactLevel;
  category: string;
  thumbnail?: string;
  isSaved: boolean;
  shareUrl?: string;
  readUrl?: string;
};

export type WatchlistNewsItem = {
  userSymbol: string;
  relatedNews: string;
  impactLevel: NewsImpactLevel;
  publishedAt: string;
};

export type MarketNewsUiState = {
  notificationCount: number;
  selectedCategory: string;
  selectedImpactFilter: string;
  savedNewsIds: string[];
  watchlistSymbols: string[];
};

export type MarketNewsScreenData = {
  breakingNews: BreakingNewsItem | null;
  categories: NewsCategory[];
  impactFilters: ImpactFilter[];
  aiMarketBrief: AiMarketBrief | null;
  economicEvents: EconomicCalendarEvent[];
  latestNews: LatestNewsItem[];
  watchlistNews: WatchlistNewsItem[];
  uiState: MarketNewsUiState;
  lastUpdatedAt?: string;
};

export type MarketNewsSummary = {
  breakingCount: number;
  latestCount: number;
  highImpactCount: number;
  calendarCount: number;
  watchlistNewsCount: number;
};

const PREVIEW_CATEGORY_NAMES = [
  'All',
  'Forex',
  'Crypto',
  'Stocks',
  'Indices',
  'Commodities',
  'Economy',
  'Central Banks',
  'Prop Firm',
];

const PREVIEW_FILTER_NAMES = ['High Impact', 'Medium Impact', 'Low Impact', 'Watchlist', 'Saved'];

export function buildMarketNewsPreviewData(watchlistSymbols: string[] = []): MarketNewsScreenData {
  const normalizedWatchlist = uniqueStrings(watchlistSymbols);

  return {
    breakingNews: {
      id: 'preview-breaking-001',
      title: 'Major Central Bank Signals Potential Rate Cut in Next Policy Meeting',
      summary: 'The statement hints at easing inflation pressures and a shift in monetary policy stance.',
      source: 'Global Finance',
      publishedAt: '2m ago',
      relativeTime: 'Just now',
      impactLevel: 'High',
      affectedSymbols: ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'USDJPY', 'US500', 'NAS100', 'BTCUSD', 'ETHUSD', 'USDCHF'],
      category: 'Economy',
      imageOrChartPreview: 'market-pulse',
      isSaved: false,
      readUrl: undefined,
    },
    categories: PREVIEW_CATEGORY_NAMES.map((categoryName, index) => ({
      categoryId: `category-${categoryName.toLowerCase().replace(/\s+/g, '-')}`,
      categoryName,
      isSelected: index === 0,
    })),
    impactFilters: PREVIEW_FILTER_NAMES.map((filterName, index) => ({
      filterId: `filter-${filterName.toLowerCase().replace(/\s+/g, '-')}`,
      filterName,
      impactLevel: resolveFilterImpact(filterName),
      isSelected: index === 0,
    })),
    aiMarketBrief: {
      summary: 'Macro risk remains elevated while traders wait for confirmation from rate guidance, liquidity conditions, and the next calendar catalyst.',
      updatedAt: 'Updated 2m ago',
      affectedMarkets: ['FX Majors', 'Gold', 'US Indices'],
      confidenceLabel: 'Confidence 82%',
      sentimentLabel: 'Risk-sensitive',
    },
    economicEvents: [
      {
        eventId: 'preview-event-001',
        currency: 'CUR',
        eventName: 'Economic event placeholder',
        eventTime: 'Preview time',
        impactLevel: 'High',
        countdown: 'T-00:00',
        previousValue: '--',
        forecastValue: '--',
        actualValue: '--',
        isLive: false,
      },
      {
        eventId: 'preview-event-002',
        currency: 'CUR',
        eventName: 'Central bank event placeholder',
        eventTime: 'Preview time',
        impactLevel: 'Medium',
        countdown: 'T-00:00',
        previousValue: '--',
        forecastValue: '--',
        actualValue: '--',
        isLive: false,
      },
      {
        eventId: 'preview-event-003',
        currency: 'CUR',
        eventName: 'Inflation data placeholder',
        eventTime: 'Preview time',
        impactLevel: 'Low',
        countdown: 'T-00:00',
        previousValue: '--',
        forecastValue: '--',
        actualValue: '--',
        isLive: false,
      },
    ],
    latestNews: [
      {
        newsId: 'preview-news-001',
        source: 'Market Desk',
        title: 'Dollar Holds Firm as Traders Wait for Central Bank Guidance',
        summary: 'FX majors remain sensitive to rate-path expectations while gold and indices watch the next policy catalyst.',
        publishedAt: '12m ago',
        affectedSymbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
        impactLevel: 'High',
        category: 'Forex',
        thumbnail: 'pulse',
        isSaved: false,
        shareUrl: undefined,
        readUrl: undefined,
      },
      {
        newsId: 'preview-news-002',
        source: 'Calendar Provider',
        title: 'Policy Speaker Risk Keeps Rate-Sensitive Markets on Alert',
        summary: 'Traders are watching for confirmation on inflation progress, liquidity tone, and forward-rate assumptions.',
        publishedAt: '28m ago',
        affectedSymbols: ['USDJPY', 'US30', 'NAS100'],
        impactLevel: 'Medium',
        category: 'Central Banks',
        thumbnail: 'calendar',
        isSaved: true,
        shareUrl: undefined,
        readUrl: undefined,
      },
      {
        newsId: 'preview-news-003',
        source: 'Market Desk',
        title: 'Watchlist Instruments React to Fresh Risk-Sentiment Shift',
        summary: 'Personalized market updates can surface when provider headlines match the trader watchlist.',
        publishedAt: '44m ago',
        affectedSymbols: normalizedWatchlist.slice(0, 2).length > 0 ? normalizedWatchlist.slice(0, 2) : ['WATCHLIST'],
        impactLevel: 'Low',
        category: 'Commodities',
        thumbnail: 'watchlist',
        isSaved: false,
        shareUrl: undefined,
        readUrl: undefined,
      },
    ],
    watchlistNews: buildPreviewWatchlistNews(normalizedWatchlist),
    uiState: {
      notificationCount: 2,
      selectedCategory: 'category-all',
      selectedImpactFilter: 'filter-high-impact',
      savedNewsIds: ['preview-news-002'],
      watchlistSymbols: normalizedWatchlist,
    },
    lastUpdatedAt: 'Preview update',
  };
}

export function applyMarketNewsSelection(
  data: MarketNewsScreenData,
  selectedCategory: string,
  selectedImpactFilter: string,
  watchlistSymbols: string[] = data.uiState.watchlistSymbols,
): MarketNewsScreenData {
  const normalizedWatchlist = uniqueStrings(watchlistSymbols);

  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      isSelected: category.categoryId === selectedCategory,
    })),
    impactFilters: data.impactFilters.map((filter) => ({
      ...filter,
      isSelected: filter.filterId === selectedImpactFilter,
    })),
    watchlistNews: data.watchlistNews.length > 0 ? data.watchlistNews : buildPreviewWatchlistNews(normalizedWatchlist),
    uiState: {
      ...data.uiState,
      selectedCategory,
      selectedImpactFilter,
      watchlistSymbols: normalizedWatchlist,
    },
  };
}

export function buildMarketNewsSummary(data: MarketNewsScreenData): MarketNewsSummary {
  return {
    breakingCount: data.breakingNews ? 1 : 0,
    latestCount: data.latestNews.length,
    highImpactCount: [
      data.breakingNews,
      ...data.latestNews,
      ...data.economicEvents,
      ...data.watchlistNews,
    ].filter((item) => item?.impactLevel === 'High').length,
    calendarCount: data.economicEvents.length,
    watchlistNewsCount: data.watchlistNews.length,
  };
}

export function filterLatestNews(
  newsItems: readonly LatestNewsItem[],
  categories: readonly NewsCategory[],
  impactFilters: readonly ImpactFilter[],
): LatestNewsItem[] {
  const selectedCategory = categories.find((category) => category.isSelected);
  const selectedImpactFilter = impactFilters.find((filter) => filter.isSelected);
  const selectedCategoryName = selectedCategory?.categoryName ?? 'All';

  return newsItems.filter((item) => {
    const categoryMatches = selectedCategoryName === 'All' || item.category === selectedCategoryName;
    if (!categoryMatches) return false;

    if (!selectedImpactFilter) return true;
    if (selectedImpactFilter.impactLevel === 'Watchlist') return item.affectedSymbols.length > 0;
    if (selectedImpactFilter.impactLevel === 'Saved') return item.isSaved;
    if (!selectedImpactFilter.impactLevel) return true;

    return item.impactLevel === selectedImpactFilter.impactLevel;
  });
}

export function buildPreviewWatchlistNews(watchlistSymbols: readonly string[]): WatchlistNewsItem[] {
  return uniqueStrings([...watchlistSymbols]).slice(0, 3).map((symbol, index) => ({
    userSymbol: symbol,
    relatedNews: `${symbol} matched a fresh market catalyst from the news intelligence feed.`,
    impactLevel: index === 0 ? 'High' : 'Medium',
    publishedAt: 'Preview time',
  }));
}

export function hasWatchlistSymbols(watchlistSymbols: readonly string[]): boolean {
  return uniqueStrings([...watchlistSymbols]).length > 0;
}

function resolveFilterImpact(filterName: string): ImpactFilter['impactLevel'] {
  if (filterName === 'High Impact') return 'High';
  if (filterName === 'Medium Impact') return 'Medium';
  if (filterName === 'Low Impact') return 'Low';
  if (filterName === 'Watchlist') return 'Watchlist';
  if (filterName === 'Saved') return 'Saved';

  return undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
