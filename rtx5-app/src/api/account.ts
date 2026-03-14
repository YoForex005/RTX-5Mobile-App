import { apiClient } from './apiClient';

/** Raw API response from GET /api/account/summary */
export interface AccountSummaryApiResponse {
  id: string;
  balance: number;
  equity: number;
  margin_used: number;
  margin_available: number;
  unrealized_pl: number;
  realized_pl: number;
  open_positions: number;
  pending_orders: number;
  currency: string;
  leverage: number;
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
function mapApiResponse(raw: AccountSummaryApiResponse): AccountSummary {
  const marginLevel = raw.margin_used > 0
    ? (raw.equity / raw.margin_used) * 100
    : 0;

  return {
    balance: raw.balance,
    credit: 0, // Not provided by the new API
    profit: raw.unrealized_pl,
    equity: raw.equity,
    margin: raw.margin_used,
    freeMargin: raw.margin_available,
    marginLevel,
    leverage: raw.leverage,
    currency: raw.currency || 'USD',
    openPositions: raw.open_positions,
    pendingOrders: raw.pending_orders,
  };
}

/**
 * Fetches the live account summary.
 * Uses JWT auth (no login param needed).
 *
 * GET /api/account/summary
 */
export async function getAccountSummary(_login?: string): Promise<AccountSummary> {
  const response = await apiClient('/api/account/summary');

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
