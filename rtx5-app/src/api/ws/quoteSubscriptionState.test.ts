import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyQuoteSubscriptionDelta,
  buildActiveQuoteSymbols,
} from './quoteSubscriptionState';

test('quote subscription counts keep a symbol active until the last consumer unsubscribes', () => {
  let counts = applyQuoteSubscriptionDelta(new Map(), ['EURUSD'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], 1);

  assert.deepEqual(buildActiveQuoteSymbols([], counts), ['EURUSD']);

  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], -1);
  assert.deepEqual(buildActiveQuoteSymbols([], counts), ['EURUSD']);

  counts = applyQuoteSubscriptionDelta(counts, ['EURUSD'], -1);
  assert.deepEqual(buildActiveQuoteSymbols([], counts), []);
});

test('sticky quote subscriptions merge with additive consumers instead of overriding them', () => {
  const counts = applyQuoteSubscriptionDelta(new Map(), ['EURUSD'], 1);
  const active = buildActiveQuoteSymbols(['XAUUSD'], counts).sort();

  assert.deepEqual(active, ['EURUSD', 'XAUUSD']);
});

test('quote subscriptions preserve broker feed symbols before counting and sending', () => {
  let counts = applyQuoteSubscriptionDelta(new Map(), ['GBPUSD.c', 'XAUUSDm'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['GBPUSD'], 1);
  counts = applyQuoteSubscriptionDelta(counts, ['GBPUSD.c'], -1);

  const active = buildActiveQuoteSymbols(['BTCUSDm'], counts).sort();

  assert.deepEqual(active, ['BTCUSDm', 'GBPUSD', 'XAUUSDm']);
});

test('empty or zero-count symbols are ignored when building active quote subscriptions', () => {
  const active = buildActiveQuoteSymbols(['', 'BTCUSDm'], new Map([['EURUSD', 0], ['GBPUSD.c', 2]])).sort();

  assert.deepEqual(active, ['BTCUSDm', 'GBPUSD.c']);
});
