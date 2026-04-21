import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveQuoteTickTimestamp } from './quoteTimestamp.ts';

test('resolveQuoteTickTimestamp ignores boolean t=false and falls back cleanly', () => {
  assert.equal(resolveQuoteTickTimestamp({ t: false }, 1234567890), 1234567890);
});

test('resolveQuoteTickTimestamp accepts numeric-like string timestamps', () => {
  assert.equal(resolveQuoteTickTimestamp({ time: '1713705000' }, 1), 1713705000);
});

test('resolveQuoteTickTimestamp prefers the first valid timestamp field', () => {
  assert.equal(resolveQuoteTickTimestamp({ time: false, timestamp: 1713705000, t: 0 }, 1), 1713705000);
});
