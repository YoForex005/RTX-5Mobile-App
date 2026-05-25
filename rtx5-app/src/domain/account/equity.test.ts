import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContractSizeMap,
  calculateEquityFromTick,
} from './equity';
import type { PositionItem } from '../../dev/mock/tradingData';

const basePosition: PositionItem = {
  id: '1',
  symbol: 'EURUSD',
  side: 'buy',
  volume: 1,
  openPrice: 1.1,
  currentPrice: 1.1,
  pnl: 0,
  swap: 0,
  openTime: '2026.01.01 00:00:00',
};

test('calculateEquityFromTick applies buy direction and contract size', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [basePosition],
    tick: { symbol: 'EURUSD', price: 1.101 },
    contractSizes: buildContractSizeMap([{ symbol: 'EURUSD', contractSize: 100000 }]),
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1100);
});

test('calculateEquityFromTick applies sell direction', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [{ ...basePosition, side: 'sell' }],
    tick: { symbol: 'EURUSD', price: 1.099 },
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1100);
});

test('calculateEquityFromTick preserves other-symbol pnl values', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [
      basePosition,
      { ...basePosition, id: '2', symbol: 'GBPUSD', pnl: 25 },
    ],
    tick: { symbol: 'EURUSD', price: 1.101 },
  });

  assert.equal(Math.round(result.floating), 125);
  assert.equal(Math.round(result.equity), 1125);
});
