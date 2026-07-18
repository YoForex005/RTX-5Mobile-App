import { getAccountSummary } from '../api/account';
import {
  commitCandleHistoryResponse,
  getCandleHistory,
} from '../domain/candles/api/candles';
import { fetchInstrumentMeta } from '../api/instruments';
import {
  CANDLE_HISTORY_QUERY_GC_MS,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  LATEST_DAILY_CANDLE_HISTORY_LIMIT,
  normalizeCandleHistoryTimeframeStrict,
} from '../domain/candles/core/candles';
import { normalizeSymbol } from '../domain/symbols';
import { appQueryClient } from '../state/providers/AppProviders';
import { captureActiveBrokerSession } from '../state/activeBrokerSession';
import { getAccountSummaryQueryKey } from '../query/account';
import { runSessionBoundQuery } from '../query/authenticatedQueryScope';
import { INSTRUMENT_META_QUERY_VERSION } from '../query/instruments';
import { candleKeys } from '../domain/candles/query/candles';
import { mergeHistoryIntoCandleCache } from '../domain/candles/state/candleCache';

export function prefetchAccountSummary(login?: string) {
  const capture = captureActiveBrokerSession();
  if (!login || !capture) return;
  const cacheNamespace = capture.session.cacheNamespace;

  void appQueryClient.prefetchQuery({
    queryKey: getAccountSummaryQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getAccountSummary(login),
    ),
    staleTime: 2_000,
  }).catch(() => {});
}

export function prefetchInstrument(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: ['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol],
    queryFn: () => fetchInstrumentMeta(symbol, cacheNamespace),
    staleTime: 60 * 60_000,
  }).catch(() => {});
}

export function prefetchChartCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !normalizedTimeframe || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.history(cacheNamespace, normalizedSymbol, normalizedTimeframe),
    queryFn: async () => {
      const response = await getCandleHistory(
        normalizedSymbol,
        normalizedTimeframe,
        DEFAULT_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(response, (current) => {
        mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, current.candles, {
          provenance: current.provenance,
        });
        return current.candles;
      });
    },
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
  }).catch(() => {});
}

export function prefetchLatestDailyCandle(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const capture = captureActiveBrokerSession();
  const cacheNamespace = capture?.session.cacheNamespace ?? '';

  if (!normalizedSymbol || !capture) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.latestDaily(cacheNamespace, normalizedSymbol),
    queryFn: async () => {
      const response = await getCandleHistory(
        normalizedSymbol,
        'D1',
        LATEST_DAILY_CANDLE_HISTORY_LIMIT,
        { cacheNamespace },
      );
      return commitCandleHistoryResponse(
        response,
        (current) => current.currentCandle ?? current.candles[current.candles.length - 1] ?? null,
      );
    },
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
  }).catch(() => {});
}

export async function prefetchChartContext(symbol: string, timeframe: string) {
  await Promise.allSettled([
    prefetchInstrument(symbol),
    prefetchChartCandles(symbol, timeframe),
  ]);
}

export function prefetchDailyCandles(symbol: string) {
  prefetchLatestDailyCandle(symbol);
}

export function prefetchQuoteDetails(symbol: string) {
  prefetchInstrument(symbol);
  prefetchDailyCandles(symbol);
}

export function prefetchOrderTicketData(login?: string, symbol?: string) {
  prefetchAccountSummary(login);
  if (symbol) {
    prefetchInstrument(symbol);
  }
}
