import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendFeedAuthToWsUrl,
  extractFeedBrokerToken,
  resolveConfiguredFeedBrokerToken,
  resolveConfiguredFeedBrokerTokenForBroker,
  redactFeedAuthFromWsUrl,
} from './feedAuth';

test('extractFeedBrokerToken reads common response fields and nested feed auth', () => {
  assert.equal(
    extractFeedBrokerToken({ feed_broker_token: ' [redacted-feed-token-1] ' }),
    '[redacted-feed-token-1]',
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
