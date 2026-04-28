import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MockRestHistoryProvider,
  MockWebSocketQuoteStream,
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  extractFunctionBody,
  makeCandle,
  makeLiveOverlayCandle,
  makeTrustedHistoryCandle,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

test('stability helpers: validate candle series rejects duplicate candle times', () => {
  assert.throws(
    () => assertNoDuplicateCandleTimes([makeCandle(60), makeCandle(60)], 'test series'),
    /duplicate candle time 60/,
  );
});

test('stability helpers: validate candle series rejects invalid OHLC', () => {
  assert.throws(
    () => assertValidCandleSeries([makeCandle(60, { open: 1.2, high: 1.1, low: 1, close: 1.15 })]),
    /invalid OHLC/,
  );
});

test('stability helpers: trusted history and live overlay builders keep provenance explicit', () => {
  const history = makeTrustedHistoryCandle(60, { close: 1.2, serverTimeframe: 'M5' });
  const live = makeLiveOverlayCandle(120, { close: 1.3, firstTickTs: 121, lastTickTs: 129 });

  assert.equal(history.source, 'rest');
  assert.equal(history.closed, true);
  assert.equal(history.serverTimeframe, 'M5');
  assert.equal(live.source, 'live');
  assert.equal(live.closed, false);
  assert.equal(live.firstTickTs, 121);
  assert.equal(live.lastTickTs, 129);
});

test('mock REST history provider serves queued history and failures in order', async () => {
  const provider = new MockRestHistoryProvider()
    .queueFailure('offline')
    .queueHistory([makeCandle(60), makeCandle(120)]);

  await assert.rejects(
    () => provider.fetchHistory({ symbol: 'EURUSD', timeframe: 'M1' }),
    /offline/,
  );

  const history = await provider.fetchHistory({ symbol: 'EURUSD', timeframe: 'M1', limit: 2 });

  assert.deepEqual(history.map((candle) => candle.time), [60, 120]);
  assert.equal(provider.requests.length, 2);
  assert.deepEqual(provider.requests[1], { symbol: 'EURUSD', timeframe: 'M1', limit: 2 });
});

test('mock WebSocket quote stream isolates symbols and pauses while disconnected', () => {
  const stream = new MockWebSocketQuoteStream();
  const eurusdTicks: number[] = [];
  const gbpusdTicks: number[] = [];

  const unsubscribeEurUsd = stream.subscribe('EURUSDm', (tick) => eurusdTicks.push(tick.timestamp));
  stream.subscribe('GBPUSD', (tick) => gbpusdTicks.push(tick.timestamp));

  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: 100 }), 1);
  assert.deepEqual(eurusdTicks, [100]);
  assert.deepEqual(gbpusdTicks, []);

  stream.disconnect();
  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.2, ask: 1.2001, timestamp: 101 }), 0);
  stream.reconnect();
  unsubscribeEurUsd();

  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.3, ask: 1.3001, timestamp: 102 }), 0);
  assert.deepEqual(eurusdTicks, [100]);
});

test('WebView source helper extracts embedded bridge functions from the real ChartScreen', () => {
  const source = readChartScreenSource();
  const updateChartDataBody = extractFunctionBody(source, 'updateChartData');

  assert.match(updateChartDataBody, /series\.setData\(mapped\)/);
  assert.match(updateChartDataBody, /applyOverlayPayload\(_overlayPayload\)/);
});
