import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMergedPositions,
  dedupePositionsById,
  isTerminalPositionUpdate,
  shouldClearPositionsForLoginSwitch,
} from './positionsState.helpers.ts';

test('shouldClearPositionsForLoginSwitch only clears when the account really changed', () => {
  assert.equal(shouldClearPositionsForLoginSwitch(null, '2001'), false);
  assert.equal(shouldClearPositionsForLoginSwitch('2001', '2001'), false);
  assert.equal(shouldClearPositionsForLoginSwitch('2001', '2002'), true);
});

test('buildMergedPositions replaces missing positions from a fresh snapshot so closed trades disappear', () => {
  const merged = buildMergedPositions(
    [
      {
        id: '301',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 4,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
      },
      {
        id: '302',
        symbol: 'EURUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 1.102,
        currentPrice: 1.101,
        pnl: 7,
        swap: 0,
        openTime: '2026-04-16T10:01:00.000Z',
      },
    ],
    [
      {
        ticket: 302,
        symbol: 'EURUSD',
        side: 'sell',
        volume: 0.2,
        price_open: 1.102,
        price_current: 1.1005,
        profit: 14,
        swap: 0,
        commission: 0,
        time_create: 1_775_000_100,
      },
    ],
  );

  assert.deepEqual(merged.map((position) => position.id), ['302']);
  assert.equal(merged[0]?.currentPrice, 1.1005);
});

test('buildMergedPositions preserves recent optimistic positions that are still waiting for backend confirmation', () => {
  const optimisticCreatedAt = Date.now() - 5000;

  const merged = buildMergedPositions(
    [
      {
        id: '401',
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.3,
        openPrice: 3240,
        currentPrice: 3241,
        pnl: 15,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
        clientCreatedAt: optimisticCreatedAt,
      },
    ],
    [],
  );

  assert.deepEqual(merged.map((position) => position.id), ['401']);
});

test('dedupePositionsById keeps the newest optimistic row when a ticket collides', () => {
  const firstCreatedAt = Date.now();
  const deduped = dedupePositionsById([
    {
      id: '1774502954924',
      symbol: 'GBPUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.342,
      currentPrice: 1.342,
      pnl: 0,
      swap: 0,
      openTime: '2026-05-20T14:27:53.000Z',
      clientCreatedAt: firstCreatedAt,
    },
    {
      id: '1774502954924',
      symbol: 'GBPUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.341,
      currentPrice: 1.341,
      pnl: 0,
      swap: 0,
      openTime: '2026-05-20T14:27:52.000Z',
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, '1774502954924');
  assert.equal(deduped[0]?.clientCreatedAt, firstCreatedAt);
});

test('buildMergedPositions deduplicates duplicate ticket records from websocket snapshots', () => {
  const merged = buildMergedPositions(
    [],
    [
      {
        order_ticket: 1774502954924,
        symbol: 'GBPUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.3419,
        price_current: 1.3421,
        profit: 0,
        time_create: 1_779_285_473,
      },
      {
        position_ticket: 1774502954924,
        symbol: 'GBPUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.3419,
        price_current: 1.3421,
        profit: 0,
        time_create: 1_779_285_473,
      },
    ],
  );

  assert.deepEqual(merged.map((position) => position.id), ['1774502954924']);
});

test('buildMergedPositions can merge scoped websocket batches without dropping other symbols', () => {
  const merged = buildMergedPositions(
    [
      {
        id: '601',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 4,
        swap: 0,
        openTime: '2026-04-16T10:00:00.000Z',
      },
      {
        id: '602',
        symbol: 'XAUUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 3245,
        currentPrice: 3241,
        pnl: 80,
        swap: 0,
        openTime: '2026-04-16T10:01:00.000Z',
      },
    ],
    [
      {
        ticket: 601,
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        price_open: 1.1,
        price_current: 1.102,
        profit: 20,
        swap: 0,
        commission: 0,
        time_create: 1_775_000_000,
      },
    ],
    { preserveMissingExisting: true },
  );

  assert.deepEqual(merged.map((position) => position.id).sort(), ['601', '602']);
  assert.equal(merged.find((position) => position.id === '601')?.currentPrice, 1.102);
  assert.equal(merged.find((position) => position.id === '602')?.symbol, 'XAUUSD');
});

test('buildMergedPositions does not create visible placeholder positions from symbol-less updates', () => {
  const merged = buildMergedPositions(
    [],
    [
      {
        ticket: 701,
        profit: 11.5,
      },
    ],
    { preserveMissingExisting: true },
  );

  assert.deepEqual(merged, []);
});

test('isTerminalPositionUpdate detects close-like lifecycle payloads so stale trades can be removed immediately', () => {
  assert.equal(isTerminalPositionUpdate({ ticket: 501, status: 'closed' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 502, action: 'closed_by' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 503, event: 'position.close' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 504, event: 'sl_hit' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 505, status: 'open' }), false);
});
