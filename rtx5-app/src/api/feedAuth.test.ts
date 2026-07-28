import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendFeedAuthToWsUrl,
  extractFeedBrokerToken,
  resolveConfiguredFeedBrokerToken,
  resolveConfiguredFeedBrokerTokenForBroker,
  redactFeedAuthFromWsUrl,
} from './feedAuth';

const FEED_ENV_KEYS = [
  'EXPO_PUBLIC_FEED_BROKER_TOKEN',
  'EXPO_PUBLIC_BROKER_FEED_TOKEN',
  'EXPO_PUBLIC_WS_FEED_TOKEN',
  'EXPO_PUBLIC_FEED_TOKEN',
  'EXPO_PUBLIC_FEED_BROKER_ID',
  'EXPO_PUBLIC_BROKER_FEED_ID',
  'EXPO_PUBLIC_MYPROP_FEED_BROKER_ID',
  'EXPO_PUBLIC_ACHIEVER_FEED_TOKEN',
  'EXPO_PUBLIC_ACHIEVER_FINANCIALS_FEED_TOKEN',
  'EXPO_PUBLIC_GTA_FEED_TOKEN',
  'EXPO_PUBLIC_GROW_TRADING_ACADEMY_FEED_TOKEN',
  'EXPO_PUBLIC_MYPROP_FEED_TOKEN',
] as const;

const withFeedEnv = (
  overrides: Partial<Record<(typeof FEED_ENV_KEYS)[number], string>>,
  run: () => void,
): void => {
  const previous = new Map(
    FEED_ENV_KEYS.map((key) => [key, process.env[key]] as const),
  );
  for (const key of FEED_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of FEED_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('extractFeedBrokerToken reads common response fields and nested feed auth', () => {
  assert.equal(
    extractFeedBrokerToken({ feed_broker_token: ' [redacted-feed-token-1] ' }),
    ' [redacted-feed-token-1] ',
  );
  assert.equal(
    extractFeedBrokerToken({ feed: { token: '[ignored-redacted]', feedToken: '[redacted-feed-token-2]' } }),
    '[redacted-feed-token-2]',
  );
  assert.equal(
    extractFeedBrokerToken({ marketData: { brokerFeedToken: '[redacted-feed-token-3]' } }),
    '[redacted-feed-token-3]',
  );
});

test('appendFeedAuthToWsUrl adds broker_id and token while replacing stale auth params', () => {
  const nextUrl = appendFeedAuthToWsUrl(
    'wss://services.myprop.trade/ws/feed?broker_id=old&token=stale&foo=1',
    'myprop-trade',
    'env-feed-token',
  );
  const parsed = new URL(nextUrl);

  assert.equal(`${parsed.protocol}//${parsed.host}${parsed.pathname}`, 'wss://services.myprop.trade/ws/feed');
  assert.equal(parsed.searchParams.get('foo'), '1');
  assert.equal(parsed.searchParams.get('broker_id'), 'myprop-trade');
  assert.equal(parsed.searchParams.get('token'), 'env-feed-token');
});

test('feed token is preserved verbatim before URLSearchParams encoding', () => {
  const parsed = new URL(appendFeedAuthToWsUrl(
    'wss://service.example/ws/feed',
    'broker-a',
    '  opaque+token==  ',
  ));
  assert.equal(parsed.searchParams.get('token'), '  opaque+token==  ');
});

test('redactFeedAuthFromWsUrl hides only the token value', () => {
  assert.equal(
    redactFeedAuthFromWsUrl('wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=secret&foo=1'),
    'wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=***&foo=1',
  );
});

test('configured feed token helpers are exported for env fallback', () => {
  assert.equal(typeof resolveConfiguredFeedBrokerToken, 'function');
  assert.equal(typeof resolveConfiguredFeedBrokerTokenForBroker, 'function');
});

test('generic env token fails closed without an exact broker-id lock', () => {
  withFeedEnv({
    EXPO_PUBLIC_FEED_BROKER_TOKEN: 'myprop-only-token',
  }, () => {
    assert.equal(resolveConfiguredFeedBrokerToken(), 'myprop-only-token');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'), '');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('achiever-financials'), '');
  });
});

test('generic env token is returned only for its exact locked broker', () => {
  withFeedEnv({
    EXPO_PUBLIC_FEED_BROKER_TOKEN: 'myprop-only-token',
    EXPO_PUBLIC_FEED_BROKER_ID: 'myprop-trade',
  }, () => {
    assert.equal(
      resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'),
      'myprop-only-token',
    );
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('achiever-financials'), '');
  });
});

test('Achiever never consumes public env aliases while other broker aliases stay scoped', () => {
  withFeedEnv({
    EXPO_PUBLIC_MYPROP_FEED_TOKEN: 'myprop-specific-token',
    EXPO_PUBLIC_ACHIEVER_FEED_TOKEN: 'achiever-specific-token',
  }, () => {
    assert.equal(
      resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'),
      'myprop-specific-token',
    );
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('achiever-financials'), '');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('gta_broker'), '');
  });
});

test('even an Achiever-locked generic public token is rejected', () => {
  withFeedEnv({
    EXPO_PUBLIC_FEED_BROKER_TOKEN: 'forbidden-static-achiever-token',
    EXPO_PUBLIC_FEED_BROKER_ID: 'achiever-financials',
  }, () => {
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('achiever-financials'), '');
  });
});
