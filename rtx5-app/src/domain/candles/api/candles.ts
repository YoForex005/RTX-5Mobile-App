/**
 * Historical Candlestick Data API (V2)
 * 
 * Fetches paginated OHLCV (Open, High, Low, Close, Volume) data
 * required to render the initial state of the Lightweight Charts.
 */

import { apiJsonClient, commitApiJson } from '../../../api/apiClient';
import { StaleBrokerSessionError } from '../../../api/brokerApi';
import {
  buildCandleHistorySearchParams,
  extractCandleHistoryPayload,
  getCandleHistoryRequestTimeframes,
  resolveCandleHistoryRouteContract,
} from './candleHistoryQuery';
import type { CandleHistoryQueryStyle, CandleHistoryRequestOptions } from './candleHistoryQuery';
import type { Candle } from '../../../state/tradingState';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../../../state/activeBrokerSession';
import { DEFAULT_CANDLE_HISTORY_LIMIT, normalizeCandleSeries, normalizeSymbol, normalizeTimeframeStrict } from '../core/candles';
import {
  getConfiguredCandlePriceBasis,
  normalizeCandlePriceBasis,
  splitRestHistoryCandles,
  type CandlePriceBasis,
  type TrustedHistoryCandle,
} from '../core/candleProvenance';

/** Response shape from GET /api/v2/candles */
export interface CandleHistoryResponse {
  symbol: string;
  timeframe: string;
  count: number;
  candles: Candle[];
  closedCandles: TrustedHistoryCandle[];
  currentCandle: Candle | null;
  priceBasis: CandlePriceBasis;
  provenance: ActiveBrokerSessionProvenance;
}
export type { CandleHistoryRequestOptions } from './candleHistoryQuery';

export const isCandleHistoryResponseCurrent = (
  response: CandleHistoryResponse,
): boolean => isActiveBrokerSessionProvenanceCurrent(response.provenance);

export const commitCandleHistoryResponse = <T>(
  response: CandleHistoryResponse,
  commit: (currentResponse: CandleHistoryResponse) => T,
): T => {
  if (!isCandleHistoryResponseCurrent(response)) {
    throw new StaleBrokerSessionError();
  }
  return commit(response);
};

/** 
 * Represents a single attempt to fetch and parse historical candle data.
 * Used internally to aggregate results from authenticated history requests.
 */
type CandleHistoryAttempt = {
  extractedPayload: ReturnType<typeof extractCandleHistoryPayload>;
  resolvedTimeframe: string;
  normalizedCandles: Candle[];
  resolvedPriceBasis: CandlePriceBasis;
};

type CandleHistoryRoute = {
  pathPrefix: string;
  queryStyle: CandleHistoryQueryStyle;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const isAbortSignalLike = (value: unknown): value is AbortSignal => {
  if (!isObjectRecord(value)) return false;
  return typeof value.aborted === 'boolean' && typeof value.addEventListener === 'function';
};

const isAbortError = (error: unknown): boolean => {
  if (!isObjectRecord(error)) return false;
  const name = typeof error.name === 'string' ? error.name : '';
  const message = typeof error.message === 'string' ? error.message : '';
  return name === 'AbortError' || /\babort(?:ed)?\b/i.test(message);
};

/**
 * Processes a parsed response from the backend candle API.
 * 
 * - Parses JSON and extracts the standard payload structure.
 * - Resolves the exact timeframe and price basis returned by the server.
 * - Normalizes the raw data into strict `Candle` objects and applies the count limit.
 * 
 * @throws Error if the response is not OK or if parsing fails.
 */
const readCandleHistoryPayload = (
  payload: unknown,
  responseOk: boolean,
  responseStatus: number,
  requestTimeframe: string,
  count: number,
  currentPriceBasis: CandlePriceBasis,
): CandleHistoryAttempt => {
  if (!responseOk) {
    let errorMsg = 'Failed to fetch candle history';
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const errorData = payload as Record<string, unknown>;
      const serverMessage = errorData.message ?? errorData.error;
      if (typeof serverMessage === 'string' && serverMessage.trim()) {
        errorMsg = serverMessage.trim();
      }
    }
    throw new Error(`API Error ${responseStatus}: ${errorMsg}`);
  }

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
  route: CandleHistoryRoute,
  cacheNamespace: string,
): Promise<CandleHistoryAttempt> => {
  const params = buildCandleHistorySearchParams(
    requestTimeframe,
    count,
    requestOptions,
    route.queryStyle,
  );
  const pathSymbol = encodeURIComponent(requestedSymbol);
  const result = await apiJsonClient<unknown>(`/${route.pathPrefix}/${pathSymbol}?${params.toString()}`, {
    signal: requestOptions?.signal,
  });

  return commitApiJson(result, cacheNamespace, (payload) =>
    readCandleHistoryPayload(
      payload,
      result.ok,
      result.status,
      requestTimeframe,
      count,
      currentPriceBasis,
    ));
};

/**
 * Fetches historical candlestick data for a given symbol and timeframe.
 *
 * Uses the one exact release-configured path and query style. When that
 * contract is absent, history fails closed instead of probing alternatives.
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
  const sessionCapture = captureActiveBrokerSession();
  if (!sessionCapture) {
    throw new Error('No authenticated broker session available for candle history.');
  }
  const provenance = getActiveBrokerSessionProvenance(sessionCapture.session);
  const requestedSymbol = normalizeSymbol(symbol);
  const requestedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!requestedSymbol || !requestedTimeframe) {
    throw new Error(`Unsupported candle history request: ${symbol} ${timeframe}`);
  }
  const requestOptions = isAbortSignalLike(options)
    ? { signal: options }
    : options;
  const expectedCacheNamespace = requestOptions?.cacheNamespace ?? provenance.cacheNamespace;
  if (
    !expectedCacheNamespace ||
    expectedCacheNamespace !== provenance.cacheNamespace ||
    !isActiveBrokerSessionProvenanceCurrent(provenance)
  ) {
    throw new StaleBrokerSessionError();
  }

  const requestTimeframes = getCandleHistoryRequestTimeframes(requestedTimeframe);
  const route = resolveCandleHistoryRouteContract();
  if (!route) {
    throw new Error(
      'Candle history contract is unconfigured. Set an approved path and query style before requesting history.',
    );
  }

  let extractedPayload = extractCandleHistoryPayload([]);
  let resolvedTimeframe: string = requestedTimeframe;
  let normalizedCandles: Candle[] = [];
  let resolvedPriceBasis = getConfiguredCandlePriceBasis();
  let lastHttpError: Error | null = null;
  let hadSuccessfulResponse = false;

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

  let foundUsableAttempt = false;
  for (let index = 0; index < requestTimeframes.length && !foundUsableAttempt; index += 1) {
    const requestTimeframe = requestTimeframes[index];
    try {
      const attempt = await fetchAuthenticatedCandleHistory(
        requestedSymbol,
        requestTimeframe,
        count,
        requestOptions,
        resolvedPriceBasis,
        route,
        expectedCacheNamespace,
      );
      if (acceptAttempt(attempt)) {
        foundUsableAttempt = true;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (error instanceof StaleBrokerSessionError) {
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

  if (!isActiveBrokerSessionProvenanceCurrent(provenance)) {
    throw new StaleBrokerSessionError();
  }

  return {
    symbol: normalizeSymbol(extractedPayload.symbol ?? requestedSymbol),
    timeframe: resolvedTimeframe,
    count: normalizedCandles.length,
    candles: normalizedCandles,
    closedCandles: closedHistory,
    currentCandle,
    priceBasis: resolvedPriceBasis,
    provenance,
  };
}
