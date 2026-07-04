import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CHART_SYMBOLS,
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
  resolveChartSymbolKey,
} from './chartSymbolMetadata';

test('default chart symbols provide a stable picker fallback', () => {
  assert.ok(DEFAULT_CHART_SYMBOLS.length >= 10);
  assert.equal(new Set(DEFAULT_CHART_SYMBOLS).size, DEFAULT_CHART_SYMBOLS.length);
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('EURUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('GBPUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('XAUUSD'));
  assert.ok(DEFAULT_CHART_SYMBOLS.includes('BTCUSD'));
});

test('chart symbol metadata resolves pair names and broker suffixes', () => {
  assert.equal(resolveChartSymbolKey('GBPUSD.c'), 'GBPUSD');
  assert.equal(resolveChartSymbolKey('XAUUSDm'), 'XAUUSD');
  assert.equal(resolveChartSymbolKey('BTCUSDpro'), 'BTCUSD');
  assert.equal(resolveChartSymbolFullName('GBPUSD.c'), 'British Pound / US Dollar');
  assert.equal(resolveChartSymbolFullName('EURJPY'), 'Euro / Japanese Yen');
  assert.equal(resolveChartSymbolFullName('XAGUSDm'), 'Silver / US Dollar');
});

test('chart symbol metadata resolves header categories', () => {
  assert.equal(resolveChartSymbolCategory('EURUSD'), 'FOREX');
  assert.equal(resolveChartSymbolCategory('GBPUSD.c'), 'FOREX');
  assert.equal(resolveChartSymbolCategory('XAUUSDm'), 'METAL');
  assert.equal(resolveChartSymbolCategory('BTCUSDpro'), 'CRYPTO');
  assert.equal(resolveChartSymbolCategory('SOLUSDpro'), 'CRYPTO');
  assert.equal(resolveChartSymbolCategory('ABCDEF'), null);
});

test('unknown six-letter pairs still get a readable pair subtitle', () => {
  assert.equal(resolveChartSymbolFullName('ABCDEF'), 'ABC / DEF');
});
