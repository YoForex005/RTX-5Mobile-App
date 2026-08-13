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

test('broker realtime subscribes to positions, metrics, and confirmed deals with singular channel messages', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /ACTIVE_TRADE_CHANNELS = \['positions', 'metrics', 'deals'\] as const/);
  assert.match(brokerRealtimeSource, /channel: `\$\{channel\}\.\$\{login\}`/);
  assert.match(brokerRealtimeSource, /this\.activeChannels\.forEach\(\(channel\) => \{[\s\S]*this\.send\(\{ action: 'subscribe', channel \}\)/);
  assert.doesNotMatch(brokerRealtimeSource, /action: 'subscribe',[\s\S]{0,80}channels:/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_SYMBOL = 'EURUSD'/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_TIMEFRAME = 'M1'/);
  assert.doesNotMatch(brokerRealtimeSource, /ACTIVE_TRADE_CHANNELS = \[[^\]]*'history'/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('deals\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /asRecord\(record\.position\) \?\? asRecord\(record\.item\)/);
  assert.match(brokerRealtimeSource, /this\.invalidateLifecycleQueries\(eventName, identity\)/);
  assert.match(brokerRealtimeSource, /dataRecord\?\.type \?\? dataRecord\?\.event/);
  assert.match(brokerRealtimeSource, /this\.send\(\{ action: 'ping' \}\)/);
});

test('broker realtime position batches are filtered, hint-only for SL/TP, and never replace by absence', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /filterRealtimePositionRows\([\s\S]*positionsState\.positions/);
  assert.match(brokerRealtimeSource, /rejectedRows > 0[\s\S]*schedulePositionsReconciliation\(identity\)/);
  assert.match(brokerRealtimeSource, /notifyModifyPositionSocketHint\(/);
  assert.match(brokerRealtimeSource, /acceptedRows\.map\(stripUnversionedPositionProtection\)/);
  assert.match(brokerRealtimeSource, /preserveMissingExisting: true/);
  assert.match(brokerRealtimeSource, /price_sl: _priceSl[\s\S]*price_tp: _priceTp/);
  assert.match(
    brokerRealtimeSource,
    /status: _status[\s\S]*position_state: _positionState[\s\S]*action: _action[\s\S]*event: _event/,
  );
  assert.match(
    brokerRealtimeSource,
    /acceptedRows\.some\(isTerminalPositionUpdate\)[\s\S]*schedulePositionsReconciliation\(identity\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /isTerminalPositionUpdate\(acceptedRows\[0\]\)[\s\S]*schedulePositionsReconciliation\(identity\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /this\.invalidateLifecycleQueries\([\s\S]*eventName \|\| normalizeEventName\(envelope\?\.event \?\? envelope\?\.type \?\? envelope\?\.action\)[\s\S]*identity/,
  );
  assert.doesNotMatch(brokerRealtimeSource, /isAuthoritativeRealtimePositionsBatch/);
  assert.doesNotMatch(brokerRealtimeSource, /preserveMissingExisting: false/);
  assert.match(brokerRealtimeSource, /POSITIONS_RECONCILE_COOLDOWN_MS = 5_000/);
});

test('deal and close freshness invalidation is narrow, coalesced, and session fenced', () => {
  const brokerRealtimeSource = source();

  assert.match(
    brokerRealtimeSource,
    /const HISTORY_CACHE_KEYS = \[[\s\S]*'positionHistory'[\s\S]*'deals'[\s\S]*'accountDeals'[\s\S]*\] as const/,
  );
  assert.match(brokerRealtimeSource, /HISTORY_INVALIDATION_COALESCE_MS = 250/);
  assert.match(brokerRealtimeSource, /HISTORY_INVALIDATION_COOLDOWN_MS = 1_000/);
  assert.match(
    brokerRealtimeSource,
    /isHistoryPayloadEvent\(channel, eventName, statusName\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /SOCKET_CONTROL_EVENT_PATTERN\.test\(eventName\)[\s\S]*SOCKET_CONTROL_EVENT_PATTERN\.test\(statusName\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /historyInvalidationPending = true;[\s\S]*historyInvalidationTimer \|\| this\.historyInvalidationInFlight/,
  );
  assert.match(
    brokerRealtimeSource,
    /this\.ws !== socket[\s\S]*sameIdentity\(getActiveBrokerSessionIdentity\(capture\.session\), identity\)[\s\S]*sameOwnerStamp\(this\.activeOwnerStamp, ownerStamp\)[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(ownerStamp\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /HISTORY_CACHE_KEYS\.map\(\(root\) => appQueryClient\.invalidateQueries\([\s\S]*queryKey: \[root, capture\.session\.cacheNamespace\][\s\S]*cancelRefetch: true/,
  );
  assert.match(
    brokerRealtimeSource,
    /finally \{[\s\S]*epoch !== this\.historyInvalidationEpoch[\s\S]*historyInvalidationPending[\s\S]*armHistoryQueryInvalidation/,
  );
  assert.ok(
    (brokerRealtimeSource.match(/this\.clearHistoryQueryInvalidation\(\)/g) ?? []).length >= 2,
    'socket close and teardown must both cancel pending history work',
  );
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
