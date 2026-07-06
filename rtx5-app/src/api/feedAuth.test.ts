import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  appendFeedAuthToWsUrl,
  extractFeedBrokerToken,
  redactFeedAuthFromWsUrl,
  resolveConfiguredFeedBrokerTokenForBroker,
  stripFeedAuthQueryFromWsUrl,
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
    'wss://services.myprop.trade/ws/feed?broker_id=old&token=***&foo=1',
    'myprop-trade',
    '[redacted feed token]',
  );
  const parsed = new URL(nextUrl);

  assert.equal(`${parsed.protocol}//${parsed.host}${parsed.pathname}`, 'wss://services.myprop.trade/ws/feed');
  assert.equal(parsed.searchParams.get('foo'), '1');
  assert.equal(parsed.searchParams.get('broker_id'), 'myprop-trade');
  assert.equal(parsed.searchParams.get('token'), '[redacted feed token]');
});

test('appendFeedAuthToWsUrl keeps broker_id when feed token is not required', () => {
  assert.equal(
    appendFeedAuthToWsUrl(
      'wss://testbrokerbackend.orrnn.com/ws/feed?token=***',
      'testorrnn',
      '',
    ),
    'wss://testbrokerbackend.orrnn.com/ws/feed?broker_id=testorrnn',
  );
});

test('redactFeedAuthFromWsUrl hides only the token value', () => {
  assert.equal(
    redactFeedAuthFromWsUrl('wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=%5Bredacted%5D&foo=1'),
    'wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=***&foo=1',
  );
});

test('stripFeedAuthQueryFromWsUrl returns the socket base for broker-feed comparison', () => {
  assert.equal(
    stripFeedAuthQueryFromWsUrl('wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=***'),
    'wss://services.myprop.trade/ws/feed',
  );
});

test('resolveConfiguredFeedBrokerTokenForBroker scopes env token to configured broker id', () => {
  const previousId = process.env.EXPO_PUBLIC_FEED_BROKER_ID;
  const previousToken = process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN;
  process.env.EXPO_PUBLIC_FEED_BROKER_ID = 'myprop-trade';
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = '[redacted-feed-token]';

  try {
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'), '[redacted-feed-token]');
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
  process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN = '[redacted-global-feed-token]';

  try {
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('myprop-trade'), '[redacted-global-feed-token]');
    assert.equal(resolveConfiguredFeedBrokerTokenForBroker('other-broker'), '[redacted-global-feed-token]');
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

test('feed auth uses static EXPO_PUBLIC env access so release OTA bundles inline values', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/api/feedAuth.ts'), 'utf8');

  assert.doesNotMatch(source, /process\.env\[[^\]]+\]/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_FEED_BROKER_TOKEN/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_FEED_BROKER_ID/);
});
