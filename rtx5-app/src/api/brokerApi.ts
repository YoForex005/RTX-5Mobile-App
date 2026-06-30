import { useUserPreferences } from '../state/userPreferences';
import {
  ACCESS_TOKEN_KEY,
  ACTIVE_BROKER_ID_KEY,
  ACTIVE_BROKER_LOGO_URL_KEY,
  ACTIVE_BROKER_SERVER_URL_KEY,
  EXPIRES_AT_KEY,
  REFRESH_TOKEN_KEY,
  clearAuthSessionTokens,
  persistAuthSessionTokens,
  persistSelectedBrokerSession,
} from '../state/brokerSessionStorage';
import { getSecureItemAsync } from '../utils/secureStorage';
import { timedFetch } from '../utils/apiLatency';
import {
  buildApiUrl,
  buildBrokerApiBaseUrl,
  buildBrokerWsUrl,
  getBrokerBackendDomainUnavailableMessage,
  isBrokerServiceBaseUrl,
  normalizeBrokerServerUrl,
} from './brokerRouting';
import { extractFeedBrokerToken } from './feedAuth';

const TOKEN_REFRESH_SKEW_MS = 60_000;
const AUTH_REFRESH_TIMEOUT_MS = 2500;
const AUTH_REFRESH_FAILURES_BEFORE_LOGOUT = 2;
const AUTH_REFRESH_FAILURE_WINDOW_MS = 30_000;
const DEFAULT_BROKER_WS_URL = 'wss://backend.orrnn.com/ws/v2';
const AUTH_SESSION_EXPIRED_MESSAGE = 'Refresh token invalid or expired.';
const AUTH_SESSION_UNAVAILABLE_MESSAGE = 'No authenticated broker session available.';
const BROKER_BACKEND_DOMAIN_UNAVAILABLE_CODE = 'BROKER_BACKEND_DOMAIN_UNAVAILABLE';

export type BrokerApiRequestInit = RequestInit & {
  _retry?: boolean;
  skipAuth?: boolean;
  skipRefresh?: boolean;
};

type BrokerSession = {
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

type NormalizedAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  brokerId?: string;
  feedToken?: string;
};

const isAuthFailureStatus = (status: number) =>
  status === 400 || status === 401 || status === 403;

const isAuthSessionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes(AUTH_SESSION_EXPIRED_MESSAGE) ||
    message.includes(AUTH_SESSION_UNAVAILABLE_MESSAGE) ||
    message.includes('No refresh token available')
  );
};

