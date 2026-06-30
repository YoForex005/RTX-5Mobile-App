import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendFeedAuthToWsUrl,
  extractFeedBrokerToken,
  redactFeedAuthFromWsUrl,
  resolveConfiguredFeedBrokerTokenForBroker,
  stripFeedAuthQueryFromWsUrl,
} from './feedAuth';

test('extractFeedBrokerToken reads common response fields and nested feed auth', () => {
  assert.equal(
    extractFeedBrokerToken({ feed_broker_token: ' feed-token-1 ' }),
    'feed-token-1',
  );
  assert.equal(
    extractFeedBrokerToken({ feed: { token: 'ignored', feedToken: 'feed-token-2' } }),
    'feed-token-2',
  );
  assert.equal(
    extractFeedBrokerToken({ marketData: { brokerFeedToken: 'feed-token-3' } }),
    'feed-token-3',
  );
});

test('appendFeedAuthToWsUrl adds broker_id and token while replacing stale auth params', () => {
  assert.equal(
    appendFeedAuthToWsUrl(
      'wss://services.myprop.trade/ws/feed?broker_id=old&token=old&foo=1',
      'myprop-trade',
      'a b/c+d=e&f',
    ),
    'wss://services.myprop.trade/ws/feed?foo=1&broker_id=myprop-trade&token=a%20b%2Fc%2Bd%3De%26f',
  );
});

test('appendFeedAuthToWsUrl keeps broker_id when feed token is not required', () => {
  assert.equal(
    appendFeedAuthToWsUrl(
      'wss://testbrokerbackend.orrnn.com/ws/feed?token=old',
      'testorrnn',
      '',
    ),
    'wss://testbrokerbackend.orrnn.com/ws/feed?broker_id=testorrnn',
  );
});

test('redactFeedAuthFromWsUrl hides only the token value', () => {
  assert.equal(
    redactFeedAuthFromWsUrl('wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=secret&foo=1'),
    'wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=***&foo=1',
  );
});

test('stripFeedAuthQueryFromWsUrl returns the socket base for broker-feed comparison', () => {
  assert.equal(
    stripFeedAuthQueryFromWsUrl('wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=secret'),
    'wss://services.myprop.trade/ws/feed',
  );
});

test('resolveConfiguredFeedBrokerTokenForBroker scopes env token to configured broker id', () => {
  const previousId = process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  const previousToken = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = 'myprop-trade';
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'secret-feed-token';

  try {
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'), 'secret-feed-token');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('other-broker'), '');
  } finally {
    if (previousId === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_ID;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_ID = previousId;
    }
    if (previousToken === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previousToken;
    }
  }
});

test('resolveConfiguredFeedBrokerTokenForBroker applies env token to any broker when no broker id is configured', () => {
  const previousId = process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  const previousToken = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  delete process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = 'global-feed-token';

  try {
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'), 'global-feed-token');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('other-broker'), 'global-feed-token');
  } finally {
    if (previousId === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_ID;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_ID = previousId;
    }
    if (previousToken === undefined) {
      delete process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
    } else {
      process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = previousToken;
    }
  }
});
