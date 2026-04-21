import type { LiveAccountData } from '../../state/liveAccountState';
import type { AccountSummary } from '../../state/tradingState';
import type { PositionItem, QuoteItem } from '../../mock/tradingData';
import { sumLivePositionPnl } from './livePositionMetrics.ts';

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

export function resolveTradeFloatingPnl(
  summaryFloating: number,
  positions: PositionItem[],
  hydratedLogin: string | null,
  activeLogin: number | string | null | undefined,
  quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
): number {
  if (activeLogin === null || activeLogin === undefined) {
    return summaryFloating;
  }

  if (hydratedLogin !== String(activeLogin)) {
    return summaryFloating;
  }

  return sumLivePositionPnl(positions, quotesBySymbol);
}

export function resolveRenderableTradeAccountSummary(
  summary: TradeAccountSummary,
  floating: number,
): TradeAccountSummary {
  if (!Number.isFinite(floating) || Math.abs(floating - summary.floating) <= Number.EPSILON) {
    return summary;
  }

  const equity = summary.balance + summary.credit + floating;
  const freeMargin = equity - summary.margin;
  const marginLevel = summary.margin > 0 ? (equity / summary.margin) * 100 : summary.marginLevel;

  return {
    ...summary,
    floating,
    equity: Number.isFinite(equity) ? equity : summary.equity,
    freeMargin: Number.isFinite(freeMargin) ? freeMargin : summary.freeMargin,
    marginLevel: Number.isFinite(marginLevel) ? marginLevel : summary.marginLevel,
  };
}
