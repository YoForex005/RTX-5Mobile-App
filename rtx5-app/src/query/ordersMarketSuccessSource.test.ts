import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const querySource = readSource('src/query/orders.ts');
const orderSource = readSource('src/api/orders/placeMarketOrder.ts');
const reconciliationSource = readSource('src/api/orders/marketPositionReconciliation.ts');

test('market success delegates position ownership to the API reconciliation coordinator', () => {
  const successSource = querySource.slice(
    querySource.indexOf('const handlePlaceOrderSuccess'),
    querySource.indexOf('type PlaceOrderExecutorOptions'),
  );

  assert.match(orderSource, /reconcileMarketOrderPositions\(reconciliationResponse/);
  assert.doesNotMatch(successSource, /position_ticket|order_ticket|getPositionsForReconciliation|refreshPositions/);
  assert.doesNotMatch(successSource, /applyPositionsSnapshot|upsertPosition/);
});

test('market execution responses never create a fabricated position', () => {
  assert.doesNotMatch(querySource, /canOptimisticallyInsertPosition|\.upsertPosition\(/);
  assert.doesNotMatch(orderSource, /\.upsertPosition\(/);
  assert.doesNotMatch(reconciliationSource, /\.upsertPosition\(/);
  assert.match(orderSource, /applyPositionsSnapshot\(/);
});

test('reconciliation uses position_ticket and never order_ticket as position identity', () => {
  assert.match(reconciliationSource, /response\?\.position_ticket \?\? response\?\.ticket/);
  assert.doesNotMatch(reconciliationSource, /response\?\.order_ticket|response\.order_ticket/);
});

test('opened, closed, and netting actions require matching broker-ledger evidence', () => {
  assert.match(reconciliationSource, /action === 'closed'[\s\S]*return !ticketPresent/);
  assert.match(reconciliationSource, /action === 'opened' \|\| action === 'open'[\s\S]*return ticketPresent/);
  assert.match(reconciliationSource, /\['increased', 'decreased', 'reversed'\]\.includes\(action\)[\s\S]*ticketPresent && attempt >= 1/);
  assert.match(reconciliationSource, /return ticketPresent && attempt >= 1/);
});

test('requested SL and TP are never painted as backend-confirmed after market execution', () => {
  assert.doesNotMatch(reconciliationSource, /price_sl|price_tp|\bsl:|\btp:/);
  assert.doesNotMatch(orderSource, /commitPositions:[\s\S]{0,300}price_sl|commitPositions:[\s\S]{0,300}price_tp/);
});

test('market reconciliation remains bound to the immutable dispatch owner', () => {
  assert.match(orderSource, /getPositionsForReconciliation\(owner\.accountLogin\)/);
  assert.match(orderSource, /isOwnerCurrent: \(\) => isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
  assert.match(orderSource, /applyPositionsSnapshot\([\s\S]*owner\.accountLogin/);
  assert.doesNotMatch(orderSource, /resolveTradingLoginString/);
  assert.doesNotMatch(querySource, /refreshPositions\(/);
});
