import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import {
  buildClosePositionRequestDescriptor,
  buildFullClosePositionRequestPayload,
  buildPartialClosePositionRequestPayload,
  normalizeClosePositionTicket,
} from './closePayload';

const positionsApiSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');
const closePayloadSource = readFileSync(resolve(process.cwd(), 'src/api/positions/closePayload.ts'), 'utf8');

test('normal close builds exactly the required full-close body', () => {
  const request = buildFullClosePositionRequestPayload();

  assert.deepEqual(request.body, { mode: 'full' });
  assert.deepEqual(Object.keys(request.body), ['mode']);
  assert.equal(request.journalPayload, undefined);
});

test('partial close builds volume only and never includes full mode', () => {
  const numericRequest = buildPartialClosePositionRequestPayload(0.03);
  const decimalRequest = buildPartialClosePositionRequestPayload('0.0100');

  assert.deepEqual(numericRequest.body, { volume: 0.03 });
  assert.deepEqual(Object.keys(numericRequest.body), ['volume']);
  assert.deepEqual(numericRequest.journalPayload, { volume: 0.03 });
  assert.deepEqual(decimalRequest.body, { volume: '0.0100' });
  assert.deepEqual(decimalRequest.journalPayload, { volume: 0.01 });
});

test('invalid partial volume throws instead of falling back to a full close', () => {
  for (const volume of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, '', ' ', 'zero', '-0.01']) {
    assert.throws(
      () => buildPartialClosePositionRequestPayload(volume),
      /positive number or decimal string/,
    );
  }
});

test('close paths accept only positive broker ticket values', () => {
  assert.equal(normalizeClosePositionTicket(67890), '67890');
  assert.equal(normalizeClosePositionTicket('9223372036854775807'), '9223372036854775807');

  for (const ticket of [0, -1, 1.5, Number.NaN, '', 'position-row-id', '0']) {
    assert.throws(
      () => normalizeClosePositionTicket(ticket),
      /positive broker ticket/,
    );
  }
});

test('full close descriptor binds the broker ticket to the exact POST body', () => {
  const descriptor = buildClosePositionRequestDescriptor(
    '9223372036854775807',
    buildFullClosePositionRequestPayload(),
  );

  assert.deepEqual(descriptor, {
    ticket: '9223372036854775807',
    endpoint: '/positions/9223372036854775807/close',
    method: 'POST',
    body: '{"mode":"full"}',
  });
});

test('partial close descriptor serializes only a validated volume', () => {
  const descriptor = buildClosePositionRequestDescriptor(
    67890,
    buildPartialClosePositionRequestPayload(0.01),
  );

  assert.equal(descriptor.endpoint, '/positions/67890/close');
  assert.equal(descriptor.method, 'POST');
  assert.equal(descriptor.body, '{"volume":0.01}');
  assert.deepEqual(descriptor.journalPayload, { volume: 0.01 });
});

test('positions API serializes strict full and partial requests through one submitter', () => {
  assert.match(positionsApiSource, /const submitClosePositionRequest = async \(/);
  assert.match(positionsApiSource, /buildClosePositionRequestDescriptor\(ticketId, request\)/);
  assert.match(
    positionsApiSource,
    /apiClient\(descriptor\.endpoint, \{[\s\S]*method: descriptor\.method,[\s\S]*body: descriptor\.body,/,
  );
  assert.match(
    positionsApiSource,
    /closePosition: async \(ticketId: string \| number\)[\s\S]*buildFullClosePositionRequestPayload\(\)/,
  );
  assert.match(
    positionsApiSource,
    /closePositionPartial: async \([\s\S]*buildPartialClosePositionRequestPayload\(volume\)/,
  );
  assert.doesNotMatch(closePayloadSource, /ticket_by|ticketBy/);
});
