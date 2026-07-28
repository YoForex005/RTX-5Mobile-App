import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeSource = (name: string) => readFileSync(
  resolve(process.cwd(), 'src/features/trade', name),
  'utf8',
);

test('trade completions invalidate only their captured broker/account/epoch namespace', () => {
  const files = [
    'OrderTicketScreen.tsx',
    'ClosePositionScreen.tsx',
    'BulkOperationScreen.tsx',
    'closePositionFlow.ts',
  ];

  for (const file of files) {
    const source = readTradeSource(file);
    assert.match(source, /captureActiveBrokerSession(?:Provenance)?\(/, file);
    assert.match(source, /isActiveBrokerSessionProvenanceCurrent\(/, file);
    assert.match(source, /invalidateSessionQueryRoots\(/, file);
    assert.doesNotMatch(source, /\.invalidateQueries\(/, file);
  }

  const modifyScreenSource = readTradeSource('ModifyPositionScreen.tsx');
  const modifyCoordinatorSource = readTradeSource('modifyPositionCoordinator.ts');
  assert.match(modifyScreenSource, /submitModifyPosition\(\{/);
  assert.doesNotMatch(
    modifyScreenSource,
    /invalidateSessionQueryRoots|\.invalidateQueries\(|positionsApi\.modifyPosition/,
  );
  assert.match(modifyCoordinatorSource, /captureActiveBrokerSessionOwnerStamp\(\)/);
  assert.match(modifyCoordinatorSource, /owner\.cacheNamespace/);
  assert.match(modifyCoordinatorSource, /owner\.apiBase/);
  assert.match(modifyCoordinatorSource, /owner\.credentialGeneration/);
  assert.match(modifyCoordinatorSource, /owner\.credentialIdentity/);
  assert.match(modifyCoordinatorSource, /positionsApi\.getPositionsForReconciliation/);

  const unsupportedCloseBy = readTradeSource('CloseByScreen.tsx');
  assert.match(unsupportedCloseBy, /Close By is unavailable for this API contract/);
  assert.doesNotMatch(
    unsupportedCloseBy,
    /captureActiveBrokerSession|invalidateSessionQueryRoots|positionsApi|beginOptimisticClose/,
  );
});
