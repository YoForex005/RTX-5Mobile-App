import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('live data websocket URLs stay iOS-safe across quote candle account and price feeds', () => {
  const brokerRoutingSource = readSource('src/api/brokerRouting.ts');
  const quotesSocketSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const candlesSocketSource = readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts');
  const candlesProtocolSource = readSource('src/domain/candles/ws/candlesSocketProtocol.ts');
  const accountSocketSource = readSource('src/api/ws/accountSocket.ts');
  const legacyPriceSocketSource = readSource('src/api/ws/socket.ts');

  assert.match(brokerRoutingSource, /iOS blocks cleartext websocket traffic and raw-IP certificates/);
  assert.match(brokerRoutingSource, /export function normalizeConfiguredWsUrl/);
  assert.ok(brokerRoutingSource.includes("replace(/^https:"));
  assert.ok(brokerRoutingSource.includes("replace(/^http:"));
  assert.ok(brokerRoutingSource.includes("replace(/^ws:"));
  assert.match(brokerRoutingSource, /url\.protocol !== 'wss:'/);
  assert.match(brokerRoutingSource, /isRawIpHost\(url\.hostname\)/);

  assert.match(quotesSocketSource, /brokerApi\.getWebSocketUrl\(\)/);
  assert.doesNotMatch(quotesSocketSource, /EXPO_PUBLIC_QUOTES_WS_URL|DEFAULT_QUOTES_WS_URL|appendFeedAuthToWsUrl/);
  assert.match(
    quotesSocketSource,
    /Market data requires a logged-in broker session\. Skipping public feed fallback/,
  );

  assert.match(candlesProtocolSource, /normalizeConfiguredWsUrl\(configuredUrl, brokerUrl\)/);
  assert.doesNotMatch(candlesProtocolSource, /const url = \(configuredUrl \|\|/);
  assert.match(
    candlesSocketSource,
    /brokerApi\.getWebSocketUrl\(\)/,
  );
  assert.doesNotMatch(candlesSocketSource, /appendCandleWsBrokerId|getStoredAccessToken|appendCandleWsToken|EXPO_PUBLIC_CANDLES_WS_REQUIRES_TOKEN|EXPO_PUBLIC_CANDLES_WS_URL/);

  assert.match(accountSocketSource, /normalizeConfiguredWsUrl\([\s\S]*process\.env\.EXPO_PUBLIC_ACCOUNT_WS_URL/);
  assert.doesNotMatch(accountSocketSource, /process\.env\.EXPO_PUBLIC_ACCOUNT_WS_URL \|\|/);

  assert.match(legacyPriceSocketSource, /normalizeConfiguredWsUrl\([\s\S]*process\.env\.EXPO_PUBLIC_WS_URL/);
  assert.doesNotMatch(legacyPriceSocketSource, /return process\.env\.EXPO_PUBLIC_WS_URL \|\|/);
});
