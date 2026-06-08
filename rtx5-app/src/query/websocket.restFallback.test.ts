import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildRestQuoteTickEvent } from './restQuoteTick';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

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

test('live symbol REST fallback skips polling while a fresh websocket quote is already in state', () => {
  const source = readSource('src/query/websocket.ts');

  assert.match(
    source,
    /const liveQuote = useTradingState\.getState\(\)\.quotes\[entry\.symbol\];[\s\S]*if \(isFreshLiveQuote\(liveQuote\)\) \{\s*return;\s*\}/,
  );
});
