import { normalizeCandleHistoryTimeframeStrict } from '../core/candles';
import { asRecord } from '../core/candleUtils';

/** Options for paginating historical candle requests. */
export type CandleHistoryRequestOptions = {
  signal?: AbortSignal;
  /** Unix timestamp in SECONDS. Fetch candles that occurred after this time. */
  from?: number;
  /** Unix timestamp in SECONDS. Fetch candles that occurred before this time. */
  to?: number;
};

export type CandleHistoryQueryStyle = 'timeframeLimit' | 'tfCount';

/** The normalized shape extracted from various possible backend JSON responses. */
export type ExtractedCandleHistoryPayload = {
  candles: unknown[];
  symbol?: string;
  timeframe?: string;
  priceBasis?: string;
};

const pickFirstArray = (...candidates: unknown[]): unknown[] => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

/**
 * Highly permissive extractor that searches through a JSON payload to find
 * the array of candles. Deals with various backend nesting formats like
 * `{ data: { candles: [...] } }`, `{ result: [...] }`, etc.
 */
export const extractCandleHistoryPayload = (payload: unknown): ExtractedCandleHistoryPayload => {
  if (Array.isArray(payload)) {
    return { candles: payload };
  }

  const record = asRecord(payload);
  if (!record) {
    return { candles: [] };
  }

  const nestedData = asRecord(record.data);
  const nestedResult = asRecord(record.result);
  const nestedPayload = asRecord(record.payload);

  return {
    candles: pickFirstArray(
      record.candles,
      record.data,
      record.items,
      record.results,
      record.result,
      record.payload,
      record.bars,
      nestedData?.candles,
      nestedData?.items,
      nestedData?.results,
      nestedData?.bars,
      nestedResult?.candles,
      nestedResult?.items,
      nestedPayload?.candles,
      nestedPayload?.items,
    ),
    symbol:
      (typeof record.symbol === 'string' ? record.symbol : undefined) ??
      (typeof nestedData?.symbol === 'string' ? nestedData.symbol : undefined) ??
      (typeof nestedResult?.symbol === 'string' ? nestedResult.symbol : undefined),
    timeframe:
      (typeof record.timeframe === 'string' ? record.timeframe : undefined) ??
      (typeof record.tf === 'string' ? record.tf : undefined) ??
      (typeof nestedData?.timeframe === 'string' ? nestedData.timeframe : undefined) ??
      (typeof nestedData?.tf === 'string' ? nestedData.tf : undefined) ??
      (typeof nestedResult?.timeframe === 'string' ? nestedResult.timeframe : undefined) ??
      (typeof nestedResult?.tf === 'string' ? nestedResult.tf : undefined),
    priceBasis:
      (typeof record.priceBasis === 'string' ? record.priceBasis : undefined) ??
      (typeof record.price_basis === 'string' ? record.price_basis : undefined) ??
      (typeof nestedData?.priceBasis === 'string' ? nestedData.priceBasis : undefined) ??
      (typeof nestedData?.price_basis === 'string' ? nestedData.price_basis : undefined) ??
      (typeof nestedResult?.priceBasis === 'string' ? nestedResult.priceBasis : undefined) ??
      (typeof nestedResult?.price_basis === 'string' ? nestedResult.price_basis : undefined),
  };
};

const normalizeBoundedUnixSeconds = (value: number): string =>
  String(Math.max(1, Math.floor(value)));

/**
 * Builds the URL query parameters for fetching historical candles.
 *
 * The candle backend contract uses Unix timestamps in seconds for both
 * response candle times and pagination bounds. Keeping request bounds in the
 * same unit is important for left-scroll history: sending milliseconds turns a
 * valid 2026 cursor into a far-future year and the backend returns an empty
 * page.
 */
export const buildCandleHistorySearchParams = (
  timeframe: string,
  count: number,
  options?: CandleHistoryRequestOptions,
  style: CandleHistoryQueryStyle = 'timeframeLimit',
): URLSearchParams => {
  const params = new URLSearchParams();
  const requestTimeframe = timeframe.trim();
  const normalizedRequestTimeframe = /^\d+(?:m|h|d|w)$/.test(requestTimeframe)
    ? requestTimeframe
    : requestTimeframe.toUpperCase();
  if (style === 'tfCount') {
    params.set('tf', normalizedRequestTimeframe);
    params.set('count', String(count));
  } else {
    params.set('timeframe', normalizedRequestTimeframe);
    params.set('limit', String(count));
  }

  if (typeof options?.from === 'number' && Number.isFinite(options.from) && options.from > 0) {
    params.set('from', normalizeBoundedUnixSeconds(options.from));
  }

  if (typeof options?.to === 'number' && Number.isFinite(options.to) && options.to > 0) {
    params.set('to', normalizeBoundedUnixSeconds(options.to));
  }

  return params;
};

export const getCandleHistoryRequestTimeframes = (timeframe: string): string[] => {
  const normalizedTimeframe = normalizeCandleHistoryTimeframeStrict(timeframe);
  return normalizedTimeframe ? [normalizedTimeframe] : [];
};
