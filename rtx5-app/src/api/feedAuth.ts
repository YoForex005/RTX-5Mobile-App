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

export const appendFeedAuthToWsUrl = (
  baseUrl: string,
  brokerId: string,
  feedToken: string,
): string => {
  const url = new URL(baseUrl);
  url.searchParams.set('broker_id', cleanString(brokerId));
  url.searchParams.set('token', cleanString(feedToken));
  return url.toString();
};

export const redactFeedAuthFromWsUrl = (url: string): string =>
  url.replace(/([?&]token=)[^&]*/i, '$1***');
