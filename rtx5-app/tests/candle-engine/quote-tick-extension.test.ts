/**
 * Active-candle extension via quote-tick bridge — pure-helper tests.
 *
 * Backends commonly publish candle messages only on bar-close (or on a slow
 * cadence), while real-time price movement within the active bar arrives via
 * the quote feed. Without bridging the quote tick into the active candle the
 * forming bar stays static while the bid/ask line moves above the chart.
 *
 * `applyQuoteTickExtensionToCandleMap` is the pure helper the engine wraps:
 *
 *   - Updates only an EXISTING bucket (live map or REST current candle whose
 *     time matches the active bucket).
 *   - Never invents a new bucket. If neither matches, returns `ignored=true`.
 *   - Never modifies closed history (gated by `historyCutoffTime`).
 *   - Subsequent backend `applyLiveCandleToCandleMap` calls fully overwrite
 *     the bucket — backend remains the authoritative source.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from '../../src/domain/candles/series/liveCandleAggregator';
import {
  createCandleMap,
  materializeCandleMap,
} from '../../src/domain/candles/series/candleSeriesMerger';
import {
  makeBackendLiveCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const t1000 = secondsUtc(2024, 3, 22, 10, 0, 0);
const t1001 = secondsUtc(2024, 3, 22, 10, 1, 0);
const t1002 = secondsUtc(2024, 3, 22, 10, 2, 0);

test('quote tick extends close of an existing live candle in the active bucket', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.108, low: 1.102, close: 1.106 }),
    'M1',
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 30 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.close, 1.115);
  assert.equal(active.high, 1.115);
  // Low stays at backend-supplied minimum.
  assert.equal(active.low, 1.102);
});

test('quote tick widens wick high and low symmetrically as price swings', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.1, high: 1.1, low: 1.1, close: 1.1 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.12, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.08, time: t1001 + 10 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.105, time: t1001 + 15 }, 'M1');

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.high, 1.12);
  assert.equal(active.low, 1.08);
  assert.equal(active.close, 1.105);
});

test('quote tick falls back to seeding from REST current candle when no live candle exists yet', () => {
  const map = createCandleMap();
  // No backend live message yet; REST returned a "current" candle at t1001.
  const restCurrent = {
    time: t1001,
    open: 1.105,
    high: 1.107,
    low: 1.103,
    close: 1.106,
    volume: 0,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 25 },
    'M1',
    { historyCutoffTime: t1000, latestHistoryCandle: restCurrent },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.close, 1.115);
  assert.equal(active.high, 1.115);
  // Low stays at REST-supplied minimum.
  assert.equal(active.low, 1.103);
});

test('quote tick is dropped when no backend candle exists at the active bucket (no fake candle invented)', () => {
  const map = createCandleMap([makeTrustedHistoryCandle(t1000, { close: 1.105 })]);

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 30 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'no_active_backend_candle');
  // Series unchanged: only the closed history candle remains.
  const candles = materializeCandleMap(map);
  assert.deepEqual(candles.map((c) => c.time), [t1000]);
});

test('backend live candle snapshot fully overwrites a quote-tick-extended bucket (backend authority)', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.106, low: 1.104, close: 1.105 }),
    'M1',
  );

  // Quote ticks pump the close around 1.110.
  applyQuoteTickExtensionToCandleMap(map, { price: 1.110, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.112, time: t1001 + 10 }, 'M1');

  // Backend then sends an authoritative snapshot with different OHLC.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.108, low: 1.103, close: 1.107 }),
    'M1',
  );

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  // Backend wins: close=1.107, high=1.108, low=1.103. The 1.112 tick high is
  // discarded because the next backend snapshot is authoritative.
  assert.equal(active.time, t1001);
  assert.equal(active.open, 1.105);
  assert.equal(active.high, 1.108);
  assert.equal(active.low, 1.103);
  assert.equal(active.close, 1.107);
});

test('quote tick for a closed history bucket is rejected (closed history is immutable)', () => {
  const map = createCandleMap([
    makeTrustedHistoryCandle(t1000, { open: 1.1, high: 1.11, low: 1.09, close: 1.105 }),
    makeTrustedHistoryCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
  ]);

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.999, time: t1000 + 30 },
    'M1',
    { historyCutoffTime: t1001 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'older_than_history_cutoff');
  // History unchanged: both closed candles intact.
  const candles = materializeCandleMap(map);
  const closedFirst = candles.find((c) => c.time === t1000);
  assert.ok(closedFirst);
  assert.equal(closedFirst!.close, 1.105);
  assert.equal(closedFirst!.high, 1.11);
  assert.equal(closedFirst!.low, 1.09);
});

test('quote tick with invalid price is dropped without mutating the map', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
  );

  for (const bad of [NaN, -1, 0, Infinity, -Infinity]) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: bad, time: t1001 + 5 },
      'M1',
    );
    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'invalid_price');
  }

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.close, 1.106);
  assert.equal(active.high, 1.107);
  assert.equal(active.low, 1.103);
});

test('quote tick with invalid timestamp is dropped without mutating the map', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
  );

  for (const bad of [null, undefined, '', 'invalid', NaN, -1]) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: 1.115, time: bad },
      'M1',
    );
    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'invalid_timestamp');
  }

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.close, 1.106);
});

test('repeated identical quote ticks do not flip changed=true', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.106, low: 1.104, close: 1.106 }),
    'M1',
  );

  // First tick at 1.106 — same close as backend, same high/low. Map already
  // contains the bucket so the helper reports changed=false.
  const first = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.106, time: t1001 + 5 },
    'M1',
  );
  assert.equal(first.ignored, false);
  assert.equal(first.changed, false);

  // Subsequent identical ticks also report changed=false.
  for (let i = 0; i < 5; i += 1) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: 1.106, time: t1001 + 6 + i },
      'M1',
    );
    assert.equal(result.changed, false);
  }
});

test('quote tick preserves wick high once widened — subsequent lower ticks do not shrink it', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.1, high: 1.1, low: 1.1, close: 1.1 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.15, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.05, time: t1001 + 10 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.10, time: t1001 + 15 }, 'M1');

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.high, 1.15);
  assert.equal(active.low, 1.05);
  assert.equal(active.close, 1.10);
});

test('quote tick reaching a future bucket above the live tail extends nothing without a backend bucket', () => {
  // History up to t1000. Live has t1001 as the active bucket. Tick lands in
  // t1002 (no backend candle yet). Must NOT fabricate t1002.
  const map = createCandleMap([makeTrustedHistoryCandle(t1000, { close: 1.105 })]);
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
    { historyCutoffTime: t1000 },
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.110, time: t1002 + 5 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'no_active_backend_candle');
  const candles = materializeCandleMap(map);
  // Series stays at [t1000, t1001] — no fabricated t1002.
  assert.deepEqual(candles.map((c) => c.time), [t1000, t1001]);
});

test('quote tick across multiple subsequent backend snapshots leaves no residue', () => {
  // Simulates the full lifecycle: backend creates bucket → ticks extend close
  // → backend snapshot 2 overwrites → more ticks → backend snapshot 3
  // overwrites again. Each backend snapshot must reset all OHLC to authority.
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.0, low: 1.0, close: 1.0 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.5, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 0.5, time: t1001 + 10 }, 'M1');

  // Backend snapshot 2: overwrites all of the tick-driven OHLC.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.05, low: 0.95, close: 1.02 }),
    'M1',
  );

  let candles = materializeCandleMap(map);
  let active = candles[candles.length - 1];
  assert.equal(active.high, 1.05);
  assert.equal(active.low, 0.95);
  assert.equal(active.close, 1.02);

  // Now ticks again.
  applyQuoteTickExtensionToCandleMap(map, { price: 1.10, time: t1001 + 15 }, 'M1');
  candles = materializeCandleMap(map);
  active = candles[candles.length - 1];
  assert.equal(active.close, 1.10);
  assert.equal(active.high, 1.10);
  // Backend's low (0.95) stays as floor (tick at 1.10 doesn't affect low).
  assert.equal(active.low, 0.95);

  // Backend snapshot 3: again resets.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.08, low: 0.98, close: 1.04 }),
    'M1',
  );
  candles = materializeCandleMap(map);
  active = candles[candles.length - 1];
  assert.equal(active.high, 1.08);
  assert.equal(active.low, 0.98);
  assert.equal(active.close, 1.04);
});
