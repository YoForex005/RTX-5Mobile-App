import { apiClient, API_BASE_URL } from './apiClient';

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Auth API — http://69.197.178.27/api/v2/auth
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
  server?: string;      // Note: backend may not always return server directly in V2
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
export const loginAPI = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || errorBody.error || 'Login failed');
  }

  return response.json();
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
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || errorBody.error || 'Registration failed');
  }

  return response.json();
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
    throw new Error(errorBody.message || errorBody.error?.message || 'Password change failed');
  }

  return response.json();
};

