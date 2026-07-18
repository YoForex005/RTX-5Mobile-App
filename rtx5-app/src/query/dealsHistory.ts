import type { Deal } from '../api/deals';

const dealIdentity = (deal: Deal) => {
  const ticket = Number(deal.ticket);
  if (Number.isFinite(ticket) && ticket > 0) return `ticket:${ticket}`;

  return [
    'deal',
    deal.account_login ?? '',
    deal.order_ticket ?? '',
    deal.position_ticket ?? '',
    deal.symbol ?? '',
    deal.entry ?? '',
    deal.action ?? '',
    deal.time ?? '',
    deal.volume ?? '',
    deal.price ?? '',
  ].join(':');
};

export const buildAccountDealsQueryKey = (
  cacheNamespace: string,
  login: number | undefined,
  from?: number,
  to?: number,
) => ['accountDeals', cacheNamespace, login ?? 'session', from ?? null, to ?? null] as const;

export const mergeDealHistorySources = (
  accountDeals: Deal[],
  loginDeals: Deal[],
): Deal[] => {
  const seen = new Set<string>();
  const merged: Deal[] = [];

  for (const deal of accountDeals) {
    seen.add(dealIdentity(deal));
    merged.push(deal);
  }

  for (const deal of loginDeals) {
    const key = dealIdentity(deal);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(deal);
    }
  }

  return merged;
};

const normalizeDealTimeSeconds = (time: unknown) => {
  const value = Number(time);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
};

export const filterDealsByTimeRange = (
  deals: Deal[],
  from?: number,
  to?: number,
) => {
  if (from == null && to == null) return deals;

  return deals.filter((deal) => {
    const seconds = normalizeDealTimeSeconds(deal.time);
    if (seconds == null) return true;
    if (from != null && seconds < from) return false;
    if (to != null && seconds > to) return false;
    return true;
  });
};
