import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const socketFiles = [
  'src/api/ws/socket.ts',
  'src/api/ws/accountSocket.ts',
  'src/api/ws/BrokerRealtimeService.ts',
  'src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts',
] as const;

test('non-quote sockets resolve only the immutable active trading endpoint', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /brokerApi\.getWebSocketUrl\(\)/, file);
    assert.match(contents, /isActiveBrokerSessionCurrent/, file);
    assert.doesNotMatch(contents, /useUserPreferences|brokerServerUrl|buildBrokerWsUrl/, file);
    assert.doesNotMatch(contents, /EXPO_PUBLIC_(?:WS|ACCOUNT_WS|CANDLES_WS)|DEFAULT_[A-Z_]*WS/, file);
  }
});

test('socket callbacks reject old broker/account/epoch captures before writes', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /getActiveBrokerSessionIdentity|ActiveBrokerSessionIdentity|AccountWsSession/, file);
    assert.match(contents, /this\.ws !== socket[^\n]*isActiveBrokerSessionCurrent/, file);
    assert.match(contents, /payloadMatchesSocketIdentity/, file);
  }
});

test('non-quote sockets stop reconnecting on authentication close codes', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /isSocketAuthenticationFailure\(event\?\.code\)/, file);
  }
});

test('candle protocol accepts exact WSS only and has no shared fallback', () => {
  const protocol = source('src/domain/candles/ws/candlesSocketProtocol.ts');
  assert.match(protocol, /normalizeBrokerWssUrl\(exactTradeWsBase\)/);
  assert.doesNotMatch(protocol, /backend\.orrnn\.com|buildBrokerWsUrl|normalizeConfiguredWsUrl/);
});

test('gateway health uses the exact active feedStatusUrl and rejects stale responses', () => {
  const health = source('src/api/health.ts');
  assert.match(health, /const statusUrl = capture\.session\.feedStatusUrl/);
  assert.match(health, /timedFetch\(statusUrl/);
  assert.match(health, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.doesNotMatch(health, /apiClient\('\/health'\)|buildBrokerHealthUrl|brokerServerUrl/);
});
