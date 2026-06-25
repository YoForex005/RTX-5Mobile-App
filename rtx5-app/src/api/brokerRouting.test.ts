import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_PROXY_API_BASE_URL,
  AUTH_PROXY_SERVER_URL,
  buildBrokerApiBaseUrl,
  buildBrokerWsUrl,
  normalizeConfiguredWsUrl,
  normalizeBrokerProxyServerAddress,
  normalizeBrokerServerUrl,
  resolveBrokerProxyServerAddress,
  resolveBrokerServiceBaseUrl,
  shouldUseBrokerHostedQuoteFeed,
} from './brokerRouting';

test('normalizeBrokerServerUrl keeps broker service bases on secure domains', () => {
  assert.equal(
    normalizeBrokerServerUrl('http://testbrokerbackend.orrnn.com:443/api/v2'),
    'https://testbrokerbackend.orrnn.com',
  );
  assert.equal(
    normalizeBrokerServerUrl('ws://testbrokerbackend.orrnn.com/ws/v2'),
    'https://testbrokerbackend.orrnn.com',
  );
  assert.equal(normalizeBrokerServerUrl('http://69.197.178.27:8090'), '');
  assert.equal(normalizeBrokerServerUrl('https://69.197.178.27:8090'), '');
});

test('resolveBrokerServiceBaseUrl uses the discovery service domain instead of server ip', () => {
  assert.equal(
    resolveBrokerServiceBaseUrl({
      server_url: 'http://testbrokerbackend.orrnn.com:8090',
      protocol: 'http',
      server: '69.197.178.27:8090',
    }),
    'https://testbrokerbackend.orrnn.com:8090',
  );
  assert.equal(
    resolveBrokerServiceBaseUrl({
      server_url: '',
      protocol: 'http',
      server: 'testbrokerbackend.orrnn.com:8090',
    }),
    'https://testbrokerbackend.orrnn.com:8090',
  );
  assert.equal(
    resolveBrokerServiceBaseUrl({
      server_url: '',
      protocol: 'http',
      server: '69.197.178.27:8090',
    }),
    '',
  );
  assert.equal(
    resolveBrokerServiceBaseUrl({
      server_url: '',
      market_api_url: 'https://services.growtradingacademy.com',
      server_domain: 'services.growtradingacademy.com',
      server: '103.91.186.142:443',
    }),
    'https://services.growtradingacademy.com',
  );
});

test('resolveBrokerProxyServerAddress uses broker domains for gateway login', () => {
  assert.equal(
    resolveBrokerProxyServerAddress({
      server_url: 'https://services.growtradingacademy.com',
      market_api_url: 'https://services.growtradingacademy.com',
      protocol: 'https',
      server: 'services.growtradingacademy.com:443',
      server_ip: '103.91.186.142',
    }),
    'services.growtradingacademy.com:443',
  );
  assert.equal(
    resolveBrokerProxyServerAddress({
      server_url: 'https://services.growtradingacademy.com',
      protocol: 'https',
      server: '103.91.186.142:443',
    }),
    'services.growtradingacademy.com',
  );
  assert.equal(
    resolveBrokerProxyServerAddress({
      server_url: '',
      protocol: 'https',
      server: '103.91.186.142:443',
    }),
    '',
  );
  assert.equal(normalizeBrokerProxyServerAddress('https://103.91.186.142:443/api/v2'), '103.91.186.142:443');
});

test('auth proxy uses the trusted shared gateway origin by default', () => {
  assert.equal(AUTH_PROXY_API_BASE_URL, 'https://backend.orrnn.com/api/v2');
  assert.equal(AUTH_PROXY_SERVER_URL, 'https://backend.orrnn.com');
});

test('buildBrokerApiBaseUrl falls back instead of constructing raw-ip broker requests', () => {
  assert.equal(
    buildBrokerApiBaseUrl('http://69.197.178.27:8090'),
    'https://backend.orrnn.com/api/v2',
  );
});

test('buildBrokerWsUrl always derives broker sockets with wss from the login server url', () => {
  assert.equal(
    buildBrokerWsUrl('https://testbrokerbackend.orrnn.com:443', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://testbrokerbackend.orrnn.com/ws/v2',
  );
  assert.equal(
    buildBrokerWsUrl('http://69.197.178.27:8090', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://fallback/ws/v2',
  );
});

test('buildBrokerWsUrl falls back only when no broker server url is saved', () => {
  assert.equal(
    buildBrokerWsUrl('', '/ws/v2', 'wss://fallback/ws/v2'),
    'wss://fallback/ws/v2',
  );
});

test('normalizeConfiguredWsUrl keeps configured websocket overrides safe for iOS', () => {
  assert.equal(
    normalizeConfiguredWsUrl('ws://testbrokerbackend.orrnn.com/ws/feed', 'wss://fallback/ws/feed'),
    'wss://testbrokerbackend.orrnn.com/ws/feed',
  );
  assert.equal(
    normalizeConfiguredWsUrl('http://testbrokerbackend.orrnn.com/ws/v2?token=abc', 'wss://fallback/ws/v2'),
    'wss://testbrokerbackend.orrnn.com/ws/v2?token=abc',
  );
  assert.equal(
    normalizeConfiguredWsUrl('ws://69.197.178.27:8090/ws/feed', 'wss://fallback/ws/feed'),
    'wss://fallback/ws/feed',
  );
  assert.equal(
    normalizeConfiguredWsUrl('', 'wss://fallback/ws/feed'),
    'wss://fallback/ws/feed',
  );
});

test('shouldUseBrokerHostedQuoteFeed keeps insecure broker hosts on the shared backend quote feed', () => {
  assert.equal(shouldUseBrokerHostedQuoteFeed('https://testbrokerbackend.orrnn.com:443'), true);
  assert.equal(shouldUseBrokerHostedQuoteFeed('wss://testbrokerbackend.orrnn.com:443'), true);
  assert.equal(shouldUseBrokerHostedQuoteFeed('http://69.197.178.27:8090'), false);
  assert.equal(shouldUseBrokerHostedQuoteFeed('ws://69.197.178.27:8090'), false);
  assert.equal(shouldUseBrokerHostedQuoteFeed(''), false);
});
