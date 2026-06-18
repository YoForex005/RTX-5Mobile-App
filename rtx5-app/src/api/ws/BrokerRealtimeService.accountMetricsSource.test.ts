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
