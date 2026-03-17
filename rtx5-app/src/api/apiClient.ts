import { useUserPreferences } from '../state/userPreferences';

// V2 API base URL
export const API_BASE_URL = 'http://69.197.178.27/api/v2';

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

  // Clone headers
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Set default content type if not provided
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    headers.set('accept', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const url = `${API_BASE_URL}${endpoint}`;
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
      const rs = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
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

      // Retry original request with fresh access token
      const retryHeaders = new Headers(originalRequest.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshData.access_token}`);
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
