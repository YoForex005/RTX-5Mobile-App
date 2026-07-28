import type { FeedAuthContext } from '../state/activeBrokerSession';
import {
  extractFeedBrokerToken,
  preserveNonBlankFeedToken,
  resolveConfiguredFeedBrokerTokenForBroker,
} from './feedAuth';

export const ACHIEVER_BROKER_ID = 'achiever-financials';

const ACHIEVER_FEED_AUTH_CONTEXT_KEYS = Object.freeze([
  'broker_id_query_param',
  'credential',
  'mode',
  'token_query_param',
] as const);

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const cleanParam = (value: unknown): string => {
  const param = cleanString(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(param) ? param : '';
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const disabledFeedAuth = (
  reason: 'missing_contract' | 'missing_credential',
): FeedAuthContext => Object.freeze({
  mode: 'disabled_unconfigured',
  reason,
});

const normalizeBrokerId = (value: unknown): string =>
  cleanString(value).toLowerCase();

const readAuthResponseAccountLogin = (
  response: Record<string, unknown>,
): string => cleanString(response.account_login);

const hasExactAchieverFeedAuthContextKeys = (
  value: Record<string, unknown>,
): boolean => {
  const keys = Object.keys(value).sort();
  return (
    keys.length === ACHIEVER_FEED_AUTH_CONTEXT_KEYS.length &&
    keys.every((key, index) => key === ACHIEVER_FEED_AUTH_CONTEXT_KEYS[index])
  );
};

const readNonBlankRootCredential = (
  response: Record<string, unknown>,
  key: 'access_token' | 'refresh_token',
): string => {
  const value = response[key];
  return typeof value === 'string' && value.trim() ? value : '';
};

const hasCompleteAchieverSameResponseAuth = (
  response: Record<string, unknown>,
): boolean => (
  Boolean(readNonBlankRootCredential(response, 'access_token')) &&
  Boolean(readNonBlankRootCredential(response, 'refresh_token')) &&
  typeof response.expires_in === 'number' &&
  Number.isFinite(response.expires_in) &&
  response.expires_in > 0
);

/**
 * Achiever's feed credential is accepted only when the same response explicitly
 * proves the selected broker and requested account. Request-value fallbacks are
 * intentionally forbidden for this security boundary.
 */
export const assertAchieverAuthResponseIdentity = (input: {
  response: unknown;
  brokerId: string;
  accountLogin: string | number;
}): void => {
  if (normalizeBrokerId(input.brokerId) !== ACHIEVER_BROKER_ID) {
    return;
  }

  const root = asRecord(input.response);
  if (!root) {
    throw new Error('Achiever authentication response is not an object.');
  }
  const responseBrokerId = typeof root.broker_id === 'string'
    ? root.broker_id.trim()
    : '';
  if (responseBrokerId !== ACHIEVER_BROKER_ID) {
    throw new Error('Achiever authentication response did not include the selected broker identity.');
  }

  const expectedAccountLogin = cleanString(input.accountLogin);
  const responseAccountLogin = readAuthResponseAccountLogin(root);
  if (!expectedAccountLogin || responseAccountLogin !== expectedAccountLogin) {
    throw new Error('Achiever authentication response did not match the requested account.');
  }
};

export const isExactAchieverFeedAuthContext = (
  value: FeedAuthContext,
): boolean =>
  value.mode === 'query' &&
  value.credential === 'feed_token' &&
  value.tokenQueryParam === 'token' &&
  value.brokerIdQueryParam === 'broker_id' &&
  !value.accountLoginQueryParam;

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
  brokerId?: string,
): FeedAuthContext => {
  const root = asRecord(response);
  const isAchiever = normalizeBrokerId(brokerId) === ACHIEVER_BROKER_ID;
  const metadata = asRecord(
    isAchiever
      ? root?.feed_auth_context
      : root?.feed_auth_context ?? root?.feed_auth,
  );
  if (!metadata) {
    return disabledFeedAuth('missing_contract');
  }
  if (isAchiever && !hasExactAchieverFeedAuthContextKeys(metadata)) {
    return disabledFeedAuth('missing_contract');
  }

  const mode = cleanString(metadata.mode).toLowerCase();
  if (!isAchiever && mode === 'none' && metadata.auth_required === false) {
    return Object.freeze({ mode: 'none' });
  }
  if (mode !== 'query') {
    return disabledFeedAuth('missing_contract');
  }

  const credentialValue = cleanString(metadata.credential).toLowerCase();
  const credential = credentialValue === 'feed_token' || (
    !isAchiever && credentialValue === 'access_token'
  )
    ? credentialValue
    : null;
  const tokenQueryParam = cleanParam(
    isAchiever
      ? metadata.token_query_param
      : metadata.tokenQueryParam ?? metadata.token_query_param,
  );
  const brokerIdQueryParam = cleanParam(
    isAchiever
      ? metadata.broker_id_query_param
      : metadata.brokerIdQueryParam ?? metadata.broker_id_query_param,
  );
  const accountLoginQueryParam = cleanParam(
    isAchiever
      ? metadata.account_login_query_param
      : metadata.accountLoginQueryParam ?? metadata.account_login_query_param,
  );

  const distinctParams = new Set(
    [tokenQueryParam, brokerIdQueryParam, accountLoginQueryParam].filter(Boolean),
  );
  const expectedParamCount =
    Number(Boolean(tokenQueryParam)) +
    Number(Boolean(brokerIdQueryParam)) +
    Number(Boolean(accountLoginQueryParam));
  if (
    !credential ||
    !tokenQueryParam ||
    distinctParams.size !== expectedParamCount ||
    (
      isAchiever &&
      (
        credential !== 'feed_token' ||
        tokenQueryParam !== 'token' ||
        brokerIdQueryParam !== 'broker_id' ||
        Boolean(accountLoginQueryParam)
      )
    )
  ) {
    return disabledFeedAuth('missing_contract');
  }
  if (credential === 'feed_token' && !hasFeedToken) {
    return disabledFeedAuth('missing_credential');
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
  accountLogin?: string | number | null;
  existingFeedToken?: string | null;
}): ResolvedSessionFeedAuth => {
  const brokerId = normalizeBrokerId(input.brokerId);
  if (brokerId === ACHIEVER_BROKER_ID) {
    assertAchieverAuthResponseIdentity({
      response: input.response,
      brokerId,
      accountLogin: input.accountLogin ?? '',
    });
    const root = asRecord(input.response);
    const loginFeedToken = preserveNonBlankFeedToken(root?.feed_token);
    const feedAuthContext = resolveFeedAuthContextFromAuthResponse(
      input.response,
      Boolean(loginFeedToken),
      brokerId,
    );
    if (!isExactAchieverFeedAuthContext(feedAuthContext) || !loginFeedToken) {
      return Object.freeze({
        feedAuthContext,
        source: 'none' as const,
      });
    }
    const accessToken = readNonBlankRootCredential(root!, 'access_token');
    if (
      !hasCompleteAchieverSameResponseAuth(root!) ||
      loginFeedToken === accessToken
    ) {
      return Object.freeze({
        feedAuthContext: disabledFeedAuth('missing_contract'),
        source: 'none' as const,
      });
    }
    return Object.freeze({
      feedToken: loginFeedToken,
      feedAuthContext,
      source: 'backend' as const,
    });
  }

  const loginFeedToken = extractFeedBrokerToken(input.response);
  const envFeedToken = resolveConfiguredFeedBrokerTokenForBroker(brokerId);
  const existing = preserveNonBlankFeedToken(input.existingFeedToken);
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
  const brokerId = normalizeBrokerId(input.brokerId);
  if (brokerId === ACHIEVER_BROKER_ID) {
    const feedToken = preserveNonBlankFeedToken(input.feedToken);
    if (!isExactAchieverFeedAuthContext(input.feedAuthContext)) {
      return Object.freeze({
        feedAuthContext: input.feedAuthContext.mode === 'disabled_unconfigured'
          ? input.feedAuthContext
          : disabledFeedAuth('missing_contract'),
        source: 'none' as const,
      });
    }
    if (!feedToken) {
      return Object.freeze({
        feedAuthContext: disabledFeedAuth('missing_credential'),
        source: 'none' as const,
      });
    }
    return Object.freeze({
      feedToken,
      feedAuthContext: input.feedAuthContext,
      source: 'backend' as const,
    });
  }

  if (input.feedAuthContext.mode !== 'disabled_unconfigured') {
    const envToken = resolveConfiguredFeedBrokerTokenForBroker(brokerId);
    const feedToken = preserveNonBlankFeedToken(input.feedToken) || envToken;
    return Object.freeze({
      ...(feedToken ? { feedToken } : {}),
      feedAuthContext: input.feedAuthContext,
      source: preserveNonBlankFeedToken(input.feedToken)
        ? 'backend' as const
        : envToken
          ? 'env' as const
          : 'none' as const,
    });
  }

  return resolveSessionFeedAuth({
    brokerId,
    existingFeedToken: input.feedToken,
  });
};
