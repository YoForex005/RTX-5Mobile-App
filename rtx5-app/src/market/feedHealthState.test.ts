import assert from 'node:assert/strict';
import test from 'node:test';

import {
  feedHealthBlocksSocketConnection,
  feedHealthAllowsFreshQuoteFallback,
  feedHealthAllowsPriceActions,
  feedHealthCanSafelyRetry,
  initialFeedHealthState,
  reduceFeedHealth,
  type FeedHealthIdentity,
  type FeedHealthState,
  type NormalizedFeedServerHealth,
} from './feedHealthState';

const identity = (
  brokerId = 'broker-a',
  accountLogin = '1001',
  sessionEpoch = 1,
): FeedHealthIdentity => ({ brokerId, accountLogin, sessionEpoch });

const thresholds = {
  localTickStaleAfterMs: 1_000,
  serverStatusStaleAfterMs: 2_000,
} as const;

const healthyServer = (
  observedAt: number,
  changes: Partial<NormalizedFeedServerHealth> = {},
): NormalizedFeedServerHealth => ({
  observedAt,
  feedConfigured: true,
  authAccepted: true,
  providerConnected: true,
  upstreamConnected: true,
  marketAvailable: true,
  scheduledMarketClosed: false,
  stale: false,
  degraded: false,
  ...changes,
});

const bind = (
  feedIdentity = identity(),
  approvedThresholds: typeof thresholds | null = thresholds,
): FeedHealthState => reduceFeedHealth(initialFeedHealthState, {
  type: 'BIND_SESSION',
  identity: feedIdentity,
  transportConfigured: true,
  credentialApproved: true,
  thresholds: approvedThresholds,
});

test('health is scoped to broker, account, and session epoch', () => {
  const active = bind();
  const wrongBroker = reduceFeedHealth(active, {
    type: 'SERVER_STATUS',
    identity: identity('broker-b'),
    health: healthyServer(1_000),
  });
  const oldEpoch = reduceFeedHealth(active, {
    type: 'LOCAL_TICK',
    identity: identity('broker-a', '1001', 0),
    receivedAt: 1_000,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });

  assert.equal(wrongBroker, active);
  assert.equal(oldEpoch, active);
});

test('fresh server health and a fresh local websocket tick are both required', () => {
  const serverOnly = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(10_000),
  });
  assert.equal(serverOnly.status, 'connecting');
  assert.equal(serverOnly.reasonCategory, 'awaiting_live_tick');

  const healthy = reduceFeedHealth(serverOnly, {
    type: 'LOCAL_TICK',
    identity: identity(),
    receivedAt: 10_100,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });
  assert.equal(healthy.status, 'healthy');
  assert.equal(feedHealthAllowsPriceActions(healthy, 10_500), true);

  const stale = reduceFeedHealth(healthy, {
    type: 'EVALUATE',
    identity: identity(),
    now: 11_100,
  });
  assert.equal(stale.status, 'stale_or_degraded');
  assert.equal(stale.reasonCategory, 'local_tick_stale');
  assert.equal(feedHealthAllowsPriceActions(stale, 11_100), false);
});

test('REST snapshots cannot make the feed healthy', () => {
  const serverHealthy = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(20_000),
  });
  const afterSnapshot = reduceFeedHealth(serverHealthy, {
    type: 'LOCAL_TICK',
    identity: identity(),
    receivedAt: 20_100,
    bid: 10,
    ask: 11,
    transport: 'rest_snapshot',
  });

  assert.equal(afterSnapshot, serverHealthy);
  assert.equal(afterSnapshot.status, 'connecting');
  assert.equal(feedHealthAllowsPriceActions(afterSnapshot, 20_100), false);
});

test('missing backend-approved thresholds fails closed even with server and tick success', () => {
  const withoutPolicy = bind(identity(), null);
  const withServer = reduceFeedHealth(withoutPolicy, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(30_000),
  });
  const withTick = reduceFeedHealth(withServer, {
    type: 'LOCAL_TICK',
    identity: identity(),
    receivedAt: 30_100,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });

  assert.equal(withTick.status, 'stale_or_degraded');
  assert.equal(withTick.reasonCategory, 'health_policy_unconfigured');
  assert.equal(feedHealthAllowsPriceActions(withTick, 30_100), false);
});

