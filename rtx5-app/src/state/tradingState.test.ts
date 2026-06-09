import assert from 'node:assert/strict';
import test from 'node:test';

import { useTradingState } from './tradingState.ts';

const resetTradingState = () => {
  useTradingState.setState({
    quotes: {},
    tickCount: 0,
    account: null,
    candles: {},
  });
};

test('backend quote digits replace stale cached quote precision', () => {
  resetTradingState();

  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12,
    ask: 65001.12,
    digits: 2,
    digitsSource: 'backend',
  });
  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12345678,
    ask: 65001.12345678,
    digits: 8,
    digitsSource: 'backend',
  });

  const quote = useTradingState.getState().quotes.BTCUSD;
  assert.equal(quote.digits, 8);
  assert.equal(quote.digitsSource, 'backend');
});
