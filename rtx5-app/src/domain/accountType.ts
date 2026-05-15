export type TradingAccountType = 'demo' | 'contest' | 'real';

function normalizeAccountGroup(group: string | null | undefined): string {
  return (group ?? '').trim().toLowerCase();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return undefined;
}

function resolveTypeFromToken(value: unknown): TradingAccountType | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = normalizeAccountGroup(value);

  if (normalized.includes('demo')) {
    return 'demo';
  }

  if (normalized.includes('contest') || normalized.includes('competition') || normalized.includes('tournament')) {
    return 'contest';
  }

  if (normalized.includes('real') || normalized.includes('live')) {
    return 'real';
  }

  return undefined;
}

function readFirstType(record: Record<string, unknown> | null, keys: string[]): TradingAccountType | undefined {
  if (!record) return undefined;

  for (const key of keys) {
    const type = resolveTypeFromToken(record[key]);
    if (type) return type;
  }

  return undefined;
}

export function getTradingAccountType(group: string | null | undefined): TradingAccountType {
  return resolveTypeFromToken(group) ?? 'real';
}

export function getTradingAccountTypeFromBackend(payload: unknown): TradingAccountType {
  const root = readRecord(payload);
  const user = readRecord(root?.user);
  const account = readRecord(root?.account);
  const nestedUserAccount = readRecord(user?.account);

  const directKeys = ['account_type', 'accountType', 'account_kind', 'accountKind', 'type', 'kind', 'mode'];
  const groupKeys = ['group', 'account_group', 'accountGroup'];

  const directType =
    readFirstType(root, directKeys) ??
    readFirstType(account, directKeys) ??
    readFirstType(user, directKeys) ??
    readFirstType(nestedUserAccount, directKeys);
  if (directType) return directType;

  const isDemo =
    readBoolean(root?.is_demo ?? root?.isDemo ?? root?.demo) ??
    readBoolean(account?.is_demo ?? account?.isDemo ?? account?.demo) ??
    readBoolean(user?.is_demo ?? user?.isDemo ?? user?.demo) ??
    readBoolean(nestedUserAccount?.is_demo ?? nestedUserAccount?.isDemo ?? nestedUserAccount?.demo);
  if (isDemo) return 'demo';

  const isContest =
    readBoolean(root?.is_contest ?? root?.isContest ?? root?.contest) ??
    readBoolean(account?.is_contest ?? account?.isContest ?? account?.contest) ??
    readBoolean(user?.is_contest ?? user?.isContest ?? user?.contest) ??
    readBoolean(nestedUserAccount?.is_contest ?? nestedUserAccount?.isContest ?? nestedUserAccount?.contest);
  if (isContest) return 'contest';

  const groupType =
    readFirstType(root, groupKeys) ??
    readFirstType(account, groupKeys) ??
    readFirstType(user, groupKeys) ??
    readFirstType(nestedUserAccount, groupKeys);

  return groupType ?? 'real';
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
