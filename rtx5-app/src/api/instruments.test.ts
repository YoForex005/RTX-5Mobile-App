import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
} from './instrumentMeta.ts';

test('normalizeInstrumentMetaPayload reads backend digit fields', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({ Symbol: 'BTCUSD', Digits: '2' }),
    { Symbol: 'BTCUSD', Digits: '2', symbol: 'BTCUSD', digits: 2 },
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'ETHUSD', pricePrecision: 4 }).digits,
    4,
  );
});

test('instrument catalog payload primes cached backend digits by exact and normalized symbol', () => {
  primeInstrumentMetaCacheFromCatalogPayload({
    instruments: [
      { symbol: 'BTCUSDm', digits: 2 },
    ],
  });

  assert.equal(getCachedInstrumentMeta('BTCUSDm')?.digits, 2);
  assert.equal(getCachedInstrumentMeta('BTCUSD')?.digits, 2);
});
