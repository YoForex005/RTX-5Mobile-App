import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/positions/closedHistory.ts'),
  'utf8',
);

test('closed history continues after a broker-capped short page', () => {
  assert.doesNotMatch(
    source,
    /pageRows\.length < pageSize/,
    'a gateway may cap a requested 1000-row page to 50 without reaching the end',
  );
  assert.match(
    source,
    /nextOffset \+= pageRows\.length/,
    'the next offset must follow the number of rows the gateway actually returned',
  );
  assert.match(
    source,
    /seenPageSignatures\.has\(pageSignature\)/,
    'an endpoint that ignores offset must still terminate safely',
  );
});
