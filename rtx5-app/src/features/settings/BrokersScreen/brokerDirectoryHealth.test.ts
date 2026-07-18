import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS,
  BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS,
  classifyBrokerDirectoryHealth,
} from './brokerDirectoryHealth';

const connected = {
  feed_active_source: 'cserver',
  providers: [{ id: 'primary', connected: true }],
  feed_provider: 'primary',
  upstream_connected: true,
  available_symbols: ['EURUSD'],
  symbol_status: [{ symbol: 'EURUSD', fresh: true, stale: false, tradable: true }],
};

test('directory broker health never labels provider reachability as live without policy confirmation', () => {
  assert.deepEqual(classifyBrokerDirectoryHealth(connected, 1_000), {
    state: 'provider_online_unverified',
    label: 'Provider online · policy unverified',
  });
});

test('directory broker health is broker-status-specific and fail closed', () => {
  assert.equal(classifyBrokerDirectoryHealth({ ...connected, upstream_connected: false }, 1_000).state, 'provider_down');
  // Directory probes are tokenless: legacy auth_accepted:false is unknown, not auth_failed.
  assert.equal(
    classifyBrokerDirectoryHealth({ ...connected, auth_accepted: false }, 1_000).state,
    'provider_online_unverified',
  );
  assert.equal(classifyBrokerDirectoryHealth({ ...connected, scheduled_market_closed: true }, 1_000).state, 'market_closed');
  assert.equal(classifyBrokerDirectoryHealth({
    ...connected,
    auth_accepted: true,
    market_available: true,
  }, 1_000).state, 'healthy');
  assert.equal(classifyBrokerDirectoryHealth({}, 1_000).state, 'unavailable');
});

test('directory badge observations refresh and expire on a bounded cadence', () => {
  assert.equal(BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS, 30_000);
  assert.equal(BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS, 45_000);
  assert.ok(
    BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS >
      BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS,
  );
  assert.ok(
    BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS <=
      BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS * 2,
  );
});
