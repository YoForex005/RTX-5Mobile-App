import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/ws/BrokerRealtimeService.ts'), 'utf8');

test('broker realtime never owns executable quote or tick-derived PnL state', () => {
  const brokerRealtimeSource = source();
  const legacySocketSource = readFileSync(resolve(process.cwd(), 'src/api/ws/socket.ts'), 'utf8');

  assert.doesNotMatch(brokerRealtimeSource, /ticks\.|handleTick|setQuote|calculateFloatingPnlFromTick|setInstrumentSpecs/);
  assert.doesNotMatch(legacySocketSource, /setQuote|extendActiveCandlesFromQuoteTick/);
  assert.match(legacySocketSource, /Quote channels are disabled; executable quotes use \/ws\/feed only/);
});

test('broker realtime subscribes only account and trade lifecycle channels', () => {
  const brokerRealtimeSource = source();
  const accountSocketSource = readFileSync(resolve(process.cwd(), 'src/api/ws/accountSocket.ts'), 'utf8');

  assert.match(brokerRealtimeSource, /ACCOUNT_LIFECYCLE_CHANNELS = \['positions', 'account', 'metrics', 'orders', 'deals', 'history'\] as const/);
  assert.match(brokerRealtimeSource, /return ACCOUNT_LIFECYCLE_CHANNELS\.map\(\(channel\) => `\$\{channel\}\.\$\{login\}`\)/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_SYMBOL = 'EURUSD'/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_TIMEFRAME = 'M1'/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('orders\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('deals\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('order\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('deal\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /asRecord\(record\.position\) \?\? asRecord\(record\.item\)/);
  assert.match(brokerRealtimeSource, /this\.invalidateLifecycleQueries\(eventName, identity\)/);
  assert.match(brokerRealtimeSource, /this\.send\(\{ action: 'ping' \}\)/);
  assert.match(accountSocketSource, /\['metrics', 'account', 'positions', 'orders', 'deals', 'history'\]/);
});
