/**
 * Historical Candlestick Data API (V2)
 * 
 * Fetches paginated OHLCV (Open, High, Low, Close, Volume) data
 * required to render the initial state of the Lightweight Charts.
 */

import { apiClient } from '../../../api/apiClient';
import {
  buildCandleHistorySearchParams,
  extractCandleHistoryPayload,
  getCandleHistoryRequestTimeframes,
} from './candleHistoryQuery';
import type { CandleHistoryRequestOptions } from './candleHistoryQuery';
import { PUBLIC_API_V1_BASE_URL } from '../../../api/publicDemo';
import { Candle } from '../../../state/tradingState';
import { useUserPreferences } from '../../../state/userPreferences';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeCandleSeries, normalizeSymbol, normalizeTimeframeStrict } from '../core/candles';
import {
  getConfiguredCandlePriceBasis,
  normalizeCandlePriceBasis,
  splitRestHistoryCandles,
  type CandlePriceBasis,
  type TrustedHistoryCandle,
} from '../core/candleProvenance';

/** Response shape from GET /api/v1/candles */
export interface CandleHistoryResponse {
  symbol: string;
  timeframe: string;
  count: number;
  candles: Candle[];
  closedCandles: TrustedHistoryCandle[];
  currentCandle: Candle | null;
  priceBasis: CandlePriceBasis;
}
export type { CandleHistoryRequestOptions } from './candleHistoryQuery';

/** 
 * Represents a single attempt to fetch and parse historical candle data.
 * Used internally to aggregate results from potentially multiple fallback requests.
 */
