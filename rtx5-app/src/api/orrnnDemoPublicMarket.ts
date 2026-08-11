import { normalizeSymbol } from '../domain/symbols';
import { normalizeTimeframeStrict } from '../domain/candles/core/candles';
import { timedFetch } from '../utils/apiLatency';
import {
  ORRNN_DEMO_PUBLIC_BROKER_ID,
  ORRNN_DEMO_PUBLIC_FEED_STATUS_URL,
  ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL,
} from '../config/orrnnDemoPublicMarket';

export {
  ORRNN_DEMO_PUBLIC_BROKER_ID,
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
  ORRNN_DEMO_PUBLIC_FEED_STATUS_URL,
  ORRNN_DEMO_PUBLIC_FEED_WS_URL,
  ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
  ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL,
} from '../config/orrnnDemoPublicMarket';

const PUBLIC_CANDLE_LIMIT = 500;
const PUBLIC_CATALOG_STALE_MS = 5 * 60 * 1_000;

const PUBLIC_CANDLE_TF_BY_CANONICAL = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
} as const;

export type OrrnnDemoPublicCandleTimeframe =
  (typeof PUBLIC_CANDLE_TF_BY_CANONICAL)[keyof typeof PUBLIC_CANDLE_TF_BY_CANONICAL];

export type OrrnnDemoPublicMarketSelection = {
  brokerId: string | null | undefined;
  isLoggedIn: boolean;
};

export type OrrnnDemoPublicCatalog = {
  symbols: string[];
  timeframes: OrrnnDemoPublicCandleTimeframe[];
};

export type OrrnnDemoPublicCandlesResponse = {
  symbol: string;
  tf: OrrnnDemoPublicCandleTimeframe;
  count: number;
  candles: unknown[];
};

export type OrrnnDemoPublicFeedStatus = {
  market_available: boolean;
  upstream_connected: boolean;
  feed_auth_required: boolean;
};

/**
 * The public feed can emit either one flat quote or a coalesced
 * `{ type: "ticks", ticks: [...] }` frame. Keep this transport expansion pure
 * so React Native and tests use the same deployed contract.
 */
export const getOrrnnDemoPublicQuotePayloads = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [payload];
  }
  const ticks = (payload as Record<string, unknown>).ticks;
  return Array.isArray(ticks) ? ticks : [payload];
};

const isMatchingPublicCandleRecord = (
  candle: unknown,
  symbol: string,
  timeframe: OrrnnDemoPublicCandleTimeframe,
): boolean => {
  if (!candle || typeof candle !== 'object' || Array.isArray(candle)) {
    return false;
  }
  const record = candle as Record<string, unknown>;
  return (
    normalizeSymbol(String(record.symbol ?? '')) === symbol
    && String(record.tf ?? '').trim() === timeframe
  );
};

type CachedPublicCatalog = {
  value: OrrnnDemoPublicCatalog;
  fetchedAt: number;
};

let cachedPublicCatalog: CachedPublicCatalog | null = null;
let publicCatalogRequest: Promise<OrrnnDemoPublicCatalog> | null = null;

export const isOrrnnDemoPublicMarketSelection = ({
  isLoggedIn,
}: OrrnnDemoPublicMarketSelection): boolean =>
  !isLoggedIn;

export const resolveOrrnnDemoPublicCandleTimeframe = (
  timeframe: unknown,
): OrrnnDemoPublicCandleTimeframe | null => {
  const normalized = normalizeTimeframeStrict(timeframe);
  return normalized
    ? PUBLIC_CANDLE_TF_BY_CANONICAL[
        normalized as keyof typeof PUBLIC_CANDLE_TF_BY_CANONICAL
      ] ?? null
    : null;
};

