import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNITY_FILTERS,
  COMMUNITY_POSTS,
  EDUCATION_DISCLOSURE,
  FEATURED_TRADERS,
  LIVE_TRADING_ROOMS,
  MARKET_POLL,
  MARKET_SENTIMENTS,
  buildCommunitySummary,
  filterCommunityPosts,
  getCommunityPostCountByCategory,
} from './tradersCommunityViewModel';

test('trader community filters match the professional community categories', () => {
  assert.deepEqual(COMMUNITY_FILTERS, [
    'All',
    'Market Talk',
    'Trade Ideas',
    'Analysis',
    'News',
    'Learning',
    'Prop Firm',
    'Copy Trading',
  ]);
});

test('market sentiment keeps trading-specific symbols and valid percentages', () => {
  assert.deepEqual(MARKET_SENTIMENTS.map((item) => item.symbol), ['XAUUSD', 'EURUSD', 'BTCUSD']);
  assert.equal(MARKET_SENTIMENTS.every((item) => item.percent > 0 && item.percent <= 100), true);
});

test('featured traders avoid profit claims and expose professional verification metadata', () => {
  assert.equal(
    FEATURED_TRADERS.every((trader) => trader.helpfulRating === undefined || trader.helpfulRating <= 100),
    true,
  );
  assert.equal(FEATURED_TRADERS.every((trader) => /profit|guarantee/i.test(trader.specialty) === false), true);
  assert.equal(FEATURED_TRADERS.filter((trader) => trader.verified).length, 3);
});

test('live rooms expose active member counts and compact avatar previews', () => {
  assert.equal(LIVE_TRADING_ROOMS.length, 3);
  assert.equal(
    LIVE_TRADING_ROOMS.every((room) => !room.memberPreview || room.activeMembers > room.memberPreview.length),
    true,
  );
});

test('community posts use deterministic IDs, optional education labels, and supported categories', () => {
  const ids = COMMUNITY_POSTS.map((post) => post.id);
  const supportedCategories = new Set(COMMUNITY_FILTERS.filter((filter) => filter !== 'All'));

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(COMMUNITY_POSTS.every((post) => supportedCategories.has(post.category)), true);
  assert.equal(COMMUNITY_POSTS.every((post) => !post.riskLabel || /education/i.test(post.riskLabel)), true);
});

test('community summary derives screen-level metrics from traders, rooms, posts, and sentiment', () => {
  const summary = buildCommunitySummary();

  assert.equal(summary.totalPosts, 4);
  assert.equal(summary.verifiedTraders, 3);
  assert.equal(summary.activeRooms, 3);
  assert.equal(summary.trackedSymbols, 4);
  assert.equal(summary.pollDistributionTotal, 100);
});

test('community post filtering narrows by category and search query', () => {
  const tradeIdeas = filterCommunityPosts(COMMUNITY_POSTS, 'Trade Ideas', '');
  const goldPosts = filterCommunityPosts(COMMUNITY_POSTS, 'All', 'gold');

  assert.deepEqual(tradeIdeas.map((post) => post.id), ['aarav-xau-liquidity']);
  assert.deepEqual(goldPosts.map((post) => post.id), ['aarav-xau-liquidity']);
});

test('community category counts derive from post data', () => {
  assert.equal(getCommunityPostCountByCategory('Trade Ideas'), 1);
  assert.equal(getCommunityPostCountByCategory('Analysis'), 1);
  assert.equal(getCommunityPostCountByCategory('Prop Firm'), 1);
});

test('market poll and disclosure preserve education-only compliance framing', () => {
  assert.match(MARKET_POLL.question, /Gold/i);
  assert.equal(MARKET_POLL.options.reduce((sum, option) => sum + option.percent, 0), 100);
  assert.match(EDUCATION_DISCLOSURE, /Not financial advice/i);
});
