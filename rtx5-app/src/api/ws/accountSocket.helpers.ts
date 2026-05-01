import type { LiveAccountData } from '../../state/liveAccountState';

type AccountDetails = {
  id: string;
  credentials?: {
    accessToken: string;
  };
} | null;

export type AccountWsSession = {
  token: string;
  login: string;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function extractMetricsFromRecord(source: Record<string, unknown>): Partial<LiveAccountData> | null {
  const metrics: Partial<LiveAccountData> = {};

  const login = pickFiniteNumber(source.login, source.account_login, source.accountLogin);
  const balance = pickFiniteNumber(source.balance);
  const equity = pickFiniteNumber(source.equity);
  const margin = pickFiniteNumber(source.margin, source.usedMargin, source.used_margin);
  const marginFree = pickFiniteNumber(
    source.margin_free,
    source.free_margin,
    source.freeMargin,
    source.margin_available,
    source.marginAvailable,
  );
  const marginLevel = pickFiniteNumber(source.margin_level, source.marginLevel);
  const floating = pickFiniteNumber(
    source.floating,
    source.floatingPnl,
    source.floating_pnl,
    source.unrealizedPnl,
    source.profit,
    source.pnl,
    source.pl,
    source.profitLoss,
    source.unrealized_pl,
  );

  if (login !== undefined) metrics.login = login;
  if (balance !== undefined) metrics.balance = balance;
  if (equity !== undefined) metrics.equity = equity;
  if (margin !== undefined) metrics.margin = margin;
  if (marginFree !== undefined) metrics.margin_free = marginFree;
  if (marginLevel !== undefined) metrics.margin_level = marginLevel;
  if (floating !== undefined) metrics.floating = floating;

  return Object.keys(metrics).length > 0 ? metrics : null;
}

function extractNestedLiveAccountMetrics(
  data: unknown,
  seen: WeakSet<object>,
): Partial<LiveAccountData> | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (seen.has(data)) {
    return null;
  }

  seen.add(data);
  const source = data as Record<string, unknown>;
  const directMetrics = extractMetricsFromRecord(source);

  for (const key of ['data', 'account', 'snapshot', 'metrics', 'payload']) {
    const nested = source[key];
    const nestedMetrics = extractNestedLiveAccountMetrics(nested, seen);
    if (nestedMetrics) {
      return directMetrics ? { ...directMetrics, ...nestedMetrics } : nestedMetrics;
    }
  }

  return directMetrics;
}

export function resolveAccountWsSession(
  accountDetails: AccountDetails,
  liveLogin?: number,
): AccountWsSession | null {
  const token = accountDetails?.credentials?.accessToken?.trim();
  if (!token) {
    return null;
  }

  const persistedLogin = pickFiniteNumber(accountDetails?.id);
  const resolvedLiveLogin = pickFiniteNumber(liveLogin);
  const resolvedLogin =
    persistedLogin !== undefined && persistedLogin >= 100000
      ? persistedLogin
      : (resolvedLiveLogin ?? persistedLogin);

  if (resolvedLogin === undefined || resolvedLogin <= 0) {
    return null;
  }

  return {
    token,
    login: String(Math.trunc(resolvedLogin)),
  };
}

export function extractLiveAccountMetrics(data: unknown): Partial<LiveAccountData> | null {
  return extractNestedLiveAccountMetrics(data, new WeakSet<object>());
}
