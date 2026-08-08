import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMarketStatusPayload } from './marketStatus';

test('normalizes the live closed payload even when session boundaries are absent', () => {
  assert.deepEqual(
    normalizeMarketStatusPayload({
      symbol: 'XAUUSD',
      status: 'closed',
      quote_open: false,
      trade_open: false,
      server_time: 1_785_000_000,
      message: 'weekend',
    }),
    {
      symbol: 'XAUUSD',
      status: 'closed',
      session_open: undefined,
      session_close: undefined,
      quote_open: false,
      trade_open: false,
      server_time: 1_785_000_000,
      message: 'weekend',
    },
  );
});

test('normalizes broker aliases, milliseconds, numeric booleans, and nested data', () => {
  const normalized = normalizeMarketStatusPayload({
    data: {
      instrument: 'US30.pro',
      marketStatus: 'after-hours',
      quotesOpen: 0,
      tradingOpen: 'false',
      sessionOpen: 1_785_000_000_000,
      closeTime: '1785003600',
      serverTime: '2026-07-25T10:00:00.000Z',
    },
  });

  assert.equal(normalized.symbol, 'US30.pro');
  assert.equal(normalized.status, 'after_hours');
  assert.equal(normalized.quote_open, false);
  assert.equal(normalized.trade_open, false);
  assert.equal(normalized.session_open, 1_785_000_000);
  assert.equal(normalized.session_close, 1_785_003_600);
  assert.equal(normalized.server_time, 1_784_973_600);
});

test('keeps unknown or missing fields unknown instead of guessing a schedule', () => {
  assert.deepEqual(normalizeMarketStatusPayload({}, 'AAPL'), {
    symbol: 'AAPL',
    status: 'unknown',
    session_open: undefined,
    session_close: undefined,
    quote_open: undefined,
    trade_open: undefined,
    server_time: undefined,
    message: undefined,
  });
});
