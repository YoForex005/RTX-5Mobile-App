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
import { pruneLiveCandleMapCoveredByHistory } from '../../series/freshHistoryLiveSeries';
import {
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../../core/timeframeUtils';
import { candleMemoryCache } from '../candleMemoryCache';
import { getEventTime, getHistorySeedSnapshot, logDebug } from './helpers';
import {
  DEFAULT_HISTORY_LIMIT,
  type BufferedLiveEvent,
  type StreamEntry,
} from './types';

export interface HistoryFetchManagerBridge {
  readonly entries: Map<string, StreamEntry>;
  readonly historyPrefetches: Map<string, Promise<number>>;
  notify(entry: StreamEntry): void;
  applyLiveEvents(entry: StreamEntry, events: BufferedLiveEvent[]): boolean;
  commit(entry: StreamEntry): void;
}

export const runLoadHistory = (
  manager: HistoryFetchManagerBridge,
  entry: StreamEntry,
  limit: number,
): void => {
  if (!manager.entries.has(entry.key)) {
    return;
  }

  entry.requestId += 1;
  const requestId = entry.requestId;
  entry.abortController?.abort();
  const controller = new AbortController();
  entry.abortController = controller;
  entry.loading = true;
  entry.historyLoading = true;
  entry.error = null;
  entry.bufferedEvents = [];
  manager.notify(entry);

  const symbol = entry.symbol;
  const timeframe = entry.timeframe;
  logDebug('history_request', { symbol, timeframe, requestId });

  void getCandleHistory(symbol, timeframe, limit, { signal: controller.signal })
    .then((history) => {
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }

      const historySeed = getHistorySeedSnapshot(history);
      const historyCandles = historySeed.candles;

      // Keep REST history and backend live candles separate. The visible
      // chart series is rebuilt fresh from these two sources in commit().
      live.historyCandles = historyCandles;
      live.liveCandleMap = pruneLiveCandleMapCoveredByHistory(
        live.liveCandleMap,
        historySeed.closedHistoryLastTime,
      );
      live.historyLastTime = historySeed.closedHistoryLastTime;
      live.loading = false;
      live.historyLoading = false;
      live.error = null;
      syncMergedCandleCache(symbol, timeframe, history.closedCandles, { canonical: true });

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
      const live = manager.entries.get(entry.key);
      if (!live || live.requestId !== requestId || controller.signal.aborted) {
        return;
      }

      live.loading = false;
      live.historyLoading = false;
      live.error = error instanceof Error ? error.message : String(error);
      const replayEvents = live.bufferedEvents
        .splice(0)
        .sort((left, right) => getEventTime(left) - getEventTime(right) || left.order - right.order);
      manager.applyLiveEvents(live, replayEvents);
      manager.commit(live);
      logDebug('history_failure', {
        symbol,
        timeframe,
        requestId,
        message: live.error,
        replayedLiveEvents: replayEvents.length,
      });
    })
    .finally(() => {
      const live = manager.entries.get(entry.key);
      if (live && live.requestId === requestId) {
        live.abortController = null;
      }
    });
};

export const runPrefetchHistory = (
  manager: HistoryFetchManagerBridge,
  symbol: string,
  timeframe: string,
  resolveKey: (symbol: string, timeframe: string) => string,
): Promise<number> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return Promise.resolve(0);
  }

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

  const prefetch = getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_HISTORY_LIMIT)
    .then((history) => {
      const seed = getHistorySeedSnapshot(history);
      const candles = seed.candles;
      candleMemoryCache.set(normalizedSymbol, normalizedTimeframe, candles);
      syncMergedCandleCache(normalizedSymbol, normalizedTimeframe, history.closedCandles, { canonical: true });

      const liveEntry = manager.entries.get(key);
      // Guard against a stale prefetch overwriting newer state. If a real
      // loadHistory has run for this entry (requestId > 0) or is currently
      // running, ignore the prefetch result — the authoritative loadHistory
      // path owns historyCandles/historyLastTime/commit lifecycle.
      if (
        liveEntry &&
        candles.length > 0 &&
        liveEntry.requestId === 0 &&
        !liveEntry.historyLoading
      ) {
        liveEntry.historyCandles = candles;
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
