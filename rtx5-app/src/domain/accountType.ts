export type TradingAccountType = 'demo' | 'contest' | 'real';

function normalizeAccountGroup(group: string | null | undefined): string {
  return (group ?? '').trim().toLowerCase();
}

export function getTradingAccountType(group: string | null | undefined): TradingAccountType {
  const normalizedGroup = normalizeAccountGroup(group);

  if (normalizedGroup.includes('demo')) {
    return 'demo';
  }

  if (normalizedGroup.includes('contest')) {
    return 'contest';
  }

  return 'real';
}

export function isDemoTradingAccount(group: string | null | undefined): boolean {
  return getTradingAccountType(group) === 'demo';
}

export function getTradingAccountRibbonLabel(group: string | null | undefined): 'Demo' | 'Real' {
  return isDemoTradingAccount(group) ? 'Demo' : 'Real';
}

export function getTradingAccountBadgeLabel(group: string | null | undefined): 'Demo' | 'Live' {
  return isDemoTradingAccount(group) ? 'Demo' : 'Live';
}
