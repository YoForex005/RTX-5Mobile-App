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

/**
 * Feed credentials are opaque. Whitespace is used only to decide whether the
 * value is empty; a valid string is retained byte-for-byte for URL encoding.
 */
export const preserveNonBlankFeedToken = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const firstConfiguredValue = (values: readonly unknown[]): string => {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) {
      return cleaned;
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
      const token = preserveNonBlankFeedToken(record[key]);
      if (token) {
        return token;
      }
    }
  }

  return '';
};

/**
 * Legacy generic app-config market-data token (old flow). Generic aliases are
 * unsafe until EXPO_PUBLIC_FEED_BROKER_ID binds them to one exact broker.
 */
export const resolveConfiguredFeedBrokerToken = (): string =>
  firstConfiguredValue([
    process.env.EXPO_PUBLIC_FEED_BROKER_TOKEN,
    process.env.EXPO_PUBLIC_BROKER_FEED_TOKEN,
    process.env.EXPO_PUBLIC_WS_FEED_TOKEN,
    process.env.EXPO_PUBLIC_FEED_TOKEN,
  ]);

export const resolveConfiguredFeedBrokerId = (): string =>
  firstConfiguredValue([
    process.env.EXPO_PUBLIC_FEED_BROKER_ID,
    process.env.EXPO_PUBLIC_BROKER_FEED_ID,
    process.env.EXPO_PUBLIC_MYPROP_FEED_BROKER_ID,
  ]);

const normalizeBrokerId = (value: unknown): string =>
  cleanString(value).toLowerCase();

const resolveBrokerSpecificConfiguredFeedToken = (brokerId: string): string => {
  switch (brokerId) {
    case 'gta_broker':
      return firstConfiguredValue([
        process.env.EXPO_PUBLIC_GTA_FEED_TOKEN,
        process.env.EXPO_PUBLIC_GROW_TRADING_ACADEMY_FEED_TOKEN,
      ]);
    case 'myprop-trade':
      return firstConfiguredValue([
        process.env.EXPO_PUBLIC_MYPROP_FEED_TOKEN,
      ]);
    default:
      return '';
  }
};

/**
 * Env token for the active broker. Broker-specific aliases are intrinsically
 * scoped; generic aliases require an exact broker-id lock and otherwise fail
 * closed so one broker's credential can never leak into another handshake.
 */
export const resolveConfiguredFeedBrokerTokenForBroker = (
  brokerId?: string | null,
): string => {
  const normalizedBrokerId = normalizeBrokerId(brokerId);
  if (!normalizedBrokerId) {
    return '';
  }

  // Achiever production feed credentials must come from the authenticated
  // backend handoff. EXPO_PUBLIC values ship in the client and must never mask
  // an absent or malformed Achiever login/refresh contract.
  if (normalizedBrokerId === 'achiever-financials') {
    return '';
  }

  const brokerSpecificToken =
    resolveBrokerSpecificConfiguredFeedToken(normalizedBrokerId);
  if (brokerSpecificToken) {
    return brokerSpecificToken;
  }

  const token = resolveConfiguredFeedBrokerToken();
  if (!token) {
    return '';
  }

  const configuredBrokerId = normalizeBrokerId(resolveConfiguredFeedBrokerId());
  if (!configuredBrokerId) {
    return '';
  }

  return configuredBrokerId === normalizedBrokerId ? token : '';
};

export const appendFeedAuthToWsUrl = (
  baseUrl: string,
  brokerId: string,
  token: string,
): string => {
  const normalizedBrokerId = cleanString(brokerId);
  const exactToken = preserveNonBlankFeedToken(token);
  if (!baseUrl || !normalizedBrokerId) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('broker_id', normalizedBrokerId);
    if (exactToken) {
      url.searchParams.set('token', exactToken);
    } else {
      url.searchParams.delete('token');
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
};

export const redactFeedAuthFromWsUrl = (url: string): string =>
  url.replace(/([?&]token=)[^&]*/i, '$1***');

export const stripFeedAuthQueryFromWsUrl = (url: string): string => {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
};
