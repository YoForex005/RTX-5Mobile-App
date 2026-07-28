import {
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionOwnerStampCurrent,
  subscribeActiveBrokerSession,
  updateActiveBrokerSessionCredentials,
  type ActiveBrokerSessionCapture,
  type ActiveBrokerSessionIdentity,
  type ActiveBrokerSessionOwnerStamp,
  type FeedAuthContext,
} from '../state/activeBrokerSession';
import type { SecureAuthCredentialBundle } from '../state/secureCredentialBundle';
import { timedFetch } from '../utils/apiLatency';
import { buildApiUrl } from './brokerRouting';
import { extractFeedBrokerToken } from './feedAuth';
import {
  ACHIEVER_BROKER_ID,
  resolveEffectiveFeedAuthForSession,
  resolveSessionFeedAuth,
} from './feedAuthContract';
import { createTradeIdempotencyKey, getTradeIdempotencyAction } from './tradeIdempotency';
import {
  fingerprintMarketDataHost,
  recordMarketDataEvent,
} from '../market/marketDataTelemetry';

const TOKEN_REFRESH_SKEW_MS = 60_000;
const AUTH_REFRESH_TIMEOUT_MS = 2500;
const AUTH_SESSION_EXPIRED_MESSAGE = 'Refresh token invalid or expired.';
const AUTH_SESSION_UNAVAILABLE_MESSAGE = 'No authenticated broker session available.';
const GUARDED_RESPONSE_BODY_READERS = new Set<PropertyKey>([
  'json',
  'text',
  'blob',
  'arrayBuffer',
  'formData',
  'bytes',
]);

export type BrokerApiRequestInit = RequestInit & {
  _retry?: boolean;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  /**
   * Client-side abort budget for this request. Defaults to the shared
   * API_FETCH_TIMEOUT_MS; pass 0 to wait indefinitely (chart candle history —
   * a slow backend must be awaited, not failed with a timeout error).
   */
  timeoutMs?: number;
  /**
   * Defaults to true for idempotent reads and backend-deduplicated mutations.
   * Existing-position SL/TP PUT has no replay contract, so it refreshes the
   * session after a 401 but returns that response without replaying the write.
   */
  replayAfterAuthRefresh?: boolean;
};

export type BrokerApiJsonResponse<T> = Readonly<{
  ok: boolean;
  status: number;
  data: T;
  identity: ActiveBrokerSessionIdentity;
  owner: ActiveBrokerSessionOwnerStamp;
  cacheNamespace: string;
}>;

type NormalizedAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  brokerId?: string;
  accountLogin?: string;
  feedToken?: string;
  feedAuthContext?: FeedAuthContext;
  feedContractFailure?: 'feed_generation_reused';
};

type InFlightRequest = {
  controller: AbortController;
  removeCallerAbortListener: () => void;
};

type CredentialLease = Readonly<{
  accessToken: string;
  owner: ActiveBrokerSessionOwnerStamp;
}>;

type RequestOwnership = {
  owner: ActiveBrokerSessionOwnerStamp;
};

type OwnedResponse = Readonly<{
  response: Response;
  identity: ActiveBrokerSessionIdentity;
  owner: ActiveBrokerSessionOwnerStamp;
  cacheNamespace: string;
}>;

type SessionInvalidationHandler = (
  identity: ActiveBrokerSessionIdentity,
) => Promise<void>;

export class StaleBrokerSessionError extends Error {
  public readonly code = 'STALE_BROKER_SESSION';

  constructor() {
    super('Broker session changed while the operation was in flight.');
    this.name = 'StaleBrokerSessionError';
  }
}

const isAuthFailureStatus = (status: number): boolean =>
  status === 400 || status === 401 || status === 403;

const isAuthSessionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes(AUTH_SESSION_EXPIRED_MESSAGE) ||
    message.includes(AUTH_SESSION_UNAVAILABLE_MESSAGE) ||
    message.includes('No refresh token available')
  );
};

