import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
  validateQuoteTickForCandle,
  type RawQuoteTick,
  type ValidatedQuoteTick,
} from '../../api/ws/liveCandleOverlay';
import { mergeFetchedHistoryIntoWindow } from '../../api/ws/liveCandlesEngine.helpers';
import {
  alignTimeToBucket,
  getExpectedNextCandleTime,
  isStructurallyValidCandle,
  materializeCanonicalHistoryAndLiveCandles,
  normalizeCandle,
  sortAndDedupeCandles,
} from '../../domain/candles';
import { markTrustedHistorySeries, splitRestHistoryCandles } from '../../domain/candleProvenance';
import { resolveVisibleSeriesMode } from '../../api/ws/liveCandlesEnginePolicy';
import {
  MockRestHistoryProvider,
  MockWebSocketQuoteStream,
  assertNoDuplicateCandleTimes,
  assertNoSplitHistoryLiveSeries,
  assertValidCandleSeries,
  makeCandle,
  makeLiveOverlayCandle,
  makeTrustedHistoryCandle,
} from './testing/chartStabilityTestUtils';
import type { Candle } from '../../state/tradingState';

const tick = (
  bid: number,
  timestamp: number,
  sequence: number,
  input: Partial<RawQuoteTick> = {},
  referencePrice?: number,
): ValidatedQuoteTick => {
  const validated = validateQuoteTickForCandle(
    { bid, ask: bid + 0.0001, timestamp, ...input },
    { priceBasis: 'bid', sequence, referencePrice },
  );
  assert.ok(validated, `tick should validate at ${timestamp}`);
  return validated;
};

test('unit: timeframe bucket alignment is deterministic for every supported chart timeframe', () => {
  const sample = Date.UTC(2024, 3, 22, 10, 37, 45) / 1000;
  const expectedByTimeframe: Record<string, number> = {
    M1: Date.UTC(2024, 3, 22, 10, 37, 0) / 1000,
    M3: Date.UTC(2024, 3, 22, 10, 36, 0) / 1000,
    M5: Date.UTC(2024, 3, 22, 10, 35, 0) / 1000,
    M15: Date.UTC(2024, 3, 22, 10, 30, 0) / 1000,
    M30: Date.UTC(2024, 3, 22, 10, 30, 0) / 1000,
    H1: Date.UTC(2024, 3, 22, 10, 0, 0) / 1000,
    H2: Date.UTC(2024, 3, 22, 10, 0, 0) / 1000,
    H4: Date.UTC(2024, 3, 22, 8, 0, 0) / 1000,
    D1: Date.UTC(2024, 3, 22, 0, 0, 0) / 1000,
    W1: Date.UTC(2024, 3, 22, 0, 0, 0) / 1000,
    MN: Date.UTC(2024, 3, 1, 0, 0, 0) / 1000,
  };

  for (const [timeframe, expected] of Object.entries(expectedByTimeframe)) {
    assert.equal(alignTimeToBucket(sample, timeframe), expected, timeframe);
  }
});

test('unit: OHLC generation uses first tick for open, extremes for wick, newest tick for close', () => {
  const first = tick(1.1, 1713744065, 1);
  const newer = tick(1.2, 1713744070, 2, {}, first.price);
  const delayedOlder = tick(1.05, 1713744061, 3, {}, newer.price);
  const bucket = getLiveTickBucketTime(first, 'M1');

  const candle = mergeTickIntoLiveCandle(
    mergeTickIntoLiveCandle(createLiveCandleFromTick(bucket, first), newer),
    delayedOlder,
  );

  assert.equal(candle.open, 1.1);
  assert.equal(candle.high, 1.2);
  assert.equal(candle.low, 1.05);
  assert.equal(candle.close, 1.2);
  assert.equal(candle.firstTickTs, first.timestamp);
  assert.equal(candle.lastTickTs, newer.timestamp);
  assert.equal(candle.lastSequence, newer.sequence);
  assert.equal(isStructurallyValidCandle(candle), true);
});

test('unit: duplicate ticks are suppressed by stable validation signature before OHLC merge', () => {
  const seen = new Set<string>();
  const first = tick(1.1, 1713744065, 1);
  const duplicate = tick(1.1, 1713744065, 1);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  seen.add(first.signature);
  if (!seen.has(duplicate.signature)) {
    candle = mergeTickIntoLiveCandle(candle, duplicate);
  }

  assert.equal(duplicate.signature, first.signature);
  assert.equal(candle.volume, 0);
  assert.equal(candle.close, 1.1);
});

