import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSymbol } from './symbols';

test('normalizeSymbol keeps live backend symbols unchanged', () => {
  assert.equal(normalizeSymbol('GBPUSD'), 'GBPUSD');
  assert.equal(normalizeSymbol('btcusd'), 'BTCUSD');
  assert.equal(normalizeSymbol('XAUUSD'), 'XAUUSD');
});

test('normalizeSymbol translates legacy mobile aliases to live backend symbols', () => {
  assert.equal(normalizeSymbol('BTCUSDm'), 'BTCUSD');
  assert.equal(normalizeSymbol('xauusdm'), 'XAUUSD');
  assert.equal(normalizeSymbol('ETHUSDm'), 'ETHUSD');
});
