import {
  getSecureItemAsync,
  removeSecureItemAsync,
  setSecureItemAsync,
} from '../utils/secureStorage';
import { normalizeBrokerServerUrl } from '../api/brokerRouting';

export const ACTIVE_BROKER_ID_KEY = 'broker_id';
export const ACTIVE_BROKER_SERVER_URL_KEY = 'server_url';
export const ACTIVE_BROKER_LOGO_URL_KEY = 'logo_url';
export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const EXPIRES_AT_KEY = 'expires_at';

type BrokerSessionInput = {
  brokerId: string;
  serverUrl?: string | null;
  logoUrl?: string | null;
};

type AuthTokenInput = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string;
};

export async function persistSelectedBrokerSession({
  brokerId,
  serverUrl,
  logoUrl,
}: BrokerSessionInput): Promise<void> {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  const normalizedLogoUrl = String(logoUrl ?? '').trim();
  const [storedBrokerId, storedLogoUrl] = normalizedLogoUrl
    ? ['', '']
    : await Promise.all([
        getSecureItemAsync(ACTIVE_BROKER_ID_KEY).catch(() => ''),
        getSecureItemAsync(ACTIVE_BROKER_LOGO_URL_KEY).catch(() => ''),
      ]);
  const shouldKeepStoredLogo =
    !normalizedLogoUrl &&
    String(storedBrokerId ?? '').trim().toLowerCase() === String(brokerId ?? '').trim().toLowerCase();
  const nextLogoUrl = normalizedLogoUrl || (shouldKeepStoredLogo ? String(storedLogoUrl ?? '').trim() : '');
  await Promise.all([
    setSecureItemAsync(ACTIVE_BROKER_ID_KEY, brokerId),
    setSecureItemAsync(ACTIVE_BROKER_SERVER_URL_KEY, normalizedServerUrl),
    setSecureItemAsync(ACTIVE_BROKER_LOGO_URL_KEY, nextLogoUrl),
  ]);
}

export async function persistAuthSessionTokens({
  accessToken,
  refreshToken,
  expiresAt,
}: AuthTokenInput): Promise<void> {
  await Promise.all([
    setSecureItemAsync(ACCESS_TOKEN_KEY, accessToken),
    setSecureItemAsync(REFRESH_TOKEN_KEY, refreshToken ?? ''),
    setSecureItemAsync(EXPIRES_AT_KEY, expiresAt),
  ]);
}

export async function clearAuthSessionTokens(): Promise<void> {
  await Promise.all([
    removeSecureItemAsync(ACCESS_TOKEN_KEY),
    removeSecureItemAsync(REFRESH_TOKEN_KEY),
    removeSecureItemAsync(EXPIRES_AT_KEY),
  ]);
}
