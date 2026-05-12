import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultQuoteWatchlist, resolveQuoteFeedSymbols } from './quoteWatchlistDefaults';

test('resolveQuoteFeedSymbols maps persisted display symbols to broker feed symbols', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD', 'GBPUSD', 'XAUUSD'], ['BTCUSDm', 'GBPUSD.c', 'XAUUSDm']),
    ['BTCUSDm', 'GBPUSD.c', 'XAUUSDm'],
  );
});

test('buildDefaultQuoteWatchlist keeps curated defaults using available raw feed symbols', () => {
  assert.deepEqual(
    buildDefaultQuoteWatchlist(['BTCUSDm', 'XAUUSDm', 'GBPUSD.c', 'EURUSD', 'USDJPY']),
    ['EURUSD', 'GBPUSD.c', 'USDJPY', 'XAUUSDm', 'BTCUSDm'],
  );
});
