import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLivePositionPnl, resolveLivePositionPrice, sumLivePositionPnl } from './livePositionMetrics.ts';

test('resolveLivePositionPrice uses bid for buys and ask for sells', () => {
  const buyPrice = resolveLivePositionPrice(
    {
      id: '1001',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.101,
      pnl: 12.5,
      swap: 0,
      openTime: '2026-04-21T10:00:00.000Z',
    },
    { bid: 1.1025, ask: 1.1027 },
  );

  const sellPrice = resolveLivePositionPrice(
    {
      id: '1002',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.099,
      pnl: 10,
      swap: 0,
      openTime: '2026-04-21T10:01:00.000Z',
    },
    { bid: 1.0988, ask: 1.0991 },
  );

  assert.equal(buyPrice, 1.1025);
  assert.equal(sellPrice, 1.0991);
});

test('resolveLivePositionPrice ignores stale quote timestamps', () => {
  const price = resolveLivePositionPrice(
    {
      id: '1003',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.101,
      pnl: 12.5,
      swap: 0,
      openTime: '2026-04-21T10:02:00.000Z',
    },
    { bid: 1.2, ask: 1.2002, lastTickAt: 1 },
  );

  assert.equal(price, 1.101);
});

test('resolveLivePositionPrice uses quotes that are received recently even when feed time is old', () => {
  const price = resolveLivePositionPrice(
    {
      id: '1004',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.101,
      pnl: 12.5,
      swap: 0,
      openTime: '2026-04-21T10:03:00.000Z',
    },
    { bid: 1.2, ask: 1.2002, lastTickAt: 1, lastReceivedAt: Date.now() },
  );

  assert.equal(price, 1.2);
});

test('resolveLivePositionPnl recalculates a buy position from live bid ticks', () => {
  const livePnl = resolveLivePositionPnl(
    {
      id: '2001',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.101,
      pnl: 12.5,
      swap: -0.25,
      commission: -0.1,
      openTime: '2026-04-21T10:00:00.000Z',
    },
    { bid: 1.102, ask: 1.10215 },
  );

  assert.equal(Number(livePnl.toFixed(2)), 25.35);
});

test('resolveLivePositionPnl recalculates a sell position from live ask ticks', () => {
  const livePnl = resolveLivePositionPnl(
    {
      id: '2002',
      symbol: 'GBPUSD',
      side: 'sell',
      volume: 0.2,
      openPrice: 1.29,
      currentPrice: 1.288,
      pnl: 19.4,
      swap: -0.4,
      commission: -0.2,
      openTime: '2026-04-21T10:01:00.000Z',
    },
    { bid: 1.2876, ask: 1.2875 },
  );

  assert.equal(Number(livePnl.toFixed(2)), 24.4);
});

test('sumLivePositionPnl aggregates recalculated row pnl values across symbols', () => {
  const total = sumLivePositionPnl(
    [
      {
        id: '3001',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.1,
        openPrice: 1.1,
        currentPrice: 1.101,
        pnl: 12.5,
        swap: 0,
        openTime: '2026-04-21T10:00:00.000Z',
      },
      {
        id: '3002',
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.2,
        openPrice: 3245.5,
        currentPrice: 3248.1,
        pnl: 47.75,
        swap: -1.25,
        commission: -0.5,
        openTime: '2026-04-21T10:01:00.000Z',
      },
    ],
    {
      EURUSD: { bid: 1.102, ask: 1.10215 },
      XAUUSD: { bid: 3249.8, ask: 3250.1 },
    },
  );

  assert.equal(Number(total.toFixed(2)), 105.12);
});
