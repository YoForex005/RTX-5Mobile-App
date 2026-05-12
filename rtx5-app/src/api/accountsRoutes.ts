export const ACCOUNTS_LIST_PATH = '/accounts';

export function buildAccountDetailPath(login: number | string): string {
  return `/account/${encodeURIComponent(String(login))}`;
}
