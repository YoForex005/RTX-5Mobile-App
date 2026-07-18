import assert from 'node:assert/strict';
import test from 'node:test';

import { MARKET_QUOTE_STALE_AFTER_MS } from './quotePolicy';
import {
  recordBlockedPriceAction,
  resolveQuoteActionAvailability,
} from './quoteIntegrity';
import {
  getMarketDataTelemetrySnapshot,
  resetMarketDataTelemetryForTests,
} from './marketDataTelemetry';

const NOW = 1_800_000_000_000;

test('allows only a fresh explicitly tradable websocket quote', () => {
  assert.deepEqual(
    resolveQuoteActionAvailability({
      bid: 1.1,
      ask: 1.1002,
      lastReceivedAt: NOW - 50,
      feedTickAt: NOW - 75,
      transport: 'websocket',
      tradable: true,
    }, NOW),
    { allowed: true, bid: 1.1, ask: 1.1002 },
  );
});

test('REST snapshots and missing transport are never executable', () => {
  const quote = { bid: 1.1, ask: 1.1002, lastReceivedAt: NOW, feedTickAt: NOW, tradable: true } as const;
  assert.equal(resolveQuoteActionAvailability({ ...quote, transport: 'rest_snapshot' }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability(quote, NOW).allowed, false);
});

test('stale, degraded, and non-tradable websocket quotes fail closed', () => {
  const quote = {
    bid: 1.1,
    ask: 1.1002,
    lastReceivedAt: NOW,
    feedTickAt: NOW,
    transport: 'websocket' as const,
    tradable: true,
  };
  assert.equal(resolveQuoteActionAvailability({ ...quote, stale: true }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability({ ...quote, degraded: true }, NOW).allowed, false);
  assert.equal(resolveQuoteActionAvailability({ ...quote, tradable: undefined }, NOW).allowed, false);
  assert.equal(
    resolveQuoteActionAvailability({ ...quote, lastReceivedAt: NOW - MARKET_QUOTE_STALE_AFTER_MS - 1 }, NOW).allowed,
    false,
  );
});

test('fresh receipt time cannot make a missing or stale source timestamp executable', () => {
  const quote = {
    bid: 1.1,
    ask: 1.1002,
    lastReceivedAt: NOW,
    transport: 'websocket' as const,
    tradable: true,
  };

  assert.deepEqual(resolveQuoteActionAvailability(quote, NOW), {
    allowed: false,
    reason: 'stale_quote',
  });
  assert.deepEqual(resolveQuoteActionAvailability({
    ...quote,
    feedTickAt: NOW - MARKET_QUOTE_STALE_AFTER_MS - 1,
  }, NOW), {
    allowed: false,
    reason: 'stale_quote',
  });
  assert.equal(resolveQuoteActionAvailability({
    ...quote,
    feedTickAt: NOW,
    ageMs: MARKET_QUOTE_STALE_AFTER_MS + 1,
  }, NOW).allowed, false);
});

test('blocked price actions emit only the action category and fail-closed reason', () => {
  resetMarketDataTelemetryForTests();
  recordBlockedPriceAction('order_ticket_market_order', {
    allowed: false,
    reason: 'stale_quote',
  });
  const event = getMarketDataTelemetrySnapshot()[0];
  assert.equal(event.name, 'trade_blocked');
  assert.deepEqual(event.details, {
    action: 'order_ticket_market_order',
    reason: 'stale_quote',
    brokerId: undefined,
    sessionEpoch: undefined,
  });
});
