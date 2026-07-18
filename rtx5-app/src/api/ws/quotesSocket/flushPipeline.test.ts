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

test('batched quote flush recalculates spread and keeps volume backend-owned', () => {
  resetTradingState();

  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([
      [
        'EURUSD',
        {
          bid: 1.16345,
          ask: 1.16365,
          spread: 0,
          digits: 5,
        },
      ],
    ]),
  };

  flushUpdates(flushState);

  let quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.spread, 20);
  assert.equal(quote.volume, undefined);
  assert.equal(quote.volumeSource, undefined);

  flushState.pendingUpdates = new Map([
    [
      'EURUSD',
      {
        bid: 1.16346,
        ask: 1.16366,
        digits: 5,
        volume: 4407,
      },
    ],
  ]);

  flushUpdates(flushState);

  quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.spread, 20);
  assert.equal(quote.volume, 4407);
  assert.equal(quote.volumeSource, 'backend');

  flushState.pendingUpdates = new Map([
    [
      'EURUSD',
      {
        bid: 1.16347,
        ask: 1.16367,
        digits: 5,
      },
    ],
  ]);

  flushUpdates(flushState);

  quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.volume, 4407);
  assert.equal(quote.volumeSource, 'backend');
});

test('batched quote flush never injects static mock/spec fields', () => {
  resetTradingState();
  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([['EURUSD', {
      bid: 1.1,
      ask: 1.1002,
      transport: 'websocket',
      tradable: true,
    }]]),
  };

  flushUpdates(flushState);
  const quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.transport, 'websocket');
  assert.equal(quote.tradable, true);
  assert.equal(quote.contractSize, undefined);
  assert.equal(quote.swapLong, undefined);
  assert.equal(quote.high, undefined);
  assert.equal(quote.low, undefined);
});

test('batched quote flush discards a queued old-epoch update', () => {
  resetTradingState();
  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    canCommitPendingUpdates: () => false,
    pendingUpdates: new Map([['EURUSD', {
      bid: 1.1,
      ask: 1.1002,
      transport: 'websocket',
      tradable: true,
    }]]),
  };

  flushUpdates(flushState);

  assert.deepEqual(useTradingState.getState().quotes, {});
  assert.equal(flushState.pendingUpdates.size, 0);
});
