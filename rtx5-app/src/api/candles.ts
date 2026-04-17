/**
 * Historical Candlestick Data API (V2)
 * 
 * Fetches paginated OHLCV (Open, High, Low, Close, Volume) data
 * required to render the initial state of the Lightweight Charts.
 */

import { apiClient } from './apiClient';
import {
  buildCandleHistorySearchParams,
  extractCandleHistoryPayload,
  getCandleHistoryRequestTimeframes,
} from './candleHistoryQuery';
import type { CandleHistoryRequestOptions } from './candleHistoryQuery';
import { Candle } from '../state/tradingState';
import { DEFAULT_CANDLE_HISTORY_LIMIT, getBucketGapCount, normalizeCandleSeries, normalizeSymbol, normalizeTimeframe } from '../domain/candles';

/** Response shape from GET /api/v1/candles */
export interface CandleHistoryResponse {
  symbol: string;
  timeframe: string;
  count: number;
  candles: Candle[];
}
export type { CandleHistoryRequestOptions } from './candleHistoryQuery';

/**
 * Fetches historical candlestick data for a given symbol and timeframe.
 *
 * GET /api/v1/candles?symbol={symbol}&timeframe={timeframe}&count={count}
 *
 * @param symbol    - Trading pair (e.g. 'EURUSD', 'XAUUSD')
 * @param timeframe - Candle period (e.g. 'M1', 'M5', 'H1', 'D1')
 * @param count     - Number of candles to fetch (default 200)
 */
export async function getCandleHistory(
  symbol: string,
  timeframe: string,
  count: number = DEFAULT_CANDLE_HISTORY_LIMIT,
  options?: AbortSignal | CandleHistoryRequestOptions,
): Promise<CandleHistoryResponse> {
  const requestedSymbol = normalizeSymbol(symbol);
  const requestedTimeframe = normalizeTimeframe(timeframe);
  const requestOptions =
    options instanceof AbortSignal
      ? { signal: options }
      : options;
  const requestTimeframes = getCandleHistoryRequestTimeframes(requestedTimeframe);

  let extractedPayload = extractCandleHistoryPayload([]);
  let resolvedTimeframe = requestedTimeframe;
  let normalizedCandles: Candle[] = [];
  let lastHttpError: Error | null = null;

  for (let index = 0; index < requestTimeframes.length; index += 1) {
    const requestTimeframe = requestTimeframes[index];
    const params = buildCandleHistorySearchParams(requestTimeframe, count, requestOptions);
    const response = await apiClient(`/candles/${requestedSymbol}?${params.toString()}`, { signal: requestOptions?.signal });

    if (!response.ok) {
      let errorMsg = 'Failed to fetch candle history';
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorData.error || errorMsg;
      } catch (_e) {
        // Ignored
      }
      lastHttpError = new Error(`API Error ${response.status}: ${errorMsg}`);
      continue;
    }

    const payload = await response.json();
    extractedPayload = extractCandleHistoryPayload(payload);
    resolvedTimeframe = normalizeTimeframe(extractedPayload.timeframe ?? requestedTimeframe);
    normalizedCandles = normalizeCandleSeries(extractedPayload.candles, resolvedTimeframe).slice(-count);

    if (normalizedCandles.length > 0 || index === requestTimeframes.length - 1) {
      if (requestTimeframe !== requestedTimeframe && normalizedCandles.length > 0) {
        console.log(
          `[api/candles] ${requestedSymbol} ${requestedTimeframe}: history loaded via fallback timeframe token ${requestTimeframe}`,
        );
      }
      break;
    }
  }

  if (normalizedCandles.length === 0 && lastHttpError) {
    throw lastHttpError;
  }

  const rawCount = Array.isArray(extractedPayload.candles) ? extractedPayload.candles.length : 0;
  if (rawCount > 0 && normalizedCandles.length === 0) {
    // The API sent bars but every single one was dropped by validation.
    // Almost always means a schema mismatch (unexpected field names, a
    // timestamp unit we don't recognise, or OHLC fields that aren't finite).
    console.warn(
      `[api/candles] Received ${rawCount} raw bars for ${requestedSymbol} ${requestedTimeframe} but 0 passed validation. Sample bar:`,
      extractedPayload.candles[0],
    );
  }

  // ── Gap diagnostic ───────────────────────────────────────────────────
  // Walks the sorted normalised bar series looking for time deltas larger
  // than one bucket. A single log line reveals whether the backend itself
  // returned a time-gappy response (→ backend issue) or if the bars are
  // contiguous (→ any visible chart gap is a frontend issue elsewhere).
  if (normalizedCandles.length >= 2) {
    const gaps: { at: number; missedBuckets: number }[] = [];
    let expectedBuckets = 1;
    for (let i = 1; i < normalizedCandles.length; i++) {
      const missedBuckets = Math.max(
        0,
        getBucketGapCount(normalizedCandles[i - 1].time, normalizedCandles[i].time, resolvedTimeframe) - 1,
      );
      expectedBuckets += missedBuckets + 1;
      if (missedBuckets > 0) {
        gaps.push({ at: normalizedCandles[i - 1].time, missedBuckets });
      }
    }
    const first = normalizedCandles[0].time;
    const last = normalizedCandles[normalizedCandles.length - 1].time;
    console.log(
      `[api/candles] ${requestedSymbol} ${resolvedTimeframe}: ` +
      `${normalizedCandles.length}/${expectedBuckets} bars ` +
      `(first=${new Date(first * 1000).toISOString()}, last=${new Date(last * 1000).toISOString()}), ` +
      `internal gaps=${gaps.length}` +
      (gaps.length > 0 ? ` e.g. ${gaps.length} gap(s), biggest=${Math.max(...gaps.map(g => g.missedBuckets))} bars` : ''),
    );
  }

  return {
    symbol: normalizeSymbol(extractedPayload.symbol ?? requestedSymbol),
    timeframe: resolvedTimeframe,
    count: normalizedCandles.length,
    candles: normalizedCandles,
  };
}
