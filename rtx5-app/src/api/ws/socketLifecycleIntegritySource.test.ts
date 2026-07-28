import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('background lifecycle suspends every non-quote socket before foreground validation', () => {
  const layout = readSource('app/_layout.tsx');

  assert.match(layout, /brokerRealtimeService\.suspend\(\)/);
  assert.match(layout, /accountWsService\.suspend\(\)/);
  assert.match(layout, /candlesWsService\.suspend\(\)/);
  assert.match(layout, /wsService\.suspend\(\)/);

  const validation = layout.indexOf('brokerApi.getValidAccessToken(false)');
  const identityGuard = layout.indexOf('isActiveBrokerSessionCurrent(identity)', validation);
  const resume = layout.indexOf('brokerRealtimeService.resume()', validation);
  const bootstrap = layout.indexOf('bootstrapApp({ accountLogin: identity.accountLogin })', validation);
  assert.ok(validation > -1 && identityGuard > validation);
  assert.ok(resume > identityGuard && bootstrap > resume);
});

test('socket suspension preserves demand and caches while disconnect keeps logout teardown', () => {
  const sources = [
    readSource('src/api/ws/BrokerRealtimeService.ts'),
    readSource('src/api/ws/accountSocket.ts'),
    readSource('src/api/ws/socket.ts'),
    readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts'),
  ];

  for (const source of sources) {
    assert.match(source, /suspend\(\): void/);
    assert.match(source, /resume\(\): void/);
    assert.match(source, /private isSuspended = AppState\.currentState !== 'active'/);
  }

  const candles = sources[3];
  const candleSuspend = candles.slice(candles.indexOf('public suspend()'), candles.indexOf('public resume()'));
  assert.doesNotMatch(candleSuspend, /subscriptions\.clear|candleCache = \[\]|engineUnsubscribe/);
  assert.match(candles, /public disconnect\(\): void \{[\s\S]*subscriptions\.clear\(\)[\s\S]*candleCache = \[\]/);

  const account = sources[1];
  const accountSuspend = account.slice(account.indexOf('public suspend()'), account.indexOf('public resume()'));
  assert.doesNotMatch(accountSuspend, /clearPositions|resetMetrics/);

  const legacy = sources[2];
  const legacySuspend = legacy.slice(legacy.indexOf('public suspend()'), legacy.indexOf('public resume()'));
  assert.doesNotMatch(legacySuspend, /activeSubscriptions\.clear/);
});

test('broker realtime and candles use capped full jitter and do not reset on TCP open', () => {
  const broker = readSource('src/api/ws/BrokerRealtimeService.ts');
  const candles = readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts');

  for (const source of [broker, candles]) {
    assert.match(source, /resolveFullJitterBackoffMs\(\{/);
    assert.match(source, /startStableConnectionTimer\(socket, identity\)/);
    assert.match(source, /hasStableConnectionSucceeded\(\{/);
    assert.match(source, /acceptedPayloadCount \+= 1/);
    assert.match(source, /markConnectionHealthy\(\)/);
    const onOpen = source.slice(source.indexOf('socket.onopen ='), source.indexOf('socket.onmessage ='));
    assert.doesNotMatch(onOpen, /reconnectAttempts = 0/);
  }

  assert.match(broker, /const accepted = this\.handleMessage[\s\S]*if \(accepted\) \{[\s\S]*this\.markConnectionHealthy\(\)/);
  assert.match(candles, /const accepted = this\.handlePayload[\s\S]*if \(accepted\) \{[\s\S]*this\.markConnectionHealthy\(\)/);
});

test('quote socket recovers after active-session credentials refresh', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /subscribeActiveBrokerSession/);
  assert.match(quotes, /event\.type !== 'credentials_updated'/);
  assert.match(quotes, /reportFeedCredentialsRefreshed\(identity\)/);
  assert.match(quotes, /this\.shouldReconnect = this\.hasActiveDemand\(\)/);
  assert.match(quotes, /authRefreshAttemptedCredentialIdentity/);
  assert.match(quotes, /brokerApi\.getValidAccessToken\(true\)/);
  assert.match(quotes, /this\.rejectedSocketUrl === nextUrl/);
});

test('quote socket callbacks and timers are fenced by credential owner generation', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const health = readSource('src/market/feedHealthProbe.ts');

  assert.match(quotes, /captureActiveBrokerSessionOwnerStamp/);
  assert.match(quotes, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
  assert.match(quotes, /socketOwnerStamp/);
  assert.match(quotes, /schedulePreOpenErrorFallback\(socket, owner, identity\)/);
  assert.match(quotes, /QUOTE_WS_PREOPEN_ERROR_CLOSE_WAIT_MS/);
  assert.match(health, /captureActiveBrokerSessionOwnerStamp/);
  assert.match(health, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
});

test('quote socket opens immediately then health probe can hard-stop confirmed blocks', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /feedHealthBlocksSocketConnection\(health, identity\)/);
  // Fast path: open right after URL resolve so first ticks are not blocked by
  // a serial status probe (up to ~3s). Confirmed health blocks still stop the socket.
  const firstOpen = quotes.indexOf('this.openResolvedSocket(resolved)');
  const healthProbe = quotes.indexOf('await probeActiveFeedHealth(resolved.owner)', firstOpen);
  const failedProbeGuard = quotes.indexOf('if (!healthConfirmed)', healthProbe);
  const policyGuard = quotes.indexOf('if (this.shouldPauseForConfirmedHealth(resolved.identity))', failedProbeGuard);
  assert.ok(firstOpen > -1 && healthProbe > firstOpen);
  assert.ok(failedProbeGuard > healthProbe && policyGuard > failedProbeGuard);
  assert.match(quotes, /if \(!healthConfirmed\) \{[\s\S]*if \(boundedRecoveryProbe\) \{[\s\S]*this\.shouldReconnect = false/);
  assert.match(quotes, /this\.openResolvedSocket\(resolved\);[\s\S]*this\.scheduleHealthProbe\(resolved\.owner\)/);
});

test('NetInfo failures use the same advancing reconnect policy and telemetry', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /\.catch\(\(\) => \{[\s\S]*this\.scheduleNextBackoffReconnect\('network_status_failed'\)/);
  assert.match(quotes, /resolveNextReconnectAttempt\(\{[\s\S]*currentAttempt: this\.reconnectAttempts/);
  assert.match(quotes, /recordMarketDataEvent\('reconnect_scheduled',[\s\S]*trigger,[\s\S]*attempt: decision\.attempt/);
});

test('quote socket open and subscription ACK telemetry require the current session identity', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(
    quotes,
    /socket\.onopen = \(\) => \{[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(owner\)[\s\S]*recordMarketDataEvent\('socket_open',[\s\S]*brokerId: identity\.brokerId[\s\S]*sessionEpoch: identity\.sessionEpoch/,
  );
  assert.match(
    quotes,
    /handleSubscriptionAckPayload\(payload: unknown\)[\s\S]*const identity = this\.socketIdentity;[\s\S]*const owner = this\.socketOwnerStamp;[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(owner\)[\s\S]*recordMarketDataEvent\('subscribe_ack',[\s\S]*symbolCount: symbols\.length[\s\S]*sessionEpoch: identity\.sessionEpoch/,
  );
});

test('broker and legacy trade sockets cannot write executable quotes', () => {
  const broker = readSource('src/api/ws/BrokerRealtimeService.ts');
  const legacy = readSource('src/api/ws/socket.ts');

  assert.doesNotMatch(broker, /setQuote|handleTick|ticks\.|calculateFloatingPnlFromTick/);
  assert.doesNotMatch(legacy, /setQuote|extendActiveCandlesFromQuoteTick/);
  assert.match(legacy, /normalized === 'prices' \|\| normalized\.startsWith\('quotes\.'\)/);
});
