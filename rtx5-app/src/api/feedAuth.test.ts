import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractFeedBrokerToken } from './feedAuth';

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

test('feed auth no longer exposes websocket URL builders or feed-token env routing', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/api/feedAuth.ts'), 'utf8');

  assert.doesNotMatch(source, /process\.env|appendFeedAuthToWsUrl|redactFeedAuthFromWsUrl|stripFeedAuthQueryFromWsUrl|EXPO_PUBLIC_FEED_BROKER_TOKEN/);
});
