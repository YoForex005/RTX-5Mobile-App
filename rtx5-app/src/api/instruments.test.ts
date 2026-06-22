import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findInstrumentMetaInCatalogPayload,
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

test('normalizeInstrumentMetaPayload maps specification screen broker aliases', () => {
  const meta = normalizeInstrumentMetaPayload({
    symbol: 'BTCUSDm',
    volume_min: '0.01',
    volume_max: '50',
    volume_step: '0.01',
    trade_stops_level: 12,
    swap_long: '-3.5',
    swap_short: '1.25',
    margin_initial: '2',
    margin_maintenance: '1',
    currency_base: 'BTC',
    currency_profit: 'USD',
    spread_mode: 'Floating',
    spread: '1.2',
    commission: '7',
    trade_calc_mode: 'CFD',
    chart_mode: 'By Bid',
  });

  assert.equal(meta.minVolume, 0.01);
  assert.equal(meta.maxVolume, 50);
  assert.equal(meta.stepVolume, 0.01);
  assert.equal(meta.stopsLevel, '12');
  assert.equal(meta.swapLong, -3.5);
  assert.equal(meta.swapShort, 1.25);
  assert.equal(meta.marginInitial, 2);
  assert.equal(meta.marginMaintenance, 1);
  assert.equal(meta.baseCurrency, 'BTC');
  assert.equal(meta.profitCurrency, 'USD');
  assert.equal(meta.spreadMode, 'Floating');
  assert.equal(meta.spread, 1.2);
  assert.equal(meta.commission, 7);
  assert.equal(meta.calculation, 'CFD');
  assert.equal(meta.chartMode, 'By Bid');
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

test('instrument catalog lookup resolves exact and normalized symbol matches', () => {
  const payload = {
    data: {
      instruments: [
        { symbol: 'ETHUSDm', digits: 2, volume_min: '0.05' },
        { symbol: 'BTCUSDm', digits: 2, contract_size: '1' },
      ],
    },
  };

  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'BTCUSD')?.symbol, 'BTCUSDm');
  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'ETHUSDm')?.minVolume, 0.05);
  assert.equal(findInstrumentMetaInCatalogPayload(payload, 'XAUUSD'), undefined);
});
