import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/orders.ts'), 'utf8');

test('market success never uses order_ticket as position identity', () => {
  const valuesSource = source.slice(
    source.indexOf('const getConfirmedMarketOrderValues'),
    source.indexOf('const logPlaceOrderPayload'),
  );

  assert.match(valuesSource, /resolveBrokerExecutionEvidence\(data\)/);
  assert.doesNotMatch(valuesSource, /data\.order_ticket/);
});

test('market success refreshes positions even without a returned position ticket', () => {
  const successSource = source.slice(
    source.indexOf('const handlePlaceOrderSuccess'),
    source.indexOf('type PlaceOrderExecutorOptions'),
  );

  assert.match(successSource, /if \(mt5Login\) \{/);
  assert.doesNotMatch(successSource, /if \(mt5Login && positionTicket\)/);
  assert.match(successSource, /refreshPositions\(mt5Login\)/);
});

test('netting actions do not create a fake optimistic position', () => {
  assert.match(
    source,
    /return !\['closed', 'increased', 'decreased', 'reversed'\]\.includes\(action\);/,
  );
  assert.match(source, /if \(action === 'closed'\) return false/);
  assert.match(source, /canOptimisticallyInsertPosition\(data\)/);
  assert.match(source, /refreshPositions\(mt5LoginImmediate\)/);
});

test('existing-position netting actions require a second REST reconciliation', () => {
  assert.match(source, /requiresContentReconciliation = \['increased', 'decreased', 'reversed'\]\.includes\(action\)/);
  assert.match(source, /hasPositionPresenceConverged\(/);
  assert.match(source, /presenceConverged && \(!requiresContentReconciliation \|\| i >= 1\)/);
});
