import assert from 'node:assert/strict';
import test from 'node:test';

import { extractMarketSymbols } from '../domain/marketSymbols';

test('extractMarketSymbols returns only symbols present in the instruments API payload', () => {
  assert.deepEqual(
    extractMarketSymbols({
      instruments: [
        { symbol: 'EURUSD' },
        { symbol: ' XAUUSDm ' },
        'BTCUSD',
        { name: 'missing-symbol-field' },
        { symbol: '' },
        null,
        'BTCUSD',
      ],
    }),
    ['EURUSD', 'XAUUSDm', 'BTCUSD'],
  );
});

test('extractMarketSymbols does not inject default chart symbols when API payload is empty', () => {
  assert.deepEqual(extractMarketSymbols({ instruments: [] }), []);
  assert.deepEqual(extractMarketSymbols({}), []);
  assert.deepEqual(extractMarketSymbols(null), []);
});
