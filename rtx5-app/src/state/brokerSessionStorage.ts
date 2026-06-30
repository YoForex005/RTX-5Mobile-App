import {
  getSecureItemAsync,
  removeSecureItemAsync,
  setSecureItemAsync,
} from '../utils/secureStorage';
import { isBrokerServiceBaseUrl, normalizeBrokerServerUrl } from '../api/brokerRouting';

export const ACTIVE_BROKER_ID_KEY = 'broker_id';
export const ACTIVE_BROKER_SERVER_URL_KEY = 'server_url';
export const ACTIVE_BROKER_LOGO_URL_KEY = 'logo_url';
export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const EXPIRES_AT_KEY = 'expires_at';
export const FEED_BROKER_TOKEN_KEY = 'feed_broker_token';
export const FEED_BROKER_TOKEN_STORAGE_KEYS = [
  FEED_BROKER_TOKEN_KEY,
  'broker_feed_token',
  'feed_token',
  'ws_feed_token',
] as const;

type BrokerSessionInput = {
  brokerId: string;
  serverUrl?: string | null;
  logoUrl?: string | null;
};

type AuthTokenInput = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string;
  feedToken?: string | null;
};

export async function persistSelectedBrokerSession({
  brokerId,
  serverUrl,
  logoUrl,
}: BrokerSessionInput): Promise<void> {
  const candidateServerUrl = normalizeBrokerServerUrl(serverUrl);
  const normalizedServerUrl = isBrokerServiceBaseUrl(candidateServerUrl) ? candidateServerUrl : '';
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
  feedToken,
}: AuthTokenInput): Promise<void> {
  const writes: Array<Promise<void>> = [
    setSecureItemAsync(ACCESS_TOKEN_KEY, accessToken),
    setSecureItemAsync(REFRESH_TOKEN_KEY, refreshToken ?? ''),
    setSecureItemAsync(EXPIRES_AT_KEY, expiresAt),
  ];
  const normalizedFeedToken = String(feedToken ?? '').trim();
  if (normalizedFeedToken) {
    writes.push(setSecureItemAsync(FEED_BROKER_TOKEN_KEY, normalizedFeedToken));
  }
  await Promise.all(writes);
}

export async function getStoredFeedBrokerToken(): Promise<string> {
  for (const key of FEED_BROKER_TOKEN_STORAGE_KEYS) {
    const token = String(await getSecureItemAsync(key).catch(() => '') ?? '').trim();
    if (token) {
      return token;
    }
  }
  return '';
}

export async function clearAuthSessionTokens(): Promise<void> {
  await Promise.all([
    removeSecureItemAsync(ACCESS_TOKEN_KEY),
    removeSecureItemAsync(REFRESH_TOKEN_KEY),
    removeSecureItemAsync(EXPIRES_AT_KEY),
    ...FEED_BROKER_TOKEN_STORAGE_KEYS.map((key) => removeSecureItemAsync(key)),
  ]);
}
