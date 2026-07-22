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

test('broker realtime subscribes to positions and metrics with singular channel messages', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /ACTIVE_TRADE_CHANNELS = \['positions', 'metrics'\] as const/);
  assert.match(brokerRealtimeSource, /channel: `\$\{channel\}\.\$\{login\}`/);
  assert.match(brokerRealtimeSource, /this\.activeChannels\.forEach\(\(channel\) => \{[\s\S]*this\.send\(\{ action: 'subscribe', channel \}\)/);
  assert.doesNotMatch(brokerRealtimeSource, /action: 'subscribe',[\s\S]{0,80}channels:/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_SYMBOL = 'EURUSD'/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_TIMEFRAME = 'M1'/);
  assert.doesNotMatch(brokerRealtimeSource, /channel\.startsWith\('(?:account|orders|deals|history)\.'\)/);
  assert.doesNotMatch(brokerRealtimeSource, /eventName\.startsWith\('(?:account|order|deal|history)\.'\)/);
  assert.match(brokerRealtimeSource, /asRecord\(record\.position\) \?\? asRecord\(record\.item\)/);
  assert.match(brokerRealtimeSource, /this\.invalidateLifecycleQueries\(eventName, identity\)/);
  assert.match(brokerRealtimeSource, /dataRecord\?\.type \?\? dataRecord\?\.event/);
  assert.match(brokerRealtimeSource, /this\.send\(\{ action: 'ping' \}\)/);
});

test('broker realtime position batches reject unsafe ids and replace only explicit clean snapshots', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /filterRealtimePositionRows\([\s\S]*positionsState\.positions/);
  assert.match(brokerRealtimeSource, /rejectedRows > 0[\s\S]*schedulePositionsReconciliation\(identity\)/);
  assert.match(
    brokerRealtimeSource,
    /rejectedRows === 0[\s\S]*isAuthoritativeRealtimePositionsBatch\(eventName, envelope\)/,
  );
  assert.match(brokerRealtimeSource, /preserveMissingExisting: !isAuthoritative/);
  assert.match(brokerRealtimeSource, /POSITIONS_RECONCILE_COOLDOWN_MS = 5_000/);
});

test('broker realtime delegates account payloads to the shared alias-safe normalizer', () => {
  const brokerRealtimeSource = source();

  assert.match(
    brokerRealtimeSource,
    /import \{ extractLiveAccountMetrics \} from '\.\/accountSocket\.helpers'/,
  );
  assert.match(
    brokerRealtimeSource,
    /const extractedMetrics = extractLiveAccountMetrics\(data\)/,
  );
  assert.match(brokerRealtimeSource, /\.\.\.\(extractedMetrics \?\? \{\}\)/);
});
