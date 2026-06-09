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

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'GBPUSD', symbol_digits: '5' }).digits,
    5,
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'GBPUSD', quoteDigits: '5' }).digits,
    5,
  );
});

test('normalizeInstrumentMetaPayload derives digits from backend point and tick size metadata', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({ symbol: 'XAUUSD', point: '0.01' }),
    { symbol: 'XAUUSD', point: 0.01, tickSize: 0.01, digits: 2 },
  );

  assert.deepEqual(
    normalizeInstrumentMetaPayload({ symbol: 'EURUSD', tick_size: '0.00001' }),
    { symbol: 'EURUSD', tick_size: '0.00001', tickSize: 0.00001, digits: 5 },
  );

  assert.equal(
    normalizeInstrumentMetaPayload({ symbol: 'BTCUSD', digits: 2, tickSize: 0.00000001 }).digits,
    2,
  );
});

test('normalizeInstrumentMetaPayload maps backend tick value and contract size aliases', () => {
  assert.deepEqual(
    normalizeInstrumentMetaPayload({
      symbol: 'BTCUSD',
      tick_value: '1.25',
      contract_size: '100',
      tick_size: '0.01',
    }),
    {
      symbol: 'BTCUSD',
      tick_value: '1.25',
      contract_size: '100',
      tick_size: '0.01',
      tickSize: 0.01,
      tickValue: 1.25,
      contractSize: 100,
      digits: 2,
    },
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
