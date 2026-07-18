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
    'ModifyPositionScreen.tsx',
    'ClosePositionScreen.tsx',
    'CloseByScreen.tsx',
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
});