test('fresh websocket quotes can use the compatibility gate when health policy is omitted', () => {
  const feedIdentity = identity();
  const withTick = reduceFeedHealth(bind(feedIdentity, null), {
    type: 'LOCAL_TICK',
    identity: feedIdentity,
    receivedAt: 31_000,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });

  assert.equal(withTick.reasonCategory, 'health_policy_unconfigured');
  assert.equal(feedHealthAllowsFreshQuoteFallback(withTick, feedIdentity), true);
  assert.equal(feedHealthAllowsFreshQuoteFallback(withTick, identity('broker-b')), false);
});

test('fresh-quote compatibility never bypasses explicit feed or session failures', () => {
  const feedIdentity = identity();
  const withTick = reduceFeedHealth(bind(feedIdentity, null), {
    type: 'LOCAL_TICK',
    identity: feedIdentity,
    receivedAt: 32_000,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });
  const interrupted = reduceFeedHealth(withTick, {
    type: 'SOCKET_CLOSED',
    identity: feedIdentity,
  });
  const missingCredentials = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity: feedIdentity,
    transportConfigured: true,
    credentialApproved: false,
    thresholds: null,
  });
  const scheduledClose = reduceFeedHealth(withTick, {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(32_100, {
      providerConnected: false,
      upstreamConnected: false,
      marketAvailable: false,
      scheduledMarketClosed: true,
    }),
  });

  assert.equal(feedHealthAllowsFreshQuoteFallback(interrupted, feedIdentity), false);
  assert.equal(feedHealthAllowsFreshQuoteFallback(missingCredentials, feedIdentity), false);
  assert.equal(feedHealthAllowsFreshQuoteFallback(scheduledClose, feedIdentity), false);
  assert.equal(feedHealthAllowsFreshQuoteFallback(bind(feedIdentity), feedIdentity), false);
});

test('confirmed server policy unlocks only after a fresh tradable websocket tick', () => {
  const withoutPolicy = bind(identity(), null);
  const withServerPolicy = reduceFeedHealth(withoutPolicy, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(35_000, { thresholds }),
  });
  assert.deepEqual(withServerPolicy.thresholds, thresholds);
  assert.equal(withServerPolicy.status, 'connecting');
  assert.equal(feedHealthAllowsPriceActions(withServerPolicy, 35_000), false);

  const healthy = reduceFeedHealth(withServerPolicy, {
    type: 'LOCAL_TICK',
    identity: identity(),
    receivedAt: 35_100,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });
  assert.equal(healthy.status, 'healthy');
  assert.equal(feedHealthAllowsPriceActions(healthy, 35_500), true);

  const laterStatusWithoutPolicy = reduceFeedHealth(healthy, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(35_600),
  });
  assert.deepEqual(laterStatusWithoutPolicy.thresholds, thresholds);
});

test('a scheduled market close is not labelled as provider down', () => {
  const scheduledClose = reduceFeedHealth(bind(), {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(40_000, {
      providerConnected: false,
      upstreamConnected: false,
      marketAvailable: false,
      scheduledMarketClosed: true,
    }),
  });

  assert.equal(scheduledClose.status, 'healthy');
  assert.equal(scheduledClose.reasonCategory, 'scheduled_market_closed');
  assert.equal(scheduledClose.marketSchedule, 'scheduled_closed');
  assert.equal(feedHealthAllowsPriceActions(scheduledClose, 40_100), false);
});