const createUnauthenticatedResponse = (message = AUTH_SESSION_UNAVAILABLE_MESSAGE) =>
  new Response(JSON.stringify({ code: 'UNAUTHORIZED', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

const createBrokerDomainUnavailableResponse = (message: string) =>
  new Response(JSON.stringify({
    code: BROKER_BACKEND_DOMAIN_UNAVAILABLE_CODE,
    message,
    error: message,
  }), {
    status: 400,
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

const normalizeAuthResponse = (
  payload: Record<string, unknown>,
  fallbackRefreshToken: string,
): NormalizedAuthResponse => {
  const accessToken = String(payload.access_token ?? payload.token ?? '');
  const refreshToken = String(payload.refresh_token ?? payload.refreshToken ?? fallbackRefreshToken ?? '');
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

  return {
    accessToken,
    refreshToken,
    expiresAt,
    brokerId: typeof payload.broker_id === 'string'
      ? payload.broker_id
      : typeof payload.brokerId === 'string'
        ? payload.brokerId
        : undefined,
    feedToken,
  };
};

export class BrokerAPI {
  private static instance: BrokerAPI | null = null;
  private refreshPromise: Promise<string> | null = null;
  private sessionInvalidated = false;
  private consecutiveRefreshAuthFailures = 0;
  private lastRefreshAuthFailureKey = '';
  private lastRefreshAuthFailureAt = 0;

  static getInstance(): BrokerAPI {
    if (!BrokerAPI.instance) {
      BrokerAPI.instance = new BrokerAPI();
    }
    return BrokerAPI.instance;
  }

  async request(endpoint: string, options: BrokerApiRequestInit = {}): Promise<Response> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});
    const session = await this.getSession();
    const shouldAuthenticate = !options.skipAuth;
    const shouldRequireBrokerBackend = Boolean(
      useUserPreferences.getState().isLoggedIn ||
        session.accessToken ||
        session.refreshToken,
    );

    if (shouldRequireBrokerBackend && !isBrokerServiceBaseUrl(session.serverUrl)) {
      return createBrokerDomainUnavailableResponse(
        getBrokerBackendDomainUnavailableMessage(session.brokerId),
      );
    }

    if (shouldAuthenticate && (!session.accessToken || this.sessionInvalidated)) {
      return createUnauthenticatedResponse();
    }

    let activeToken = session.accessToken;
    if (shouldAuthenticate && !options.skipRefresh) {
      try {
        activeToken = await this.getValidAccessTokenForSession(session, false);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    }

    if (shouldAuthenticate) {
      if (!activeToken) {
        return createUnauthenticatedResponse();
      }
      headers.set('Authorization', `Bearer ${activeToken}`);
    }
    if (!headers.has('accept')) {
      headers.set('accept', 'application/json');
    }
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const url = this.buildRequestUrl(endpoint, session.serverUrl, method);
    const requestConfig: RequestInit = { ...options, headers };

    let response = await timedFetch(url, requestConfig, {
      label: `apiClient.${method}`,
      method,
      endpoint,
      source: 'apiClient',
    });

    if (response.status === 401 && shouldAuthenticate && !options._retry) {
      let refreshedToken = '';
      try {
        refreshedToken = await this.getValidAccessTokenForSession(session, true);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
      if (!refreshedToken || refreshedToken === activeToken) {
        return response;
      }

      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);

      response = await timedFetch(url, {
        ...requestConfig,
        headers: retryHeaders,
      }, {
        label: `apiClient.retryAfterRefresh.${method}`,
        method,
        endpoint,
        source: 'apiClient',
      });
    }

    return response;
  }

  async getJson<T>(endpoint: string, options: BrokerApiRequestInit = {}): Promise<T> {
    const response = await this.request(endpoint, options);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw { response: { status: response.status, data: body } };
    }
    return response.json() as Promise<T>;
  }

  private async getValidAccessTokenForSession(
    session: BrokerSession,
    forceRefresh = false,
  ): Promise<string> {
    if (!session.accessToken) {
      return '';
    }

    const expiresAtMs = parseExpiresAtMs(session.expiresAt);
    const shouldRefresh =
      forceRefresh ||
      (Boolean(session.refreshToken) && expiresAtMs > 0 && expiresAtMs - Date.now() < TOKEN_REFRESH_SKEW_MS);

    if (!shouldRefresh) {
      return session.accessToken;
    }

    return this.refreshToken(session);
  }

  async getValidAccessToken(forceRefresh = false): Promise<string> {
    return this.getValidAccessTokenForSession(await this.getSession(), forceRefresh);
  }

  async getWebSocketUrl(): Promise<string> {
    const session = await this.getSession();
    this.assertBrokerServiceBaseUrl(session);
    const token = await this.getValidAccessTokenForSession(session, false);
    if (!token) {
      throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    }
    const baseUrl = buildBrokerWsUrl(session.serverUrl, '/ws/v2', DEFAULT_BROKER_WS_URL);
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }

  async persistSelectedBroker(input: {
    brokerId: string;
    serverUrl: string;
    logoUrl?: string | null;
  }): Promise<void> {
    await persistSelectedBrokerSession(input);
    useUserPreferences.getState().setBrokerConnection(input.brokerId, input.serverUrl, input.logoUrl ?? '');
  }

  private async refreshToken(session: BrokerSession): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh(session).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async performRefresh(session: BrokerSession): Promise<string> {
    if (!session.refreshToken) {
      throw new Error('No refresh token available.');
    }
    this.assertBrokerServiceBaseUrl(session);

    const apiBaseUrl = buildBrokerApiBaseUrl(session.serverUrl);
    const response = await timedFetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: JSON.stringify({
        refresh_token: session.refreshToken,
        ...(session.brokerId ? { broker_id: session.brokerId } : {}),
      }),
    }, {
      label: 'apiClient.refresh',
      method: 'POST',
      endpoint: '/auth/refresh',
      source: 'auth',
      timeoutMs: AUTH_REFRESH_TIMEOUT_MS,
    });

    if (!response.ok) {
      if (isAuthFailureStatus(response.status)) {
        this.recordRefreshAuthFailure(session);
        if (this.consecutiveRefreshAuthFailures >= AUTH_REFRESH_FAILURES_BEFORE_LOGOUT) {
          await this.invalidateAuthSession();
        }
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      throw new Error(`Token refresh failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const normalized = normalizeAuthResponse(payload, session.refreshToken);
    const brokerId = normalized.brokerId || session.brokerId;

    useUserPreferences.getState().updateTokens(
      normalized.accessToken,
      normalized.refreshToken,
      normalized.expiresAt,
    );
    if (brokerId) {
      useUserPreferences.getState().setBrokerConnection(
        brokerId,
        session.serverUrl,
        session.logoUrl,
      );
    }

    await Promise.all([
      persistSelectedBrokerSession({
        brokerId,
        serverUrl: session.serverUrl,
        logoUrl: session.logoUrl,
      }),
      persistAuthSessionTokens({
        accessToken: normalized.accessToken,
        refreshToken: normalized.refreshToken,
        expiresAt: normalized.expiresAt,
        feedToken: normalized.feedToken,
      }),
    ]);

    this.sessionInvalidated = false;
    this.resetRefreshAuthFailures();
    return normalized.accessToken;
  }

  private recordRefreshAuthFailure(session: BrokerSession): void {
    const now = Date.now();
    const failureKey = `${session.brokerId}:${session.refreshToken}`;
    const sameRecentFailure =
      this.lastRefreshAuthFailureKey === failureKey &&
      now - this.lastRefreshAuthFailureAt <= AUTH_REFRESH_FAILURE_WINDOW_MS;
    this.consecutiveRefreshAuthFailures = sameRecentFailure
      ? this.consecutiveRefreshAuthFailures + 1
      : 1;
    this.lastRefreshAuthFailureKey = failureKey;
    this.lastRefreshAuthFailureAt = now;
  }

  private resetRefreshAuthFailures(): void {
    this.consecutiveRefreshAuthFailures = 0;
    this.lastRefreshAuthFailureKey = '';
    this.lastRefreshAuthFailureAt = 0;
  }

  private async invalidateAuthSession(): Promise<void> {
    this.sessionInvalidated = true;
    this.resetRefreshAuthFailures();
    useUserPreferences.getState().logout();
    try {
      await clearAuthSessionTokens();
    } catch (error) {
      console.warn('[BrokerAPI] Failed to clear expired auth tokens', error);
    }
  }

  private buildRequestUrl(endpoint: string, serverUrl: string, method: string): string {
    const apiBaseUrl = buildBrokerApiBaseUrl(serverUrl);
    let url = buildApiUrl(endpoint, apiBaseUrl);
    if (method === 'GET' && !/^https?:\/\//i.test(endpoint)) {
      url += url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
    }
    return url;
  }

  private assertBrokerServiceBaseUrl(session: BrokerSession): void {
    if (!isBrokerServiceBaseUrl(session.serverUrl)) {
      throw new Error(getBrokerBackendDomainUnavailableMessage(session.brokerId));
    }
  }

  private async getSession(): Promise<BrokerSession> {
    const state = useUserPreferences.getState();
    const credentials = state.accountDetails?.credentials;
    const liveServerUrl = normalizeBrokerServerUrl(state.brokerServerUrl || '');
    const liveAccessToken = credentials?.accessToken || '';

    if (state.isLoggedIn && state.brokerId && liveServerUrl && liveAccessToken) {
      this.sessionInvalidated = false;
      return {
        brokerId: state.brokerId,
        serverUrl: liveServerUrl,
        logoUrl: state.brokerLogoUrl || '',
        accessToken: liveAccessToken,
        refreshToken: credentials?.refreshToken || '',
        expiresAt: credentials?.expiresAt || '',
      };
    }

    const shouldLoadStoredAuth =
      state.isLoggedIn || Boolean(credentials?.accessToken || credentials?.refreshToken);

    const [
      storedBrokerId,
      storedServerUrl,
      storedLogoUrl,
      storedAccessToken,
      storedRefreshToken,
      storedExpiresAt,
    ] = await Promise.all([
      getSecureItemAsync(ACTIVE_BROKER_ID_KEY),
      getSecureItemAsync(ACTIVE_BROKER_SERVER_URL_KEY),
      getSecureItemAsync(ACTIVE_BROKER_LOGO_URL_KEY),
      shouldLoadStoredAuth ? getSecureItemAsync(ACCESS_TOKEN_KEY) : Promise.resolve(null),
      shouldLoadStoredAuth ? getSecureItemAsync(REFRESH_TOKEN_KEY) : Promise.resolve(null),
      shouldLoadStoredAuth ? getSecureItemAsync(EXPIRES_AT_KEY) : Promise.resolve(null),
    ]);

    const accessToken = credentials?.accessToken || storedAccessToken || '';
    const refreshToken = credentials?.refreshToken || storedRefreshToken || '';
    if (state.isLoggedIn && accessToken && refreshToken) {
      this.sessionInvalidated = false;
    }

    return {
      brokerId: state.brokerId || storedBrokerId || '',
      serverUrl: normalizeBrokerServerUrl(state.brokerServerUrl || storedServerUrl || ''),
      logoUrl: state.brokerLogoUrl || storedLogoUrl || '',
      accessToken,
      refreshToken,
      expiresAt: credentials?.expiresAt || storedExpiresAt || '',
    };
  }
}

export const brokerApi = BrokerAPI.getInstance();
