import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from './liveCandleAggregator';
import type { LiveCandle, MutableCandle } from '../core/candleTypes';

// 1-minute timeframe: each bucket is a 60-second slot starting at multiples
// of 60. The tests below use bucket-aligned timestamps so the asserts read
// naturally — the aggregator itself snaps `tick.time` to its bucket via
// getBucketStart, which is exercised separately by timeframeUtils tests.
const TIMEFRAME = 'M1';
const BUCKET = 1_699_999_980; // arbitrary M1-aligned (60-second-multiple) timestamp

const baseRestTail = {
  time: BUCKET,
  open: 1.0805,
  high: 1.0810,
  low: 1.0800,
  close: 1.0807,
  volume: 12,
};

const buildEmptyMap = (): Map<number, MutableCandle> => new Map();

test('opens forming candle from REST seed when first quote tick arrives in active bucket', () => {
  const candleMap = buildEmptyMap();
  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0812, time: BUCKET + 5 },
    TIMEFRAME,
    {
      historyCutoffTime: BUCKET - 60, // last closed bucket sits one slot back
      latestHistoryCandle: baseRestTail,
    },
  );

  assert.equal(result.ignored, false, `expected acceptance; reason=${result.reason ?? ''}`);
  assert.equal(result.changed, true);
  assert.ok(result.candle, 'aggregator must return a candle');
  assert.equal(result.candle!.time, BUCKET);
  assert.equal(result.candle!.open, baseRestTail.open);
  assert.equal(result.candle!.close, 1.0812, 'tick price becomes the live close');
  assert.equal(result.candle!.high, 1.0812, 'tick widens high above REST seed');
  assert.equal(result.candle!.low, baseRestTail.low);

  const stored = candleMap.get(BUCKET);
  assert.ok(stored, 'forming candle is now in the live map');
  assert.equal(stored!.close, 1.0812);
});

test('subsequent quote ticks in the same bucket update close and widen wicks', () => {
  const candleMap = buildEmptyMap();
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0812, time: BUCKET + 5 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: baseRestTail },
  );

  const second = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0820, time: BUCKET + 12 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: baseRestTail },
  );
  assert.equal(second.ignored, false);
  assert.equal(second.changed, true);
  assert.equal(second.candle!.close, 1.0820);
  assert.equal(second.candle!.high, 1.0820, 'higher tick widens high');

  const third = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0796, time: BUCKET + 30 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: baseRestTail },
  );
  assert.equal(third.ignored, false);
  assert.equal(third.candle!.close, 1.0796);
  assert.equal(third.candle!.low, 1.0796, 'lower tick widens low');
  assert.equal(third.candle!.high, 1.0820, 'previously widened high persists');
});

test('first tick after a closed REST bucket opens the next contiguous live bucket', () => {
  const closedRestTail = {
    time: BUCKET - 60, // one bucket before the active one
    open: 1.0800,
    high: 1.0808,
    low: 1.0796,
    close: 1.0804,
    volume: 30,
  };
  const candleMap = buildEmptyMap();

  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0810, time: BUCKET + 4 },
    TIMEFRAME,
    {
      // History closed at the prior bucket; the current bucket is wide open
      // for tick-driven extension.
      historyCutoffTime: BUCKET - 60,
      latestHistoryCandle: closedRestTail,
    },
  );

  assert.equal(result.ignored, false, `expected acceptance; reason=${result.reason ?? ''}`);
  assert.ok(result.candle, 'next bucket must open from the prior REST close');
  assert.equal(result.candle!.time, BUCKET, 'opened bucket must equal the tick bucket start');
  assert.equal(result.candle!.open, closedRestTail.close, 'open seeds from REST close');
  assert.equal(result.candle!.close, 1.0810);
});

