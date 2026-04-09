/**
 * Core HTTP Interceptor & API Client
 * 
 * Centralized fetch wrapper responsible for communicating with the V2 REST Backend.
 * It automatically injects the `Authorization: Bearer` JWT into all outbound requests.
 * Most importantly, it manages a robust cyclic Token Refresh Queue: if a request fails 
 * with a 401 Unauthorized, it pauses all inflight requests, silent-renews the tokens 
 * in the background using the refresh token, and replays the failed initial requests 
 * without logging the user out or dropping data.
 */

import { useUserPreferences } from '../state/userPreferences';

// V2 API base URL — resolved from environment variable, falls back to direct IP
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://69.197.178.27/api/v2';

/**
 * Decode the broker_id claim out of a JWT access token without any external
 * dependency. The V2 backend embeds the broker context directly into the
 * token's payload (e.g. `{ sub, broker_id, exp, ... }`), so we can always
 * recover the active broker from the token even if the Zustand state lost
 * its persisted `brokerId` (which happens after a logout, a fresh app
 * install, or any code path that called `state.logout()` such as a token
 * refresh failure).
 *
 * Returns null if the token is missing, malformed, or doesn't carry a
 * broker claim. Never throws.
 */
export const decodeBrokerIdFromToken = (token: string | undefined | null): string | null => {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // JS atob is available in RN's JSCore + Hermes since RN 0.71+
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : // Node fallback for unit tests
          Buffer.from(padded, 'base64').toString('utf-8');
    const claims = JSON.parse(decoded);
    return (
      claims.broker_id ||
      claims.brokerId ||
      claims.broker ||
      claims['broker-id'] ||
      null
    );
  } catch (_e) {
    return null;
  }
};

/**
 * Resolve the active broker ID from any available source:
 *   1. JWT claim (canonical — set by the backend, can't drift)
 *   2. Persisted Zustand state (set at login time)
 *   3. null (caller decides what to do)
 * The order is intentional: the JWT is always more reliable than the
 * persisted state because the persisted state can be cleared by logout.
 */
export const resolveBrokerId = (): string | null => {
  const state = useUserPreferences.getState();
  const token = state.accountDetails?.credentials?.accessToken;
  const resolved = decodeBrokerIdFromToken(token) || state.brokerId || null;
  if (!resolved && state.isLoggedIn) {
    console.warn('[RTX5] resolveBrokerId returned null while logged in — trades will fail with 403. Token broker_id:', decodeBrokerIdFromToken(token), 'State brokerId:', state.brokerId);
  }
  return resolved;
};

// Queue for pending requests while refreshing token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Custom fetch wrapper that automatically handles Bearer token injection
 * and 401 token refresh loops.
 *
 * Token lifecycle (cyclic — no forced logout):
 *   access_token  → expires after 24 hours
 *   refresh_token → each refresh call returns a NEW refresh_token,
 *                    so the token pair renews itself perpetually.
 */
interface ApiClientRequestInit extends RequestInit {
  _retry?: boolean;
}

export const apiClient = async (endpoint: string, options: ApiClientRequestInit = {}): Promise<Response> => {
  const state = useUserPreferences.getState();
  const token = state.accountDetails?.credentials?.accessToken;
  // Resolve broker context from JWT first (always canonical), persisted
  // state second (can be empty if logged in before persistBrokerId existed).
  const brokerId = resolveBrokerId();

  // Clone headers
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-API-Key', token);
  }

  // ── BROKER CONTEXT HEADER ─────────────────────────────────────────────
  // The V2 backend is multi-tenant: every trading request must declare which
  // broker it belongs to so the server can route the order to the right
  // MT5 manager. Without this header the server returns:
  //   403 "Trading is disabled. No broker context found."
  //
  // The brokerId is persisted at login time (loginAPI body field) and lives
  // in Zustand state, so we forward it on every authenticated request.
  // Sent as both X-Broker-Id and X-Broker-ID for case-insensitive servers.
  if (brokerId) {
    headers.set('X-Broker-Id', brokerId);
    headers.set('X-Broker-ID', brokerId);
  }

  // Set default content type only for requests with a body (POST, PUT, PATCH)
  // GET requests MUST NOT have Content-Type — nginx/servers may reject them
  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Always set Accept header
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  let url = `${API_BASE_URL}${endpoint}`;
  
  // React Native fetch aggressively caches GET requests. To guarantee live data updates,
  // we universally append a cache-busting timestamp to all GET operations.
  if (!config.method || config.method.toUpperCase() === 'GET') {
    url += url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  }

  let response = await fetch(url, config);

  // If unauthorized, attempt to refresh
  if (response.status === 401 && !options._retry) {
    if (isRefreshing) {
      // Pause this request if another refresh is already in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          // Retry original request with new token
          headers.set('Authorization', `Bearer ${newToken}`);
          headers.set('X-API-Key', String(newToken));
          return fetch(url, { ...config, headers, _retry: true } as ApiClientRequestInit);
        })
        .catch((err) => Promise.reject(err));
    }

    const originalRequest = { ...config, _retry: true } as ApiClientRequestInit;
    isRefreshing = true;

    try {
      const refreshToken = state.accountDetails?.credentials?.refreshToken;
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      // Call V2 refresh endpoint directly using pure fetch
      // The API requires the old access token in the Authorization header
      // alongside the refresh_token in the body.
      const rs = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      if (!rs.ok) {
        throw new Error('Refresh token invalid or expired');
      }

      const refreshData = await rs.json();
      
      // Compute expiresAt from expires_in (seconds)
      const expiresAt = new Date(Date.now() + (refreshData.expires_in ?? 86400) * 1000).toISOString();

      // Update tokens in Zustand state — cyclic: new refresh_token replaces old
      state.updateTokens(refreshData.access_token, refreshData.refresh_token, expiresAt);

      // ── CRITICAL: Persist broker_id from the refresh response ────────
      // The V2 backend returns broker_id in the refresh response body, but
      // the refreshed JWT does NOT contain the broker_id claim (unlike the
      // login JWT which does). Without this, resolveBrokerId() would return
      // null after the first token refresh, causing 403 on all trades.
      if (refreshData.broker_id && !state.brokerId) {
        state.setBrokerId(refreshData.broker_id);
      }

      // Retry original request with fresh access token
      const retryHeaders = new Headers(originalRequest.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshData.access_token}`);
      retryHeaders.set('X-API-Key', refreshData.access_token);
      originalRequest.headers = retryHeaders;
      
      processQueue(null, refreshData.access_token);
      response = await fetch(url, originalRequest);
    } catch (_error) {
      processQueue(_error, null);
      // Only logout if refresh actually fails (should be rare in cyclic flow)
      state.logout();
      return Promise.reject(_error);
    } finally {
      isRefreshing = false;
    }
  }

  return response;
};