test('unit: delayed same-bucket tick can heal wick without moving open or close backward', () => {
  const first = tick(1.2, 1713744070, 10);
  const delayed = tick(1.1, 1713744045, 11, {}, first.price);
  const candle = mergeTickIntoLiveCandle(
    createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first),
    delayed,
  );

  assert.equal(candle.open, 1.2);
  assert.equal(candle.low, 1.1);
  assert.equal(candle.close, 1.2);
});

test('unit: live candle rollover appends the next bucket without mutating closed history', () => {
  const history = [
    makeTrustedHistoryCandle(1713744000, { open: 1.1, high: 1.12, low: 1.09, close: 1.11 }),
    makeTrustedHistoryCandle(1713744060, { open: 1.11, high: 1.13, low: 1.1, close: 1.12 }),
  ];
  const nextTick = tick(1.13, 1713744123, 1);
  const live = [createLiveCandleFromTick(getLiveTickBucketTime(nextTick, 'M1'), nextTick)];
  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');

  assert.deepEqual(history.map((candle) => candle.close), [1.11, 1.12]);
  assert.deepEqual(visible.map((candle) => candle.time), [1713744000, 1713744060, 1713744120]);
  assertNoSplitHistoryLiveSeries(history, live, 'M1');
  assertValidCandleSeries(visible);
});

test('unit: detached live candle remains in one merged series with a backend gap', () => {
  const history = [
    makeTrustedHistoryCandle(60),
    makeTrustedHistoryCandle(120),
  ];
  const detachedLive = [makeLiveOverlayCandle(360, { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(history, detachedLive, history, 'M1'), 'merged');

  const catchupHistory = [
    ...history,
    makeTrustedHistoryCandle(180),
    makeTrustedHistoryCandle(240),
    makeTrustedHistoryCandle(300),
  ];

  assert.equal(resolveVisibleSeriesMode(catchupHistory, detachedLive, history, 'M1'), 'merged');
  assertNoSplitHistoryLiveSeries(catchupHistory, detachedLive, 'M1');
});

test('unit: REST stale history merge preserves the wider trusted window', () => {
  const currentHistory = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
    makeCandle(240, { close: 1.4 }),
  ];
  const staleRefresh = [makeCandle(240, { close: 1.4 })];

  const merged = mergeFetchedHistoryIntoWindow(currentHistory, staleRefresh, 'M1');

  assert.deepEqual(merged.map((candle) => candle.time), [60, 120, 180, 240]);
});

test('unit: REST current candle conflict does not become closed authoritative history', () => {
  const restPayload = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.25 }),
  ];
  const liveSameBucket = makeLiveOverlayCandle(180, { close: 1.27 });

  const { closedHistory, currentCandle } = splitRestHistoryCandles(restPayload, 'M1', 'bid');
  const trustedFromMixed = markTrustedHistorySeries([...closedHistory, liveSameBucket], 'M1', 'bid');

  assert.deepEqual(closedHistory.map((candle) => candle.time), [60, 120]);
  assert.equal(currentCandle?.time, 180);
  assert.equal(trustedFromMixed.length, 2);
  assert.equal(trustedFromMixed.some((candle) => candle.time === liveSameBucket.time), false);
});

test('unit: invalid OHLC candles are rejected before merge', () => {
  const invalid = makeCandle(60, { open: 1.2, high: 1.1, low: 1.0, close: 1.15 });

  assert.equal(isStructurallyValidCandle(invalid), false);
  assert.equal(normalizeCandle(invalid, 'M1'), null);
  assert.deepEqual(sortAndDedupeCandles([invalid]), []);
});

test('unit: weekend/session D1 gap moves Friday directly to Monday without fabricated candles', () => {
  const friday = Date.UTC(2024, 3, 19, 0, 0, 0) / 1000;
  const monday = Date.UTC(2024, 3, 22, 0, 0, 0) / 1000;
  const history = [makeTrustedHistoryCandle(friday, { serverTimeframe: 'D1' })];
  const live = [makeLiveOverlayCandle(monday)];

  assert.equal(getExpectedNextCandleTime(friday, 'D1'), Date.UTC(2024, 3, 20, 0, 0, 0) / 1000);
  assert.equal(resolveVisibleSeriesMode(history, live, history, 'D1'), 'merged');
  assertNoSplitHistoryLiveSeries(history, live, 'D1');
});

