import assert from 'node:assert/strict';
import test from 'node:test';

import type { PositionItem } from '../mock/tradingData.ts';
import { mapPositionToItem } from './positionsMapper.ts';

test('mapPositionToItem merges partial websocket updates into the existing position', () => {
  const existing: PositionItem = {
    id: '50123',
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 0.2,
    openPrice: 3245.5,
    currentPrice: 3248.1,
    pnl: 47.75,
    swap: -1.25,
    commission: -0.5,
    openTime: '2026-04-11T10:00:00.000Z',
    sl: 3230,
    tp: 3270,
  };

  const mapped = mapPositionToItem(
    {
      ticket: 50123,
      profit: 61.5,
      price_current: 3249.8,
    },
    existing,
  );

  assert.equal(mapped.id, '50123');
  assert.equal(mapped.symbol, 'XAUUSD');
  assert.equal(mapped.volume, 0.2);
  assert.equal(mapped.openPrice, 3245.5);
  assert.equal(mapped.currentPrice, 3249.8);
  assert.equal(mapped.swap, -1.25);
  assert.equal(mapped.commission, -0.5);
  assert.equal(mapped.pnl, 59.75);
  assert.equal(mapped.sl, 3230);
  assert.equal(mapped.tp, 3270);
});

test('mapPositionToItem builds stable ids for fresh positions without random fallbacks', () => {
  const mapped = mapPositionToItem({
    symbol: 'EURUSD',
    side: 'sell',
    volume: 0.1,
    price_open: 1.135,
    price_current: 1.1335,
    profit: 15,
    time_create: 1775901600,
  });

  assert.equal(mapped.id, 'pos_EURUSD_sell_1775901600_0.1_1.135');
  assert.equal(mapped.symbol, 'EURUSD');
  assert.equal(mapped.side, 'sell');
  assert.equal(mapped.pnl, 15);
});

test('mapPositionToItem normalizes broker symbols and common live update aliases', () => {
  const mapped = mapPositionToItem({
    ticket: 801,
    symbol: 'XAUUSDm',
    side: 'BUY',
    volume: '0.2',
    open_price: '3245.5',
    current_price: '3249.8',
    pnl: '61.5',
    time_create: 1775901600,
  });

  assert.equal(mapped.id, '801');
  assert.equal(mapped.symbol, 'XAUUSD');
  assert.equal(mapped.side, 'buy');
  assert.equal(mapped.openPrice, 3245.5);
  assert.equal(mapped.currentPrice, 3249.8);
  assert.equal(mapped.pnl, 61.5);
});
