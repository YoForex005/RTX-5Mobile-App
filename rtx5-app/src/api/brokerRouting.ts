const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://backend.orrnn.com/api/v2';

export const PUBLIC_BROKER_DIRECTORY_BASE_URL = trimTrailingSlash(
  process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL ||
    process.env.EXPO_PUBLIC_API_V1_BASE_URL ||
    'https://testsuperbackend.orrnn.com/api/v1',
);

export function normalizeBrokerServerUrl(serverUrl?: string | null): string {
  const normalized = String(serverUrl ?? '').trim();
  if (!normalized) {
    return '';
  }

  return trimTrailingSlash(normalized).replace(/\/api\/v\d+$/i, '');
}

export function buildBrokerApiBaseUrl(serverUrl?: string | null): string {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  if (!normalizedServerUrl) {
    return DEFAULT_API_BASE_URL;
  }

  return `${normalizedServerUrl}/api/v2`;
}

export function buildApiUrl(endpoint: string, apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const normalizedBase = trimTrailingSlash(apiBaseUrl);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}

export function buildBrokerHealthUrl(serverUrl: string): string {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  return normalizedServerUrl ? `${normalizedServerUrl}/health` : '';
}

export function buildBrokerWsUrl(
  serverUrl: string | undefined | null,
  path: '/ws' | '/ws/feed' | '/ws/v2',
  fallbackUrl: string,
): string {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  if (!normalizedServerUrl) {
    return fallbackUrl;
  }

  const brokerHost = normalizedServerUrl.replace(/^(https?|wss?):\/\//i, '');
  const wsServer = `wss://${brokerHost}`;
  return `${trimTrailingSlash(wsServer)}${path}`;
}
