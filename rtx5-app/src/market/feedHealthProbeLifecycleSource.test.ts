import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/ws/quotesSocket/QuotesWebSocketService.ts'),
  'utf8',
);

test('server health refresh is demand-driven, policy-derived, and suspended in background', () => {
  assert.match(source, /private scheduleHealthProbe\(identity: ActiveBrokerSessionIdentity\)/);
  assert.match(source, /!health\.thresholds/);
  assert.match(source, /health\.thresholds\.serverStatusStaleAfterMs \/ 2/);
  assert.match(source, /if \(!this\.isAppActive\) \{[\s\S]*this\.clearHealthProbeTimer\(\)/);
  assert.match(source, /!this\.hasActiveDemand\(\)/);
  assert.match(source, /probeActiveFeedHealth\(identity\)/);
});
