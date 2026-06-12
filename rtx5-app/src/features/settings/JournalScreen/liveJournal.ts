import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDealsQuery } from '../../../query/deals';
import { usePositionHistoryQuery, usePositionsQuery } from '../../../query/positions';
import { useJournalState } from '../../../state/journalState';
import { useResolvedTradingLogin } from '../../../state/tradingLogin';
import {
  deriveClosedPositionsFromDeals,
  mergeClosedPositionSources,
} from '../../history/derivedClosedPositions';
import {
  mapClosedPositionToJournalEntry,
  mapOpenPositionToJournalEntry,
  mergeJournalEntries,
} from './liveJournalMapper';
import {
  filterJournalEntriesByRetention,
  getJournalNextDayStartMs,
} from './journalRetention';

export function useJournalTrades() {
  const accountLogin = useResolvedTradingLogin();
  const manualEntries = useJournalState((state) => state.manualEntries);
  const pruneExpiredEntries = useJournalState((state) => state.pruneExpiredEntries);
  const [retentionNowMs, setRetentionNowMs] = useState(() => Date.now());
  const enabled = accountLogin !== undefined;

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const updateRetentionClock = () => {
      const nowMs = Date.now();
      setRetentionNowMs(nowMs);
      pruneExpiredEntries(nowMs);
    };

    const scheduleMidnightCleanup = () => {
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }

      const nowMs = Date.now();
      const delayMs = Math.max(1000, getJournalNextDayStartMs(nowMs) - nowMs + 50);
      midnightTimer = setTimeout(() => {
        updateRetentionClock();
        scheduleMidnightCleanup();
      }, delayMs);
    };

    updateRetentionClock();
    scheduleMidnightCleanup();
    const timer = setInterval(updateRetentionClock, 60_000);
    return () => {
      clearInterval(timer);
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }
    };
  }, [pruneExpiredEntries]);

  const positionsQuery = usePositionsQuery(accountLogin, {
    enabled,
    refetchInterval: 5000,
    refetchOnMount: 'always',
  });
  const positionHistoryQuery = usePositionHistoryQuery(accountLogin, {
    enabled,
    refetchOnMount: 'always',
  });
  const dealsQuery = useDealsQuery(accountLogin, {
    enabled,
    refetchInterval: 30_000,
  });

  const derivedClosedPositions = useMemo(
    () => deriveClosedPositionsFromDeals(dealsQuery.data),
    [dealsQuery.data],
  );
  const mergedClosedPositions = useMemo(
    () => mergeClosedPositionSources(positionHistoryQuery.data ?? [], derivedClosedPositions),
    [positionHistoryQuery.data, derivedClosedPositions],
  );
  const liveEntries = useMemo(
    () => mergedClosedPositions.map(mapClosedPositionToJournalEntry),
    [mergedClosedPositions],
  );
  const openEntries = useMemo(
    () => (positionsQuery.data ?? []).map((position) => mapOpenPositionToJournalEntry(position)),
    [positionsQuery.data],
  );
  const accountEntries = useMemo(
    () => [...openEntries, ...liveEntries],
    [liveEntries, openEntries],
  );
  const retainedAccountEntries = useMemo(
    () => filterJournalEntriesByRetention(accountEntries, retentionNowMs),
    [accountEntries, retentionNowMs],
  );
  const retainedManualEntries = useMemo(
    () => filterJournalEntriesByRetention(manualEntries, retentionNowMs),
    [manualEntries, retentionNowMs],
  );
  const trades = useMemo(
    () => mergeJournalEntries(retainedAccountEntries, retainedManualEntries),
    [retainedAccountEntries, retainedManualEntries],
  );

  const refetch = useCallback(async () => {
    if (!enabled) {
      return;
    }

    await Promise.all([
      positionsQuery.refetch(),
      positionHistoryQuery.refetch(),
      dealsQuery.refetch(),
    ]);
  }, [dealsQuery, enabled, positionHistoryQuery, positionsQuery]);

  return {
    accountLogin,
    trades,
    openEntries,
    liveEntries,
    manualEntries: retainedManualEntries,
    isLoading: enabled && trades.length === 0 && (positionsQuery.isLoading || positionHistoryQuery.isLoading || dealsQuery.isLoading),
    isFetching: positionsQuery.isFetching || positionHistoryQuery.isFetching || dealsQuery.isFetching,
    isError: enabled && retainedAccountEntries.length === 0 && positionsQuery.isError && positionHistoryQuery.isError && dealsQuery.isError,
    refetch,
  };
}
