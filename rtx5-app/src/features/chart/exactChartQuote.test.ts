import assert from 'node:assert/strict';
import test from 'node:test';

import { captureExactChartQuote, readExactChartQuoteForScope } from './exactChartQuote';

test('preserves divergent backend Bid and Ask exactly', () => {
  const snapshot = captureExactChartQuote('broker-a:200002:XAUUSD', {
    bid: 4341.49,
    ask: 4341.66,
    timestamp: 1_785_000_000_000,
    receivedAt: 1_785_000_000_100,
    transport: 'websocket',
  });

  assert.equal(snapshot?.bid, 4341.49);
  assert.equal(snapshot?.ask, 4341.66);
  assert.equal(snapshot?.feedTickAt, 1_785_000_000_000);
});

test('rejects missing, invalid, crossed, or synthesized one-sided prices', () => {
  assert.equal(captureExactChartQuote('scope', { bid: 100 }), null);
  assert.equal(captureExactChartQuote('scope', { ask: 102 }), null);
  assert.equal(captureExactChartQuote('scope', { bid: 0, ask: 1 }), null);
  assert.equal(captureExactChartQuote('scope', { bid: 102, ask: 100 }), null);
});

test('never leaks retained prices between broker/account/symbol scopes', () => {
  const brokerA = captureExactChartQuote('broker-a:200002:BTCUSD', { bid: 100, ask: 102 });
  assert.equal(readExactChartQuoteForScope('broker-a:200002:BTCUSD', brokerA)?.bid, 100);
  assert.equal(readExactChartQuoteForScope('broker-b:200002:BTCUSD', brokerA), null);
  assert.equal(readExactChartQuoteForScope('broker-a:200002:XAUUSD', brokerA), null);
});
