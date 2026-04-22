import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCurrentVisibleSeries,
  resolveVisibleSeriesMode,
  shouldAdoptCachedSeries,
  shouldKeepBootstrappingOnHistoryFailure,
  shouldRenderBootstrapPreview,
} from './liveCandlesEnginePolicy';

const makeCandle = (time: number) => ({ time });

test('shouldRenderBootstrapPreview stays false for cold bootstrap without seeded history', () => {
  assert.equal(shouldRenderBootstrapPreview(0, 0), false);
});

test('shouldRenderBootstrapPreview stays true once a merged series already exists', () => {
  assert.equal(shouldRenderBootstrapPreview(0, 1), true);
  assert.equal(shouldRenderBootstrapPreview(2, 0), true);
});

test('shouldAdoptCachedSeries accepts merged cache while entry is still bootstrapping', () => {
  const current = [makeCandle(200)];
  const cached = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.equal(shouldAdoptCachedSeries('bootstrapping', 0, current, cached), true);
});

test('shouldAdoptCachedSeries rejects a shorter stale cache once the engine is ready', () => {
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];
  const cached = [makeCandle(100), makeCandle(160)];

  assert.equal(shouldAdoptCachedSeries('ready', current.length, current, cached), false);
});

test('shouldAdoptCachedSeries rejects an identical cache snapshot', () => {
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.equal(shouldAdoptCachedSeries('ready', current.length, current, current), false);
});

test('resolveVisibleSeriesMode preserves the current visible series when history is absent', () => {
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [makeCandle(160)], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [], [], 'M1'), 'empty');
});

test('resolveVisibleSeriesMode preserves the current visible series when live candles detach from history', () => {
  assert.equal(
    resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(340)], [makeCandle(220)], 'M1'),
    'current',
  );
});

test('resolveVisibleSeriesMode enters detached live mode immediately even before a current series exists', () => {
  assert.equal(resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(340)], [], 'M1'), 'current');
});

test('resolveCurrentVisibleSeries prefers the fresh live-only segment when history is detached', () => {
  const liveOnly = [makeCandle(340), makeCandle(400)];
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.deepEqual(
    resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], liveOnly, current),
    liveOnly,
  );
});

test('resolveCurrentVisibleSeries falls back to the current visible series when live candles are temporarily empty', () => {
  const current = [makeCandle(220), makeCandle(280)];

  assert.deepEqual(resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], [], current), current);
});

test('resolveVisibleSeriesMode merges history and live candles when they stay contiguous', () => {
  assert.equal(
    resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(220)], [makeCandle(160)], 'M1'),
    'merged',
  );
});

test('shouldKeepBootstrappingOnHistoryFailure stays true until the engine has a safe visible series', () => {
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 0), true);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(1, 0), false);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 2), false);
});
