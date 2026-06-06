import { getAccountSummary } from '../api/account';
import { getCandleHistory } from '../domain/candles/api/candles';
import { fetchInstrumentMeta } from '../api/instruments';
import {
  CANDLE_HISTORY_QUERY_GC_MS,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  LATEST_DAILY_CANDLE_HISTORY_LIMIT,
  normalizeCandleHistoryTimeframeStrict,
} from '../domain/candles/core/candles';
import { normalizeSymbol } from '../domain/symbols';
import { appQueryClient } from '../state/providers/AppProviders';
import { useUserPreferences } from '../state/userPreferences';
import { ACCOUNT_SUMMARY_KEY } from '../query/account';
import { candleKeys } from '../domain/candles/query/candles';
import { mergeHistoryIntoCandleCache } from '../domain/candles/state/candleCache';

export function prefetchAccountSummary(login?: string) {
  if (!login) return;

  void appQueryClient.prefetchQuery({
    queryKey: [ACCOUNT_SUMMARY_KEY, login],
    queryFn: () => getAccountSummary(login),
    staleTime: 2_000,
  }).catch(() => {});
}

export function prefetchInstrument(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const preferences = useUserPreferences.getState();
  const brokerId = preferences.brokerId;
  const accountId = preferences.accountDetails?.id ?? '';
  const cacheScope = `${brokerId}:${accountId}`;

  if (!normalizedSymbol) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: ['instrument', normalizedSymbol, brokerId, accountId],
    queryFn: () => fetchInstrumentMeta(normalizedSymbol, cacheScope),
    staleTime: 60 * 60_000,
  }).catch(() => {});
}

export function prefetchChartCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.history(normalizedSymbol, normalizedTimeframe),
    queryFn: async () => {
      const response = await getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT);
      mergeHistoryIntoCandleCache(normalizedSymbol, normalizedTimeframe, response.candles);
      return response.candles;
    },
    staleTime: 30_000,
    gcTime: CANDLE_HISTORY_QUERY_GC_MS,
  }).catch(() => {});
}

export function prefetchLatestDailyCandle(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return Promise.resolve();
  }

  return appQueryClient.prefetchQuery({
    queryKey: candleKeys.latestDaily(normalizedSymbol),
    queryFn: async () => {
      const response = await getCandleHistory(
        normalizedSymbol,
        'D1',
        LATEST_DAILY_CANDLE_HISTORY_LIMIT,
      );
      return response.currentCandle ?? response.candles[response.candles.length - 1] ?? null;
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
