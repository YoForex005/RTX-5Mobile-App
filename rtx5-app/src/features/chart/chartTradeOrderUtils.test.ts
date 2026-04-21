import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getChartOrderSide,
  isPendingChartOrderType,
  isPendingChartTradeValid,
  isStopLimitChartOrderType,
  resolveDefaultStopLimitPrice,
  resolveChartTradeFillPolicyLabel,
  supportsChartTradeFillPolicy,
  type ChartOrderType,
} from './chartTradeOrderUtils.ts';

const roundPrice = (value: number) => Number(value.toFixed(5));

test('market execution is not treated as a pending order', () => {
  assert.equal(isPendingChartOrderType('Market Execution'), false);
  assert.equal(isPendingChartOrderType('Buy Limit'), true);
});

test('supportsChartTradeFillPolicy matches MT5 market/limit availability', () => {
  assert.equal(supportsChartTradeFillPolicy('Market Execution'), true);
  assert.equal(supportsChartTradeFillPolicy('Buy Limit'), true);
  assert.equal(supportsChartTradeFillPolicy('Sell Stop Limit'), true);
  assert.equal(supportsChartTradeFillPolicy('Buy Stop'), false);
});

test('stop-limit order detection is strict', () => {
  assert.equal(isStopLimitChartOrderType('Buy Stop Limit'), true);
  assert.equal(isStopLimitChartOrderType('Sell Stop Limit'), true);
  assert.equal(isStopLimitChartOrderType('Buy Stop'), false);
});

test('getChartOrderSide resolves sell-prefixed order types to sell', () => {
  assert.equal(getChartOrderSide('Sell Limit'), 'sell');
  assert.equal(getChartOrderSide('Buy Stop'), 'buy');
});

test('resolveDefaultStopLimitPrice places buy stop-limit below the trigger price', () => {
  assert.equal(resolveDefaultStopLimitPrice('Buy Stop Limit', 1.205, 0.002, roundPrice), 1.203);
  assert.equal(resolveDefaultStopLimitPrice('Sell Stop Limit', 1.205, 0.002, roundPrice), 1.207);
  assert.equal(resolveDefaultStopLimitPrice('Buy Limit', 1.205, 0.002, roundPrice), 0);
});

test('resolveChartTradeFillPolicyLabel normalizes broker metadata to MT5 labels', () => {
  assert.equal(resolveChartTradeFillPolicyLabel({ fillPolicy: 'ioc' }), 'IOC');
  assert.equal(resolveChartTradeFillPolicyLabel({ filling_mode: ['return', 'fok'] }), 'Return');
  assert.equal(resolveChartTradeFillPolicyLabel({ fill_policies: 'book_or_cancel, ioc' }), 'BOC');
  assert.equal(resolveChartTradeFillPolicyLabel(undefined), 'FOK');
});

test('pending order validation matches MT5-style trigger direction rules', () => {
  const sharedInput = {
    bid: 1.2,
    ask: 1.2002,
    pointSize: 0.00001,
  };

  const validCases: Array<{ orderType: ChartOrderType; entryPrice: number; stopLimitPrice?: number }> = [
    { orderType: 'Buy Limit', entryPrice: 1.1998 },
    { orderType: 'Sell Limit', entryPrice: 1.2003 },
    { orderType: 'Buy Stop', entryPrice: 1.2004 },
    { orderType: 'Sell Stop', entryPrice: 1.1999 },
    { orderType: 'Buy Stop Limit', entryPrice: 1.2004, stopLimitPrice: 1.2001 },
    { orderType: 'Sell Stop Limit', entryPrice: 1.1998, stopLimitPrice: 1.2001 },
  ];

  validCases.forEach((input) => {
    assert.equal(isPendingChartTradeValid({ ...sharedInput, ...input }), true, input.orderType);
  });

  const invalidCases: Array<{ orderType: ChartOrderType; entryPrice: number; stopLimitPrice?: number }> = [
    { orderType: 'Buy Limit', entryPrice: 1.2004 },
    { orderType: 'Sell Limit', entryPrice: 1.1998 },
    { orderType: 'Buy Stop', entryPrice: 1.1998 },
    { orderType: 'Sell Stop', entryPrice: 1.2004 },
    { orderType: 'Buy Stop Limit', entryPrice: 1.2004, stopLimitPrice: 1.2005 },
    { orderType: 'Sell Stop Limit', entryPrice: 1.1998, stopLimitPrice: 1.1997 },
  ];

  invalidCases.forEach((input) => {
    assert.equal(isPendingChartTradeValid({ ...sharedInput, ...input }), false, input.orderType);
  });
});
