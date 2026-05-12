/**
 * Live Market Account Summary DTOs & Service (V2)
 * 
 * Provides polling/fetch endpoints for core equity and margin metrics.
 * Note: High-frequency equivalents of this data are streamed via `accountSocket.ts`.
 */

import { apiClient } from './apiClient';
import { buildAccountDetailPath } from './accountsRoutes';

/** Raw API response from GET /api/account/summary */
export interface AccountSummaryApiResponse {
  id: string;
  balance: number | string;
  credit?: number | string;
  equity: number | string;
  margin?: number | string;
  margin_used?: number | string;
  used_margin?: number | string;
  margin_available?: number | string;
  margin_free?: number | string;
  free_margin?: number | string;
  margin_level?: number | string;
  unrealized_pl?: number | string;
  floating?: number | string;
  floating_pnl?: number | string;
  realized_pl?: number | string;
  open_positions?: number | string;
  pending_orders?: number | string;
  currency: string;
  leverage: number | string;
}

/** Normalized account summary for UI consumption */
export interface AccountSummary {
  balance: number;
  credit: number;
  profit: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  openPositions: number;
  pendingOrders: number;
}

/**
 * Maps the raw API response (snake_case) to the UI-friendly interface (camelCase).
 */
function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function mapApiResponse(raw: AccountSummaryApiResponse): AccountSummary {
  const balance = toFiniteNumber(raw.balance);
  const equity = toFiniteNumber(raw.equity);
  const margin = toFiniteNumber(raw.margin_used ?? raw.used_margin ?? raw.margin);
  const marginLevel = raw.margin_level !== undefined
    ? toFiniteNumber(raw.margin_level)
    : margin > 0
    ? (equity / margin) * 100
    : 0;

  return {
    balance,
    credit: toFiniteNumber(raw.credit),
    profit: toFiniteNumber(raw.unrealized_pl ?? raw.floating_pnl ?? raw.floating),
    equity,
    margin,
    freeMargin: toFiniteNumber(raw.margin_available ?? raw.free_margin ?? raw.margin_free),
    marginLevel,
    leverage: toFiniteNumber(raw.leverage),
    currency: raw.currency || 'USD',
    openPositions: Math.trunc(toFiniteNumber(raw.open_positions)),
    pendingOrders: Math.trunc(toFiniteNumber(raw.pending_orders)),
  };
}

/**
 * Fetches the live account summary.
 * Uses JWT auth (no login param needed).
 *
 * GET /api/v2/account/{login}
 */
export async function getAccountSummary(login?: string): Promise<AccountSummary> {
  const parsedLogin = Number(login);
  if (!Number.isFinite(parsedLogin) || parsedLogin <= 0) {
    throw new Error('Login ID is required to fetch account summary');
  }

  const response = await apiClient(buildAccountDetailPath(Math.trunc(parsedLogin)));

  if (!response.ok) {
    let errorMsg = 'Failed to fetch account summary';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  const raw: AccountSummaryApiResponse = await response.json();
  return mapApiResponse(raw);
}
