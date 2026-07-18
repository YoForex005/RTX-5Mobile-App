import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFeedHealthBannerModel } from './feedHealthPresentation';
import { initialFeedHealthState, reduceFeedHealth } from './feedHealthState';

const identity = { brokerId: 'myprop-trade', accountLogin: '1001', sessionEpoch: 7 } as const;

test('provider outage presentation is broker-scoped, critical, and retryable', () => {
  const bound = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: true,
    credentialApproved: true,
    thresholds: { localTickStaleAfterMs: 1_000, serverStatusStaleAfterMs: 2_000 },
  });
  const withTick = reduceFeedHealth(bound, {
    type: 'LOCAL_TICK',
    identity,
    receivedAt: 1_000,
    bid: 1,
    ask: 2,
    transport: 'websocket',
  });
  const providerDown = reduceFeedHealth(withTick, {
    type: 'SERVER_STATUS',
    identity,
    health: {
      observedAt: 1_100,
      feedConfigured: true,
      authAccepted: true,
      providerConnected: false,
      upstreamConnected: true,
      marketAvailable: true,
      scheduledMarketClosed: false,
      stale: false,
      degraded: false,
    },
  });

  const providerBanner = buildFeedHealthBannerModel(providerDown, 'myprop-trade');
  // UI banners are suppressed on all surfaces; model still carries copy for diagnostics.
  assert.equal(providerBanner.visible, false);
  assert.equal(providerBanner.tone, 'critical');
  assert.equal(providerBanner.title, 'Market Data Unavailable');
  assert.equal(providerBanner.brokerLabel, 'Myprop Trade');
  assert.equal(providerBanner.reasonLabel, 'Broker market-data provider is offline');
  assert.equal(providerBanner.lastSuccessAt, 1_000);
  assert.equal(providerBanner.canRetry, true);
});

test('auth failure is unavailable but deliberately has no unsafe retry', () => {
  const authFailed = reduceFeedHealth(
    reduceFeedHealth(initialFeedHealthState, {
      type: 'BIND_SESSION',
      identity,
      transportConfigured: true,
      credentialApproved: true,
    }),
    { type: 'SOCKET_CLOSED', identity, authFailure: true },
  );
  const banner = buildFeedHealthBannerModel(authFailed, 'myprop-trade');

  assert.equal(banner.visible, false);
  assert.equal(banner.title, 'Market Data Unavailable');
  assert.equal(banner.reasonLabel, 'Broker rejected feed authentication');
  assert.equal(banner.canRetry, false);
});

test('healthy feed does not render an outage banner', () => {
  const syntheticHealthy = {
    ...initialFeedHealthState,
    identity,
    status: 'healthy' as const,
    reasonCategory: 'awaiting_live_tick' as const,
    transportConfigured: true,
    credentialApproved: true,
  };

  assert.equal(buildFeedHealthBannerModel(syntheticHealthy, 'myprop-trade').visible, false);
});

test('disabled feed auth contract keeps diagnostic reason but never shows UI banner', () => {
  const unconfigured = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: false,
    credentialApproved: false,
  });
  const missingContract = buildFeedHealthBannerModel(unconfigured, 'myprop-trade', {
    mode: 'disabled_unconfigured',
    reason: 'missing_contract',
  });
  const missingCredential = buildFeedHealthBannerModel(unconfigured, 'myprop-trade', {
    mode: 'disabled_unconfigured',
    reason: 'missing_credential',
  });

  assert.equal(missingContract.visible, false);
  assert.match(missingContract.reasonLabel, /feed_auth_context/);
  assert.equal(missingCredential.visible, false);
  assert.match(missingCredential.reasonLabel, /Feed token missing/);
});

test('health_policy_unconfigured never shows the Prices Delayed banner', () => {
  const bound = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: true,
    credentialApproved: true,
    // thresholds omitted → health_policy_unconfigured after tick
  });
  const withTick = reduceFeedHealth(bound, {
    type: 'LOCAL_TICK',
    identity,
    receivedAt: 1_000,
    bid: 1,
    ask: 2,
    transport: 'websocket',
  });
  const banner = buildFeedHealthBannerModel(withTick, 'myprop-trade');
  assert.equal(withTick.reasonCategory, 'health_policy_unconfigured');
  assert.equal(banner.visible, false);
  assert.equal(banner.reasonLabel, 'Feed health policy is awaiting approval');
});
