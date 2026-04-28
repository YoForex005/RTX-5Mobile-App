import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveQuoteTickTimestamp } from './quoteTimestamp.ts';

test('resolveQuoteTickTimestamp ignores boolean t=false and falls back cleanly', () => {
  assert.equal(resolveQuoteTickTimestamp({ t: false }, 1234567890), 1234567890);
});

test('resolveQuoteTickTimestamp returns null without a server timestamp or explicit fallback', () => {
  assert.equal(resolveQuoteTickTimestamp({ t: false }), null);
});

test('resolveQuoteTickTimestamp accepts numeric-like string timestamps', () => {
  assert.equal(resolveQuoteTickTimestamp({ time: '1713705000' }, 1), 1713705000);
});

test('resolveQuoteTickTimestamp prefers the first valid timestamp field', () => {
  assert.equal(resolveQuoteTickTimestamp({ time: false, timestamp: 1713705000, t: 0 }, 1), 1713705000);
});

test('resolveQuoteTickTimestamp checks lastTickAt and serverTime when primary fields are absent', () => {
  assert.equal(resolveQuoteTickTimestamp({ lastTickAt: 1713705001, serverTime: 1713705002 }), 1713705001);
  assert.equal(resolveQuoteTickTimestamp({ serverTime: '2024-04-21T10:30:03.000Z' }), 1713695403000);
});

test('resolveQuoteTickTimestamp keeps timestamp ahead of time for the canonical feed path', () => {
  assert.equal(
    resolveQuoteTickTimestamp({ timestamp: 1713705004, time: 1713705999, t: 1713705998 }),
    1713705004,
  );
});
