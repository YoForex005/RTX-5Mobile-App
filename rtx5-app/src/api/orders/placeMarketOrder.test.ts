import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { buildMarketOrderSymbolCandidates } from './placeMarketOrderCandidates.ts';

const marketOrderSource = readFileSync(resolve(process.cwd(), 'src/api/orders/placeMarketOrder.ts'), 'utf8');

test('market order symbol candidates reject accepted and catalog aliases with different suffixes', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'XAUUSDm',
      acceptedSymbol: 'XAUUSD.pro',
      cachedCatalogSymbol: 'XAUUSD.c',
    }),
    ['XAUUSDm'],
  );
});

test('market order symbol candidates dedupe exact and normalized matches', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'EURUSD',
      cachedCatalogSymbol: 'EURUSD',
    }),
    ['EURUSD'],
  );
});

test('market order symbol candidates keep broker-authoritative spelling for the same exact key', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'eurusd.pro',
      acceptedSymbol: 'EURUSD.PRO',
      cachedCatalogSymbol: 'EURUSD.pro',
    }),
    ['EURUSD.PRO', 'eurusd.pro', 'EURUSD.pro'],
  );
});

test('market order symbol candidates do not brute-force hardcoded suffixes', () => {
  assert.deepEqual(
    buildMarketOrderSymbolCandidates({
      callerSymbol: 'GBPUSD',
    }),
    ['GBPUSD'],
  );
});

test('market order request explicitly identifies market execution', () => {
  const orderBodySource = marketOrderSource.slice(
    marketOrderSource.indexOf('const orderBody:'),
    marketOrderSource.indexOf('// Optional order fields'),
  );

  assert.match(orderBodySource, /type: 'market'/);
});
