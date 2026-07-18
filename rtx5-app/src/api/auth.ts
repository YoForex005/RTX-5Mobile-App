import { apiClient, API_BASE_URL } from './apiClient';
import {
  buildBrokerApiBaseUrl,
  getBrokerBackendDomainUnavailableMessage,
  isBrokerServiceBaseUrl,
} from './brokerRouting';
import { timedFetch } from '../utils/apiLatency';
import {
  fingerprintMarketDataHost,
  recordMarketDataEvent,
} from '../market/marketDataTelemetry';

const AUTH_LOGIN_TIMEOUT_MS = 8000;

const isAbortError = (error: unknown) =>
  error instanceof Error && (
    error.name === 'AbortError' ||
    error.message.toLowerCase().includes('aborted')
  );

const extractBackendErrorMessage = (payload: any, fallback: string): string => {
  const candidates = [
    payload?.message,
    payload?.detail,
    payload?.error?.message,
    payload?.error?.detail,
    payload?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
};

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Auth API — https://backend.orrnn.com/api/v2/auth
//
// Endpoints integrated:
//   POST   /auth/login           — Authenticate and receive JWT tokens
//   POST   /auth/register        — Create a new trading account
//   POST   /auth/refresh         — Exchange refresh token for new token pair (handled in apiClient.ts)
//   POST   /auth/change-password — Change current user's password (requires Bearer)
//
// Token lifecycle (cyclic — no forced logout):
//   access_token expires after 24 hours.
//   refresh_token → POST /auth/refresh → returns NEW access_token + NEW refresh_token.
//   The cycle repeats perpetually, so the refresh token never truly expires.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Request Types ──────────────────────────────────────────────────────────────

/** POST /auth/login — request body */
export interface LoginRequest {
  username: string;
  password: string;
  broker_id: string;
}

export type LoginRequestOptions = {
  serverUrl?: string;
  signal?: AbortSignal;
};

export class LoginRequestAbortedError extends Error {
  public readonly code = 'LOGIN_REQUEST_ABORTED';

  constructor() {
    super('Login request was cancelled.');
    this.name = 'LoginRequestAbortedError';
  }
}

export const isLoginRequestAbortedError = (
  error: unknown,
): error is LoginRequestAbortedError =>
  error instanceof LoginRequestAbortedError ||
  (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'LOGIN_REQUEST_ABORTED'
  );

/** POST /auth/register — request body */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  broker_id: string;
  group: string;
  leverage: number;
  currency: string;
}

/** POST /auth/change-password — request body */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}


// ─── Response Types ─────────────────────────────────────────────────────────────

/**
 * Shared auth response for login, register, and refresh endpoints.
 * Contains JWT token pair and account metadata.
 */
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;   // "Bearer"
  expires_in: number;   // seconds (e.g. 86400 = 24h)
  account_login: number; // account login number returned by V2
  username: string;
  name?: string;
  account_name?: string;
  accountName?: string;
  server?: string;      // Note: backend may not always return server directly in V2
  broker_id?: string;
  group?: string;
  account_group?: string;
  account_type?: string;
  accountType?: string;
  is_demo?: boolean;
  isDemo?: boolean;
  is_contest?: boolean;
  isContest?: boolean;
  expires_at?: number;
  role?: string;
  user_id?: number;
}


// ─── API Functions ──────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 *
 * Authenticate with login credentials and receive JWT tokens.
 * Does NOT require existing Bearer token — this is the entry point.
 *
 * @param credentials - { username, password, broker_id }
 * @returns AuthResponse with access_token, refresh_token, expires_in, account_login
 * @throws Error with server message on 401 (invalid credentials) or other failures
 */
export const loginAPI = async (
  credentials: LoginRequest,
  options: LoginRequestOptions = {},
): Promise<AuthResponse> => {
  const controller = new AbortController();
  let didCallerAbort = Boolean(options.signal?.aborted);
  const abortFromCaller = () => {
    didCallerAbort = true;
    controller.abort();
  };
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    controller.abort();
  }, AUTH_LOGIN_TIMEOUT_MS);

  let response: Response;
  let apiHostFingerprint = 'unresolved';
  try {
    if (!isBrokerServiceBaseUrl(options.serverUrl)) {
      throw new Error(getBrokerBackendDomainUnavailableMessage(credentials.broker_id));
    }
    const apiBaseUrl = buildBrokerApiBaseUrl(options.serverUrl);
    apiHostFingerprint = fingerprintMarketDataHost(apiBaseUrl);

    response = await timedFetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(credentials),
      signal: controller.signal,
    }, {
      label: 'auth.login',
      method: 'POST',
      endpoint: '/auth/login',
      source: 'auth',
    });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      if (didCallerAbort) {
        recordMarketDataEvent('auth_outcome', {
          operation: 'login', outcome: 'cancelled', brokerId: credentials.broker_id,
          apiHostFingerprint,
        });
        throw new LoginRequestAbortedError();
      }
      recordMarketDataEvent('auth_outcome', {
        operation: 'login', outcome: 'timeout', brokerId: credentials.broker_id,
        apiHostFingerprint,
      });
      throw new Error('Login request timed out. Please check your connection and try again.');
    }
    recordMarketDataEvent('auth_outcome', {
      operation: 'login', outcome: 'request_failed', brokerId: credentials.broker_id,
      apiHostFingerprint,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(extractBackendErrorMessage(errorBody, 'Login failed')) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    recordMarketDataEvent('auth_outcome', {
      operation: 'login', outcome: 'rejected', brokerId: credentials.broker_id,
      apiHostFingerprint, status: response.status,
    });
    throw error;
  }

  const payload = await response.json() as AuthResponse;
  recordMarketDataEvent('auth_outcome', {
    operation: 'login', outcome: 'accepted', brokerId: credentials.broker_id,
    apiHostFingerprint, status: response.status,
  });
  return payload;
};

/**
 * POST /auth/register
 *
 * Create a new trading account. Returns JWT tokens on success.
 * Does NOT require existing Bearer token.
 *
 * @param data - { email, password, name, broker_id, group, leverage, currency }
 * @returns AuthResponse (same shape as login)
 * @throws Error on 400 (validation) or 409 (email already registered)
 */
export const registerAPI = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await timedFetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(data),
  }, {
    label: 'auth.register',
    method: 'POST',
    endpoint: '/auth/register',
    source: 'register',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    recordMarketDataEvent('auth_outcome', {
      operation: 'register', outcome: 'rejected', brokerId: data.broker_id,
      apiHostFingerprint: fingerprintMarketDataHost(API_BASE_URL), status: response.status,
    });
    throw new Error(extractBackendErrorMessage(errorBody, 'Registration failed'));
  }

  const payload = await response.json() as AuthResponse;
  recordMarketDataEvent('auth_outcome', {
    operation: 'register', outcome: 'accepted', brokerId: data.broker_id,
    apiHostFingerprint: fingerprintMarketDataHost(API_BASE_URL), status: response.status,
  });
  return payload;
};

/**
 * POST /auth/change-password
 *
 * Change the current user's password. Requires Bearer authentication.
 * Uses apiClient which automatically injects Bearer token and handles 401 refresh.
 *
 * @param data - { current_password, new_password }
 * @returns { message: "Operation completed successfully." }
 * @throws Error on 400 (validation) or 401 (invalid current password)
 */
export const changePasswordAPI = async (data: ChangePasswordRequest): Promise<{ message: string }> => {
  const response = await apiClient('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(extractBackendErrorMessage(errorBody, 'Password change failed'));
  }

  return response.json();
};

