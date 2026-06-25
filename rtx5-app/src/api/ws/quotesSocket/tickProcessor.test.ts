import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('quote tick processor carries websocket envelope context into nested tick payloads', () => {
  const source = readSource('src/api/ws/quotesSocket/tickProcessor.ts');

  assert.match(source, /const parseJsonStringPayload = \(value: unknown\): unknown =>/);
  assert.match(source, /const QUOTE_ENVELOPE_CONTEXT_KEYS = \[/);
  assert.match(source, /'channel'/);
  assert.match(source, /'tick_time'/);
  assert.match(source, /'sequenceId'/);
  assert.match(source, /const mergeQuoteEnvelopeContext = \(/);
  assert.match(source, /\{ \.\.\.context, \.\.\.candidateRecord \}/);
  assert.match(source, /for \(const key of \['data', 'ticks', 'prices', 'quotes', 'items', 'payload', 'message'\]\)/);
  assert.match(source, /return value\.map\(\(item\) => mergeQuoteEnvelopeContext\(record, item\)\)/);
  assert.match(source, /for \(const key of \['data', 'tick', 'quote', 'price', 'payload', 'message'\]\)/);
  assert.match(source, /return \[mergeQuoteEnvelopeContext\(record, value\)\]/);
  assert.match(source, /const parsedPayload = parseJsonStringPayload\(payload\)/);
  assert.match(source, /for \(const candidate of getQuoteCandidateItems\(parsedPayload\)\)/);
});