test('quote tick widens the OHLC of an existing backend live snapshot', () => {
  const candleMap = buildEmptyMap();
  // Simulate the backend live_candle path having just stamped a snapshot
  // for the active bucket. The live tick must extend it without reopening.
  candleMap.set(BUCKET, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0810,
    low: 1.0800,
    close: 1.0807,
    volume: 12,
    source: 'live_candle',
    closed: false,
    firstUpdateTime: BUCKET,
    lastUpdateTime: BUCKET + 5,
  });

  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0815, time: BUCKET + 8 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: null },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.equal(result.candle!.open, 1.0805, 'backend open survives a quote tick');
  assert.equal(result.candle!.close, 1.0815, 'tick price replaces close');
  assert.equal(result.candle!.high, 1.0815, 'tick widens high above prior backend high');
});

test('in-order backend snapshot overwrites quote-expanded temporary wicks', () => {
  // Realistic scenario:
  // 1. Backend opens the bucket with H=1.0810 / L=1.0800.
  // 2. A quote tick widens the wick to H=1.0830 between snapshots.
  // 3. The next backend snapshot reports H=1.0815 / L=1.0802 — narrower
  //    than what the tick stream observed because the broker did not yet
  //    receive the same spike.
  // The merged candle MUST keep the wider H seen by the ticks; otherwise
  // the wick visibly shrinks ("candle tick breakdown").
  const candleMap = buildEmptyMap();

  const firstSnapshot: LiveCandle = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0810,
    low: 1.0800,
    close: 1.0807,
    volume: 12,
    closed: false,
  };
  applyLiveCandleToCandleMap(candleMap, firstSnapshot, TIMEFRAME, {
    historyCutoffTime: BUCKET - 60,
  });
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0830, time: BUCKET + 12 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: null },
  );

  const secondSnapshot: LiveCandle = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0815, // narrower than the tick-built 1.0830 — must NOT shrink the wick
    low: 1.0802,  // narrower than the existing 1.0800 — must NOT shrink the wick
    close: 1.0812,
    volume: 18,
    closed: false,
  };
  const result = applyLiveCandleToCandleMap(candleMap, secondSnapshot, TIMEFRAME, {
    historyCutoffTime: BUCKET - 60,
  });

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.equal(result.candle!.high, 1.0815, 'broker high is authoritative');
  assert.equal(result.candle!.low, 1.0802, 'broker low is authoritative');
  assert.equal(result.candle!.close, 1.0812, 'broker close is authoritative');
  assert.equal(result.candle!.open, 1.0805, 'broker open is authoritative');
});

test('closing snapshot accepts broker OHLC verbatim (final word on the bar)', () => {
  // Once the broker says the bar is closed, the bar is done forming and
  // the broker's OHLC stands. Local tick observations are not allowed to
  // override the broker's final tally.
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0830, time: BUCKET + 12 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: null },
  );

  const closingSnapshot: LiveCandle = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816, // broker's final high — narrower than tick-observed 1.0830
    low: 1.0798,
    close: 1.0815,
    volume: 28,
    closed: true,
  };
  const result = applyLiveCandleToCandleMap(candleMap, closingSnapshot, TIMEFRAME, {
    historyCutoffTime: BUCKET - 60,
  });

  assert.equal(result.ignored, false);
  assert.equal(candleMap.get(BUCKET)!.closed, true, 'mutable entry is finalised');
  assert.equal(result.candle!.high, 1.0816, 'closing snapshot is authoritative — broker H wins');
  assert.equal(result.candle!.low, 1.0798);
  assert.equal(result.candle!.close, 1.0815);
});

test('first snapshot for a bucket writes broker OHLC unchanged', () => {
  const candleMap = buildEmptyMap();
  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );
  assert.equal(result.ignored, false);
  assert.equal(result.candle!.open, 1.0805);
  assert.equal(result.candle!.high, 1.0810);
  assert.equal(result.candle!.low, 1.0800);
  assert.equal(result.candle!.close, 1.0807);
});

