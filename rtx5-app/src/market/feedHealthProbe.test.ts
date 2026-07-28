import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAuthenticatedFeedStatusUrl,
  isFeedAuthRejected,
  normalizeConfirmedFeedStatus,
  resolveAuthAcceptedForHealth,
} from './feedHealthProbe';
import {
  feedHealthBlocksSocketConnection,
  initialFeedHealthState,
  reduceFeedHealth,
} from './feedHealthState';

test('confirmed bridge status maps provider/upstream and fresh symbol signals', () => {
  const health = normalizeConfirmedFeedStatus({
    feed_active_source: 'cserver',
    feed_provider: 'primary',
    providers: [{ id: 'primary', connected: true }],
    upstream_connected: true,
    available_symbols: ['EURUSD'],
    symbol_status: [{ symbol: 'EURUSD', fresh: true, stale: false, tradable: true }],
  }, 1000);
  assert.deepEqual(health, {
    observedAt: 1000,
    feedConfigured: true,
    authAccepted: null,
    providerConnected: true,
    upstreamConnected: true,
    marketAvailable: true,
    scheduledMarketClosed: false,
    stale: false,
    degraded: false,
  });
});

test('an unmatched declared provider never inherits an unrelated cserver outage', () => {
  const health = normalizeConfirmedFeedStatus({
    feed_active_source: 'cserver',
    feed_provider: 'rtx5_hub',
    providers: [{ id: 't4b', connected: true }],
    cserver_connected: false,
    upstream_connected: true,
    available_symbols: ['EURUSD'],
    symbol_status: [{ symbol: 'EURUSD', fresh: true, stale: false, tradable: false }],
  }, 1_000);

  assert.equal(health?.providerConnected, null);
  assert.equal(health?.upstreamConnected, true);

  const identity = { brokerId: 'gta_broker', accountLogin: '200009', sessionEpoch: 1 };
  const bound = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: true,
    credentialApproved: true,
    thresholds: null,
  });
  const afterStatus = reduceFeedHealth(bound, {
    type: 'SERVER_STATUS',
    identity,
    health: health!,
  });
  assert.notEqual(afterStatus.status, 'provider_down');
  assert.equal(feedHealthBlocksSocketConnection(afterStatus, identity), false);
});

test('a matching provider row remains authoritative for a real provider outage', () => {
  const health = normalizeConfirmedFeedStatus({
    feed_active_source: 't4b',
    feed_provider: 't4b',
    providers: [{ id: 'T4B', connected: false }],
    cserver_connected: true,
    upstream_connected: true,
    available_symbols: ['EURUSD'],
  }, 1_000);

  assert.equal(health?.providerConnected, false);
});

test('explicit and legacy cserver statuses can still use cserver_connected', () => {
  const explicit = normalizeConfirmedFeedStatus({
    feed_active_source: 'cserver',
    feed_provider: 'cserver',
    cserver_connected: false,
    upstream_connected: true,
    available_symbols: ['EURUSD'],
  }, 1_000);
  const legacy = normalizeConfirmedFeedStatus({
    feed_active_source: 'cserver',
    cserver_connected: true,
    upstream_connected: true,
    available_symbols: ['EURUSD'],
  }, 1_000);

  assert.equal(explicit?.providerConnected, false);
  assert.equal(legacy?.providerConnected, true);
});

test('confirmed bridge status maps only a valid broker health policy', () => {
  const base = {
    feed_active_source: 'cserver',
    providers: [{ id: 'primary', connected: true }],
    feed_provider: 'primary',
    upstream_connected: true,
    available_symbols: ['XAUUSD'],
    symbol_status: [{ symbol: 'XAUUSD', fresh: true, stale: false, tradable: true }],
  };
  const valid = normalizeConfirmedFeedStatus({
    ...base,
    health_policy: {
      local_tick_stale_after_ms: 2_000,
      server_status_stale_after_ms: 90_000,
    },
  }, 1_000);

  assert.deepEqual(valid?.thresholds, {
    localTickStaleAfterMs: 2_000,
    serverStatusStaleAfterMs: 90_000,
  });
  assert.equal(normalizeConfirmedFeedStatus({
    ...base,
    health_policy: {
      local_tick_stale_after_ms: 499,
      server_status_stale_after_ms: 90_000,
    },
  }, 1_000)?.thresholds, undefined);
  assert.equal(normalizeConfirmedFeedStatus({
    ...base,
    health_policy: {
      local_tick_stale_after_ms: '2000',
      server_status_stale_after_ms: 90_000,
    },
  }, 1_000)?.thresholds, undefined);
  assert.equal(normalizeConfirmedFeedStatus(base, 1_000)?.thresholds, undefined);
});

