import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { orrnnDemoPublicMarketSocket } from '../../../api/ws/orrnnDemoPublicMarketSocket';
import {
  sortAndDedupeCandles,
} from '../core/candles';
import {
  getOrrnnDemoPublicCandleQueryOptions,
  getOrrnnDemoPublicCandleQueryKey,
  fetchOrrnnDemoPublicCandleSeries,
  ORRNN_DEMO_PUBLIC_CANDLE_LIMIT,
  resolveOrrnnDemoPublicCandleSelection,
} from '../query/orrnnDemoPublicCandles';
import type { CandleParams } from '../stream/liveCandleStream';

const EMPTY_PUBLIC_CANDLES = Object.freeze([]) as readonly CandleParams[];

type PublicCandleLiveState = {
  contextKey: string;
  candles: readonly CandleParams[];
};

const INACTIVE_PUBLIC_CANDLE_LIVE_STATE: PublicCandleLiveState = {
  contextKey: '',
  candles: EMPTY_PUBLIC_CANDLES,
};

const mergePublicCandle = (
  candles: readonly CandleParams[],
  incoming: CandleParams,
): CandleParams[] => {
  const withoutSameTime = candles.filter((candle) => candle.time !== incoming.time);
  const nextCandle: CandleParams = { ...incoming, source: 'live_candle' };
  return sortAndDedupeCandles([
    ...withoutSameTime,
    nextCandle,
  ]).slice(-ORRNN_DEMO_PUBLIC_CANDLE_LIMIT) as CandleParams[];
};

const mergePublicHistoryWithRetainedLiveCandles = (
  historyCandles: readonly CandleParams[],
  currentCandles: readonly CandleParams[],
): CandleParams[] => {
  const retainedLiveCandles = currentCandles.filter(
    (candle) => candle.source === 'live_candle',
  );
  return sortAndDedupeCandles([
    ...historyCandles,
    ...retainedLiveCandles,
  ]).slice(-ORRNN_DEMO_PUBLIC_CANDLE_LIMIT) as CandleParams[];
};

export function useOrrnnDemoPublicCandles(
  symbol: string,
  timeframe: string,
  active: boolean,
) {
  const selection = useMemo(
    () => resolveOrrnnDemoPublicCandleSelection(symbol, timeframe),
    [symbol, timeframe],
  );
  const queryOptions = useMemo(
    () => getOrrnnDemoPublicCandleQueryOptions(symbol, timeframe, active),
    [active, symbol, timeframe],
  );
  const queryClient = useQueryClient();
  const historyQuery = useQuery(queryOptions);
  const refetchHistory = historyQuery.refetch;
  // Read the exact shared key directly as a fallback. The disabled hidden
  // observer is allowed one `data` notification so the retained WebView can
  // paint REST history before navigation, without attaching its live socket.
  const resolvedHistoryCandles = historyQuery.data ?? (
    selection
      ? queryClient.getQueryData<CandleParams[]>(
          getOrrnnDemoPublicCandleQueryKey(selection.symbol, selection.timeframe),
        )
      : undefined
  );
  const contextKey = selection
    ? `${selection.symbol}:${selection.timeframe}`
    : '';
  const [liveState, setLiveState] = useState<PublicCandleLiveState>(
    INACTIVE_PUBLIC_CANDLE_LIVE_STATE,
  );
  const paginationRequestRef = useRef<{ contextKey: string } | null>(null);

  useEffect(() => {
    // A resolved empty array is still an authoritative REST baseline. Attach
    // the live stream only after the query has settled, never while navigation
    // is merely prefetching this hidden chart context.
    if (!active || !selection || resolvedHistoryCandles === undefined) {
      setLiveState(INACTIVE_PUBLIC_CANDLE_LIVE_STATE);
      return;
    }

    let cancelled = false;
    const restCandles = resolvedHistoryCandles;
    setLiveState((current) => ({
      contextKey,
      candles: mergePublicHistoryWithRetainedLiveCandles(
        restCandles,
        current.contextKey === contextKey ? current.candles : EMPTY_PUBLIC_CANDLES,
      ),
    }));

    // REST establishes the initial series before the anonymous live stream is
    // attached. A navigation-only prefetch never reaches this subscription.
    const unsubscribe = orrnnDemoPublicMarketSocket.subscribeCandle(
      selection.symbol,
      selection.timeframe,
      (incoming) => {
        if (cancelled) {
          return;
        }
        setLiveState((current) => ({
          contextKey,
          candles: mergePublicCandle(
            current.contextKey === contextKey ? current.candles : restCandles,
            incoming,
          ),
        }));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    active,
    contextKey,
    resolvedHistoryCandles,
    selection,
  ]);

  const refresh = useCallback(() => {
    if (active) {
      void refetchHistory();
    }
  }, [active, refetchHistory]);
  const paginate = useCallback(() => {
    if (!active || !selection) {
      return;
    }

    const queryKey = getOrrnnDemoPublicCandleQueryKey(
      selection.symbol,
      selection.timeframe,
    );
    const cachedHistory = queryClient.getQueryData<CandleParams[]>(queryKey);
    if (
      (cachedHistory?.length ?? 0) >= ORRNN_DEMO_PUBLIC_CANDLE_LIMIT
      || paginationRequestRef.current?.contextKey === contextKey
    ) {
      return;
    }

    paginationRequestRef.current = { contextKey };
    void fetchOrrnnDemoPublicCandleSeries(
      selection.symbol,
      selection.timeframe,
      ORRNN_DEMO_PUBLIC_CANDLE_LIMIT,
    ).then((expandedHistory) => {
      queryClient.setQueryData<CandleParams[]>(queryKey, (currentHistory = []) => (
        sortAndDedupeCandles([
          ...expandedHistory,
          ...currentHistory,
        ]).slice(-ORRNN_DEMO_PUBLIC_CANDLE_LIMIT) as CandleParams[]
      ));
    }).catch(() => undefined).finally(() => {
      if (paginationRequestRef.current?.contextKey === contextKey) {
        paginationRequestRef.current = null;
      }
    });
  }, [active, contextKey, queryClient, selection]);

  const cachedRestCandles = resolvedHistoryCandles ?? EMPTY_PUBLIC_CANDLES;
  const candles = active && liveState.contextKey === contextKey
    ? liveState.candles
    : cachedRestCandles;
  const error = active && resolvedHistoryCandles === undefined && historyQuery.error
    ? historyQuery.error instanceof Error
      ? historyQuery.error.message
      : 'Unable to load public demo candles.'
    : null;

  return {
    candles: candles as CandleParams[],
    hasHistoryCandles: cachedRestCandles.length > 0,
    loading: active && resolvedHistoryCandles === undefined && historyQuery.isFetching,
    error,
    refresh,
    paginate,
  };
}

export { mergePublicCandle, mergePublicHistoryWithRetainedLiveCandles };
