const SENSITIVE_AUTH_KEYS = new Set([
  'access_token',
  'accessToken',
  'authorization',
  'broker_feed_token',
  'brokerFeedToken',
  'feed_broker_token',
  'feed_token',
  'feedBrokerToken',
  'feedToken',
  'market_data_feed_token',
  'marketDataFeedToken',
  'password',
  'refresh_token',
  'refreshToken',
  'token',
  'ws_feed_token',
  'wsFeedToken',
]);

const MAX_REDACTION_DEPTH = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const redactAuthPayload = (payload: unknown, depth = 0): unknown => {
  if (Array.isArray(payload)) {
    if (depth >= MAX_REDACTION_DEPTH) {
      return '[redacted-depth-limit]';
    }
    return payload.map((item) => redactAuthPayload(item, depth + 1));
  }

  if (!isRecord(payload)) {
    return payload;
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return '[redacted-depth-limit]';
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    redacted[key] = SENSITIVE_AUTH_KEYS.has(key)
      ? '[redacted]'
      : redactAuthPayload(value, depth + 1);
  }
  return redacted;
};
