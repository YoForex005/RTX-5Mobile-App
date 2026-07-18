/**
 * REST history loading for the candle stream.
 *
 * Both `runLoadHistory` and `runPrefetchHistory` were lifted out of the
 * original `LiveCandleStreamManager` so the manager class stays under the
 * 500-line ceiling. They take a small `HistoryFetchManagerBridge` interface
 * so they remain unit-testable without the full class.
 */
import { getCandleHistory } from '../../api/candles';
import { syncMergedCandleCache } from '../../state/candleCache';
import {
  foldCoveredLiveExtremesIntoHistory,
  pruneLiveCandleMapCoveredByHistory,
} from '../../series/freshHistoryLiveSeries';
import {
  normalizeCandleHistoryTimeframeStrict,
  normalizeSymbol,
} from '../../core/timeframeUtils';
import { candleMemoryCache } from '../candleMemoryCache';
import { getEventTime, getHistorySeedSnapshot, logDebug } from './helpers';
import {
  INITIAL_HISTORY_LIMIT,
  MAX_RENDERED_HISTORY_CANDLES,
  MAX_RETAINED_HISTORY_CANDLES,
  type BufferedLiveEvent,
  type StreamEntry,
} from './types';

/**
 * A minimal interface that exposes only the methods of LiveCandleStreamManager
 * needed by the history fetching logic. This prevents circular dependencies 
 * and makes the history logic easily mockable/testable.
 */
export interface HistoryFetchManagerBridge {
  readonly entries: Map<string, StreamEntry>;
  readonly historyPrefetches: Map<string, Promise<number>>;
  notify(entry: StreamEntry): void;
  applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean;
  commit(entry: StreamEntry): void;
}

import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import { computeHistoryRetryPlan } from './historyRetryPolicy';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../../../state/activeBrokerSession';

/**
 * Executes an async fetch of authoritative historical candles from the REST API.
 * 
 * - Handles race conditions via `abortController` and `requestId`.
 * - Replays any live websocket ticks that buffered while history was downloading.
 * - Safely stitches the trusted history underneath the live mutating candles.
 * 
 * @param manager The bridge to the main stream manager.
 * @param entry The specific stream state being updated.
 * @param limit Max number of candles to fetch.
 * @param options Optional parameters for pagination (e.g. fetching older history).
 */
