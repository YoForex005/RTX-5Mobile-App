import test from 'node:test';
import assert from 'node:assert/strict';

import { LiveCandleStreamManager } from './manager';
import type { StreamEntry } from './types';

/**
 * Regression guard for the "revisited symbol never finishes loading" defect.
 *
 * Switching away from a symbol disposes its StreamEntry, but the module-level
 * candleMemoryCache keeps the committed series. Coming back therefore seeds the
 * new entry with the *previous* visit's series before the REST refresh lands —
 * and when that refresh returns byte-identical history, `commit()` takes the
 * `isSameSeries` early return.
 *
 * That early return runs AFTER `entry.loading` has already been recomputed, so
 * loading flips true -> false without any listener notification. The React
 * binding (useSyncExternalStore) never re-reads the snapshot, its cached key
 * still encodes `loading: 1`, and the chart's spinner stays up forever — until
 * some unrelated event happens to notify, or the app is restarted.
 *
 * The first visit is unaffected: the entry starts empty, so the series really
 * does change and the notification fires.
 */

const TIMEFRAME_SECONDS = 300;

const buildHistoryCandles = (count: number, startTime: number) =>
  Array.from({ length: count }, (_, index) => ({
    time: startTime + index * TIMEFRAME_SECONDS,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 25,
    source: 'history',
    closed: true,
  }));

const createSeededEntry = (
  manager: LiveCandleStreamManager,
  onNotify: () => void,
): StreamEntry => {
  const entry = {
    key: 'BTCUSD:M5',
    symbol: 'BTCUSD',
    timeframe: 'M5',
    streamKey: 'BTCUSD:M5',
    requestId: 1,
    historyCandles: buildHistoryCandles(40, 1_775_000_000),
    liveCandleMap: new Map(),
    historyLastTime: null,
    lastLiveEdgeGapRefreshBoundary: null,
    historyPaginationCursorTime: null,
    renderHistoryLimit: 200,
    candles: [],
    listeners: new Set([onNotify]),
    consumers: 1,
    // A revisit is mid-refresh: loadFreshHistory has already flipped the entry
    // into its loading state and notified React, so the spinner is on screen.
    loading: true,
    historyLoading: true,
    historyPageLoading: false,
    error: null,
    isLiveConnected: false,
    lastUpdateTime: null,
    abortController: null,
    bufferedEvents: [],
    pendingEvents: [],
    flushFrame: null,
    flushTimer: null,
    eventOrder: 0,
    historyRetryTimer: null,
    historyRetryAttempt: 0,
    seededFromCache: true,
  } as unknown as StreamEntry;

  manager.entries.set(entry.key, entry);
  return entry;
};

test('commit() notifies when a warm revisit clears loading without changing the series', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  // Commit #1 — the cache seed is adopted. The series genuinely changes here
  // ([] -> 40 bars), so this notification fires today and must keep firing.
  manager.commit(entry);
  assert.equal(notifications, 1, 'seeding commit must notify');
  assert.equal(entry.loading, true, 'entry is still loading while REST is in flight');
  const seededSeriesLength = entry.candles.length;
  assert.ok(seededSeriesLength > 0, 'seeding commit must publish candles');

  // Commit #2 — REST history for a warm revisit comes back identical to the
  // cached seed, so the rebuilt series is unchanged. Only `loading` moves.
  entry.historyLoading = false;
  manager.commit(entry);

  assert.equal(entry.loading, false, 'REST completion must clear the engine loading flag');
  assert.equal(
    notifications,
    2,
    'loading true -> false must reach React even when the series is unchanged; '
      + 'without this notification the chart spinner never clears on a revisited symbol',
  );
});

test('commit() stays quiet when neither the series nor the observable state changed', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  entry.historyLoading = false;
  manager.commit(entry);
  const settledNotifications = notifications;

  // A redundant commit with nothing changed must not wake React up again,
  // otherwise every buffered live flush would re-render the chart screen.
  manager.commit(entry);
  assert.equal(
    notifications,
    settledNotifications,
    'an unchanged commit must not notify',
  );
});

test('a warm revisit that chains onto a pending prefetch still settles loading', async () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });
  // A revisit arrives with history already seeded from candleMemoryCache and no
  // fetch of its own in flight.
  entry.historyLoading = false;
  entry.loading = false;
  entry.abortController = null;

  // The symbol picker fires prefetchChartSelectionHistory on every selection, so
  // by the time the chart subscribes there is a warm-up record for this key.
  let resolvePrefetch: (count: number) => void = () => {};
  manager.historyPrefetches.set(entry.key, {
    limit: 200,
    promise: new Promise<number>((resolve) => {
      resolvePrefetch = resolve;
    }),
  });

  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);

  assert.equal(entry.loading, true, 'chaining onto a prefetch raises the spinner');

  // The warm-up completes and commits its own history.
  resolvePrefetch(120);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    entry.historyLoading,
    false,
    'no real load was issued, so nothing else will recompute loading',
  );
  assert.equal(
    entry.loading,
    false,
    'the prefetch chain must settle loading; otherwise the chart spins forever on a '
      + 'symbol whose next tick never arrives',
  );
});

test('a prefetch that rejects still settles loading instead of dangling', async () => {
  const manager = new LiveCandleStreamManager();
  const entry = createSeededEntry(manager, () => {});
  entry.historyLoading = false;
  entry.loading = false;
  entry.abortController = null;

  let rejectPrefetch: (reason: unknown) => void = () => {};
  manager.historyPrefetches.set(entry.key, {
    limit: 200,
    promise: new Promise<number>((_resolve, reject) => {
      rejectPrefetch = reject;
    }),
  });

  (manager as unknown as {
    loadFreshHistory: (target: StreamEntry) => void;
  }).loadFreshHistory(entry);
  assert.equal(entry.loading, true);

  rejectPrefetch(new Error('warm-up failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(entry.loading, false, 'a failed warm-up must not strand the spinner');
});

test('commit() notifies when live connectivity is regained without changing the series', () => {
  const manager = new LiveCandleStreamManager();
  let notifications = 0;
  const entry = createSeededEntry(manager, () => {
    notifications += 1;
  });

  entry.historyLoading = false;
  manager.commit(entry);
  const settledNotifications = notifications;
  assert.equal(entry.isLiveConnected, true, 'commit marks the stream connected');

  // isLiveConnected is part of the store snapshot key, and commit() owns it, so
  // a reconnect on an otherwise idle series must still reach React.
  entry.isLiveConnected = false;
  manager.commit(entry);
  assert.equal(
    notifications,
    settledNotifications + 1,
    'regained connectivity must reach React even when the series is unchanged',
  );
});
