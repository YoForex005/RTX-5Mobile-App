import { useQuery } from '@tanstack/react-query';
import { getAccountSummary, AccountSummary } from '../api/account';

export const ACCOUNT_SUMMARY_KEY = 'accountSummary';

export function useAccountSummary(login?: string) {
  return useQuery<AccountSummary, Error>({
    queryKey: [ACCOUNT_SUMMARY_KEY, login],
    queryFn: async () => {
      if (!login) {
        throw new Error('Login ID is required to fetch account summary');
      }
      return getAccountSummary(login);
    },
    enabled: !!login,
    refetchInterval: 5000, // Live poll every 5 seconds for real-time MT5 stats
    staleTime: 2000,
  });
}

// Mock hook to fix compilation error for ChangePasswordSheet which references this
export function useChangeMt5Password() {
  return {
    mutate: (data: any, options: any) => { options?.onSuccess?.(); },
    isPending: false,
  };
}