type CandleHistoryAttempt = {
  extractedPayload: ReturnType<typeof extractCandleHistoryPayload>;
  resolvedTimeframe: string;
  normalizedCandles: Candle[];
  resolvedPriceBasis: CandlePriceBasis;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const getStoredAccessToken = (): string | null =>
  useUserPreferences.getState().accountDetails?.credentials?.accessToken ?? null;

const appendCacheBust = (url: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;

/**
 * Processes a raw HTTP response from the backend candle API.
 * 
 * - Parses JSON and extracts the standard payload structure.
 * - Resolves the exact timeframe and price basis returned by the server.
 * - Normalizes the raw data into strict `Candle` objects and applies the count limit.
 * 
 * @throws Error if the response is not OK or if parsing fails.
 */
const readCandleHistoryResponse = async (
  response: Response,
  requestTimeframe: string,
  count: number,
  currentPriceBasis: CandlePriceBasis,
): Promise<CandleHistoryAttempt> => {
  if (!response.ok) {
    let errorMsg = 'Failed to fetch candle history';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (_e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  const payload = await response.json();
  const extractedPayload = extractCandleHistoryPayload(payload);
  const requestNormalizedTimeframe = normalizeTimeframeStrict(requestTimeframe);
  if (!requestNormalizedTimeframe) {
    throw new Error(`Unsupported candle timeframe: ${requestTimeframe}`);
  }
  const resolvedTimeframe =
    normalizeTimeframeStrict(extractedPayload.timeframe) ?? requestNormalizedTimeframe;
  const resolvedPriceBasis =
    normalizeCandlePriceBasis(extractedPayload.priceBasis) ??
    currentPriceBasis;
  const normalizedCandles = normalizeCandleSeries(extractedPayload.candles, resolvedTimeframe).slice(-count);

  return {
    extractedPayload,
    resolvedTimeframe,
    normalizedCandles,
    resolvedPriceBasis,
  };
};

/**
 * Attempts to fetch history using the authenticated API client.
 * Relies on the standard `apiClient` wrapper which handles auth headers automatically.
 */
const fetchAuthenticatedCandleHistory = async (
  requestedSymbol: string,
  requestTimeframe: string,
  count: number,
  requestOptions: CandleHistoryRequestOptions | undefined,
  currentPriceBasis: CandlePriceBasis,
): Promise<CandleHistoryAttempt> => {
  const params = buildCandleHistorySearchParams(requestTimeframe, count, requestOptions);
  const response = await apiClient(`/candles/${requestedSymbol}?${params.toString()}`, {
    signal: requestOptions?.signal,
  });

  return readCandleHistoryResponse(response, requestTimeframe, count, currentPriceBasis);
};

/**
 * Fallback mechanism for fetching history from public demo endpoints.
 * 
 * Tries multiple URL routing structures since different backend versions 
 * might expose the candle API via path params vs query params.
 * Returns the first successful attempt that yields actual candles.
 */
const fetchPublicCandleHistory = async (
  requestedSymbol: string,
  requestTimeframe: string,
  count: number,
  requestOptions: CandleHistoryRequestOptions | undefined,
  currentPriceBasis: CandlePriceBasis,
): Promise<CandleHistoryAttempt> => {
  const pathParams = buildCandleHistorySearchParams(requestTimeframe, count, requestOptions);
  const queryParams = buildCandleHistorySearchParams(requestTimeframe, count, requestOptions);
  queryParams.set('symbol', requestedSymbol);

  const urls = [
    `${PUBLIC_API_V1_BASE_URL}/candles/${encodeURIComponent(requestedSymbol)}?${pathParams.toString()}`,
    `${PUBLIC_API_V1_BASE_URL}/candles?${queryParams.toString()}`,
  ];
  let lastError: Error | null = null;
  let lastEmptyAttempt: CandleHistoryAttempt | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(appendCacheBust(url), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: requestOptions?.signal,
      });
      const attempt = await readCandleHistoryResponse(response, requestTimeframe, count, currentPriceBasis);
      if (attempt.normalizedCandles.length > 0) {
        return attempt;
      }
      lastEmptyAttempt = attempt;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastEmptyAttempt) {
    return lastEmptyAttempt;
  }

  throw lastError ?? new Error('Failed to fetch public candle history');
};

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
  const requestedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!requestedSymbol || !requestedTimeframe) {
    throw new Error(`Unsupported candle history request: ${symbol} ${timeframe}`);
  }
  const requestOptions =
    options instanceof AbortSignal
      ? { signal: options }
      : options;
  const requestTimeframes = getCandleHistoryRequestTimeframes(requestedTimeframe);

  let extractedPayload = extractCandleHistoryPayload([]);
  let resolvedTimeframe: string = requestedTimeframe;
  let normalizedCandles: Candle[] = [];
  let resolvedPriceBasis = getConfiguredCandlePriceBasis();
  let lastHttpError: Error | null = null;
  let hadSuccessfulResponse = false;
  const hasAuthToken = Boolean(getStoredAccessToken());

  const applyAttempt = (attempt: CandleHistoryAttempt): void => {
    extractedPayload = attempt.extractedPayload;
    resolvedTimeframe = attempt.resolvedTimeframe;
    resolvedPriceBasis = attempt.resolvedPriceBasis;
    normalizedCandles = attempt.normalizedCandles;
  };

  const acceptAttempt = (attempt: CandleHistoryAttempt): boolean => {
    hadSuccessfulResponse = true;
    applyAttempt(attempt);
    return attempt.normalizedCandles.length > 0;
  };

  for (let index = 0; index < requestTimeframes.length; index += 1) {
    const requestTimeframe = requestTimeframes[index];
    if (hasAuthToken) {
      try {
        const attempt = await fetchAuthenticatedCandleHistory(
          requestedSymbol,
          requestTimeframe,
          count,
          requestOptions,
          resolvedPriceBasis,
        );
        if (acceptAttempt(attempt)) {
          break;
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        lastHttpError = error instanceof Error ? error : new Error(String(error));
      }
    }

    try {
      const attempt = await fetchPublicCandleHistory(
        requestedSymbol,
        requestTimeframe,
        count,
        requestOptions,
        resolvedPriceBasis,
      );
      if (acceptAttempt(attempt)) {
        break;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      lastHttpError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (normalizedCandles.length === 0 && !hadSuccessfulResponse && lastHttpError) {
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

  const { closedHistory, currentCandle } = splitRestHistoryCandles(
    normalizedCandles,
    resolvedTimeframe,
    resolvedPriceBasis,
  );

  return {
    symbol: normalizeSymbol(extractedPayload.symbol ?? requestedSymbol),
    timeframe: resolvedTimeframe,
    count: normalizedCandles.length,
    candles: normalizedCandles,
    closedCandles: closedHistory,
    currentCandle,
    priceBasis: resolvedPriceBasis,
  };
}