test('unknown payloads and absent market availability remain fail closed', () => {
  assert.equal(normalizeConfirmedFeedStatus({}, 1000), null);
  assert.equal(normalizeConfirmedFeedStatus(null, 1000), null);
  assert.equal(normalizeConfirmedFeedStatus({
    feed_active_source: 'cserver',
    upstream_connected: true,
    available_symbols: ['EURUSD'],
  }, 1000)?.marketAvailable, null);
});

test('auth_accepted tri-state: omit/null/legacy-tokenless-false are not rejections', () => {
  const base = {
    feed_active_source: 'cserver',
    upstream_connected: true,
    available_symbols: ['EURUSD'],
  };
  // No credential presented
  assert.equal(normalizeConfirmedFeedStatus(base, 1000)?.authAccepted, null);
  assert.equal(
    normalizeConfirmedFeedStatus({ ...base, auth_accepted: false }, 1000, {
      credentialPresented: false,
    })?.authAccepted,
    null,
  );
  assert.equal(
    normalizeConfirmedFeedStatus({ ...base, auth_accepted: null }, 1000, {
      credentialPresented: false,
    })?.authAccepted,
    null,
  );
  // Credential presented
  assert.equal(
    normalizeConfirmedFeedStatus({ ...base, auth_accepted: true }, 1000, {
      credentialPresented: true,
    })?.authAccepted,
    true,
  );
  assert.equal(
    normalizeConfirmedFeedStatus({ ...base, auth_accepted: false }, 1000, {
      credentialPresented: true,
    })?.authAccepted,
    false,
  );
});

test('isFeedAuthRejected only when false AND credential was presented', () => {
  assert.equal(isFeedAuthRejected(null, false), false);
  assert.equal(isFeedAuthRejected(undefined, false), false);
  assert.equal(isFeedAuthRejected(false, false), false);
  assert.equal(isFeedAuthRejected(false, true), true);
  assert.equal(isFeedAuthRejected(true, true), false);
  assert.equal(resolveAuthAcceptedForHealth(false, false), null);
  assert.equal(resolveAuthAcceptedForHealth(false, true), false);
  assert.equal(resolveAuthAcceptedForHealth(true, false), true);
});

test('authenticated feed status URL attaches query feed credentials', () => {
  const previousToken = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  const previousBrokerId = process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'env-feed-token';
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = 'myprop-trade';
  try {
    const url = buildAuthenticatedFeedStatusUrl(
      'https://services.myprop.trade/ws/feed/status',
      {
        brokerId: 'myprop-trade',
        feedAuthContext: { mode: 'disabled_unconfigured', reason: 'missing_contract' },
        feedToken: undefined,
        accountLogin: '200002',
      },
    );
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('token'), 'env-feed-token');
    assert.equal(parsed.searchParams.get('broker_id'), 'myprop-trade');
  } finally {
    if (previousToken === undefined) delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    else process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previousToken;
    if (previousBrokerId === undefined) delete process.env.EXPO_PUBLIC_FEED_BROKER_ID;
    else process.env.EXPO_PUBLIC_FEED_BROKER_ID = previousBrokerId;
  }
});

test('authenticated feed status URL uses the declared access-token credential', () => {
  const url = buildAuthenticatedFeedStatusUrl(
    'https://services.broker.test/ws/feed/status',
    {
      brokerId: 'broker-test',
      feedAuthContext: {
        mode: 'query',
        credential: 'access_token',
        tokenQueryParam: 'access_token',
        brokerIdQueryParam: 'broker_id',
      },
      feedToken: 'wrong-feed-token',
      accessToken: 'active-access-token',
    },
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('access_token'), 'active-access-token');
  assert.equal(parsed.searchParams.get('broker_id'), 'broker-test');
});
