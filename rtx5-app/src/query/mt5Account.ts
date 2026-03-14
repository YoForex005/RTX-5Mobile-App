import { useMutation } from '@tanstack/react-query';
import {
  createMT5Account,
  CreateMT5AccountRequest,
  CreateMT5AccountResponse,
} from '../api/mt5Account';

/**
 * TanStack Mutation hook for creating new MT5 trading accounts.
 *
 * Usage:
 * ```ts
 * const { mutate: createAccount, isPending, data, error } = useCreateMT5Account();
 * createAccount({ name: 'John', email: 'john@example.com', ... });
 * ```
 */
export function useCreateMT5Account() {
  return useMutation<CreateMT5AccountResponse, Error, CreateMT5AccountRequest>({
    mutationFn: createMT5Account,
  });
}
