import assert from 'node:assert/strict';
import test from 'node:test';

import { useTradingState } from '../../../state/tradingState.ts';
import { flushUpdates, type FlushPipelineState } from './flushPipeline.ts';

const resetTradingState = () => {
  useTradingState.setState({
    quotes: {},
    tickCount: 0,
    account: null,
    candles: {},
  });
};

test('batched quote flush lets backend digits correct stale cached precision', () => {
  resetTradingState();

  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12,
    ask: 65001.12,
    digits: 2,
    digitsSource: 'backend',
  });

  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([
      [
        'BTCUSD',
        {
          bid: 65000.12345678,
          ask: 65001.12345678,
          digits: 8,
        },
      ],
    ]),
  };

  flushUpdates(flushState);

  const quote = useTradingState.getState().quotes.BTCUSD;
  assert.equal(quote.digits, 8);
  assert.equal(quote.digitsSource, 'backend');
});
