/**
 * Core module: mt5Account.ts
 */

import { useMutation } from '@tanstack/react-query';
import {
  createMT5Account,
  CreateMT5AccountRequest,
  CreateMT5AccountResponse,
} from '../api/mt5Account';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

/**
 * TanStack Mutation hook for creating new MT5 trading accounts.
 *
 * Usage:
 * ```ts
 * const { mutate: createAccount, isPending, data, error } = useCreateMT5Account();
 * createAccount({ name: 'John', email: 'john@example.com', ... });
 * ```
 * 
 * Note: When building the UI for account creation, utilize `useMt5Groups` from `../../query/mt5` 
 * to fetch the available groups to populate the form selection.
 */
export function useCreateMT5Account() {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  return useMutation<CreateMT5AccountResponse, Error, CreateMT5AccountRequest>({
    mutationFn: (payload) => runSessionBoundQuery(
      cacheNamespace,
      () => createMT5Account(payload),
    ),
  });
}