const readJson = async <T>(response: Response, label: string): Promise<T> => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${label} returned an invalid response.`);
  }
  return payload as T;
};

export async function getOrrnnDemoPublicMarketCatalog(
  signal?: AbortSignal,
): Promise<OrrnnDemoPublicCatalog> {
  const now = Date.now();
  if (
    cachedPublicCatalog &&
    now - cachedPublicCatalog.fetchedAt <= PUBLIC_CATALOG_STALE_MS
  ) {
    return cachedPublicCatalog.value;
  }

  // Quotes and the idle Chart-history warm-up can request this catalog during
  // the same cold-start window. Share that read so Chart prefetch does not
  // duplicate or compete with the visible Quotes bootstrap request.
  if (publicCatalogRequest) {
    return publicCatalogRequest;
  }

  const request = (async (): Promise<OrrnnDemoPublicCatalog> => {
    const endpoint = `${ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL}/candles/symbols`;
    const response = await timedFetch(
      endpoint,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal,
      },
      {
        label: 'orrnnDemoPublicMarket.catalog',
        method: 'GET',
        endpoint: '/candles/symbols',
        source: 'candles',
      },
    );
    const payload = await readJson<{
      symbols?: unknown;
      timeframes?: unknown;
    }>(response, 'Public market catalog');
    const symbols = Array.isArray(payload.symbols)
      ? Array.from(
          new Set(
            payload.symbols
              .map((symbol) => normalizeSymbol(String(symbol ?? '')))
              .filter(Boolean),
          ),
        )
      : [];
    const timeframes = Array.isArray(payload.timeframes)
      ? Array.from(
          new Set(
            payload.timeframes.filter(
              (timeframe): timeframe is OrrnnDemoPublicCandleTimeframe =>
                typeof timeframe === 'string' &&
                Object.values(PUBLIC_CANDLE_TF_BY_CANONICAL).includes(
                  timeframe as OrrnnDemoPublicCandleTimeframe,
                ),
            ),
          ),
        )
      : [];

    if (symbols.length === 0 || timeframes.length === 0) {
      throw new Error('Public market catalog did not include symbols and timeframes.');
    }

    const value = { symbols, timeframes };
    cachedPublicCatalog = { value, fetchedAt: Date.now() };
    return value;
  })();
  publicCatalogRequest = request;

  try {
    return await request;
  } finally {
    if (publicCatalogRequest === request) {
      publicCatalogRequest = null;
    }
  }
}

export async function getOrrnnDemoPublicCandles(
  symbol: string,
  timeframe: string,
  limit = PUBLIC_CANDLE_LIMIT,
  signal?: AbortSignal,
): Promise<OrrnnDemoPublicCandlesResponse> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const publicTimeframe = resolveOrrnnDemoPublicCandleTimeframe(timeframe);
  if (!normalizedSymbol || !publicTimeframe) {
    throw new Error(`Unsupported public candle selection: ${symbol} ${timeframe}.`);
  }

  const safeLimit = Math.min(PUBLIC_CANDLE_LIMIT, Math.max(1, Math.floor(limit)));
  const search = new URLSearchParams({
    symbol: normalizedSymbol,
    tf: publicTimeframe,
    limit: String(safeLimit),
  });
  // Warm or join the catalog used by symbol selection, but do not make a valid
  // candle payload wait on that separate endpoint. On some Android cold starts
  // the history response is ready while /candles/symbols is still negotiating;
  // serializing their completion leaves Chart on a loader for no data reason.
  void getOrrnnDemoPublicMarketCatalog(signal).catch(() => undefined);
  const response = await timedFetch(
    `${ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL}/candles?${search.toString()}`,
    {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    },
    {
      label: 'orrnnDemoPublicMarket.candles',
      method: 'GET',
      endpoint: '/candles',
      source: 'candles',
      // Match the authenticated chart-history policy: wait for the original
      // read (or caller cancellation) instead of restarting a nearly-finished
      // cold request after the generic API timeout.
      timeoutMs: 0,
    },
  );
  const availableCatalog = cachedPublicCatalog?.value;
  if (
    availableCatalog && (
      !availableCatalog.symbols.includes(normalizedSymbol) ||
      !availableCatalog.timeframes.includes(publicTimeframe)
    )
  ) {
    throw new Error(`Public candle data is unavailable for ${normalizedSymbol} ${publicTimeframe}.`);
  }
  const payload = await readJson<{
    symbol?: unknown;
    tf?: unknown;
    count?: unknown;
    candles?: unknown;
  }>(response, 'Public candles');
  const responseSymbol = normalizeSymbol(String(payload.symbol ?? ''));
  const responseTimeframe = String(payload.tf ?? '').trim();
  if (
    responseSymbol !== normalizedSymbol ||
    responseTimeframe !== publicTimeframe ||
    !Array.isArray(payload.candles)
  ) {
    throw new Error('Public candles returned data for a different market selection.');
  }

  const matchingCandles = payload.candles.filter((candle) =>
    isMatchingPublicCandleRecord(candle, normalizedSymbol, publicTimeframe),
  );

  return {
    symbol: normalizedSymbol,
    tf: publicTimeframe,
    count: matchingCandles.length,
    candles: matchingCandles.slice(-safeLimit),
  };
}

export async function getOrrnnDemoPublicFeedStatus(
  signal?: AbortSignal,
): Promise<OrrnnDemoPublicFeedStatus> {
  const response = await timedFetch(
    ORRNN_DEMO_PUBLIC_FEED_STATUS_URL,
    {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    },
    {
      label: 'orrnnDemoPublicMarket.feedStatus',
      method: 'GET',
      endpoint: '/ws/feed/status',
      source: 'marketHealth',
    },
  );
  const payload = await readJson<Record<string, unknown>>(
    response,
    'Public feed status',
  );
  if (
    typeof payload.market_available !== 'boolean' ||
    typeof payload.upstream_connected !== 'boolean' ||
    typeof payload.feed_auth_required !== 'boolean'
  ) {
    throw new Error('Public feed status returned an invalid response.');
  }
  return {
    market_available: payload.market_available,
    upstream_connected: payload.upstream_connected,
    feed_auth_required: payload.feed_auth_required,
  };
}

export const resetOrrnnDemoPublicMarketCatalogCache = (): void => {
  cachedPublicCatalog = null;
  publicCatalogRequest = null;
};
