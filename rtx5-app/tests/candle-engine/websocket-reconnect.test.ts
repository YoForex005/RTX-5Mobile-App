import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveCandleFromTick,
  getLiveTickBucketTime,
  mergeTickIntoLiveCandle,
} from '../../src/api/ws/liveCandleOverlay';
import { resolveVisibleSeriesMode } from '../../src/api/ws/liveCandlesEnginePolicy';
import {
  MockWebSocketQuoteStream,
  assertNoDuplicateCandleTimes,
  buildContiguousHistory,
  makeLiveOverlayCandle,
  secondsUtc,
  validateBidTick,
} from '../support/candleTestUtils';
import type { Candle } from '../../src/state/tradingState';
import type { LiveOverlayCandle } from '../../src/domain/candleProvenance';

test('socket disconnect keeps last trusted candles and reconnect resumes live updates', () => {
  const stream = new MockWebSocketQuoteStream();
  const signatures = new Set<string>();
  let live: LiveOverlayCandle | null = null;

  stream.subscribe('EURUSD', (quote) => {
    const tick = validateBidTick(quote.bid ?? 0, quote.timestamp, signatures.size + 1, {}, live?.close);
    if (signatures.has(tick.signature)) {
      return;
    }
    signatures.add(tick.signature);

    const bucketTime = getLiveTickBucketTime(tick, 'M1');
    live = live && live.time === bucketTime
      ? mergeTickIntoLiveCandle(live, tick)
      : createLiveCandleFromTick(bucketTime, tick);
  });

  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: 1713744065 }), 1);
  stream.disconnect();
  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.2, ask: 1.2001, timestamp: 1713744070 }), 0);
  stream.reconnect();
  assert.equal(stream.emit({ symbol: 'EURUSD', bid: 1.15, ask: 1.1501, timestamp: 1713744075 }), 1);

  const finalLive = live as LiveOverlayCandle | null;
  assert.ok(finalLive);
  assert.equal(finalLive.close, 1.15);
  assert.equal(finalLive.volume, 0);
});

test('reconnect old ticks do not create duplicate active candles', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 2, 'M1');
  const activeBucket = secondsUtc(2024, 3, 22, 12, 2, 0);
  const live = [
    makeLiveOverlayCandle(activeBucket, {
      open: 1.1,
      high: 1.2,
      low: 1.1,
      close: 1.2,
      firstTickTs: activeBucket + 20,
      lastTickTs: activeBucket + 50,
      firstSequence: 1,
      lastSequence: 3,
    }),
  ];

  const oldReconnectTick = validateBidTick(1.15, activeBucket + 10, 4, {}, live[0].close);
  const merged = mergeTickIntoLiveCandle(live[0], oldReconnectTick);
  const visible: Candle[] = [...history, merged];

  assert.equal(merged.close, 1.2);
  assert.equal(merged.low, 1.1);
  assertNoDuplicateCandleTimes(visible);
});

test('missed buckets during disconnect remain a visible backend gap in one merged series', () => {
  const staleHistory = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 2, 'M1');
  const liveAfterReconnect = [makeLiveOverlayCandle(secondsUtc(2024, 3, 22, 12, 8, 0), { close: 1.4 })];

  assert.equal(resolveVisibleSeriesMode(staleHistory, liveAfterReconnect, staleHistory, 'M1'), 'merged');

  const caughtUpHistory = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 8, 'M1');
  assert.equal(resolveVisibleSeriesMode(caughtUpHistory, liveAfterReconnect, staleHistory, 'M1'), 'merged');
});

test('mock quote stream isolates subscriptions by normalized symbol', () => {
  const stream = new MockWebSocketQuoteStream();
  const received: string[] = [];

  stream.subscribe('EURUSDm', (tick) => received.push(`${tick.symbol}:${tick.bid}`));
  stream.subscribe('XAUUSD', (tick) => received.push(`${tick.symbol}:${tick.bid}`));

  stream.emit({ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: 1 });
  stream.emit({ symbol: 'XAUUSD.c', bid: 2300, ask: 2300.1, timestamp: 1 });

  assert.deepEqual(received.sort(), ['EURUSD:1.1', 'XAUUSD:2300']);
  assert.equal(stream.listenerCount('EURUSD'), 1);
  assert.equal(stream.listenerCount('XAUUSD'), 1);
});
