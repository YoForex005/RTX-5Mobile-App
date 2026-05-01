import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultQuoteWatchlist, DEFAULT_QUOTE_WATCHLIST } from './quoteWatchlistDefaults';

test('buildDefaultQuoteWatchlist uses typed public-feed defaults when catalog is unavailable', () => {
  assert.deepEqual(buildDefaultQuoteWatchlist([]), [...DEFAULT_QUOTE_WATCHLIST]);
});

test('buildDefaultQuoteWatchlist filters defaults through available catalog symbols', () => {
  assert.deepEqual(
    buildDefaultQuoteWatchlist(['EURUSD', 'XAUUSD', 'AAPL']),
    ['EURUSD', 'XAUUSD'],
  );
});

test('buildDefaultQuoteWatchlist falls back to the first catalog symbols when defaults are absent', () => {
  assert.deepEqual(
    buildDefaultQuoteWatchlist(['US30', 'NAS100', 'GER40', 'UK100', 'FRA40', 'AAPL']),
    ['US30', 'NAS100', 'GER40', 'UK100', 'FRA40'],
  );
});
