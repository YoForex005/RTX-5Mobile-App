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

test('shouldRenderBootstrapPreview remains disabled for the production policy', () => {
  assert.equal(shouldRenderBootstrapPreview(0, 0), false);
  assert.equal(shouldRenderBootstrapPreview(0, 1), false);
  assert.equal(shouldRenderBootstrapPreview(2, 0), false);
});

test('shouldAdoptCachedSeries accepts useful cache while entry is still bootstrapping', () => {
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

test('resolveVisibleSeriesMode allows backend live data when history is absent', () => {
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [makeCandle(160)], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [], [], 'M1'), 'empty');
});

test('resolveVisibleSeriesMode always merges history and live without splitting detached gaps', () => {
  const history = [makeCandle(100), makeCandle(160), makeCandle(220)];
  const detachedLive = [makeCandle(520), makeCandle(580)];

  assert.equal(resolveVisibleSeriesMode(history, detachedLive, history, 'M1'), 'merged');
  assert.equal(resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(220)], [makeCandle(160)], 'M1'), 'merged');
});

test('resolveCurrentVisibleSeries keeps the freshest live segment for API callers', () => {
  const liveOnly = [makeCandle(340), makeCandle(400)];
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.deepEqual(
    resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], liveOnly, current),
    liveOnly,
  );
  assert.deepEqual(resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], [], current), current);
});

test('shouldSyncVisibleSeriesCache stores any non-empty canonical visible series', () => {
  assert.equal(shouldSyncVisibleSeriesCache('history', [makeCandle(100)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('merged', [makeCandle(100), makeCandle(160)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('current', [makeCandle(340)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('empty', [], 'M1'), false);
});

test('shouldKeepBootstrappingOnHistoryFailure stays true only while nothing is visible', () => {
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 0), true);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(1, 0), false);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 2), false);
});
