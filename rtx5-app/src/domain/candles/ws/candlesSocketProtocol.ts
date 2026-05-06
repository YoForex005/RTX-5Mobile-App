import { normalizeSymbol, normalizeTimeframeStrict } from '../core/candles';

export const DEFAULT_CANDLES_WS_URL = 'wss://backend.orrnn.com/ws/v2';

export const resolveCandlesWsUrl = (configuredUrl?: string): string => {
  const url = (configuredUrl || DEFAULT_CANDLES_WS_URL).trim();
  if (!url) {
    return DEFAULT_CANDLES_WS_URL;
  }

  return url.replace(/\/ws\/feed(\?.*)?$/, '/ws/v2$1');
};

/**
 * Append (or replace) the `?token=` query parameter on a WS URL.
 *
 * Backend `/ws/v2` requires JWT authentication for candle channel
 * subscriptions even though they are nominally "public". A connection without
 * a valid token is silently treated as having no candle channels: REST
 * history loads but no live candle update ever arrives. Pass the user's
 * stored access token in via `token` to authenticate the connection. Pass
 * `null` to keep the URL anonymous (used for guest mode).
 */
export const appendCandleWsToken = (baseUrl: string, token: string | null): string => {
  if (!token) {
    return baseUrl;
  }
  // Strip any existing token query so reconnects under a rotated token do not
  // accumulate stale params. We do this by parsing the query string manually
  // (no URL constructor dependency in RN/Hermes guarantees) and rebuilding it.
  const queryStart = baseUrl.indexOf('?');
  if (queryStart === -1) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  const base = baseUrl.slice(0, queryStart);
  const query = baseUrl.slice(queryStart + 1);
  const params = query
    .split('&')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.toLowerCase().startsWith('token='));
  params.push(`token=${encodeURIComponent(token)}`);
  return `${base}?${params.join('&')}`;
};

export const createCandleChannel = (symbol: string, tf: string): string | null => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  return normalizedSymbol && normalizedTimeframe
    ? `candles.${normalizedSymbol}.${normalizedTimeframe}`
    : null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const pickString = (record: Record<string, unknown> | null, keys: readonly string[]): string | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

const pickTimeframeValue = (record: Record<string, unknown> | null, keys: readonly string[]): unknown => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const getNestedRecord = (record: Record<string, unknown> | null): Record<string, unknown> | null =>
  asRecord(record?.candle) ??
  asRecord(record?.bar) ??
  asRecord(record?.data) ??
  asRecord(record?.payload) ??
  null;

const hasAnyKey = (record: Record<string, unknown> | null, keys: readonly string[]): boolean =>
  Boolean(record && keys.some((key) => record[key] !== undefined && record[key] !== null && record[key] !== ''));

export const hasBackendCandleShape = (payload: unknown): boolean => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const candidate = nested ?? record;
  return (
    hasAnyKey(candidate, ['open', 'Open', 'OPEN', 'o', 'O']) &&
    hasAnyKey(candidate, ['high', 'High', 'HIGH', 'h', 'H']) &&
    hasAnyKey(candidate, ['low', 'Low', 'LOW', 'l', 'L']) &&
    hasAnyKey(candidate, ['close', 'Close', 'CLOSE', 'c', 'C'])
  );
};

const extractChannelContext = (channel: unknown): { symbol: string | null; tf: string | null } => {
  if (typeof channel !== 'string') {
    return { symbol: null, tf: null };
  }

  const parts = channel.split('.');
  if (parts.length < 3 || parts[0] !== 'candles') {
    return { symbol: null, tf: null };
  }

  const tf = normalizeTimeframeStrict(parts[parts.length - 1]);
  const symbol = normalizeSymbol(parts.slice(1, -1).join('.'));
  return {
    symbol: symbol || null,
    tf,
  };
};

export const extractCandlePayloadContext = (payload: unknown): { symbol: string | null; tf: string | null } => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const channelContext = extractChannelContext(record?.channel);
  const symbol =
    channelContext.symbol ??
    pickString(record, ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol']) ??
    pickString(nested, ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol']);
  const timeframe =
    channelContext.tf ??
    pickTimeframeValue(record, ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval']) ??
    pickTimeframeValue(nested, ['timeframe', 'Timeframe', 'TIMEFRAME', 'tf', 'TF', 'period', 'interval']);

  return {
    symbol: symbol ? normalizeSymbol(symbol) : null,
    tf: normalizeTimeframeStrict(timeframe),
  };
};

export const getCandlePayloadItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.candles)) return record.candles;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.bars)) return record.bars;

  const nestedData = asRecord(record.data);
  const nestedPayload = asRecord(record.payload);
  const nestedResult = asRecord(record.result);
  const nestedCandidates = [nestedData, nestedPayload, nestedResult].filter(
    (entry): entry is Record<string, unknown> => entry !== null,
  );

  for (const nested of nestedCandidates) {
    if (Array.isArray(nested.candles)) return nested.candles;
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.bars)) return nested.bars;
    if (Array.isArray(nested.data)) return nested.data;
  }

  if (record.candle) return [record.candle];
  if (record.bar) return [record.bar];
  for (const nested of nestedCandidates) {
    if (nested.candle) return [nested.candle];
    if (nested.bar) return [nested.bar];
    if (hasBackendCandleShape(nested)) return [nested];
  }
  if (record.data && typeof record.data === 'object') return [record.data];
  return [record];
};