test('opens tick-only bucket when REST seed for the same bucket is stale', () => {
  // REST returned a current candle for this bucket but the broker's price
  // jumped (news event, weekend reopen) so the tick is far outside REST's
  // bounds. The aggregator MUST still generate the live candle — using the
  // tick as the open — instead of rejecting.
  const candleMap = buildEmptyMap();
  const staleRestTail = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0810,
    low: 1.0800,
    close: 1.0807,
    volume: 12,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.2050, time: BUCKET + 5 }, // far outside the stale seed
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: staleRestTail },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.205,
    high: 1.205,
    low: 1.205,
    close: 1.205,
    volume: 0,
  });
  assert.equal(candleMap.size, 1);
});

test('opens next contiguous tick-only bucket when prior close is stale', () => {
  // Prior bucket closed at one regime; the next bucket's first tick is in a
  // very different regime. Still must generate the live candle.
  const candleMap = buildEmptyMap();
  const stalePriorClose = {
    time: BUCKET - 60,
    open: 1.0800,
    high: 1.0808,
    low: 1.0796,
    close: 1.0804,
    volume: 30,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.2100, time: BUCKET + 4 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: stalePriorClose },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.21,
    high: 1.21,
    low: 1.21,
    close: 1.21,
    volume: 0,
  });
  assert.equal(candleMap.size, 1);
});

test('opens tick-only fresh bucket when there is a multi-bucket gap without filling the gap', () => {
  // Last known bucket is far in the past — the tick is several buckets
  // ahead. We do NOT fabricate the missing buckets; we open the bucket the
  // tick falls into so the live candle is generated.
  const candleMap = buildEmptyMap();
  const staleClosedTail = {
    time: BUCKET - 600, // 10 buckets back
    open: 1.0800,
    high: 1.0808,
    low: 1.0796,
    close: 1.0804,
    volume: 30,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0815, time: BUCKET + 4 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 660, latestHistoryCandle: staleClosedTail },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0815,
    high: 1.0815,
    low: 1.0815,
    close: 1.0815,
    volume: 0,
  });
  assert.equal(candleMap.size, 1);
});

test('backend snapshot keeps geometric invariants after a quote dip', () => {
  // Realistic scenario:
  // 1. Backend opens bucket: O=1.0810 H=1.0815 L=1.0808 C=1.0812 (valid).
  // 2. Tick stream dips price to 1.0795 — low extended below original low.
  //    Existing now: O=1.0810 H=1.0815 L=1.0795 C=1.0795 (valid).
  // 3. Backend sends another snapshot with O=1.0808 (above existing.low,
  //    but lower than original open) H=1.0815 L=1.0808 C=1.0813.
  // The merged candle must remain geometrically valid: in particular, the
  // tick-observed low (1.0795) must survive AND must remain ≤ the new open.
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0810, high: 1.0815, low: 1.0808, close: 1.0812, volume: 6, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0795, time: BUCKET + 8 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: null },
  );

  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0808, high: 1.0815, low: 1.0808, close: 1.0813, volume: 18, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, false, `merge must succeed; reason=${result.reason ?? ''}`);
  assert.ok(result.candle, 'merge must yield a candle');
  assert.ok(result.candle!.low <= result.candle!.open, 'low ≤ open invariant holds');
  assert.ok(result.candle!.low <= result.candle!.close, 'low ≤ close invariant holds');
  assert.ok(result.candle!.high >= result.candle!.open, 'high ≥ open invariant holds');
  assert.ok(result.candle!.high >= result.candle!.close, 'high ≥ close invariant holds');
  assert.equal(result.candle!.open, 1.0808, 'broker open authoritative');
  assert.equal(result.candle!.close, 1.0813, 'broker close authoritative');
  assert.equal(result.candle!.low, 1.0808, 'broker low authoritative');
  assert.equal(result.candle!.high, 1.0815);
});

test('rejects ticks for a bucket strictly older than closed history', () => {
  const candleMap = buildEmptyMap();
  const result = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0812, time: BUCKET - 600 }, // ten buckets back
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, latestHistoryCandle: baseRestTail },
  );

  assert.equal(result.ignored, true, 'older-than-history ticks must not mutate the map');
  assert.equal(result.changed, false);
  assert.equal(candleMap.size, 0);
});
