import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBrokerFeedStatusUrl,
  extractActiveFeedSymbols,
} from './feedStatus';

test('buildBrokerFeedStatusUrl uses broker domain and broker_id only', () => {
  assert.equal(
    buildBrokerFeedStatusUrl('https://services.myprop.trade/api/v2', 'myprop'),
    'https://services.myprop.trade/ws/feed/status?broker_id=myprop',
  );
  assert.equal(buildBrokerFeedStatusUrl('https://backend.orrnn.com/api/v2', 'myprop'), '');
  assert.equal(buildBrokerFeedStatusUrl('http://69.197.178.27:8090', 'myprop'), '');
  assert.equal(buildBrokerFeedStatusUrl('https://services.myprop.trade', ''), '');
});

test('extractActiveFeedSymbols prefers fresh symbol_status rows', () => {
  assert.deepEqual(
    extractActiveFeedSymbols({
      symbol_status: {
        XAUUSD: { has_quote: true, last_tick_age_sec: 0.2, silent: false },
        BTCUSD: { has_quote: true, last_tick_age_sec: 120, silent: false },
        EURUSD: { status: 'silent', last_bid: 1.1, last_tick_age_sec: 1 },
        GBPUSD: { status: 'silent', last_tick_age_sec: 1 },
      },
    }),
    ['XAUUSD', 'EURUSD'],
  );
});

test('extractActiveFeedSymbols falls back to available minus silent symbols', () => {
  assert.deepEqual(
    extractActiveFeedSymbols({
      available_symbols: ['XAUUSD', 'EURUSD', 'BTCUSD'],
      silent_symbols: ['BTCUSD'],
    }),
    ['XAUUSD', 'EURUSD'],
  );
});
