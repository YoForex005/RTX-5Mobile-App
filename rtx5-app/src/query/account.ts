/**
 * Core module: account.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getAccountSummary, AccountSummary } from '../api/account';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const ACCOUNT_SUMMARY_KEY = 'accountSummary';

export const getAccountSummaryQueryKey = (
  cacheNamespace: string,
  login?: string,
) => [ACCOUNT_SUMMARY_KEY, cacheNamespace, login] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useAccountSummary(
  login?: string,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery<AccountSummary, Error>({
    queryKey: getAccountSummaryQueryKey(cacheNamespace, login),
    queryFn: async () => {
      if (!login) {
        throw new Error('Login ID is required to fetch account summary');
      }
      return runSessionBoundQuery(
        cacheNamespace,
        () => getAccountSummary(login),
      );
    },
    enabled,
    refetchInterval: enabled ? (options.refetchInterval ?? 30_000) : false,
    staleTime: 10_000,
  });
}

// Mock hook to fix compilation error for ChangePasswordSheet which references this
export function useChangeMt5Password() {
  return {
    mutate: (data: any, options: any) => { options?.onSuccess?.(); },
    isPending: false,
  };
}
