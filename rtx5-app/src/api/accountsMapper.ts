type NumericAccountField = number | string | null | undefined;

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

/**
 * Single trading account as returned by the API (snake_case).
 * Used by both GET /accounts (list) and GET /accounts/{login} (detail).
 */
export interface TradingAccountRaw {
  login: NumericAccountField;
  name?: string | null;
  group?: string | null;
  currency?: string | null;
  leverage: NumericAccountField;
  balance: NumericAccountField;
  credit: NumericAccountField;
  equity: NumericAccountField;
  margin?: NumericAccountField;
  used_margin?: NumericAccountField;
  margin_free?: NumericAccountField;
  free_margin?: NumericAccountField;
  margin_level: NumericAccountField;
  floating?: NumericAccountField;
  floating_pnl?: NumericAccountField;
  total_swap?: NumericAccountField;
  open_positions?: NumericAccountField;
  status?: string | null;
  created_at?: NumericAccountField;
  updated_at?: NumericAccountField;
}

/**
 * Normalized trading account for UI consumption (camelCase).
 */
export interface TradingAccount {
  login: number;
  name: string;
  group: string;
  currency: string;
  leverage: number;
  balance: number;
  credit: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnl: number;
  totalSwap: number;
  openPositions: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Maps a single raw API account (snake_case) to the UI-friendly shape (camelCase).
 */
export function mapRawAccount(raw: TradingAccountRaw): TradingAccount {
  const login = Math.trunc(toFiniteNumber(raw.login));

  return {
    login,
    name: raw.name || `Account ${login}`,
    group: raw.group || 'standard',
    currency: raw.currency || 'USD',
    leverage: toFiniteNumber(raw.leverage),
    balance: toFiniteNumber(raw.balance),
    credit: toFiniteNumber(raw.credit),
    equity: toFiniteNumber(raw.equity),
    usedMargin: toFiniteNumber(raw.used_margin ?? raw.margin),
    freeMargin: toFiniteNumber(raw.free_margin ?? raw.margin_free),
    marginLevel: toFiniteNumber(raw.margin_level),
    floatingPnl: toFiniteNumber(raw.floating_pnl ?? raw.floating),
    totalSwap: toFiniteNumber(raw.total_swap),
    openPositions: Math.trunc(toFiniteNumber(raw.open_positions)),
    status: raw.status || 'active',
    createdAt: toFiniteNumber(raw.created_at),
    updatedAt: toFiniteNumber(raw.updated_at),
  };
}
