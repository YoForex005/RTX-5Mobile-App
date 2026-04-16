/**
 * Core module: tradingLogin.ts
 */

import { useLiveAccountState } from './liveAccountState';
import { useUserPreferences } from './userPreferences';

/**
 * Central resolution utility for determining the active trading account login.
 * It prioritizes the real-time live connection state, falling back to persisted user preferences.
 * 
 * @returns The active numeric MT5 login ID, or undefined if no account is authenticated.
 */
export function resolveTradingLogin(): number | undefined {
  // 1. Highest Priority: Check the actual live WebSocket state
  const liveLogin = useLiveAccountState.getState().login;
  if (Number.isFinite(liveLogin) && liveLogin > 0) {
    return liveLogin;
  }

  // 2. Fallback: Check the locally persisted user preferences (useful during initialization)
  const persistedLogin = Number(useUserPreferences.getState().accountDetails?.id);
  if (Number.isFinite(persistedLogin) && persistedLogin > 0) {
    return persistedLogin;
  }

  return undefined;
}

/**
 * Reactive hook variant of resolveTradingLogin().
 * Use inside components that need to update immediately when the active
 * account login changes, such as query hooks keyed by account login.
 */
export function useResolvedTradingLogin(): number | undefined {
  const liveLogin = useLiveAccountState((state) => state.login);
  const persistedLogin = useUserPreferences((state) => Number(state.accountDetails?.id));

  if (Number.isFinite(liveLogin) && liveLogin > 0) {
    return liveLogin;
  }

  if (Number.isFinite(persistedLogin) && persistedLogin > 0) {
    return persistedLogin;
  }

  return undefined;
}

/**
 * String-based wrapper for resolveTradingLogin, heavily used in TanStack Query keys 
 * and API requests where string interpolation is required.
 * 
 * @returns The active login as a string, or undefined.
 */
export function resolveTradingLoginString(): string | undefined {
  const login = resolveTradingLogin();
  return login !== undefined ? String(login) : undefined;
}