export const runLoadHistory = (
  manager: HistoryFetchManagerBridge,
  entry: StreamEntry,
  limit: number,
  options?: { to?: number; from?: number; isRetry?: boolean },
): void => {
  if (!manager.entries.has(entry.key)) {
    return;
  }
  const sessionProvenance = captureActiveBrokerSessionProvenance();
  if (!sessionProvenance) return;

  const isPaginationRequest = Boolean(options?.to);
  // A new load supersedes any pending failure-retry for this entry.
  if (entry.historyRetryTimer) {
    clearTimeout(entry.historyRetryTimer);
    entry.historyRetryTimer = null;
  }
  // A fresh (non-retry) initial load resets the bounded retry budget, so a
  // user-driven refresh or symbol re-open gets a clean set of attempts.
  if (!isPaginationRequest && !options?.isRetry) {
    entry.historyRetryAttempt = 0;
  }
  entry.requestId += 1;
  const requestId = entry.requestId;
  entry.abortController?.abort();
  const controller = new AbortController();
  entry.abortController = controller;
  entry.loading = true;
  entry.error = null;
  if (isPaginationRequest) {
    entry.historyPageLoading = true;
  } else {
    entry.renderHistoryLimit = INITIAL_HISTORY_LIMIT;
    entry.historyPaginationCursorTime = null;
    entry.historyLoading = true;
    entry.historyPageLoading = false;
    entry.bufferedEvents = [];
  }
  manager.notify(entry);

  const symbol = entry.symbol;
  const timeframe = entry.timeframe;
  logDebug('history_request', { symbol, timeframe, requestId, to: options?.to });

  void getCandleHistory(symbol, timeframe, limit, {
    signal: controller.signal,
    to: options?.to,
    from: options?.from,
    cacheNamespace: sessionProvenance.cacheNamespace,
  })
    .then((history) => {
      if (!isActiveBrokerSessionProvenanceCurrent(history.provenance)) return;
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }

      const historySeed = getHistorySeedSnapshot(history);
      let historyCandles = historySeed.candles;

      if (isPaginationRequest) {
        const previousOldestHistoryTime = live.historyCandles[0]?.time ?? null;
        historyCandles = sanitizeCandlesForChart([...historyCandles, ...live.historyCandles], { timeframe });
        if (historyCandles.length > MAX_RETAINED_HISTORY_CANDLES) {
          historyCandles = historyCandles.slice(-MAX_RETAINED_HISTORY_CANDLES);
        }
        const newOlderHistoryCount =
          typeof previousOldestHistoryTime === 'number'
            ? historyCandles.filter((candle) => candle.time < previousOldestHistoryTime).length
            : 0;
        if (newOlderHistoryCount > 0) {
          live.historyPaginationCursorTime = null;
          live.renderHistoryLimit = Math.min(
            MAX_RENDERED_HISTORY_CANDLES,
            Math.max(INITIAL_HISTORY_LIMIT, live.renderHistoryLimit + newOlderHistoryCount),
          );
        } else if (typeof options?.from === 'number' && Number.isFinite(options.from)) {
          live.historyPaginationCursorTime = Math.max(1, Math.floor(options.from));
        }
      }

      // Keep REST history and backend live candles separate. The visible
      // chart series is rebuilt fresh from these two sources in commit().
      live.historyCandles = historyCandles;

      if (!options?.to) {
        // Preserve wicks we observed live before the live candle is pruned, so a
        // finalized candle never renders narrower than it did while forming.
        live.historyCandles = foldCoveredLiveExtremesIntoHistory(
          live.historyCandles,
          live.liveCandleMap,
          historySeed.closedHistoryLastTime,
          timeframe,
        );
        live.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
          live.liveCandleMap,
          historySeed.closedHistoryLastTime,
        );
        live.historyLastTime = historySeed.closedHistoryLastTime;
      }
      
      live.loading = false;
      live.historyLoading = false;
      live.historyPageLoading = false;
      live.error = null;
      live.historyRetryAttempt = 0;
      syncMergedCandleCache(symbol, timeframe, history.closedCandles, {
        canonical: true,
        provenance: history.provenance,
      });

      const replayEvents = live.bufferedEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      manager.applyLiveEvents(live, replayEvents);
      manager.commit(live);
      logDebug('history_success', {
        symbol,
        timeframe,
        requestId,
        historyCandles: historyCandles.length,
        currentCandleTime: history.currentCandle?.time ?? null,
        seededCurrentCandleTime: historySeed.currentCandleTime,
        trustedHistoryLastTime: live.historyLastTime,
        replayedLiveEvents: replayEvents.length,
      });
    })
    .catch((error) => {
      if (!isActiveBrokerSessionProvenanceCurrent(sessionProvenance)) return;
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }

      live.loading = false;
      live.historyLoading = false;
      live.historyPageLoading = false;
      live.error = error instanceof Error ? error.message : String(error);
      const replayEvents = live.bufferedEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      manager.applyLiveEvents(live, replayEvents);
      manager.commit(live);
      manager.notify(live);
      logDebug('history_failure', {
        symbol,
        timeframe,
        requestId,
        message: live.error,
        replayedLiveEvents: replayEvents.length,
      });

      // Self-heal: the initial history load (which gates the chart render) just
      // failed and we still have no history. Schedule a bounded, self-cancelling
      // retry so a transient backend hiccup recovers automatically instead of
      // leaving the chart blank until the user switches symbol. Pagination
      // failures are excluded (they don't gate the render and already advance
      // their own cursor).
      const retryPlan = computeHistoryRetryPlan(live, isPaginationRequest);
      if (retryPlan.shouldRetry) {
        live.historyRetryAttempt = retryPlan.nextAttempt;
        const attemptNumber = retryPlan.nextAttempt;
        if (live.historyRetryTimer) {
          clearTimeout(live.historyRetryTimer);
        }
        live.historyRetryTimer = setTimeout(() => {
          const retryEntry = manager.entries.get(entry.key);
          if (!retryEntry) {
            return;
          }
          retryEntry.historyRetryTimer = null;
          // Superseded by a symbol/timeframe switch, manual refresh, or a
          // request that already started: the requestId moved on — no-op.
          if (retryEntry.requestId !== requestId) {
            return;
          }
          // Cache/prefetch already filled history while we waited — no-op.
          if (retryEntry.historyCandles.length > 0) {
            return;
          }
          logDebug('history_retry', { symbol, timeframe, attempt: attemptNumber });
          runLoadHistory(manager, retryEntry, limit, { isRetry: true });
        }, retryPlan.delayMs);
      }
    })
    .finally(() => {
      const live = manager.entries.get(entry.key);
      if (live && live.requestId === requestId) {
        live.abortController = null;
      }
    });
};

