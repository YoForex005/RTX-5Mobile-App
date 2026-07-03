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
import { recordAccountJournalEvent } from './terminalJournalState';

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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const asFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const isSavedAccountType = (value: unknown): value is SavedAccountType =>
  value === 'demo' || value === 'real' || value === 'contest';

const normalizeSavedAccountSnapshot = (value: unknown): SavedAccountSnapshot | undefined => {
  const snapshot = asRecord(value);
  if (Object.keys(snapshot).length === 0) return undefined;

  return {
    balance: asFiniteNumber(snapshot.balance),
    equity: asFiniteNumber(snapshot.equity),
    freeMargin: asFiniteNumber(snapshot.freeMargin),
    leverage: asFiniteNumber(snapshot.leverage),
    floatingPnl: asFiniteNumber(snapshot.floatingPnl),
    openPositions: asFiniteNumber(snapshot.openPositions),
    currency: asString(snapshot.currency, 'USD'),
    updatedAt: asFiniteNumber(snapshot.updatedAt),
  };
};

const normalizeSavedAccount = (value: unknown): SavedAccount | null => {
  const account = asRecord(value);
  const login = asString(account.login);
  const brokerId = asString(account.brokerId);
  if (!login || !brokerId) return null;

  const snapshot = normalizeSavedAccountSnapshot(account.snapshot);

  return {
    login,
    name: asString(account.name, `Account ${login}`),
    brokerId,
    server: asString(account.server),
    serverUrl: asString(account.serverUrl) || undefined,
    logoUrl: asString(account.logoUrl) || undefined,
    accountType: isSavedAccountType(account.accountType) ? account.accountType : 'demo',
    lastUsedAt: asFiniteNumber(account.lastUsedAt),
    ...(snapshot ? { snapshot } : {}),
    hasCredentials: asBoolean(account.hasCredentials),
  };
};

const normalizeSavedAccountsPersistedState = (state: unknown): Pick<SavedAccountsState, 'accounts'> => {
  const accounts = asRecord(state).accounts;
  return {
    accounts: Array.isArray(accounts)
      ? accounts
          .map(normalizeSavedAccount)
          .filter((account): account is SavedAccount => account !== null)
      : [],
  };
};

export const useSavedAccounts = create<SavedAccountsState>()(
  persist(
    (set, get) => ({
      accounts: [],
      hasHydrated: false,
      upsertAccount: (account) => {
        const existingBeforeUpdate = get().accounts.find(
          (a) => a.login === account.login && a.brokerId === account.brokerId,
        );
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
            serverUrl: account.serverUrl || existing?.serverUrl,
            logoUrl: account.logoUrl || existing?.logoUrl,
            hasCredentials: account.hasCredentials || !!existing?.hasCredentials,
          };
          return { accounts: [merged, ...others] };
        });
        recordAccountJournalEvent(
          existingBeforeUpdate
            ? `saved account updated for broker ${account.brokerId}`
            : `saved account added for broker ${account.brokerId}`,
          {
            level: existingBeforeUpdate ? 'info' : 'success',
            accountLogin: account.login,
          },
        );
      },
      removeAccount: (login, brokerId) => {
        const existed = get().accounts.some(
          (a) => a.login === login && a.brokerId === brokerId,
        );
        set((state) => ({
          accounts: state.accounts.filter(
            (a) => !(a.login === login && a.brokerId === brokerId),
          ),
        }));
        if (existed) {
          recordAccountJournalEvent(`saved account removed for broker ${brokerId}`, {
            level: 'success',
            accountLogin: login,
          });
        }
      },
      touchLastUsed: (login, brokerId) => {
        const existed = get().accounts.some(
          (a) => a.login === login && a.brokerId === brokerId,
        );
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.login === login && a.brokerId === brokerId
              ? { ...a, lastUsedAt: Date.now() }
              : a,
          ),
        }));
        if (existed) {
          recordAccountJournalEvent(`saved account selected for broker ${brokerId}`, {
            accountLogin: login,
          });
        }
      },
      clearAll: () => {
        const count = get().accounts.length;
        set({ accounts: [] });
        if (count > 0) {
          recordAccountJournalEvent(`cleared ${count} saved account${count === 1 ? '' : 's'}`, {
            level: 'success',
          });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      // Corrupt-data tolerant: a malformed persisted blob is cleared and treated
      // as empty rather than throwing during rehydrate (mirrors userPreferences).
      // The inner storage validates the JSON and drops it on parse failure.
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          try {
            const value = await AsyncStorage.getItem(name);
            if (value == null) return null;
            JSON.parse(value);
            return value;
          } catch (error) {
            console.warn('[SavedAccounts] Ignoring unreadable persisted accounts', error);
            void AsyncStorage.removeItem(name).catch(() => {});
            return null;
          }
        },
        setItem: (name, value) => AsyncStorage.setItem(name, value),
        removeItem: (name) => AsyncStorage.removeItem(name),
      })),
      partialize: (state) => ({ accounts: state.accounts }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeSavedAccountsPersistedState(persistedState),
        hasHydrated: true,
      }),
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
