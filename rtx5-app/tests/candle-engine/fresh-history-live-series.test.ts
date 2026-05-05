import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFreshHistoryLiveCandleSeries,
  pruneLiveCandleMapCoveredByHistory,
} from '../../src/domain/candles/series/freshHistoryLiveSeries';
import type { MutableCandle } from '../../src/domain/candles/core/candleTypes';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeBackendLiveCandle,
  makeCandle,
  secondsUtc,
} from '../support/candleTestUtils';

test('fresh history plus same-bucket backend live candle produces one active candle', () => {
  const activeTime = secondsUtc(2024, 3, 22, 10, 2, 0);
  const history = [
    makeCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 1.1 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 1.2 }),
    makeCandle(activeTime, { open: 1.2, high: 1.24, low: 1.18, close: 1.22 }),
  ];
  const live = [
    makeBackendLiveCandle(activeTime, {
      open: 1.2,
      high: 1.27,
      low: 1.18,
      close: 1.26,
      volume: 18,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live);

  assert.equal(visible.length, 3);
  assert.equal(visible.filter((candle) => candle.time === activeTime).length, 1);
  assert.equal(visible[visible.length - 1].close, 1.26);
  assert.equal(visible[visible.length - 1].volume, 18);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('fresh series preserves backend live candle beyond the history tail', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const live = [
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 5, 0), {
      open: 1.33,
      high: 1.36,
      low: 1.32,
      close: 1.35,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live);

  assert.deepEqual(visible.map((candle) => candle.time), [
    ...history.map((candle) => candle.time),
    secondsUtc(2024, 3, 22, 10, 5, 0),
  ]);
  assertValidCandleSeries(visible);
});

test('history catch-up prunes live candles that are now closed REST history', () => {
  const liveMap = new Map<number, MutableCandle>([
    [
      secondsUtc(2024, 3, 22, 10, 2, 0),
      {
        ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 2, 0)),
        source: 'live_candle',
      },
    ],
    [
      secondsUtc(2024, 3, 22, 10, 4, 0),
      {
        ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 4, 0), { close: 1.4 }),
        source: 'live_candle',
      },
    ],
  ]);

  const pruned = pruneLiveCandleMapCoveredByHistory(
    liveMap,
    secondsUtc(2024, 3, 22, 10, 3, 0),
  );

  assert.deepEqual(Array.from(pruned.keys()), [secondsUtc(2024, 3, 22, 10, 4, 0)]);
});
