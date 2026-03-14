import { apiClient } from './apiClient';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user: {
    id: string;
    username: string;
    email?: string;
    role: string;
  };
}

/**
 * Authenticate with the backend and retrieve JWT tokens
 */
export const loginAPI = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await fetch('https://rtxbackend.tradecopier.org/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || 'Login failed');
  }

  return response.json();
};

/**
 * Logout the user. Uses apiClient to automatically inject bearer token.
 */
export const logoutAPI = async (): Promise<void> => {
  try {
    await apiClient('/api/logout', {
      method: 'POST',
    });
  } catch (err) {
    // We typically eat this error because local logout must succeed regardless
    console.error('Logout API error:', err);
  }
};
