import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActiveBrokerSessionManifest,
  parseActiveBrokerSessionManifest,
} from './activeBrokerSessionStorage';

const validInput = {
  brokerId: 'Broker-A',
  accountLogin: '10001',
  apiBase: 'https://services.broker-a.example/api/v2',
  feedWsBase: 'wss://services.broker-a.example/ws/feed',
  tradeWsBase: 'wss://services.broker-a.example/ws/v2',
  feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
  servicesDomain: 'services.broker-a.example',
  feedAuthContext: {
    mode: 'query' as const,
    credential: 'feed_token' as const,
    tokenQueryParam: 'token',
    brokerIdQueryParam: 'broker_id',
  },
  configVersion: 'cfg-1',
};

test('manifest contains routing identity but no credential values', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  const serialized = JSON.stringify(manifest);

  assert.equal(manifest.brokerId, 'broker-a');
  assert.equal(manifest.accountLogin, '10001');
  assert.equal(manifest.version, 2);
  assert.equal(manifest.servicesDomain, 'services.broker-a.example');
  assert.doesNotMatch(serialized, /accessToken|refreshToken|feedToken\s*:/i);
});

test('manifest parser rejects legacy/incomplete versions and feed auth metadata', () => {
  assert.equal(parseActiveBrokerSessionManifest('{"version":1}'), null);
  assert.equal(parseActiveBrokerSessionManifest('{"version":2}'), null);
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify({
    ...createActiveBrokerSessionManifest(validInput),
    feedAuthContext: {
      mode: 'query',
      credential: 'feed_token',
      tokenQueryParam: 'token&broker_id',
    },
  })), null);
});

test('manifest parser revalidates every exact endpoint against persisted services domain', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify({
    ...manifest,
    feedWsBase: 'wss://feed.attacker.example/ws/feed',
  })), null);
  assert.equal(parseActiveBrokerSessionManifest(JSON.stringify({
    ...manifest,
    configVersion: '',
  })), null);
});

test('manifest round trip preserves the exact endpoint set', () => {
  const manifest = createActiveBrokerSessionManifest(validInput);
  assert.deepEqual(
    parseActiveBrokerSessionManifest(JSON.stringify(manifest)),
    manifest,
  );
});
