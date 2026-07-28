import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/orders.ts'), 'utf8');

test('market success never uses order_ticket as position identity', () => {
  const successSource = source.slice(
    source.indexOf('const handlePlaceOrderSuccess'),
    source.indexOf('type PlaceOrderExecutorOptions'),
  );

  assert.match(successSource, /resolveBrokerExecutionEvidence\(data\)\.ticket/);
  assert.doesNotMatch(successSource, /data\.order_ticket/);
});

test('market success refreshes positions even without a returned position ticket', () => {
  const successSource = source.slice(
    source.indexOf('const handlePlaceOrderSuccess'),
    source.indexOf('type PlaceOrderExecutorOptions'),
  );

  assert.match(successSource, /reconcileCapturedMarketOwner\(owner\)/);
  assert.doesNotMatch(
    successSource,
    /if \(positionTicket[^\n]*\)[\s\S]{0,200}reconcileCapturedMarketOwner\(owner\)/,
  );
});

test('market execution responses never create a fake optimistic position', () => {
  assert.match(source, /if \(action === 'closed'\) return false/);
  assert.doesNotMatch(source, /canOptimisticallyInsertPosition/);
  assert.doesNotMatch(source, /\.upsertPosition\(/);
  assert.match(source, /applyPositionsSnapshot\(/);
});

test('existing-position netting actions require a second REST reconciliation', () => {
  assert.match(source, /requiresContentReconciliation = \['increased', 'decreased', 'reversed'\]\.includes\(action\)/);
  assert.match(source, /hasPositionPresenceConverged\(/);
  assert.match(source, /presenceConverged && \(!requiresContentReconciliation \|\| i >= 1\)/);
});

test('requested SL/TP is never painted as backend-confirmed after market execution', () => {
  const successSource = source.slice(
    source.indexOf('const handlePlaceOrderSuccess'),
    source.indexOf('type PlaceOrderExecutorOptions'),
  );

  assert.doesNotMatch(successSource, /variables\.price_sl/);
  assert.doesNotMatch(successSource, /variables\.price_tp/);
  assert.doesNotMatch(successSource, /\bsl:\s*(data|variables)/);
  assert.doesNotMatch(successSource, /\btp:\s*(data|variables)/);
  assert.match(successSource, /Never append or decorate a local position/);
});

test('delayed market reconciliation stays bound to the dispatch owner', () => {
  const successSource = source.slice(
    source.indexOf('const handlePlaceOrderSuccess'),
    source.indexOf('type PlaceOrderExecutorOptions'),
  );
  const reconciliationSource = source.slice(
    source.indexOf('const reconcileCapturedMarketOwner'),
    source.indexOf('const scheduleTradePostSuccessRefresh'),
  );
  assert.match(successSource, /owner: ActiveBrokerSessionOwnerStamp/);
  assert.match(successSource, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
  assert.match(reconciliationSource, /getPositionsForReconciliation\([\s\S]*owner\.accountLogin/);
  assert.match(reconciliationSource, /applyPositionsSnapshot\([\s\S]*owner\.accountLogin/);
  assert.doesNotMatch(source, /resolveTradingLoginString/);
  assert.doesNotMatch(source, /refreshPositions\(/);
});
