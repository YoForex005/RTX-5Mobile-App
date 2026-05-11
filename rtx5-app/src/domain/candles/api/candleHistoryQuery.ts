import { normalizeTimeframeStrict } from '../core/candles';

/** Options for paginating historical candle requests. */
export type CandleHistoryRequestOptions = {
  signal?: AbortSignal;
  /** Unix timestamp in SECONDS. Fetch candles that occurred after this time. */
  from?: number;
  /** Unix timestamp in SECONDS. Fetch candles that occurred before this time. */
  to?: number;
};

/** The normalized shape extracted from various possible backend JSON responses. */
export type ExtractedCandleHistoryPayload = {
  candles: unknown[];
  symbol?: string;
  timeframe?: string;
  priceBasis?: string;
};

/** Safely casts an unknown value to a Record if it is an object and not an array. */
const asObjectRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

  const record = asObjectRecord(payload);
  if (!record) {
    return { candles: [] };
  }

  const nestedData = asObjectRecord(record.data);
  const nestedResult = asObjectRecord(record.result);
  const nestedPayload = asObjectRecord(record.payload);

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

/**
 * Builds the URL query parameters for fetching historical candles.
 * Specifically converts frontend Unix SECONDS timestamps into backend MILLISECONDS.
 */
export const buildCandleHistorySearchParams = (
  timeframe: string,
  count: number,
  options?: CandleHistoryRequestOptions,
): URLSearchParams => {
  const params = new URLSearchParams();
  const requestTimeframe = timeframe.trim();
  params.set(
    'timeframe',
    /^\d+(?:m|h|d|w)$/.test(requestTimeframe)
      ? requestTimeframe
      : requestTimeframe.toUpperCase(),
  );
  params.set('limit', String(count));

  if (typeof options?.from === 'number' && Number.isFinite(options.from) && options.from > 0) {
    // The backend API expects epoch in milliseconds, so we convert the seconds timestamp.
    params.set('from', String(Math.floor(options.from * 1000)));
  }

  if (typeof options?.to === 'number' && Number.isFinite(options.to) && options.to > 0) {
    // The backend API expects epoch in milliseconds, so we convert the seconds timestamp.
    params.set('to', String(Math.floor(options.to * 1000)));
  }

  return params;
};

export const getCandleHistoryRequestTimeframes = (timeframe: string): string[] => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  return normalizedTimeframe ? [normalizedTimeframe] : [];
};
