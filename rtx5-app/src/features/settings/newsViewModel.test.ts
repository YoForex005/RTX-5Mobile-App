import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMarketNewsSelection,
  buildMarketNewsPreviewData,
  buildMarketNewsSummary,
  filterLatestNews,
  hasWatchlistSymbols,
} from './newsViewModel';

test('buildMarketNewsPreviewData exposes API-ready dynamic sections', () => {
  const data = buildMarketNewsPreviewData(['USER_SYMBOL']);

  assert.ok(data.breakingNews);
  assert.equal(data.categories.some((category) => category.categoryName === 'All'), true);
  assert.equal(data.impactFilters.some((filter) => filter.filterName === 'High Impact'), true);
  assert.ok(data.aiMarketBrief);
  assert.equal(data.economicEvents.length > 0, true);
  assert.equal(data.latestNews.length > 0, true);
  assert.equal(data.watchlistNews.length, 1);
});

test('preview breaking news uses the supplied reference copy through the view model', () => {
  const data = buildMarketNewsPreviewData();

  assert.equal(data.breakingNews?.title, 'Rate Cut Signal Moves Global Markets');
  assert.equal(
    data.breakingNews?.summary,
    'The statement hints at easing inflation pressures and a shift in monetary policy stance.',
  );
  assert.equal(data.breakingNews?.source, 'Global Finance');
  assert.equal(data.breakingNews?.publishedAt, '2m ago');
  assert.equal(data.breakingNews?.relativeTime, 'Just now');
  assert.deepEqual(data.breakingNews?.affectedSymbols.slice(0, 5), ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'USDJPY']);
  assert.equal(data.latestNews[0].title, 'Dollar Holds Firm as Traders Wait for Central Bank Guidance');
  assert.deepEqual(data.latestNews[0].affectedSymbols, ['EURUSD', 'GBPUSD', 'XAUUSD']);
  assert.deepEqual(data.impactFilters.map((filter) => filter.filterName), ['All', 'High Impact', 'Watchlist', 'Saved']);
  assert.equal(data.economicEvents[0].currency, 'USD');
  assert.equal(data.economicEvents[0].eventName, 'US CPI Inflation Rate');
  assert.equal(data.lastUpdatedAt, 'Updated 2m ago');
});

test('applyMarketNewsSelection marks selected category and impact filter from UI state', () => {
  const data = buildMarketNewsPreviewData();
  const selected = applyMarketNewsSelection(data, 'category-forex', 'filter-high-impact', ['A', 'B']);

  assert.equal(selected.categories.find((category) => category.categoryId === 'category-forex')?.isSelected, true);
  assert.equal(selected.impactFilters.find((filter) => filter.filterId === 'filter-high-impact')?.isSelected, true);
  assert.deepEqual(selected.uiState.watchlistSymbols, ['A', 'B']);
});

test('filterLatestNews supports the high-impact filter', () => {
  const data = applyMarketNewsSelection(
    buildMarketNewsPreviewData(),
    'category-all',
    'filter-high-impact',
  );
  const filtered = filterLatestNews(data.latestNews, data.categories, data.impactFilters);

  assert.deepEqual(filtered.map((item) => item.newsId), ['preview-news-001']);
});

test('filterLatestNews supports saved filter state', () => {
  const data = applyMarketNewsSelection(buildMarketNewsPreviewData(), 'category-all', 'filter-saved');
  const filtered = filterLatestNews(data.latestNews, data.categories, data.impactFilters);

  assert.deepEqual(filtered.map((item) => item.newsId), ['preview-news-002']);
});

test('filterLatestNews supports watchlist match filter state', () => {
  const data = applyMarketNewsSelection(buildMarketNewsPreviewData(['XAUUSD']), 'category-all', 'filter-watchlist');
  const filtered = filterLatestNews(data.latestNews, data.categories, data.impactFilters);

  assert.deepEqual(filtered.map((item) => item.newsId), ['preview-news-003']);
});

test('buildMarketNewsSummary derives counts without hardcoded UI assumptions', () => {
  const data = buildMarketNewsPreviewData(['SYMBOL_A', 'SYMBOL_B']);
  const summary = buildMarketNewsSummary(data);

  assert.equal(summary.breakingCount, 1);
  assert.equal(summary.latestCount, data.latestNews.length);
  assert.equal(summary.calendarCount, data.economicEvents.length);
  assert.equal(summary.watchlistNewsCount, 2);
  assert.equal(summary.highImpactCount >= 1, true);
});

test('hasWatchlistSymbols detects personalized news availability', () => {
  assert.equal(hasWatchlistSymbols([]), false);
  assert.equal(hasWatchlistSymbols(['', '  ']), false);
  assert.equal(hasWatchlistSymbols(['EURUSD']), true);
});