/**
 * Initiates a background fetch of history before the UI explicitly requests it
 * (e.g., when hovering over an instrument in a watchlist).
 * 
 * - Deduplicates in-flight prefetches using `historyPrefetches`.
 * - Silently aborts or yields if a real `runLoadHistory` takes over.
 * 
 * @returns A promise resolving to the number of fetched candles, or 0 if failed.
 */
export const runPrefetchHistory = (
  manager: HistoryFetchManagerBridge,
  symbol: string,
  timeframe: string,
  resolveKey: (symbol: string, timeframe: string) => string,
): Promise<number> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return Promise.resolve(0);
  }
  const sessionProvenance = captureActiveBrokerSessionProvenance();
  if (!sessionProvenance) return Promise.resolve(0);

  const key = resolveKey(normalizedSymbol, normalizedTimeframe);
  const activeEntry = manager.entries.get(key);
  if (activeEntry?.historyLoading) {
    return Promise.resolve(activeEntry.candles.length);
  }
  if (activeEntry && activeEntry.candles.length > 0 && !activeEntry.loading) {
    return Promise.resolve(activeEntry.candles.length);
  }

  const existing = manager.historyPrefetches.get(key);
  if (existing) {
    return existing;
  }

  const prefetch = getCandleHistory(
    normalizedSymbol,
    normalizedTimeframe,
    INITIAL_HISTORY_LIMIT,
    { cacheNamespace: sessionProvenance.cacheNamespace },
  )
    .then((history) => {
      if (!isActiveBrokerSessionProvenanceCurrent(history.provenance)) return 0;
      const seed = getHistorySeedSnapshot(history);
      const candles = seed.candles;
      candleMemoryCache.set(normalizedSymbol, normalizedTimeframe, candles);
      syncMergedCandleCache(normalizedSymbol, normalizedTimeframe, history.closedCandles, {
        canonical: true,
        provenance: history.provenance,
      });

      const liveEntry = manager.entries.get(key);
      // Do not let an older warm-up result replace history already loaded
      // by the active chart.
      if (
        liveEntry &&
        candles.length > 0 &&
        liveEntry.requestId === 0 &&
        !liveEntry.historyLoading
      ) {
        liveEntry.historyCandles = foldCoveredLiveExtremesIntoHistory(
          candles,
          liveEntry.liveCandleMap,
          seed.closedHistoryLastTime,
          timeframe,
        );
        liveEntry.historyLastTime = seed.closedHistoryLastTime;
        liveEntry.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
          liveEntry.liveCandleMap,
          seed.closedHistoryLastTime,
        );
        manager.commit(liveEntry);
      }

      return candles.length;
    })
    .catch((error) => {
      logDebug('prefetch_failed', {
        symbol: normalizedSymbol,
        timeframe: normalizedTimeframe,
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    })
    .finally(() => {
      manager.historyPrefetches.delete(key);
    });

  manager.historyPrefetches.set(key, prefetch);
  return prefetch;
};
