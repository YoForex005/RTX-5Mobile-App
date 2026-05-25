import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRestQuoteTickEvent } from './restQuoteTick';

test('buildRestQuoteTickEvent normalizes a REST quote snapshot for live chart use', () => {
  const receivedAt = 1_764_059_100_000;
  const tick = buildRestQuoteTickEvent(
    'BTCUSD',
    {
      symbol: 'BTCUSD',
      bid: 77522.17,
      ask: 77528.5,
      digits: 2,
      volume: 4407,
      updatedAt: '2026-05-25T10:40:00.000Z',
    },
    receivedAt,
  );

  assert.ok(tick);
  assert.equal(tick.symbol, 'BTCUSD');
  assert.equal(tick.bid, 77522.17);
  assert.equal(tick.ask, 77528.5);
  assert.equal(tick.digits, 2);
  assert.equal(tick.volume, 4407);
  assert.equal(tick.receivedAt, receivedAt);
  assert.equal(tick.feedTickAt, Date.parse('2026-05-25T10:40:00.000Z'));
});

test('buildRestQuoteTickEvent rejects snapshots without a usable bid/ask pair', () => {
  assert.equal(
    buildRestQuoteTickEvent('BTCUSD', { symbol: 'BTCUSD', bid: 77522.17 }, 1_764_059_100_000),
    null,
  );
});
