import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/ws/BrokerRealtimeService.ts'), 'utf8');

test('broker realtime tick equity uses settled balance fallback instead of zero default', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /calculateFloatingPnlFromTick/);
  assert.match(brokerRealtimeSource, /const tradingAccount = useTradingState\.getState\(\)\.account/);
  assert.match(brokerRealtimeSource, /const hasSettledBalance = liveAccount\.metricFlags\.balance \|\| Number\.isFinite\(tradingAccount\?\.balance\)/);
  assert.match(brokerRealtimeSource, /if \(!hasSettledBalance\) \{[\s\S]*updateMetrics\(\{ floating \}\)[\s\S]*setAccount\(\{ floating \}\)[\s\S]*return;/);
  assert.match(brokerRealtimeSource, /const equity = settledBalance \+ floating/);
  assert.match(brokerRealtimeSource, /const margin = liveAccount\.metricFlags\.margin && Number\.isFinite\(liveAccount\.margin\)/);
  assert.match(brokerRealtimeSource, /const marginFree = equity - margin/);
  assert.match(brokerRealtimeSource, /const marginLevel = margin > 0 \? \(equity \/ margin\) \* 100 : 0/);
});

test('broker realtime subscribes full account lifecycle channels and dynamic position ticks', () => {
  const brokerRealtimeSource = source();
  const accountSocketSource = readFileSync(resolve(process.cwd(), 'src/api/ws/accountSocket.ts'), 'utf8');

  assert.match(brokerRealtimeSource, /ACCOUNT_LIFECYCLE_CHANNELS = \['positions', 'account', 'metrics', 'orders', 'deals', 'history'\] as const/);
  assert.match(brokerRealtimeSource, /this\.getOpenPositionSymbols\(\)\.map\(\(symbol\) => `ticks\.\$\{symbol\}`\)/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_SYMBOL = 'EURUSD'/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_TIMEFRAME = 'M1'/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('orders\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('deals\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('order\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('deal\.'\)/);
  assert.match(brokerRealtimeSource, /eventName\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /asRecord\(record\.position\) \?\? asRecord\(record\.item\)/);
  assert.match(brokerRealtimeSource, /this\.invalidateLifecycleQueries\(eventName\)/);
  assert.match(brokerRealtimeSource, /this\.send\(\{ action: 'ping' \}\)/);
  assert.match(accountSocketSource, /\['metrics', 'account', 'positions', 'orders', 'deals', 'history'\]/);
});
