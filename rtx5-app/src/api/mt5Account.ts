/**
 * MT5 Account Creation API (V2)
 * 
 * Bypasses JWT auth to provision a brand-new MT5 trading account locally
 * on the broker server, returning the Master and Investor passwords.
 */

import { apiClient, API_BASE_URL } from './apiClient';

/** Request body for POST /api/mt5/account/create */
export interface CreateMT5AccountRequest {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  group: string;       // e.g. 'demo\\STD'
  leverage: number;    // e.g. 100
}

/** Successful account creation response */
export interface MT5AccountCreated {
  login: number;
  master_password: string;
  investor_password: string;
  group: string;
  server: string;
  created_at: string;
}

export interface CreateMT5AccountResponse {
  success: boolean;
  message: string;
  account: MT5AccountCreated;
}

/**
 * Creates a new MT5 trading account.
 * No token required — this is the registration endpoint.
 *
 * POST /api/mt5/account/create
 *
 * Returns login ID, master password (trading), and investor password (read-only).
 */
export async function createMT5Account(
  payload: CreateMT5AccountRequest,
): Promise<CreateMT5AccountResponse> {
  // Use raw fetch (no auth token needed for registration)
  const response = await fetch(`${API_BASE_URL}/api/mt5/account/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to create account';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(errorMsg);
  }

  return response.json();
}
