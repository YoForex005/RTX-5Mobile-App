import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/candles/candleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/candles/candleMerger';
import { secondsUtc } from '../support/candleTestUtils';

test('older backend live candle snapshots cannot rewind the active candle', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 40, open: 1.1, high: 1.15, low: 1.09, close: 1.14, volume: 10 },
    'M1',
  );
  const stale = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 10, open: 1.1, high: 1.11, low: 1.09, close: 1.1, volume: 2 },
    'M1',
  );

  assert.equal(stale.ignored, true);
  assert.equal(stale.reason, 'stale_live_candle');
  assert.deepEqual(materializeCandleMap(map), [
    { time: bucket, open: 1.1, high: 1.15, low: 1.09, close: 1.14, volume: 10 },
  ]);
});

test('late missing backend buckets behind the current tail are ignored instead of backfilled locally', () => {
  const map = createCandleMap();
  const currentBucket = secondsUtc(2024, 3, 22, 12, 5, 0);

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: currentBucket, open: 1.2, high: 1.22, low: 1.19, close: 1.21, volume: 5 },
    'M1',
  );
  const late = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: currentBucket - 120, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 4 },
    'M1',
  );

  assert.equal(late.ignored, true);
  assert.equal(late.reason, 'late_missing_bucket');
  assert.deepEqual(materializeCandleMap(map).map((candle) => candle.time), [currentBucket]);
});
