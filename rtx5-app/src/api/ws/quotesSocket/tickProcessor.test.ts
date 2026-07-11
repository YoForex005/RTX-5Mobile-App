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
  assert.match(source, /'timestamp_ms'/);
  assert.match(source, /'time_ms'/);
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

test('quote tick processor leaves candle bodies to server channels when enabled', () => {
  const source = readSource('src/api/ws/quotesSocket/tickProcessor.ts');

  assert.match(
    source,
    /const allowReceivedAtCandleExtension =[\s\S]*normalizedUpdate\.timestampSource === 'received_at' && isCryptoSymbol\(normalizedUpdate\.symbol\)/,
  );
  assert.match(
    source,
    /normalizedUpdate\.timestampSource === 'feed' \|\| allowReceivedAtCandleExtension[\s\S]*\? normalizedTimestamp[\s\S]*: null/,
  );
  assert.match(source, /const useServerCandleStream = shouldRouteBackendCandlePayloads\(\)/);
  assert.match(source, /!useServerCandleStream &&[\s\S]*tickPriceForCandle !== null &&[\s\S]*candleExtensionTimestamp !== null/);
  assert.match(
    source,
    /extendActiveCandlesFromQuoteTick\(normalizedUpdate\.symbol,[\s\S]*price: tickPriceForCandle,[\s\S]*time: candleExtensionTimestamp,[\s\S]*volume: normalizedUpdate\.volume/,
  );
  assert.match(source, /tick_candle_extension_skipped_missing_feed_time/);
  assert.match(source, /cryptoSymbol: isCryptoSymbol\(normalizedUpdate\.symbol\)/);
  assert.doesNotMatch(source, /time: liveListenerTimestamp,[\s\S]*volume: 1/);
});
