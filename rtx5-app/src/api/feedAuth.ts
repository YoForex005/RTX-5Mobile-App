const FEED_TOKEN_RESPONSE_KEYS = [
  'feed_broker_token',
  'broker_feed_token',
  'feed_token',
  'ws_feed_token',
  'market_data_feed_token',
  'market_data_token',
  'quote_feed_token',
  'feedBrokerToken',
  'brokerFeedToken',
  'feedToken',
  'wsFeedToken',
  'marketDataFeedToken',
  'marketDataToken',
  'quoteFeedToken',
] as const;

const FEED_TOKEN_NESTED_KEYS = [
  'feed',
  'feed_auth',
  'feedAuth',
  'market_data',
  'marketData',
  'quote_feed',
  'quoteFeed',
] as const;

const FEED_TOKEN_ENV_KEYS = [
  'EXPO_PUBLIC_FEED_BROKER_TOKEN',
  'EXPO_PUBLIC_BROKER_FEED_TOKEN',
  'EXPO_PUBLIC_MYPROP_FEED_TOKEN',
  'EXPO_PUBLIC_WS_FEED_TOKEN',
  'EXPO_PUBLIC_FEED_TOKEN',
] as const;

const FEED_BROKER_ID_ENV_KEYS = [
  'EXPO_PUBLIC_FEED_BROKER_ID',
  'EXPO_PUBLIC_BROKER_FEED_ID',
  'EXPO_PUBLIC_MYPROP_FEED_BROKER_ID',
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const cleanString = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim();
};

const firstProcessEnvValue = (keys: readonly string[]): string => {
  if (typeof process === 'undefined') {
    return '';
  }

  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

export const extractFeedBrokerToken = (payload: unknown): string => {
  const root = asRecord(payload);
  if (!root) {
    return '';
  }

  const records: Record<string, unknown>[] = [root];
  for (const key of FEED_TOKEN_NESTED_KEYS) {
    const nested = asRecord(root[key]);
    if (nested) {
      records.push(nested);
    }
  }

  for (const record of records) {
    for (const key of FEED_TOKEN_RESPONSE_KEYS) {
      const token = cleanString(record[key]);
      if (token) {
        return token;
      }
    }
  }

  return '';
};

export const resolveConfiguredFeedBrokerToken = (): string =>
  firstProcessEnvValue(FEED_TOKEN_ENV_KEYS);

export const resolveConfiguredFeedBrokerId = (): string =>
  firstProcessEnvValue(FEED_BROKER_ID_ENV_KEYS);

const normalizeBrokerId = (value: unknown): string =>
  cleanString(value).toLowerCase();

export const resolveConfiguredFeedBrokerTokenForBroker = (brokerId?: string | null): string => {
  const token = resolveConfiguredFeedBrokerToken();
  if (!token) {
    return '';
  }

  const configuredBrokerId = normalizeBrokerId(resolveConfiguredFeedBrokerId());
  if (!configuredBrokerId) {
    return token;
  }

  return configuredBrokerId === normalizeBrokerId(brokerId) ? token : '';
};

export const appendFeedAuthToWsUrl = (
  baseUrl: string,
  brokerId: string,
  token: string,
): string => {
  const normalizedBrokerId = cleanString(brokerId);
  const normalizedToken = cleanString(token);
  if (!baseUrl || !normalizedBrokerId) {
    return baseUrl;
  }

  const queryStart = baseUrl.indexOf('?');
  const base = queryStart === -1 ? baseUrl : baseUrl.slice(0, queryStart);
  const query = queryStart === -1 ? '' : baseUrl.slice(queryStart + 1);
  const params = query
    .split('&')
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry) return false;
      const lower = entry.toLowerCase();
      return !lower.startsWith('broker_id=') && !lower.startsWith('token=');
    });

  params.push(`broker_id=${encodeURIComponent(normalizedBrokerId)}`);
  if (normalizedToken) {
    params.push(`token=${encodeURIComponent(normalizedToken)}`);
  }
  return `${base}?${params.join('&')}`;
};

export const redactFeedAuthFromWsUrl = (url: string): string =>
  url.replace(/([?&]token=)[^&]*/i, '$1***');

export const stripFeedAuthQueryFromWsUrl = (url: string): string => {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
};
