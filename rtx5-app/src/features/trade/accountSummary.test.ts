import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
} from './accountSummary.ts';

test('buildTradeAccountSummary uses authoritative live websocket metrics when present', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 10450,
      equity: 10625.75,
      margin: 212.4,
      margin_free: 10413.35,
      margin_level: 5001.77,
      floating: 175.75,
    },
    {
      balance: 10450,
      credit: 0,
      floating: 9,
      equity: 10459,
      margin: 100,
      freeMargin: 10359,
      marginLevel: 10459,
      currency: 'USD',
    },
  );

  assert.equal(summary.floating, 175.75);
  assert.equal(summary.equity, 10625.75);
  assert.equal(summary.margin, 212.4);
  assert.equal(summary.freeMargin, 10413.35);
  assert.equal(summary.marginLevel, 5001.77);
});

test('buildTradeAccountSummary falls back to stored account data before live metrics hydrate', () => {
  const summary = buildTradeAccountSummary(
    {
      login: 100003,
      balance: 0,
      equity: 0,
      margin: 0,
      margin_free: 0,
      margin_level: 0,
      floating: 0,
    },
    {
      balance: 9800,
      credit: 25,
      floating: -12.5,
      equity: 9787.5,
      margin: 120,
      freeMargin: 9667.5,
      marginLevel: 8156.25,
      currency: 'USD',
    },
  );

  assert.equal(summary.balance, 9800);
  assert.equal(summary.credit, 25);
  assert.equal(summary.floating, -12.5);
  assert.equal(summary.equity, 9787.5);
  assert.equal(summary.margin, 120);
  assert.equal(summary.freeMargin, 9667.5);
  assert.equal(summary.marginLevel, 8156.25);
});

test('resolveTradeFloatingPnl uses the synced open-position total for the active login', () => {
  const floating = resolveTradeFloatingPnl(
    175.75,
    [
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
      {
        id: '1002',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.2,
        openPrice: 1.29,
        currentPrice: 1.288,
        pnl: -4.25,
        swap: 0,
        openTime: '2026-04-21T10:01:00.000Z',
      },
    ],
    '100003',
    100003,
    {
      EURUSD: { bid: 1.101, ask: 1.10115 },
      GBPUSD: { bid: 1.28815, ask: 1.288 },
    },
  );

  assert.equal(floating, 8.25);
});

test('resolveTradeFloatingPnl keeps the live account floating value until positions sync for the active login', () => {
  const floating = resolveTradeFloatingPnl(
    175.75,
    [
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
    ],
    null,
    100003,
  );

  assert.equal(floating, 175.75);
});

test('resolveRenderableTradeAccountSummary derives equity, free margin, and margin level from fresher floating pnl', () => {
  const summary = resolveRenderableTradeAccountSummary(
    {
      balance: 9800,
      credit: 25,
      floating: -12.5,
      equity: 9787.5,
      margin: 120,
      freeMargin: 9667.5,
      marginLevel: 8156.25,
      currency: 'USD',
    },
    18.75,
  );

  assert.equal(summary.floating, 18.75);
  assert.equal(summary.equity, 9843.75);
  assert.equal(summary.freeMargin, 9723.75);
  assert.equal(summary.marginLevel, 8203.125);
});
