import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateQuoteSpreadPoints } from './quoteSpread.ts';

test('calculateQuoteSpreadPoints uses displayed bid ask precision', () => {
  assert.equal(calculateQuoteSpreadPoints(1.16345, 1.16365, 5), 20);
  assert.equal(calculateQuoteSpreadPoints(4475.11, 4475.34, 2), 23);
  assert.equal(calculateQuoteSpreadPoints(62257.56, 62287.23, 2), 2967);
});

test('calculateQuoteSpreadPoints rounds bid ask before comparing spread', () => {
  assert.equal(calculateQuoteSpreadPoints(1.163451, 1.163649, 5), 20);
  assert.equal(calculateQuoteSpreadPoints(4475.114, 4475.336, 2), 23);
});

test('calculateQuoteSpreadPoints rejects unusable quote inputs', () => {
  assert.equal(calculateQuoteSpreadPoints(undefined, 1.2, 5), undefined);
  assert.equal(calculateQuoteSpreadPoints(1.2, 1.1, 5), undefined);
  assert.equal(calculateQuoteSpreadPoints(1.1, 1.2, undefined), undefined);
});
