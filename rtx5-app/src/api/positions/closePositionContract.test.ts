import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { buildClosePositionRequestPayload } from './closePayload';

const positionsApiSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');

test('normal close always sends the required full-close JSON body', () => {
  const request = buildClosePositionRequestPayload();

  assert.deepEqual(request.body, { mode: 'full' });
  assert.equal(request.journalPayload, undefined);
});

test('close by retains its ticket while using the full-close body', () => {
  const request = buildClosePositionRequestPayload(67890);

  assert.deepEqual(request.body, { mode: 'full', ticket_by: 67890 });
  assert.deepEqual(request.journalPayload, { ticketBy: 67890, volume: undefined });
});

test('partial-close metadata remains present with the required close mode', () => {
  const request = buildClosePositionRequestPayload({ ticketBy: 67890, volume: 0.03 });

  assert.deepEqual(request.body, { mode: 'full', ticket_by: 67890, volume: 0.03 });
  assert.deepEqual(request.journalPayload, { ticketBy: 67890, volume: 0.03 });
});

test('positions API always serializes the shared full-close payload', () => {
  const closeFunctionSource = positionsApiSource.slice(
    positionsApiSource.indexOf('closePosition: async'),
    positionsApiSource.indexOf('modifyPosition: async'),
  );

  assert.match(closeFunctionSource, /buildClosePositionRequestPayload\(ticketBy\)/);
  assert.match(closeFunctionSource, /const body = JSON\.stringify\(closePayload\)/);
  assert.match(closeFunctionSource, /method: 'POST',[\s\S]*body,/);
});