const createUnauthenticatedResponse = (message = AUTH_SESSION_UNAVAILABLE_MESSAGE): Response =>
  new Response(JSON.stringify({ code: 'UNAUTHORIZED', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

const parseExpiresAtMs = (expiresAt: string | undefined | null): number => {
  if (!expiresAt) return 0;
  const numeric = Number(expiresAt);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeBrokerRefreshResponse = (
  payload: unknown,
  expected?: Readonly<{
    brokerId: string;
    accountLogin: string | number;
    previousFeedToken?: string | null;
  }>,
): NormalizedAuthResponse => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Refresh response was not an object.');
  }
  const root = payload as Record<string, unknown>;
  const accessToken = String(root.access_token ?? root.token ?? '').trim();
  const refreshToken = String(
    root.refresh_token ?? root.refreshToken ?? '',
  ).trim();
  const rawExpiresAt = root.expires_at ?? root.expiresAt;

  let expiresAt: string;
  if (typeof rawExpiresAt === 'string' && rawExpiresAt.trim()) {
    const raw = rawExpiresAt.trim();
    const ms = parseExpiresAtMs(raw);
    expiresAt = ms > 0 ? new Date(ms).toISOString() : raw;
  } else if (typeof rawExpiresAt === 'number' && rawExpiresAt > 0) {
    const ms = rawExpiresAt > 1e12 ? rawExpiresAt : rawExpiresAt * 1000;
    expiresAt = new Date(ms).toISOString();
  } else {
    const expiresIn = typeof root.expires_in === 'number' ? root.expires_in : 86_400;
    expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  if (!accessToken) {
    throw new Error('Refresh response did not include an access token.');
  }
  if (!refreshToken) {
    throw new Error('Refresh response did not include a rotated refresh token.');
  }

  const brokerId = typeof root.broker_id === 'string'
    ? root.broker_id.trim().toLowerCase()
    : typeof root.brokerId === 'string'
      ? root.brokerId.trim().toLowerCase()
      : undefined;
  const accountLoginValue = root.account_login ?? root.accountLogin;
  const accountLogin =
    typeof accountLoginValue === 'string' || typeof accountLoginValue === 'number'
      ? String(accountLoginValue).trim()
      : undefined;
  const sessionFeed = expected
    ? resolveSessionFeedAuth({
        response: root,
        brokerId: expected.brokerId,
        accountLogin: expected.accountLogin,
      })
    : null;
  const candidateFeedToken = sessionFeed
    ? sessionFeed.feedToken
    : extractFeedBrokerToken(root);
  const previousFeedToken =
    typeof expected?.previousFeedToken === 'string' &&
    expected.previousFeedToken.trim()
      ? expected.previousFeedToken
      : '';
  const feedGenerationReused =
    expected?.brokerId.trim().toLowerCase() === ACHIEVER_BROKER_ID &&
    Boolean(candidateFeedToken) &&
    Boolean(previousFeedToken) &&
    candidateFeedToken === previousFeedToken;
  const feedToken = feedGenerationReused ? undefined : candidateFeedToken;
  const feedAuthContext = feedGenerationReused
    ? Object.freeze({
        mode: 'disabled_unconfigured' as const,
        reason: 'missing_credential' as const,
      })
    : sessionFeed?.feedAuthContext;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(brokerId ? { brokerId } : {}),
    ...(accountLogin ? { accountLogin } : {}),
    ...(feedToken ? { feedToken } : {}),
    ...(feedAuthContext ? { feedAuthContext } : {}),
    ...(feedGenerationReused
      ? { feedContractFailure: 'feed_generation_reused' as const }
      : {}),
  };
};

export const createBrokerRefreshRequestInit = (
  refreshToken: string,
  signal?: AbortSignal,
): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify({ refresh_token: refreshToken }),
  ...(signal ? { signal } : {}),
});

