import { useLiveAccountState } from './liveAccountState';
import { useUserPreferences } from './userPreferences';

export function resolveTradingLogin(): number | undefined {
  const liveLogin = useLiveAccountState.getState().login;
  if (Number.isFinite(liveLogin) && liveLogin > 0) {
    return liveLogin;
  }

  const persistedLogin = Number(useUserPreferences.getState().accountDetails?.id);
  if (Number.isFinite(persistedLogin) && persistedLogin > 0) {
    return persistedLogin;
  }

  return undefined;
}

export function resolveTradingLoginString(): string | undefined {
  const login = resolveTradingLogin();
  return login !== undefined ? String(login) : undefined;
}
