import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendFeedAuthToWsUrl, extractFeedBrokerToken, redactFeedAuthFromWsUrl } from './feedAuth';

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

test('feed auth builds and redacts the MyProp query-auth URL without env secrets', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/api/feedAuth.ts'), 'utf8');

  const url = appendFeedAuthToWsUrl('wss://services.myprop.trade/ws/feed', 'myprop-trade', 'feed-secret');
  assert.equal(url, 'wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=feed-secret');
  assert.equal(
    redactFeedAuthFromWsUrl(url),
    'wss://services.myprop.trade/ws/feed?broker_id=myprop-trade&token=***',
  );
  assert.doesNotMatch(source, /process\.env|EXPO_PUBLIC_FEED_BROKER_TOKEN/);
});