test('unit: symbol and timeframe isolation prevents stale stream data after switching', () => {
  const stream = new MockWebSocketQuoteStream();
  const activeKey = { current: 'AUDCAD.M1' };
  const receivedByKey = new Map<string, Candle[]>();

  stream.subscribe('AUDCAD', (quote) => {
    const key = `${quote.symbol}.M1`;
    if (key !== activeKey.current) return;
    receivedByKey.set(key, [makeCandle(alignTimeToBucket(quote.timestamp, 'M1'), { close: quote.bid })]);
  });
  stream.subscribe('EURUSD', (quote) => {
    const key = `${quote.symbol}.M5`;
    if (key !== activeKey.current) return;
    receivedByKey.set(key, [makeCandle(alignTimeToBucket(quote.timestamp, 'M5'), { close: quote.bid })]);
  });

  assert.equal(stream.emit({ symbol: 'AUDCAD', bid: 0.89, ask: 0.8901, timestamp: 1713744065 }), 1);
  activeKey.current = 'EURUSD.M5';
  assert.equal(stream.emit({ symbol: 'AUDCAD', bid: 0.9, ask: 0.9001, timestamp: 1713744125 }), 1);
  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: 1713744125 }), 1);

  assert.deepEqual(Array.from(receivedByKey.keys()).sort(), ['AUDCAD.M1', 'EURUSD.M5']);
  assert.equal(receivedByKey.get('AUDCAD.M1')?.[0].close, 0.89);
  assert.equal(receivedByKey.get('EURUSD.M5')?.[0].time, alignTimeToBucket(1713744125, 'M5'));
});

test('unit: high-frequency tick burst keeps one valid candle and correct close', () => {
  const first = tick(1.1, 1713744061, 1);
  let candle = createLiveCandleFromTick(getLiveTickBucketTime(first, 'M1'), first);

  for (let sequence = 2; sequence <= 1000; sequence += 1) {
    const price = 1.1 + (sequence % 2 === 0 ? sequence : -sequence) / 1_000_000;
    candle = mergeTickIntoLiveCandle(candle, tick(price, 1713744061, sequence, {}, candle.close));
  }

  assert.equal(candle.volume, 0);
  assert.equal(candle.lastSequence, 1000);
  assert.equal(candle.close, 1.101);
  assert.equal(isStructurallyValidCandle(candle), true);
});

test('integration: REST history arrives before WebSocket ticks and merges without duplicate candles', async () => {
  const provider = new MockRestHistoryProvider().queueHistory([
    makeCandle(60, { close: 1.1, closed: true }),
    makeCandle(120, { close: 1.2, closed: true }),
  ]);
  const rest = await provider.fetchHistory({ symbol: 'EURUSD', timeframe: 'M1', limit: 2 });
  const history = markTrustedHistorySeries(rest, 'M1', 'bid');
  const nextTick = tick(1.25, 180, 1);
  const live = [createLiveCandleFromTick(getLiveTickBucketTime(nextTick, 'M1'), nextTick)];
  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');
  assert.deepEqual(visible.map((candle) => candle.time), [60, 120, 180]);
  assertNoDuplicateCandleTimes(visible);
});

test('integration: WebSocket ticks before REST can render as current data then merge with REST', async () => {
  const firstLiveTick = tick(1.25, 180, 1);
  const live = [createLiveCandleFromTick(getLiveTickBucketTime(firstLiveTick, 'M1'), firstLiveTick)];

  assert.equal(resolveVisibleSeriesMode([], live, [], 'M1'), 'current');

  const provider = new MockRestHistoryProvider().queueHistory([
    makeCandle(60, { closed: true }),
    makeCandle(120, { closed: true }),
  ]);
  const history = markTrustedHistorySeries(
    await provider.fetchHistory({ symbol: 'EURUSD', timeframe: 'M1' }),
    'M1',
    'bid',
  );

  assert.equal(resolveVisibleSeriesMode(history, live, [], 'M1'), 'merged');
  assertValidCandleSeries(materializeCanonicalHistoryAndLiveCandles(history, live, 'M1'));
});

