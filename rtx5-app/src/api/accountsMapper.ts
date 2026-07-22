type NumericAccountField = number | string | null | undefined;

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
  margin_used?: NumericAccountField;
  used_margin?: NumericAccountField;
  marginUsed?: NumericAccountField;
  usedMargin?: NumericAccountField;
  margin_free?: NumericAccountField;
  free_margin?: NumericAccountField;
  freeMargin?: NumericAccountField;
  margin_available?: NumericAccountField;
  marginAvailable?: NumericAccountField;
  margin_level?: NumericAccountField;
  marginLevel?: NumericAccountField;
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
  const equity = toFiniteNumber(raw.equity);
  const usedMargin = pickFiniteNumber(
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
  ) ?? equity - usedMargin;
  const marginLevel = pickFiniteNumber(raw.margin_level, raw.marginLevel) ?? (usedMargin > 0
    ? (equity / usedMargin) * 100
    : 0);

  return {
    login,
    name: raw.name || `Account ${login}`,
    group: raw.group || 'standard',
    currency: raw.currency || 'USD',
    leverage: toFiniteNumber(raw.leverage),
    balance: toFiniteNumber(raw.balance),
    credit: toFiniteNumber(raw.credit),
    equity,
    usedMargin,
    freeMargin,
    marginLevel,
    floatingPnl: toFiniteNumber(raw.floating_pnl ?? raw.floating),
    totalSwap: toFiniteNumber(raw.total_swap),
    openPositions: Math.trunc(toFiniteNumber(raw.open_positions)),
    status: raw.status || 'active',
    createdAt: toFiniteNumber(raw.created_at),
    updatedAt: toFiniteNumber(raw.updated_at),
  };
}
