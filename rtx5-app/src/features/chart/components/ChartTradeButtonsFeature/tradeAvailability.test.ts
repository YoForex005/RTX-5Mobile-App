import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveChartTradeActionDisabled } from './tradeAvailability';

test('one-click off still disables Buy and Sell when symbol data is stale', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: false,
    quoteActionAllowed: false,
  }), true);
});

test('one-click market disables Buy and Sell without an executable quote', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: true,
    quoteActionAllowed: false,
  }), true);
});

test('current symbol with a fresh executable quote stays enabled', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: true,
    oneClickAccepted: true,
    quoteActionAllowed: true,
  }), false);
});

test('a stale rendered chart symbol cannot launch or execute a trade', () => {
  assert.equal(resolveChartTradeActionDisabled({
    isCurrentChartSymbol: false,
    oneClickAccepted: false,
    quoteActionAllowed: true,
  }), true);
});
