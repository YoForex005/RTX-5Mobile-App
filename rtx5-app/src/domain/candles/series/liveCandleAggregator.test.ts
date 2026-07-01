import test from 'node:test';
import assert from 'node:assert/strict';

import { applyLiveCandleToCandleMap } from './liveCandleAggregator';
import type { LiveCandle, MutableCandle } from '../core/candleTypes';

const TIMEFRAME = 'M1';
const BUCKET = 1_699_999_980;

const buildEmptyMap = (): Map<number, MutableCandle> => new Map();

test('rejects backend live snapshots for the closed history cutoff bucket', () => {
  const candleMap = buildEmptyMap();
  const live: LiveCandle = {
    time: BUCKET + 5,
    open: 9,
    high: 9,
    low: 9,
    close: 9,
    volume: 1,
  };

  const result = applyLiveCandleToCandleMap(candleMap, live, TIMEFRAME, {
    historyCutoffTime: BUCKET,
  });

  assert.equal(result.ignored, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.equal(candleMap.size, 0);
});

test('first backend snapshot for a bucket writes broker OHLC unchanged', () => {
  const candleMap = buildEmptyMap();
  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0810,
    low: 1.0800,
    close: 1.0807,
    volume: 12,
  });
});

test('backend update for the same bucket replaces previous broker OHLC', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0806, high: 1.0815, low: 1.0802, close: 1.0812, volume: 18, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0806,
    high: 1.0815,
    low: 1.0802,
    close: 1.0812,
    volume: 18,
  });
});

test('closing backend snapshot accepts broker OHLC verbatim', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const closingSnapshot: LiveCandle = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
    closed: true,
  };
  const result = applyLiveCandleToCandleMap(candleMap, closingSnapshot, TIMEFRAME, {
    historyCutoffTime: BUCKET - 60,
  });

  assert.equal(result.ignored, false);
  assert.equal(candleMap.get(BUCKET)?.closed, true);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
  });
});

test('non-closing backend snapshot cannot reopen a backend-closed live candle', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0816, low: 1.0798, close: 1.0815, volume: 28, closed: true },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0820, low: 1.0790, close: 1.0819, volume: 32, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'closed_live_candle');
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
  });
});

test('backend server_time prevents delayed forming snapshots from overwriting newer ones', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 20,
      open: 1.0805,
      high: 1.0820,
      low: 1.0800,
      close: 1.0818,
      volume: 20,
      closed: false,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const delayed = applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 10,
      open: 1.0805,
      high: 1.0810,
      low: 1.0802,
      close: 1.0808,
      volume: 12,
      closed: false,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(delayed.ignored, false);
  assert.equal(delayed.reason, 'merged_out_of_order_live_candle');
  assert.equal(delayed.candle?.close, 1.0818);
  assert.equal(delayed.candle?.high, 1.0820);
  assert.equal(candleMap.get(BUCKET)?.lastBackendUpdateTime, BUCKET + 20);
});
