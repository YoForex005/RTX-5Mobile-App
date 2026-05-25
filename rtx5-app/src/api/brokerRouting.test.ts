import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrokerWsUrl } from './brokerRouting';

test('buildBrokerWsUrl always derives broker sockets with wss from the login server url', () => {
  assert.equal(
    buildBrokerWsUrl('https://testbrokerbackend.orrnn.com:443', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://testbrokerbackend.orrnn.com:443/ws/v2',
  );
  assert.equal(
    buildBrokerWsUrl('http://69.197.178.27:8090', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://69.197.178.27:8090/ws/v2',
  );
});

test('buildBrokerWsUrl falls back only when no broker server url is saved', () => {
  assert.equal(
    buildBrokerWsUrl('', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://fallback/ws/v2',
  );
});
