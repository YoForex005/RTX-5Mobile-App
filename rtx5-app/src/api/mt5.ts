import { apiClient } from './apiClient';

/** Response from GET /api/mt5/status */
export interface MT5StatusResponse {
  connected: boolean;
  address: string;
  login: number;
  last_error: string;
}

/**
 * Checks if the C++ backend is connected to the MT5 broker server.
 *
 * GET /api/mt5/status
 */
export async function getMt5Status(): Promise<MT5StatusResponse> {
  const response = await apiClient('/api/mt5/status');

  if (!response.ok) {
    let errorMsg = `MT5 Status error: HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}

/** MT5 Group structure from broker */
export interface MT5Group {
  name: string;
  currency: string;
}

/** Response from GET /api/mt5/groups */
export interface MT5GroupsResponse {
  count: number;
  groups: MT5Group[];
}

/**
 * Fetches list of all available account groups from the broker (demo, live, etc.).
 * Used for account registration/creation.
 *
 * GET /api/mt5/groups
 */
export async function getMt5Groups(): Promise<MT5GroupsResponse> {
  const response = await apiClient('/api/mt5/groups');

  if (!response.ok) {
    let errorMsg = `MT5 Groups error: HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}