test('provider, market, and auth failures stay distinct and preserve last success', () => {
  const withTick = reduceFeedHealth(bind(), {
    type: 'LOCAL_TICK',
    identity: identity(),
    receivedAt: 50_000,
    bid: 10,
    ask: 11,
    transport: 'websocket',
  });
  const providerDown = reduceFeedHealth(withTick, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(50_100, { providerConnected: false }),
  });
  assert.equal(providerDown.status, 'provider_down');
  assert.equal(providerDown.lastSuccessAt, 50_000);
  assert.equal(feedHealthCanSafelyRetry(providerDown), true);

  const marketUnavailable = reduceFeedHealth(providerDown, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(50_200, { marketAvailable: false }),
  });
  assert.equal(marketUnavailable.status, 'market_unavailable');

  const authFailed = reduceFeedHealth(marketUnavailable, {
    type: 'SOCKET_CLOSED',
    identity: identity(),
    authFailure: true,
  });
  assert.equal(authFailed.status, 'auth_failed');
  assert.equal(feedHealthCanSafelyRetry(authFailed), false);

  const genericHealthyStatus = reduceFeedHealth(authFailed, {
    type: 'SERVER_STATUS',
    identity: identity(),
    health: healthyServer(50_300),
  });
  assert.equal(genericHealthyStatus, authFailed);

  const afterCredentialRefresh = reduceFeedHealth(authFailed, {
    type: 'CREDENTIALS_REFRESHED',
    identity: identity(),
  });
  assert.equal(afterCredentialRefresh.status, 'connecting');
  assert.equal(afterCredentialRefresh.serverVerdict, 'unknown');
});

test('missing credentials is fail-closed and cannot be retried with the old session', () => {
  const state = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity: identity(),
    transportConfigured: true,
    credentialApproved: false,
    thresholds,
  });

  assert.equal(state.status, 'auth_failed');
  assert.equal(state.reasonCategory, 'credentials_unavailable');
  assert.equal(feedHealthCanSafelyRetry(state), false);
  assert.equal(feedHealthAllowsPriceActions(state, 1), false);
});

test('confirmed unconfigured and outage health block socket open', () => {
  const feedIdentity = identity();
  const configured = bind(feedIdentity);
  const providerDown = reduceFeedHealth(configured, {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(60_000, { providerConnected: false }),
  });
  const unconfigured = reduceFeedHealth(configured, {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(60_000, { feedConfigured: false }),
  });

  assert.equal(feedHealthBlocksSocketConnection(providerDown, feedIdentity), true);
  assert.equal(feedHealthBlocksSocketConnection(unconfigured, feedIdentity), true);
  assert.equal(feedHealthBlocksSocketConnection(configured, feedIdentity), false);
  assert.equal(feedHealthBlocksSocketConnection(configured, identity('broker-b')), true);
});

test('auth_accepted unknown (null) does not block socket; explicit false does', () => {
  const feedIdentity = identity();
  const configured = bind(feedIdentity);
  const unknownAuth = reduceFeedHealth(configured, {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(80_000, { authAccepted: null }),
  });
  const rejectedAuth = reduceFeedHealth(configured, {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(80_000, { authAccepted: false }),
  });

  // Unknown honesty may be degraded for trade unlock, but must not block WS open.
  assert.equal(feedHealthBlocksSocketConnection(unknownAuth, feedIdentity), false);
  assert.notEqual(unknownAuth.status, 'auth_failed');
  assert.equal(rejectedAuth.status, 'auth_failed');
  assert.equal(feedHealthBlocksSocketConnection(rejectedAuth, feedIdentity), true);
});

test('safe retry preserves the truthful outage until its health probe succeeds', () => {
  const feedIdentity = identity();
  const providerDown = reduceFeedHealth(bind(feedIdentity), {
    type: 'SERVER_STATUS',
    identity: feedIdentity,
    health: healthyServer(70_000, { upstreamConnected: false }),
  });
  const retryRequested = reduceFeedHealth(providerDown, {
    type: 'RETRY_REQUESTED',
    identity: feedIdentity,
  });

  assert.equal(retryRequested, providerDown);
  assert.equal(retryRequested.status, 'provider_down');
  assert.equal(feedHealthCanSafelyRetry(retryRequested), true);
});
