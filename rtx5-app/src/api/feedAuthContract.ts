import type { FeedAuthContext } from '../state/activeBrokerSession';
import {
  extractFeedBrokerToken,
  resolveConfiguredFeedBrokerTokenForBroker,
} from './feedAuth';

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const cleanParam = (value: unknown): string => {
  const param = cleanString(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(param) ? param : '';
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

/**
 * Legacy env-token query contract used when backend login does not publish
 * feed_auth_context (previous mobile behaviour for MyProp).
 */
export const LEGACY_ENV_FEED_QUERY_CONTEXT: FeedAuthContext = Object.freeze({
  mode: 'query',
  credential: 'feed_token',
  tokenQueryParam: 'token',
  brokerIdQueryParam: 'broker_id',
});

/**
 * Maps only explicit backend-provided feed-auth metadata. The presence of a
 * token alone is not enough to invent a header/query contract.
 */
export const resolveFeedAuthContextFromAuthResponse = (
  response: unknown,
  hasFeedToken: boolean,
): FeedAuthContext => {
  const root = asRecord(response);
  const metadata = asRecord(root?.feed_auth_context ?? root?.feed_auth);
  if (!metadata) {
    return Object.freeze({
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  }

  const mode = cleanString(metadata.mode).toLowerCase();
  if (mode === 'none' && metadata.auth_required === false) {
    return Object.freeze({ mode: 'none' });
  }
  if (mode !== 'query') {
    return Object.freeze({
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  }

  const credentialValue = cleanString(metadata.credential).toLowerCase();
  const credential = credentialValue === 'feed_token' || credentialValue === 'access_token'
    ? credentialValue
    : null;
  const tokenQueryParam = cleanParam(
    metadata.tokenQueryParam ?? metadata.token_query_param,
  );
  const brokerIdQueryParam = cleanParam(
    metadata.brokerIdQueryParam ?? metadata.broker_id_query_param,
  );
  const accountLoginQueryParam = cleanParam(
    metadata.accountLoginQueryParam ?? metadata.account_login_query_param,
  );

  if (!credential || !tokenQueryParam) {
    return Object.freeze({
      mode: 'disabled_unconfigured',
      reason: 'missing_contract',
    });
  }
  if (credential === 'feed_token' && !hasFeedToken) {
    return Object.freeze({
      mode: 'disabled_unconfigured',
      reason: 'missing_credential',
    });
  }

  return Object.freeze({
    mode: 'query',
    credential,
    tokenQueryParam,
    ...(brokerIdQueryParam ? { brokerIdQueryParam } : {}),
    ...(accountLoginQueryParam ? { accountLoginQueryParam } : {}),
  });
};

export type ResolvedSessionFeedAuth = Readonly<{
  feedToken?: string;
  feedAuthContext: FeedAuthContext;
  source: 'backend' | 'env' | 'none';
}>;

/**
 * Prefer backend login feed contract; fall back to EXPO_PUBLIC_FEED_BROKER_TOKEN
 * + the historical query-token shape when backend omits feed_auth_context.
 */
export const resolveSessionFeedAuth = (input: {
  response?: unknown;
  brokerId: string;
  existingFeedToken?: string | null;
}): ResolvedSessionFeedAuth => {
  const loginFeedToken = extractFeedBrokerToken(input.response);
  const envFeedToken = resolveConfiguredFeedBrokerTokenForBroker(input.brokerId);
  const existing = cleanString(input.existingFeedToken);
  const feedToken = loginFeedToken || existing || envFeedToken;

  const backendContext = resolveFeedAuthContextFromAuthResponse(
    input.response,
    Boolean(feedToken),
  );

  if (backendContext.mode !== 'disabled_unconfigured') {
    return Object.freeze({
      ...(feedToken ? { feedToken } : {}),
      feedAuthContext: backendContext,
      source: loginFeedToken
        ? 'backend' as const
        : feedToken
          ? 'env' as const
          : 'none' as const,
    });
  }

  // Backend did not publish a usable contract — restore old env-token path.
  if (envFeedToken) {
    return Object.freeze({
      feedToken: envFeedToken,
      feedAuthContext: LEGACY_ENV_FEED_QUERY_CONTEXT,
      source: 'env' as const,
    });
  }

  return Object.freeze({
    ...(feedToken ? { feedToken } : {}),
    feedAuthContext: backendContext,
    source: 'none' as const,
  });
};

/**
 * Runtime effective auth for an already-active session (covers cold start
 * where session was committed before env fallback existed).
 */
export const resolveEffectiveFeedAuthForSession = (input: {
  brokerId: string;
  feedAuthContext: FeedAuthContext;
  feedToken?: string | null;
}): ResolvedSessionFeedAuth => {
  if (input.feedAuthContext.mode !== 'disabled_unconfigured') {
    const envToken = resolveConfiguredFeedBrokerTokenForBroker(input.brokerId);
    const feedToken = cleanString(input.feedToken) || envToken;
    return Object.freeze({
      ...(feedToken ? { feedToken } : {}),
      feedAuthContext: input.feedAuthContext,
      source: cleanString(input.feedToken)
        ? 'backend' as const
        : envToken
          ? 'env' as const
          : 'none' as const,
    });
  }

  return resolveSessionFeedAuth({
    brokerId: input.brokerId,
    existingFeedToken: input.feedToken,
  });
};