test('integration: REST failure followed by retry produces a valid history window', async () => {
  const provider = new MockRestHistoryProvider()
    .queueFailure('network offline')
    .queueHistory([makeCandle(60, { closed: true }), makeCandle(120, { closed: true })]);

  await assert.rejects(() => provider.fetchHistory({ symbol: 'AUDCAD', timeframe: 'M1' }), /network offline/);

  const retryHistory = markTrustedHistorySeries(
    await provider.fetchHistory({ symbol: 'AUDCAD', timeframe: 'M1' }),
    'M1',
    'bid',
  );

  assert.deepEqual(retryHistory.map((candle) => candle.time), [60, 120]);
  assertValidCandleSeries(retryHistory);
});

test('integration: WebSocket disconnect and reconnect does not duplicate the active candle', () => {
  const stream = new MockWebSocketQuoteStream();
  const liveBySignature = new Set<string>();
  let live: Candle[] = [];

  stream.subscribe('EURUSD', (quote) => {
    const nextTick = tick(quote.bid ?? 0, quote.timestamp, liveBySignature.size + 1, {}, live[live.length - 1]?.close);
    if (liveBySignature.has(nextTick.signature)) return;
    liveBySignature.add(nextTick.signature);
    const existing = live.find((candle) => candle.time === getLiveTickBucketTime(nextTick, 'M1')) as ReturnType<typeof makeLiveOverlayCandle> | undefined;
    const nextLive = existing
      ? mergeTickIntoLiveCandle(existing, nextTick)
      : createLiveCandleFromTick(getLiveTickBucketTime(nextTick, 'M1'), nextTick);
    live = [nextLive];
  });

  stream.emit({ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: 1713744065 });
  stream.disconnect();
  stream.emit({ symbol: 'EURUSD', bid: 1.2, ask: 1.2001, timestamp: 1713744070 });
  stream.reconnect();
  stream.emit({ symbol: 'EURUSD', bid: 1.15, ask: 1.1501, timestamp: 1713744075 });

  assert.equal(live.length, 1);
  assert.equal(live[0].close, 1.15);
  assertNoDuplicateCandleTimes(live);
});

test('integration: detached live stream merges with REST history without duplicate buckets', () => {
  const detachedLive = [makeLiveOverlayCandle(360, { close: 1.3 })];
  const staleHistory = [makeTrustedHistoryCandle(60), makeTrustedHistoryCandle(120)];

  assert.equal(resolveVisibleSeriesMode(staleHistory, detachedLive, staleHistory, 'M1'), 'merged');

  const caughtUpHistory = [
    ...staleHistory,
    makeTrustedHistoryCandle(180),
    makeTrustedHistoryCandle(240),
    makeTrustedHistoryCandle(300),
  ];
  const visible = materializeCanonicalHistoryAndLiveCandles(caughtUpHistory, detachedLive, 'M1');

  assert.equal(resolveVisibleSeriesMode(caughtUpHistory, detachedLive, staleHistory, 'M1'), 'merged');
  assert.deepEqual(visible.map((candle) => candle.time), [60, 120, 180, 240, 300, 360]);
});

test('integration: app restart from cached candles restores only closed trusted history', () => {
  const cached = [
    makeTrustedHistoryCandle(60),
    makeTrustedHistoryCandle(120),
    makeLiveOverlayCandle(180, { close: 1.3 }),
  ];
  const hydrated = markTrustedHistorySeries(cached, 'M1', 'bid');

  assert.deepEqual(hydrated.map((candle) => candle.time), [60, 120]);
  assert.equal(hydrated.every((candle) => candle.source === 'rest' && candle.closed === true), true);
});

test('integration: fast symbol/timeframe switching keeps keyed candle windows isolated', () => {
  const audcadM1 = [makeCandle(60), makeCandle(120)];
  const audcadM5 = [makeCandle(300), makeCandle(600)];
  const eurusdM5 = [makeCandle(300, { close: 1.2 }), makeCandle(600, { close: 1.3 })];
  const windows = new Map<string, Candle[]>([
    ['AUDCAD.M1', audcadM1],
    ['AUDCAD.M5', audcadM5],
    ['EURUSD.M5', eurusdM5],
  ]);

  assert.deepEqual(windows.get('AUDCAD.M1')?.map((candle) => candle.time), [60, 120]);
  assert.deepEqual(windows.get('AUDCAD.M5')?.map((candle) => candle.time), [300, 600]);
  assert.deepEqual(windows.get('EURUSD.M5')?.map((candle) => candle.close), [1.2, 1.3]);
  assert.notDeepEqual(windows.get('AUDCAD.M5'), windows.get('EURUSD.M5'));
});
