/**
 * Persistent registry of trading accounts the user has logged into on this
 * device. Powers the "Other Connected Accounts" section + one-tap account
 * switching.
 *
 * Public metadata (login, name, brokerId, server URL, accountType, lastUsedAt) is
 * persisted via AsyncStorage. The master password for each saved account is
 * stored separately in expo-secure-store via the credential helpers below so
 * sensitive material never lands in plain AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  getSecureItemAsync,
  removeSecureItemAsync,
  setSecureItemAsync,
} from '../utils/secureStorage';

export type SavedAccountType = 'demo' | 'real' | 'contest';

export type SavedAccountSnapshot = {
  balance: number;
  equity: number;
  freeMargin: number;
  leverage: number;
  floatingPnl: number;
  openPositions: number;
  currency: string;
  updatedAt: number;
};

export type SavedAccount = {
  login: string;
  name: string;
  brokerId: string;
  server: string;
  serverUrl?: string;
  logoUrl?: string;
  accountType: SavedAccountType;
  lastUsedAt: number;
  snapshot?: SavedAccountSnapshot;
  /**
   * True when a master password was successfully stored in expo-secure-store
   * during the originating login/register flow. Backfilled entries (e.g. the
   * pre-existing active session captured by the Accounts screen) have this
   * set to false until the user signs in via the form again.
   */
  hasCredentials: boolean;
};

type SavedAccountsState = {
  accounts: SavedAccount[];
  hasHydrated: boolean;
  upsertAccount: (account: SavedAccount) => void;
  removeAccount: (login: string, brokerId: string) => void;
  touchLastUsed: (login: string, brokerId: string) => void;
  clearAll: () => void;
};

const STORAGE_KEY = 'savedAccounts';

export const useSavedAccounts = create<SavedAccountsState>()(
  persist(
    (set) => ({
      accounts: [],
      hasHydrated: false,
      upsertAccount: (account) =>
        set((state) => {
          const existing = state.accounts.find(
            (a) => a.login === account.login && a.brokerId === account.brokerId,
          );
          const others = state.accounts.filter((a) => a !== existing);
          // hasCredentials should never regress from true → false on a
          // backfill upsert (e.g. AccountsScreen recording the current
          // session before the user has typed their password into the form
          // post-update). A true value can only be cleared by removeAccount.
          const merged: SavedAccount = {
            ...account,
            hasCredentials: account.hasCredentials || !!existing?.hasCredentials,
          };
          return { accounts: [merged, ...others] };
        }),
      removeAccount: (login, brokerId) =>
        set((state) => ({
          accounts: state.accounts.filter(
            (a) => !(a.login === login && a.brokerId === brokerId),
          ),
        })),
      touchLastUsed: (login, brokerId) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.login === login && a.brokerId === brokerId
              ? { ...a, lastUsedAt: Date.now() }
              : a,
          ),
        })),
      clearAll: () => set({ accounts: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ accounts: state.accounts }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          (state as SavedAccountsState).hasHydrated = true;
        }
      },
    },
  ),
);

const encodeCredentialKeyPart = (value: string) =>
  Array.from(value)
    .map((char) => char.codePointAt(0)?.toString(16).padStart(4, '0') ?? '0000')
    .join('_') || 'empty';

export const makeSavedAccountCredentialKey = (brokerId: string, login: string) =>
  `rtx5_saved_account_pass.${encodeCredentialKeyPart(brokerId)}.${encodeCredentialKeyPart(login)}`;

export async function setSavedAccountPassword(
  brokerId: string,
  login: string,
  password: string,
): Promise<void> {
  await setSecureItemAsync(makeSavedAccountCredentialKey(brokerId, login), password);
}

export async function getSavedAccountPassword(
  brokerId: string,
  login: string,
): Promise<string | null> {
  return getSecureItemAsync(makeSavedAccountCredentialKey(brokerId, login));
}

export async function removeSavedAccountPassword(
  brokerId: string,
  login: string,
): Promise<void> {
  await removeSecureItemAsync(makeSavedAccountCredentialKey(brokerId, login));
}
