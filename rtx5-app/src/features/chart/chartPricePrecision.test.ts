import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeChartDisplayDecimals,
  resolveChartDisplayDecimals,
} from './chartPricePrecision.ts';

test('chart display decimals prefer backend instrument digits', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentDigits: 2,
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: true,
    }),
    2,
  );
});

test('chart display decimals use backend quote digits only when trusted', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: true,
    }),
    5,
  );
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: false,
    }),
    2,
  );
});

test('chart display decimals clamp backend digit values', () => {
  assert.equal(normalizeChartDisplayDecimals('4'), 4);
  assert.equal(normalizeChartDisplayDecimals(12), 8);
  assert.equal(normalizeChartDisplayDecimals(-1), 0);
  assert.equal(normalizeChartDisplayDecimals(''), undefined);
});
