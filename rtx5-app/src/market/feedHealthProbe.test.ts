import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAuthenticatedFeedStatusUrl,
  isFeedAuthRejected,
  normalizeConfirmedFeedStatus,
  resolveAuthAcceptedForHealth,
} from './feedHealthProbe';

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
  const previous = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'env-feed-token';
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = '';
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
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    else process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previous;
  }
});
