import type { LiveAccountData } from '../../state/liveAccountState';
import type { AccountSummary } from '../../state/tradingState';

export type TradeAccountSummary = {
  balance: number;
  credit: number;
  floating: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hasAuthoritativeLiveMetrics(liveAccount: Partial<LiveAccountData>): boolean {
  return [
    liveAccount.balance,
    liveAccount.equity,
    liveAccount.margin,
    liveAccount.margin_free,
    liveAccount.margin_level,
    liveAccount.floating,
  ].some((value) => toFiniteNumber(value) !== undefined && value !== 0);
}

export function buildTradeAccountSummary(
  liveAccount: Partial<LiveAccountData>,
  tradingAccount: AccountSummary | null | undefined,
): TradeAccountSummary {
  const useLiveMetrics = hasAuthoritativeLiveMetrics(liveAccount);

  return {
    balance: useLiveMetrics ? toFiniteNumber(liveAccount.balance) ?? 0 : toFiniteNumber(tradingAccount?.balance) ?? 0,
    credit: toFiniteNumber(tradingAccount?.credit) ?? 0,
    floating: useLiveMetrics ? toFiniteNumber(liveAccount.floating) ?? 0 : toFiniteNumber(tradingAccount?.floating) ?? 0,
    equity: useLiveMetrics ? toFiniteNumber(liveAccount.equity) ?? 0 : toFiniteNumber(tradingAccount?.equity) ?? 0,
    margin: useLiveMetrics ? toFiniteNumber(liveAccount.margin) ?? 0 : toFiniteNumber(tradingAccount?.margin) ?? 0,
    freeMargin: useLiveMetrics ? toFiniteNumber(liveAccount.margin_free) ?? 0 : toFiniteNumber(tradingAccount?.freeMargin) ?? 0,
    marginLevel: useLiveMetrics ? toFiniteNumber(liveAccount.margin_level) ?? 0 : toFiniteNumber(tradingAccount?.marginLevel) ?? 0,
    currency: tradingAccount?.currency || 'USD',
  };
}
