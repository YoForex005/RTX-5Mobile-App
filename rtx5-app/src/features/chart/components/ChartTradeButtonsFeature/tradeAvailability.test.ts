import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveChartTradeActionDisabled } from './tradeAvailability';

test('one-click off keeps Buy and Sell available to open New Order without a live quote', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: false,
    quoteActionAllowed: false,
  }), false);
});

test('one-click market stays pressable without a live quote (handler fail-closes, tiles stay bright)', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: true,
    quoteActionAllowed: false,
  }), false);
});

test('a stale rendered chart symbol cannot launch or execute a trade', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: false,
    oneClickAccepted: false,
    quoteActionAllowed: true,
  }), true);
});