const appendQueryCredential = (
  baseUrl: string,
  params: ReadonlyArray<readonly [string, string]>,
): string => {
  const url = new URL(baseUrl);
  for (const [key, value] of params) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export class BrokerAPI {
  private static instance: BrokerAPI | null = null;
  private readonly refreshPromises = new Map<string, Promise<CredentialLease>>();
  private readonly inFlight = new Map<string, Set<AbortController>>();
  private readonly unsubscribeFromSession: () => void;
  private sessionInvalidationHandler: SessionInvalidationHandler | null = null;

  constructor() {
    this.unsubscribeFromSession = subscribeActiveBrokerSession((event) => {
      if (event.type === 'transition') {
        this.abortInFlightRequests();
        this.refreshPromises.clear();
      }
    });
  }

  static getInstance(): BrokerAPI {
    if (!BrokerAPI.instance) {
      BrokerAPI.instance = new BrokerAPI();
    }
    return BrokerAPI.instance;
  }

  dispose(): void {
    this.unsubscribeFromSession();
    this.abortInFlightRequests();
    this.refreshPromises.clear();
  }

  abortInFlightRequests(): void {
    for (const requests of this.inFlight.values()) {
      for (const controller of requests) controller.abort();
    }
    this.inFlight.clear();
  }

  /** Registered by the top-level coordinator to include sockets/caches/UI in auth invalidation. */
  setSessionInvalidationHandler(handler: SessionInvalidationHandler | null): void {
    this.sessionInvalidationHandler = handler;
  }

  async request(endpoint: string, options: BrokerApiRequestInit = {}): Promise<Response> {
    const capture = captureActiveBrokerSession();
    if (!capture) {
      return createUnauthenticatedResponse();
    }

    const owned = await this.executeRequest(endpoint, options, capture);
    return this.bindResponseBodyReaders(owned.response, owned.owner);
  }

  async getJson<T>(endpoint: string, options: BrokerApiRequestInit = {}): Promise<T> {
    const result = await this.getJsonResponse<T>(endpoint, options);
    if (!result.ok) {
      throw { response: { status: result.status, data: result.data } };
    }
    return result.data;
  }

  /**
   * Parses a response while bound to one broker/account/epoch. Callers that
   * write a cache after awaiting must use `commitJsonResponse` so a transition
   * between parse completion and the write is rejected as stale.
   */
  async getJsonResponse<T>(
    endpoint: string,
    options: BrokerApiRequestInit = {},
  ): Promise<BrokerApiJsonResponse<T>> {
    const capture = this.requireCapture();
    const owned = await this.executeRequest(endpoint, options, capture);
    const response = this.bindResponseBodyReaders(owned.response, owned.owner);
    this.assertOwnerCurrent(owned.owner);

    let data: T;
    try {
      data = await response.json() as T;
    } catch (error) {
      this.assertOwnerCurrent(owned.owner);
      if (response.ok) throw error;
      data = {} as T;
    }
    this.assertOwnerCurrent(owned.owner);
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      data,
      identity: owned.identity,
      owner: owned.owner,
      cacheNamespace: owned.cacheNamespace,
    });
  }

  /** Performs a synchronous parse/cache commit only if provenance is current. */
  commitJsonResponse<T, R>(
    result: BrokerApiJsonResponse<T>,
    expectedCacheNamespace: string,
    commit: (data: T) => R,
  ): R {
    this.assertOwnerCurrent(result.owner);
    const capture = this.requireCurrentCapture(result.identity);
    if (
      !expectedCacheNamespace ||
      result.cacheNamespace !== expectedCacheNamespace ||
      capture.session.cacheNamespace !== expectedCacheNamespace
    ) {
      throw new StaleBrokerSessionError();
    }
    return commit(result.data);
  }

  async getValidAccessToken(forceRefresh = false): Promise<string> {
    const capture = captureActiveBrokerSession();
    if (!capture) return '';
    const identity = getActiveBrokerSessionIdentity(capture.session);
    const lease = await this.getValidAccessTokenForCapture(capture, identity, forceRefresh);
    this.assertOwnerCurrent(lease.owner);
    return lease.accessToken;
  }

  async getWebSocketUrl(): Promise<string> {
    const capture = this.requireCapture();
    const identity = getActiveBrokerSessionIdentity(capture.session);
    if (!capture.session.tradeWsBase) {
      throw new Error('The active broker did not provide a validated trading WebSocket endpoint.');
    }
    const lease = await this.getValidAccessTokenForCapture(capture, identity, false);
    this.assertOwnerCurrent(lease.owner);
    if (!lease.accessToken) throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    const session = this.requireCurrentCapture(identity).session;
    return appendQueryCredential(session.tradeWsBase!, [['token', lease.accessToken]]);
  }

  async getQuoteWebSocketUrl(): Promise<string> {
    const initialCapture = this.requireCapture();
    const identity = getActiveBrokerSessionIdentity(initialCapture.session);
    const effective = resolveEffectiveFeedAuthForSession({
      brokerId: initialCapture.session.brokerId,
      feedAuthContext: initialCapture.session.feedAuthContext,
      feedToken: initialCapture.credentials.feedToken,
    });
    const auth = effective.feedAuthContext;
    if (auth.mode === 'disabled_unconfigured') {
      throw new Error(
        auth.reason === 'missing_credential'
          ? 'The active broker market-data credential is unavailable. Please sign in again.'
          : 'The active broker market-data authentication contract is not configured.',
      );
    }
    if (auth.mode === 'none') {
      this.assertCurrent(identity);
      return initialCapture.session.feedWsBase;
    }

    let credential = '';
    if (auth.credential === 'access_token') {
      const lease = await this.getValidAccessTokenForCapture(initialCapture, identity, false);
      this.assertOwnerCurrent(lease.owner);
      credential = lease.accessToken;
    } else {
      credential = effective.feedToken
        || this.requireCurrentCapture(identity).credentials.feedToken
        || '';
    }
    this.assertCurrent(identity);
    if (!credential) {
      throw new Error('The active broker market-data credential is unavailable. Please sign in again.');
    }

    const session = this.requireCurrentCapture(identity).session;
    const params: Array<readonly [string, string]> = [[auth.tokenQueryParam, credential]];
    if (auth.brokerIdQueryParam) params.push([auth.brokerIdQueryParam, session.brokerId]);
    if (auth.accountLoginQueryParam) params.push([auth.accountLoginQueryParam, session.accountLogin]);
    return appendQueryCredential(session.feedWsBase, params);
  }

  private async executeRequest(
    endpoint: string,
    options: BrokerApiRequestInit,
    capture: ActiveBrokerSessionCapture,
  ): Promise<OwnedResponse> {
    const identity = getActiveBrokerSessionIdentity(capture.session);
    const ownership: RequestOwnership = {
      owner: this.requireCurrentOwnerStamp(identity),
    };
    const request = this.createInFlightRequest(capture, options.signal);
    try {
      const response = await this.requestForCapture(
        endpoint,
        options,
        capture,
        identity,
        ownership,
        request.controller.signal,
      );
      this.assertOwnerCurrent(ownership.owner);
      return Object.freeze({
        response,
        identity,
        owner: ownership.owner,
        cacheNamespace: ownership.owner.cacheNamespace,
      });
    } catch (error) {
      if (!isActiveBrokerSessionOwnerStampCurrent(ownership.owner)) {
        throw new StaleBrokerSessionError();
      }
      throw error;
    } finally {
      request.removeCallerAbortListener();
      this.unregisterInFlight(capture.session.cacheNamespace, request.controller);
    }
  }

  private async requestForCapture(
    endpoint: string,
    options: BrokerApiRequestInit,
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    ownership: RequestOwnership,
    signal: AbortSignal,
  ): Promise<Response> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});
    const tradeIdempotencyAction = getTradeIdempotencyAction(endpoint, method);
    const shouldAuthenticate = !options.skipAuth;
    let activeToken = capture.credentials.accessToken;
    let activeLease: CredentialLease = Object.freeze({
      accessToken: activeToken,
      owner: ownership.owner,
    });

    if (shouldAuthenticate && !activeToken) {
      return createUnauthenticatedResponse();
    }
    if (shouldAuthenticate && !options.skipRefresh) {
      try {
        activeLease = await this.getValidAccessTokenForCapture(capture, identity, false);
        activeToken = activeLease.accessToken;
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    }

    if (shouldAuthenticate) {
      if (!activeToken) return createUnauthenticatedResponse();
      headers.set('Authorization', `Bearer ${activeToken}`);
    }
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    if (!headers.has('Content-Type') && (
      tradeIdempotencyAction || (options.body && !(options.body instanceof FormData))
    )) {
      headers.set('Content-Type', 'application/json');
    }
    if (tradeIdempotencyAction && !headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', createTradeIdempotencyKey(tradeIdempotencyAction));
    }

    const url = buildApiUrl(endpoint, capture.session.apiBase);
    const {
      _retry: _ignoredRetry,
      skipAuth: _ignoredSkipAuth,
      skipRefresh: _ignoredSkipRefresh,
      signal: _ignoredSignal,
      timeoutMs,
      replayAfterAuthRefresh: _ignoredReplayAfterAuthRefresh,
      ...fetchOptions
    } = options;
    const requestConfig: RequestInit = { ...fetchOptions, headers, signal };
    if (shouldAuthenticate) {
      // A successful preflight refresh owns the next request only when its
      // credential lease is still current immediately before the send.
      this.adoptCredentialLease(ownership, identity, activeLease);
    } else {
      this.assertOwnerCurrent(ownership.owner);
    }
    let response = await timedFetch(url, requestConfig, {
      label: `apiClient.${method}`,
      method,
      endpoint,
      source: 'apiClient',
      timeoutMs,
    });
    this.assertOwnerCurrent(ownership.owner);

    if (response.status === 401 && shouldAuthenticate && !options._retry) {
      let refreshedLease: CredentialLease;
      try {
        refreshedLease = await this.getValidAccessTokenForCapture(capture, identity, true);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
      const refreshedToken = refreshedLease.accessToken;
      if (!refreshedToken) return response;
      if (
        options.replayAfterAuthRefresh === false ||
        refreshedToken === activeToken
      ) {
        // Narrow causal exception: this settled 401 triggered the credential
        // rotation. Rebind only to the exact lease returned by that refresh so
        // callers still receive the rejection without replaying the mutation.
        this.adoptCredentialLease(ownership, identity, refreshedLease);
        return response;
      }

      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      // Adopt only the refresh operation's exact owner immediately before the
      // replay. An unrelated credential rotation makes this lease stale.
      this.adoptCredentialLease(ownership, identity, refreshedLease);
      response = await timedFetch(url, { ...requestConfig, headers: retryHeaders }, {
        label: `apiClient.retryAfterRefresh.${method}`,
        method,
        endpoint,
        source: 'apiClient',
        timeoutMs,
      });
      this.assertOwnerCurrent(ownership.owner);
    }

    return response;
  }

  private async getValidAccessTokenForCapture(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    forceRefresh: boolean,
  ): Promise<CredentialLease> {
    const current = this.requireCurrentCapture(identity);
    const owner = this.requireCurrentOwnerStamp(identity);
    if (!current.credentials.accessToken) {
      return Object.freeze({ accessToken: '', owner });
    }
    const expiresAtMs = parseExpiresAtMs(current.credentials.expiresAt);
    const shouldRefresh = forceRefresh || (
      Boolean(current.credentials.refreshToken) &&
      expiresAtMs > 0 &&
      expiresAtMs - Date.now() < TOKEN_REFRESH_SKEW_MS
    );
    if (!shouldRefresh) {
      return Object.freeze({
        accessToken: current.credentials.accessToken,
        owner,
      });
    }
    return this.refreshToken(capture, identity);
  }

  private refreshToken(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
  ): Promise<CredentialLease> {
    this.assertOwnerCurrent(this.requireCurrentOwnerStamp(identity));
    const namespace = capture.session.cacheNamespace;
    const existing = this.refreshPromises.get(namespace);
    if (existing) return existing;

    const promise = this.performRefresh(identity).finally(() => {
      if (this.refreshPromises.get(namespace) === promise) {
        this.refreshPromises.delete(namespace);
      }
    });
    this.refreshPromises.set(namespace, promise);
    return promise;
  }

  private async performRefresh(identity: ActiveBrokerSessionIdentity): Promise<CredentialLease> {
    const capture = this.requireCurrentCapture(identity);
    const refreshOwner = this.requireCurrentOwnerStamp(identity);
    const { session, credentials } = capture;
    let refreshOutcomeRecorded = false;
    const recordRefreshOutcome = (
      outcome: string,
      extra: Record<string, unknown> = {},
    ) => {
      refreshOutcomeRecorded = true;
      recordMarketDataEvent('refresh_outcome', {
        outcome,
        brokerId: session.brokerId,
        sessionEpoch: identity.sessionEpoch,
        apiHostFingerprint: fingerprintMarketDataHost(session.apiBase),
        ...extra,
      });
    };
    if (!credentials.refreshToken) {
      recordRefreshOutcome('missing_refresh_credential');
      throw new Error('No refresh token available.');
    }

    const request = this.createInFlightRequest(capture);
    try {
      const response = await timedFetch(`${session.apiBase}/auth/refresh`, createBrokerRefreshRequestInit(
        credentials.refreshToken,
        request.controller.signal,
      ), {
        label: 'apiClient.refresh',
        method: 'POST',
        endpoint: '/auth/refresh',
        source: 'auth',
        timeoutMs: AUTH_REFRESH_TIMEOUT_MS,
      });
      this.assertOwnerCurrent(refreshOwner);

      if (!response.ok) {
        recordRefreshOutcome('rejected', { status: response.status });
        if (isAuthFailureStatus(response.status)) {
          await this.invalidateAuthSession(identity);
          throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw new Error(`Token refresh failed with status ${response.status}.`);
      }

      const payload = await response.json() as Record<string, unknown>;
      this.assertOwnerCurrent(refreshOwner);
      let normalized: NormalizedAuthResponse;
      try {
        normalized = normalizeBrokerRefreshResponse(payload, {
          brokerId: session.brokerId,
          accountLogin: session.accountLogin,
          previousFeedToken: credentials.feedToken,
        });
      } catch {
        recordRefreshOutcome('invalid_rotation_payload');
        await this.invalidateAuthSession(identity);
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      if (normalized.brokerId && normalized.brokerId !== session.brokerId) {
        recordRefreshOutcome('broker_identity_mismatch');
        await this.invalidateAuthSession(identity);
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      if (normalized.accountLogin && normalized.accountLogin !== session.accountLogin) {
        recordRefreshOutcome('account_identity_mismatch');
        await this.invalidateAuthSession(identity);
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      const strictAchiever = session.brokerId === ACHIEVER_BROKER_ID;
      const nextFeedAuthContext =
        normalized.feedAuthContext ?? session.feedAuthContext;
      const feedToken = normalized.feedToken
        || (!strictAchiever ? credentials.feedToken : undefined);

      // The current-owner check and queued secure replacement are invoked in
      // the same turn. A subsequent broker commit queues behind this write.
      this.assertOwnerCurrent(refreshOwner);
      let storedCredentials: SecureAuthCredentialBundle;
      try {
        const { replaceAuthSessionCredentials } = await import('../state/brokerSessionStorage');
        this.assertOwnerCurrent(refreshOwner);
        storedCredentials = await replaceAuthSessionCredentials({
          brokerId: session.brokerId,
          accountLogin: session.accountLogin,
          accessToken: normalized.accessToken,
          refreshToken: normalized.refreshToken,
          expiresAt: normalized.expiresAt,
          feedToken,
          feedAuthContext: nextFeedAuthContext,
        });
        this.assertOwnerCurrent(refreshOwner);
      } catch (error) {
        recordRefreshOutcome('secure_storage_failed');
        if (isActiveBrokerSessionOwnerStampCurrent(refreshOwner)) {
          await this.invalidateAuthSession(identity);
        }
        throw error;
      }
      this.assertOwnerCurrent(refreshOwner);

      const updated = updateActiveBrokerSessionCredentials(identity, {
        accessToken: storedCredentials.accessToken,
        refreshToken: storedCredentials.refreshToken,
        expiresAt: storedCredentials.expiresAt,
        ...(storedCredentials.feedToken
          ? { feedToken: storedCredentials.feedToken }
          : {}),
      }, storedCredentials.feedAuthContext);
      if (!updated) throw new StaleBrokerSessionError();
      const owner = this.requireCurrentOwnerStamp(identity);
      const current = this.requireCurrentCapture(identity);
      if (current.credentials.accessToken !== normalized.accessToken) {
        throw new StaleBrokerSessionError();
      }
      const { rebindActiveBrokerFeedHealthSession } =
        await import('../services/brokerSessionCoordinator');
      this.assertOwnerCurrent(owner);
      rebindActiveBrokerFeedHealthSession(this.requireCurrentCapture(identity));
      recordRefreshOutcome(normalized.feedContractFailure ?? 'accepted', {
        status: response.status,
        feedContractAccepted:
          storedCredentials.feedAuthContext.mode === 'none' ||
          (
            storedCredentials.feedAuthContext.mode === 'query' &&
            (
              storedCredentials.feedAuthContext.credential === 'access_token' ||
              Boolean(storedCredentials.feedToken)
            )
          ),
      });
      return Object.freeze({
        accessToken: normalized.accessToken,
        owner,
      });
    } catch (error) {
      if (!refreshOutcomeRecorded) {
        recordRefreshOutcome(
          error instanceof StaleBrokerSessionError ? 'stale_session' : 'request_failed',
        );
      }
      if (
        !isActiveBrokerSessionOwnerStampCurrent(refreshOwner) &&
        !(error instanceof Error && isAuthSessionError(error))
      ) {
        throw new StaleBrokerSessionError();
      }
      throw error;
    } finally {
      request.removeCallerAbortListener();
      this.unregisterInFlight(capture.session.cacheNamespace, request.controller);
    }
  }

  private async invalidateAuthSession(identity: ActiveBrokerSessionIdentity): Promise<void> {
    if (!isActiveBrokerSessionCurrent(identity)) return;
    if (this.sessionInvalidationHandler) {
      await this.sessionInvalidationHandler(identity);
      return;
    }
    beginActiveBrokerSessionTransition();
    try {
      const { clearAuthSessionTokens } = await import('../state/brokerSessionStorage');
      await clearAuthSessionTokens();
    } catch {
      // The epoch was already advanced and memory credentials were erased.
      // Secure-storage failures stay fail-closed and are handled by re-login.
    }
  }

  private requireCapture(): ActiveBrokerSessionCapture {
    const capture = captureActiveBrokerSession();
    if (!capture) throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    return capture;
  }

  private requireCurrentCapture(
    identity: ActiveBrokerSessionIdentity,
  ): ActiveBrokerSessionCapture {
    this.assertCurrent(identity);
    const capture = captureActiveBrokerSession();
    if (!capture) throw new StaleBrokerSessionError();
    return capture;
  }

  private assertCurrent(identity: ActiveBrokerSessionIdentity): void {
    if (!isActiveBrokerSessionCurrent(identity)) {
      throw new StaleBrokerSessionError();
    }
  }

  private requireCurrentOwnerStamp(
    identity: ActiveBrokerSessionIdentity,
  ): ActiveBrokerSessionOwnerStamp {
    this.assertCurrent(identity);
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (
      !owner ||
      owner.brokerId !== identity.brokerId ||
      owner.accountLogin !== identity.accountLogin ||
      owner.sessionEpoch !== identity.sessionEpoch ||
      !isActiveBrokerSessionOwnerStampCurrent(owner)
    ) {
      throw new StaleBrokerSessionError();
    }
    return owner;
  }

  private assertOwnerCurrent(owner: ActiveBrokerSessionOwnerStamp): void {
    if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
      throw new StaleBrokerSessionError();
    }
  }

  private adoptCredentialLease(
    ownership: RequestOwnership,
    identity: ActiveBrokerSessionIdentity,
    lease: CredentialLease,
  ): void {
    this.assertOwnerCurrent(lease.owner);
    const current = this.requireCurrentCapture(identity);
    if (current.credentials.accessToken !== lease.accessToken) {
      throw new StaleBrokerSessionError();
    }
    ownership.owner = lease.owner;
  }

  /**
   * A fetch can finish while its body is still being decoded. Bind all standard
   * body readers to the credential owner so legacy `apiClient(...).json()` call
   * sites cannot parse an old response after a session or credential rotation.
   */
  private bindResponseBodyReaders(
    response: Response,
    owner: ActiveBrokerSessionOwnerStamp,
  ): Response {
    return new Proxy(response, {
      get: (target, property) => {
        if (property === 'clone' && typeof target.clone === 'function') {
          return () => {
            this.assertOwnerCurrent(owner);
            const clone = target.clone();
            this.assertOwnerCurrent(owner);
            return this.bindResponseBodyReaders(clone, owner);
          };
        }

        const value = Reflect.get(target, property, target);
        if (GUARDED_RESPONSE_BODY_READERS.has(property) && typeof value === 'function') {
          return async (...args: unknown[]) => {
            this.assertOwnerCurrent(owner);
            try {
              const body = await Reflect.apply(value, target, args);
              this.assertOwnerCurrent(owner);
              return body;
            } catch (error) {
              this.assertOwnerCurrent(owner);
              throw error;
            }
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  private createInFlightRequest(
    capture: ActiveBrokerSessionCapture,
    callerSignal?: AbortSignal | null,
  ): InFlightRequest {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const namespace = capture.session.cacheNamespace;
    const requests = this.inFlight.get(namespace) ?? new Set<AbortController>();
    requests.add(controller);
    this.inFlight.set(namespace, requests);
    return {
      controller,
      removeCallerAbortListener: () => callerSignal?.removeEventListener('abort', abortFromCaller),
    };
  }

  private unregisterInFlight(namespace: string, controller: AbortController): void {
    const requests = this.inFlight.get(namespace);
    if (!requests) return;
    requests.delete(controller);
    if (requests.size === 0) this.inFlight.delete(namespace);
  }

}

export const brokerApi = BrokerAPI.getInstance();
