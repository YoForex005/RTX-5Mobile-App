import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLiveQuoteTickToSnapshot,
  hasDisplayableLiveQuotePrice,
  hasFreshLiveQuote,
} from './liveQuoteSnapshot';

test('applyLiveQuoteTickToSnapshot refreshes duplicate backend snapshots', () => {
  const first = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    undefined,
    {
      symbol: 'EURUSD',
      bid: 1.17121,
      ask: 1.17141,
      dailyOpen: 1.17223,
      previousClose: 1.17204,
      high: 1.17269,
      low: 1.16773,
      timestamp: 1777409940,
      feedTickAt: 1777409940000,
      receivedAt: 1777410000000,
    },
    1,
    1777410000000,
  );

  assert.ok(first);
  assert.equal(first.bid, 1.17121);
  assert.equal(first.ask, 1.17141);
  assert.equal(first.high, 1.17269);
  assert.equal(first.low, 1.16773);
  assert.equal(first.lastReceivedAt, 1777410000000);
  assert.equal(first.lastPriceChangedAt, 1777410000000);
  assert.equal(first.updateSeq, 1);
  assert.equal(hasFreshLiveQuote(first, 1777410001000), true);

  const duplicate = applyLiveQuoteTickToSnapshot(
    'EURUSD',
    first,
    {
      symbol: 'EURUSD',
      bid: 1.17121,
      ask: 1.17141,
      timestamp: 1777409940,
      feedTickAt: 1777409940000,
      receivedAt: 1777410002000,
    },
    2,
    1777410002000,
  );

  assert.ok(duplicate);
  assert.equal(duplicate.bid, 1.17121);
  assert.equal(duplicate.ask, 1.17141);
  assert.equal(duplicate.lastReceivedAt, 1777410002000);
  assert.equal(duplicate.lastPriceChangedAt, 1777410000000);
  assert.equal(duplicate.updateSeq, 2);
});

test('applyLiveQuoteTickToSnapshot tracks previous bid ask on real price movement', () => {
  const first = applyLiveQuoteTickToSnapshot(
    'GBPUSD.c',
    undefined,
    {
      symbol: 'GBPUSD',
      bid: 1.35155,
      ask: 1.35193,
      timestamp: 1777409999,
      receivedAt: 1777410000000,
    },
    1,
  );
  const moved = applyLiveQuoteTickToSnapshot(
    'GBPUSD.c',
    first,
    {
      symbol: 'GBPUSD',
      bid: 1.3517,
      ask: 1.352,
      timestamp: 1777410001,
      receivedAt: 1777410003000,
    },
    2,
  );

  assert.ok(moved);
  assert.equal(moved.symbol, 'GBPUSD');
  assert.equal(moved.prevBid, 1.35155);
  assert.equal(moved.prevAsk, 1.35193);
  assert.equal(moved.lastPriceChangedAt, 1777410003000);
});

test('hasDisplayableLiveQuotePrice keeps stale snapshots renderable when prices exist', () => {
  const staleNow = 1777410100000;
  const staleSnapshot = {
    symbol: 'XAUUSD',
    bid: 3358.14,
    ask: 3358.55,
    lastReceivedAt: staleNow - 46_000,
  };

  assert.equal(hasFreshLiveQuote(staleSnapshot, staleNow), false);
  assert.equal(hasDisplayableLiveQuotePrice(staleSnapshot), true);
});

test('hasDisplayableLiveQuotePrice rejects snapshots without valid bid ask prices', () => {
  assert.equal(hasDisplayableLiveQuotePrice(undefined), false);
  assert.equal(hasDisplayableLiveQuotePrice({ symbol: 'EURUSD', bid: 1.17121 }), false);
  assert.equal(hasDisplayableLiveQuotePrice({ symbol: 'EURUSD', bid: 1.17121, ask: Number.NaN }), false);
});
