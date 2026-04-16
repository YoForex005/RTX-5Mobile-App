import { getAccountSummary } from '../api/account';
import { getCandleHistory } from '../api/candles';
import { fetchInstrumentMeta } from '../api/instruments';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeTimeframe } from '../domain/candles';
import { normalizeSymbol } from '../domain/symbols';
import { appQueryClient } from '../providers/AppProviders';
import { ACCOUNT_SUMMARY_KEY } from '../query/account';
import { candleKeys } from '../query/candles';
import { useTradingState } from '../state/tradingState';

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

  void appQueryClient.prefetchQuery({
    queryKey: ['instrument', normalizedSymbol],
    queryFn: () => fetchInstrumentMeta(normalizedSymbol),
    staleTime: 60 * 60_000,
  }).catch(() => {});
}

export function prefetchChartCandles(symbol: string, timeframe: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) return;

  void appQueryClient.prefetchQuery({
    queryKey: candleKeys.history(normalizedSymbol, normalizedTimeframe),
    queryFn: async () => {
      const response = await getCandleHistory(normalizedSymbol, normalizedTimeframe, DEFAULT_CANDLE_HISTORY_LIMIT);
      useTradingState.getState().setCandleHistory(normalizedSymbol, normalizedTimeframe, response.candles);
      return response.candles;
    },
    staleTime: 30_000,
  }).catch(() => {});
}

export function prefetchDailyCandles(symbol: string) {
  prefetchChartCandles(symbol, 'D1');
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
