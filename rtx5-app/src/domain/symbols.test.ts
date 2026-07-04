import test from 'node:test';
import assert from 'node:assert/strict';

import { isCryptoSymbol, normalizeQuoteSymbolKey, normalizeSymbol } from './symbols';

test('normalizeQuoteSymbolKey preserves broker feed suffixes for live quote matching', () => {
  assert.equal(normalizeQuoteSymbolKey('eurusd.x1782'), 'EURUSD.X1782');
  assert.equal(normalizeQuoteSymbolKey(' GBP/USD_pro '), 'GBPUSD_PRO');
  assert.equal(normalizeQuoteSymbolKey('BTCUSD.P'), 'BTCUSD.P');
});

test('normalizeSymbol keeps live backend symbols unchanged', () => {
  assert.equal(normalizeSymbol('GBPUSD'), 'GBPUSD');
  assert.equal(normalizeSymbol('btcusd'), 'BTCUSD');
  assert.equal(normalizeSymbol('XAUUSD'), 'XAUUSD');
  assert.equal(normalizeSymbol('GBP/USD'), 'GBPUSD');
});

test('normalizeSymbol translates legacy mobile aliases to live backend symbols', () => {
  assert.equal(normalizeSymbol('BTCUSDm'), 'BTCUSD');
  assert.equal(normalizeSymbol('xauusdm'), 'XAUUSD');
  assert.equal(normalizeSymbol('ETHUSDm'), 'ETHUSD');
  assert.equal(normalizeSymbol(' XAU / USD m '), 'XAUUSD');
  assert.equal(normalizeSymbol('GBPUSD.c'), 'GBPUSD');
  assert.equal(normalizeSymbol('GBP/USD_pro'), 'GBPUSD');
  assert.equal(normalizeSymbol('EURUSDstd'), 'EURUSD');
});

test('isCryptoSymbol recognizes crypto pairs with broker suffixes', () => {
  assert.equal(isCryptoSymbol('BTCUSD'), true);
  assert.equal(isCryptoSymbol('btcusdm'), true);
  assert.equal(isCryptoSymbol('SOLUSDpro'), true);
  assert.equal(isCryptoSymbol('ETHUSDT'), true);
  assert.equal(isCryptoSymbol('XAUUSD'), false);
  assert.equal(isCryptoSymbol('EURUSD'), false);
});
