/**
 * Live Market Account Summary DTOs & Service (V2)
 * 
 * Provides polling/fetch endpoints for core equity and margin metrics.
 * Note: High-frequency equivalents of this data are streamed via `accountSocket.ts`.
 */

import { apiClient } from './apiClient';
import { buildAccountDetailPath } from './accountsRoutes';

type NumericAccountField = number | string | null | undefined;

/** Raw API response from GET /api/account/summary */
export interface AccountSummaryApiResponse {
  id: string;
  balance: NumericAccountField;
  credit?: NumericAccountField;
  equity: NumericAccountField;
  margin?: NumericAccountField;
  margin_used?: NumericAccountField;
  used_margin?: NumericAccountField;
  marginUsed?: NumericAccountField;
  usedMargin?: NumericAccountField;
  margin_available?: NumericAccountField;
  marginAvailable?: NumericAccountField;
  margin_free?: NumericAccountField;
  free_margin?: NumericAccountField;
  freeMargin?: NumericAccountField;
  margin_level?: NumericAccountField;
  marginLevel?: NumericAccountField;
  unrealized_pl?: NumericAccountField;
  floating?: NumericAccountField;
  floating_pnl?: NumericAccountField;
  realized_pl?: NumericAccountField;
  open_positions?: NumericAccountField;
  pending_orders?: NumericAccountField;
  currency: string | null;
  account_currency?: string | null;
  accountCurrency?: string | null;
  leverage: NumericAccountField;
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
function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return parseFiniteNumber(value) ?? fallback;
}

export function mapAccountSummaryApiResponse(raw: AccountSummaryApiResponse): AccountSummary {
  const balance = toFiniteNumber(raw.balance);
  const credit = toFiniteNumber(raw.credit);
  const profit = pickFiniteNumber(raw.unrealized_pl, raw.floating_pnl, raw.floating) ?? 0;
  // If the broker omits derived metrics, rebuild the standard account math:
  // equity = balance + credit + floating, free margin = equity - used margin.
  const equity = pickFiniteNumber(raw.equity) ?? balance + credit + profit;
  const margin = pickFiniteNumber(
    raw.margin_used,
    raw.used_margin,
    raw.marginUsed,
    raw.usedMargin,
    raw.margin,
  ) ?? 0;
  const freeMargin = pickFiniteNumber(
    raw.free_margin,
    raw.margin_free,
    raw.freeMargin,
    raw.margin_available,
    raw.marginAvailable,
  ) ?? equity - margin;
  const marginLevel = pickFiniteNumber(raw.margin_level, raw.marginLevel) ?? (margin > 0
    ? (equity / margin) * 100
    : 0);

  return {
    balance,
    credit,
    profit,
    equity,
    margin,
    freeMargin,
    marginLevel,
    leverage: toFiniteNumber(raw.leverage),
    currency: raw.currency || raw.account_currency || raw.accountCurrency || 'USD',
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
  return mapAccountSummaryApiResponse(raw);
}
