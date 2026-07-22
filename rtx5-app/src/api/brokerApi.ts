import {
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  subscribeActiveBrokerSession,
  updateActiveBrokerSessionCredentials,
  type ActiveBrokerSessionCapture,
  type ActiveBrokerSessionIdentity,
} from '../state/activeBrokerSession';
import { timedFetch } from '../utils/apiLatency';
import { buildApiUrl } from './brokerRouting';
import { extractFeedBrokerToken, resolveConfiguredFeedBrokerTokenForBroker } from './feedAuth';
import { resolveEffectiveFeedAuthForSession } from './feedAuthContract';
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
};

export type BrokerApiJsonResponse<T> = Readonly<{
  ok: boolean;
  status: number;
  data: T;
  identity: ActiveBrokerSessionIdentity;
  cacheNamespace: string;
}>;

type NormalizedAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  brokerId?: string;
  feedToken?: string;
};

type InFlightRequest = {
  controller: AbortController;
  removeCallerAbortListener: () => void;
};

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
  payload: Record<string, unknown>,
): NormalizedAuthResponse => {
  const accessToken = String(payload.access_token ?? payload.token ?? '').trim();
  const refreshToken = String(
    payload.refresh_token ?? payload.refreshToken ?? '',
  ).trim();
  const feedToken = extractFeedBrokerToken(payload);
  const rawExpiresAt = payload.expires_at ?? payload.expiresAt;

  let expiresAt: string;
  if (typeof rawExpiresAt === 'string' && rawExpiresAt.trim()) {
    const raw = rawExpiresAt.trim();
    const ms = parseExpiresAtMs(raw);
    expiresAt = ms > 0 ? new Date(ms).toISOString() : raw;
  } else if (typeof rawExpiresAt === 'number' && rawExpiresAt > 0) {
    const ms = rawExpiresAt > 1e12 ? rawExpiresAt : rawExpiresAt * 1000;
    expiresAt = new Date(ms).toISOString();
  } else {
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 86_400;
    expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  if (!accessToken) {
    throw new Error('Refresh response did not include an access token.');
  }
  if (!refreshToken) {
    throw new Error('Refresh response did not include a rotated refresh token.');
  }

  const brokerId = typeof payload.broker_id === 'string'
    ? payload.broker_id.trim().toLowerCase()
    : typeof payload.brokerId === 'string'
      ? payload.brokerId.trim().toLowerCase()
      : undefined;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(brokerId ? { brokerId } : {}),
    ...(feedToken ? { feedToken } : {}),
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
  private readonly refreshPromises = new Map<string, Promise<string>>();
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

    const identity = getActiveBrokerSessionIdentity(capture.session);
    const request = this.createInFlightRequest(capture, options.signal);
    try {
      const response = await this.requestForCapture(endpoint, options, capture, identity, request.controller.signal);
      this.assertCurrent(identity);
      return this.bindResponseBodyReaders(response, identity);
    } catch (error) {
      if (!isActiveBrokerSessionCurrent(identity)) {
        throw new StaleBrokerSessionError();
      }
      throw error;
    } finally {
      request.removeCallerAbortListener();
      this.unregisterInFlight(capture.session.cacheNamespace, request.controller);
    }
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
    const identity = getActiveBrokerSessionIdentity(capture.session);
    const response = await this.request(endpoint, options);
    this.assertCurrent(identity);

    let data: T;
    try {
      data = await response.json() as T;
    } catch (error) {
      this.assertCurrent(identity);
      if (response.ok) throw error;
      data = {} as T;
    }
    this.assertCurrent(identity);
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      data,
      identity,
      cacheNamespace: capture.session.cacheNamespace,
    });
  }

  /** Performs a synchronous parse/cache commit only if provenance is current. */
  commitJsonResponse<T, R>(
    result: BrokerApiJsonResponse<T>,
    expectedCacheNamespace: string,
    commit: (data: T) => R,
  ): R {
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
    const token = await this.getValidAccessTokenForCapture(capture, identity, forceRefresh);
    this.assertCurrent(identity);
    return token;
  }

  async getWebSocketUrl(): Promise<string> {
    const capture = this.requireCapture();
    const identity = getActiveBrokerSessionIdentity(capture.session);
    if (!capture.session.tradeWsBase) {
      throw new Error('The active broker did not provide a validated trading WebSocket endpoint.');
    }
    const token = await this.getValidAccessTokenForCapture(capture, identity, false);
    this.assertCurrent(identity);
    if (!token) throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    return appendQueryCredential(capture.session.tradeWsBase, [['token', token]]);
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
      credential = await this.getValidAccessTokenForCapture(initialCapture, identity, false);
    } else {
      credential = effective.feedToken
        || this.requireCurrentCapture(identity).credentials.feedToken
        || resolveConfiguredFeedBrokerTokenForBroker(initialCapture.session.brokerId)
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

  private async requestForCapture(
    endpoint: string,
    options: BrokerApiRequestInit,
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    signal: AbortSignal,
  ): Promise<Response> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});
    const tradeIdempotencyAction = getTradeIdempotencyAction(endpoint, method);
    const shouldAuthenticate = !options.skipAuth;
    let activeToken = capture.credentials.accessToken;

    if (shouldAuthenticate && !activeToken) {
      return createUnauthenticatedResponse();
    }
    if (shouldAuthenticate && !options.skipRefresh) {
      try {
        activeToken = await this.getValidAccessTokenForCapture(capture, identity, false);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
      this.assertCurrent(identity);
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
      ...fetchOptions
    } = options;
    const requestConfig: RequestInit = { ...fetchOptions, headers, signal };
    let response = await timedFetch(url, requestConfig, {
      label: `apiClient.${method}`,
      method,
      endpoint,
      source: 'apiClient',
      timeoutMs,
    });
    this.assertCurrent(identity);

    if (response.status === 401 && shouldAuthenticate && !options._retry) {
      let refreshedToken = '';
      try {
        refreshedToken = await this.getValidAccessTokenForCapture(capture, identity, true);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
      this.assertCurrent(identity);
      if (!refreshedToken || refreshedToken === activeToken) return response;

      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      response = await timedFetch(url, { ...requestConfig, headers: retryHeaders }, {
        label: `apiClient.retryAfterRefresh.${method}`,
        method,
        endpoint,
        source: 'apiClient',
        timeoutMs,
      });
      this.assertCurrent(identity);
    }

    return response;
  }

  private async getValidAccessTokenForCapture(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    forceRefresh: boolean,
  ): Promise<string> {
    const current = this.requireCurrentCapture(identity);
    if (!current.credentials.accessToken) return '';
    const expiresAtMs = parseExpiresAtMs(current.credentials.expiresAt);
    const shouldRefresh = forceRefresh || (
      Boolean(current.credentials.refreshToken) &&
      expiresAtMs > 0 &&
      expiresAtMs - Date.now() < TOKEN_REFRESH_SKEW_MS
    );
    if (!shouldRefresh) return current.credentials.accessToken;
    return this.refreshToken(capture, identity);
  }

  private refreshToken(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
  ): Promise<string> {
    this.assertCurrent(identity);
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

  private async performRefresh(identity: ActiveBrokerSessionIdentity): Promise<string> {
    const capture = this.requireCurrentCapture(identity);
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
      this.assertCurrent(identity);

      if (!response.ok) {
        recordRefreshOutcome('rejected', { status: response.status });
        if (isAuthFailureStatus(response.status)) {
          await this.invalidateAuthSession(identity);
          throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw new Error(`Token refresh failed with status ${response.status}.`);
      }

      const payload = await response.json() as Record<string, unknown>;
      this.assertCurrent(identity);
      let normalized: NormalizedAuthResponse;
      try {
        normalized = normalizeBrokerRefreshResponse(payload);
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
      const feedToken = normalized.feedToken
        || credentials.feedToken
        || resolveConfiguredFeedBrokerTokenForBroker(session.brokerId)
        || undefined;

      // The current-identity check and queued secure replacement are invoked in
      // the same turn. A subsequent broker commit queues behind this write.
      this.assertCurrent(identity);
      try {
        const { replaceAuthSessionCredentials } = await import('../state/brokerSessionStorage');
        this.assertCurrent(identity);
        await replaceAuthSessionCredentials({
          brokerId: session.brokerId,
          accountLogin: session.accountLogin,
          accessToken: normalized.accessToken,
          refreshToken: normalized.refreshToken,
          expiresAt: normalized.expiresAt,
          feedToken,
        });
      } catch (error) {
        recordRefreshOutcome('secure_storage_failed');
        if (isActiveBrokerSessionCurrent(identity)) {
          await this.invalidateAuthSession(identity);
        }
        throw error;
      }
      this.assertCurrent(identity);

      const updated = updateActiveBrokerSessionCredentials(identity, {
        accessToken: normalized.accessToken,
        refreshToken: normalized.refreshToken,
        expiresAt: normalized.expiresAt,
        feedToken,
      });
      if (!updated) throw new StaleBrokerSessionError();
      recordRefreshOutcome('accepted', { status: response.status });
      return normalized.accessToken;
    } catch (error) {
      if (!refreshOutcomeRecorded) {
        recordRefreshOutcome(
          error instanceof StaleBrokerSessionError ? 'stale_session' : 'request_failed',
        );
      }
      if (!isActiveBrokerSessionCurrent(identity) && !(error instanceof Error && isAuthSessionError(error))) {
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

  /**
   * A fetch can finish while its body is still being decoded. Bind all standard
   * body readers to the request identity so legacy `apiClient(...).json()` call
   * sites cannot parse an old broker response after an epoch transition.
   */
  private bindResponseBodyReaders(
    response: Response,
    identity: ActiveBrokerSessionIdentity,
  ): Response {
    return new Proxy(response, {
      get: (target, property) => {
        if (property === 'clone' && typeof target.clone === 'function') {
          return () => {
            this.assertCurrent(identity);
            const clone = target.clone();
            this.assertCurrent(identity);
            return this.bindResponseBodyReaders(clone, identity);
          };
        }

        const value = Reflect.get(target, property, target);
        if (GUARDED_RESPONSE_BODY_READERS.has(property) && typeof value === 'function') {
          return async (...args: unknown[]) => {
            this.assertCurrent(identity);
            try {
              const body = await Reflect.apply(value, target, args);
              this.assertCurrent(identity);
              return body;
            } catch (error) {
              this.assertCurrent(identity);
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
