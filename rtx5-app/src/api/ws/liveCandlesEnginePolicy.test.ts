import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCurrentVisibleSeries,
  resolveVisibleSeriesMode,
  shouldAdoptCachedSeries,
  shouldKeepBootstrappingOnHistoryFailure,
  shouldRenderBootstrapPreview,
  shouldSyncVisibleSeriesCache,
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

test('resolveVisibleSeriesMode keeps trusted history visible when live candles detach from history', () => {
  assert.equal(
    resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(340)], [makeCandle(220)], 'M1'),
    'history',
  );
});

test('resolveVisibleSeriesMode never merges detached live candles into existing history', () => {
  const history = [makeCandle(100), makeCandle(160), makeCandle(220)];
  const detachedLive = [makeCandle(520), makeCandle(580)];
  const currentVisibleHistory = history;

  assert.equal(
    resolveVisibleSeriesMode(history, detachedLive, currentVisibleHistory, 'M1'),
    'history',
  );
  assert.equal(shouldSyncVisibleSeriesCache('history', history, 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('current', detachedLive, 'M1'), false);
});

test('resolveVisibleSeriesMode paints trusted history on cold start when live is detached', () => {
  assert.equal(resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(340)], [], 'M1'), 'history');
});

test('resolveVisibleSeriesMode allows live-only candles only when backend history is absent', () => {
  const liveOnly = [makeCandle(520), makeCandle(580)];

  assert.equal(resolveVisibleSeriesMode([], liveOnly, [], 'M1'), 'current');
  assert.equal(shouldSyncVisibleSeriesCache('current', liveOnly, 'M1'), false);
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

test('shouldSyncVisibleSeriesCache rejects detached current slices from the shared bootstrap cache', () => {
  assert.equal(shouldSyncVisibleSeriesCache('current', [makeCandle(340)], 'M1'), false);
  assert.equal(
    shouldSyncVisibleSeriesCache(
      'current',
      [
        makeCandle(60),
        makeCandle(120),
        makeCandle(180),
        makeCandle(240),
        makeCandle(300),
        makeCandle(360),
        makeCandle(420),
        makeCandle(480),
      ],
      'M1',
    ),
    false,
  );
});

test('shouldSyncVisibleSeriesCache keeps merged and history snapshots cacheable', () => {
  assert.equal(shouldSyncVisibleSeriesCache('history', [makeCandle(100)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('merged', [makeCandle(100), makeCandle(160)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('empty', [], 'M1'), false);
});

test('shouldKeepBootstrappingOnHistoryFailure stays true until the engine has a safe visible series', () => {
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 0), true);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(1, 0), false);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 2), false);
});
