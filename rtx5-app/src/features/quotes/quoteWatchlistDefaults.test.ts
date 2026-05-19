import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultQuoteWatchlist, resolveQuoteFeedSymbols } from './quoteWatchlistDefaults';

test('resolveQuoteFeedSymbols maps persisted display symbols to broker feed symbols', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD', 'GBPUSD', 'XAUUSD'], ['BTCUSDm', 'GBPUSD.c', 'XAUUSDm']),
    ['BTCUSDm', 'GBPUSD.c', 'XAUUSDm'],
  );
});

test('resolveQuoteFeedSymbols preserves requested broker variants that already exist', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(
      ['EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
      ['EURUSD', 'EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
    ),
    ['EURUSD.X1782', 'EURUSD.Y1783', 'BTCUSD.P'],
  );
});

test('resolveQuoteFeedSymbols matches broker variants by feed key when casing differs', () => {
  assert.deepEqual(
    resolveQuoteFeedSymbols(
      ['eurusd.x1782', 'btcusd.p'],
      ['EURUSD', 'EURUSD.X1782', 'BTCUSD.P'],
    ),
    ['EURUSD.X1782', 'BTCUSD.P'],
  );
});

test('buildDefaultQuoteWatchlist keeps curated defaults using available raw feed symbols', () => {
  assert.deepEqual(
    buildDefaultQuoteWatchlist(['BTCUSDm', 'XAUUSDm', 'GBPUSD.c', 'EURUSD', 'USDJPY']),
    ['EURUSD', 'GBPUSD.c', 'USDJPY', 'XAUUSDm', 'BTCUSDm'],
  );
});

test('resolveQuoteFeedSymbols prefers the canonical-cased symbol when a duplicate exists', () => {
  // Repro of the BTCUSD bug: broker_3's catalog exposed both a stale lowercase
  // "btcusd" (0 ticks) and the canonical "BTCUSD" (live ticks). We must
  // subscribe to the canonical one regardless of which row came first.
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD'], ['btcusd', 'BTCUSD']),
    ['BTCUSD'],
  );
  assert.deepEqual(
    resolveQuoteFeedSymbols(['BTCUSD'], ['BTCUSD', 'btcusd']),
    ['BTCUSD'],
  );
});
