import { useUserPreferences } from '../../../../state/userPreferences';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../core/candles';

export const getStoredAccessToken = (): string | null => {
  try {
    return useUserPreferences.getState().accountDetails?.credentials?.accessToken ?? null;
  } catch {
    return null;
  }
};

export const createSubscriptionKey = (symbol: string, tf: string): string => {
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  return `${normalizeSymbol(symbol)}::${normalizedTimeframe ?? ''}`;
};
