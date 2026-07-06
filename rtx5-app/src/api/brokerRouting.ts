const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const FALLBACK_API_BASE_URL = 'https://superbackend.orrnn.com/api/v2';
const FALLBACK_PUBLIC_BROKER_DIRECTORY_BASE_URL = 'https://superbackend.orrnn.com/api/v1';
const LEGACY_SHARED_API_BASE_URL = 'https://backend.orrnn.com/api/v2';
const LEGACY_TEST_BROKER_DIRECTORY_BASE_URL = 'https://testsuperbackend.orrnn.com/api/v1';

export const BROKER_BACKEND_DOMAIN_UNAVAILABLE_MESSAGE =
  'Broker backend domain is missing or invalid for this broker. Please update the broker services domain in super admin and try again.';

export const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || FALLBACK_API_BASE_URL;

const SHARED_AUTH_PROXY_API_BASE_URL = trimTrailingSlash(
  process.env.EXPO_PUBLIC_AUTH_PROXY_API_BASE_URL || FALLBACK_API_BASE_URL,
);

export const PUBLIC_BROKER_DIRECTORY_BASE_URL = trimTrailingSlash(
  process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL ||
    process.env.EXPO_PUBLIC_API_V1_BASE_URL ||
    FALLBACK_PUBLIC_BROKER_DIRECTORY_BASE_URL,
);

export type BrokerServiceDiscovery = {
  server_url?: string | null;
  market_api_url?: string | null;
  domain_name?: string | null;
  server_domain?: string | null;
  services_domain?: string | null;
  feed_status_https_url?: string | null;
  feed_status_url?: string | null;
  feed_url?: string | null;
  feed_ws_url?: string | null;
  feed_wss_url?: string | null;
  ws_url?: string | null;
  wss_url?: string | null;
  domains?: {
    domain_name?: string | null;
    server?: string | null;
    services?: string | null;
  } | null;
  protocol?: string | null;
  server?: string | null;
  server_ip?: string | null;
  server_port?: number | null;
};

const SERVICE_PATH_PATTERN = /\/(?:api\/v\d+|ws(?:\/(?:feed(?:\/status)?|v\d+))?)$/i;
const IPV4_HOST_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_HOST_PATTERN = /^\[[0-9a-f:.]+\]$/i;

const stripBrokerServicePath = (value: string): string =>
  trimTrailingSlash(value).replace(SERVICE_PATH_PATTERN, '');

const normalizeTransportScheme = (value: string): string =>
  value
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'https://')
    .replace(/^http:\/\//i, 'https://');

const hasUrlScheme = (value: string): boolean =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const isRawIpHost = (host: string): boolean => {
  const normalizedHost = host.trim().replace(/^\[|\]$/g, '');
  return IPV4_HOST_PATTERN.test(normalizedHost) || IPV6_HOST_PATTERN.test(host.trim());
};

const isDomainLikeHost = (host: string): boolean =>
  host === 'localhost' || host.includes('.');

export function normalizeBrokerServerUrl(serverUrl?: string | null): string {
  const raw = String(serverUrl ?? '').trim();
  if (!raw) {
    return '';
  }

  const withSecureScheme = normalizeTransportScheme(stripBrokerServicePath(raw));
  const candidate = hasUrlScheme(withSecureScheme)
    ? withSecureScheme
    : `https://${withSecureScheme}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.trim().toLowerCase();
    if (url.protocol !== 'https:' || !isDomainLikeHost(host) || isRawIpHost(url.hostname)) {
      return '';
    }

    const path = trimTrailingSlash(url.pathname === '/' ? '' : url.pathname);
    return trimTrailingSlash(`${url.protocol}//${url.host}${path}`);
  } catch {
    return '';
  }
}

const getSharedBackendOrigins = (): string[] =>
  [
    DEFAULT_API_BASE_URL,
    SHARED_AUTH_PROXY_API_BASE_URL,
    PUBLIC_BROKER_DIRECTORY_BASE_URL,
    FALLBACK_API_BASE_URL,
    FALLBACK_PUBLIC_BROKER_DIRECTORY_BASE_URL,
    LEGACY_SHARED_API_BASE_URL,
    LEGACY_TEST_BROKER_DIRECTORY_BASE_URL,
  ]
    .map(normalizeBrokerServerUrl)
    .filter((origin): origin is string => Boolean(origin));

export function isSharedBackendOrigin(serverUrl?: string | null): boolean {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  return Boolean(
    normalizedServerUrl &&
      getSharedBackendOrigins().includes(normalizedServerUrl),
  );
}

export function isBrokerServiceBaseUrl(serverUrl?: string | null): boolean {
  const normalizedServerUrl = normalizeBrokerServerUrl(serverUrl);
  return Boolean(normalizedServerUrl && !isSharedBackendOrigin(normalizedServerUrl));
}

export function getBrokerBackendDomainUnavailableMessage(brokerId?: string | null): string {
  const normalizedBrokerId = String(brokerId ?? '').trim();
  return normalizedBrokerId
    ? `Broker backend domain is missing or invalid for broker "${normalizedBrokerId}". Please update the broker services domain in super admin and try again.`
    : BROKER_BACKEND_DOMAIN_UNAVAILABLE_MESSAGE;
}

export function resolveBrokerServiceBaseUrl(broker: BrokerServiceDiscovery): string {
  const candidates = [
    broker.server_url,
    broker.market_api_url,
    broker.domains?.services,
    broker.services_domain,
    broker.domains?.server,
    broker.server_domain,
    broker.domains?.domain_name,
    broker.domain_name,
    broker.feed_status_https_url,
    broker.feed_status_url,
    broker.feed_wss_url,
    broker.feed_ws_url,
    broker.feed_url,
    broker.wss_url,
    broker.ws_url,
    broker.server,
  ];

  for (const candidate of candidates) {
    const normalizedServerUrl = normalizeBrokerServerUrl(candidate);
    if (normalizedServerUrl && !isSharedBackendOrigin(normalizedServerUrl)) {
      return normalizedServerUrl;
    }
  }

  return '';
}

export function shouldUseBrokerHostedQuoteFeed(serverUrl?: string | null): boolean {
  return isBrokerServiceBaseUrl(serverUrl);
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
  if (!normalizedServerUrl || isSharedBackendOrigin(normalizedServerUrl)) {
    return fallbackUrl;
  }

  const brokerHost = normalizedServerUrl.replace(/^https:\/\//i, '');
  const wsServer = `wss://${brokerHost}`;
  return `${trimTrailingSlash(wsServer)}${path}`;
}

// iOS blocks cleartext websocket traffic and raw-IP certificates. Keep every
// live-data override on a secure domain, or use the shared backend fallback.
export function normalizeConfiguredWsUrl(configuredUrl: string | undefined | null, fallbackUrl: string): string {
  const raw = String(configuredUrl ?? '').trim();
  if (!raw) {
    return fallbackUrl;
  }

  const withSecureWsScheme = raw
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'wss://')
    .replace(/^ws:\/\//i, 'wss://');
  const candidate = hasUrlScheme(withSecureWsScheme)
    ? withSecureWsScheme
    : `wss://${withSecureWsScheme}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.trim().toLowerCase();
    if (url.protocol !== 'wss:' || !isDomainLikeHost(host) || isRawIpHost(url.hostname)) {
      return fallbackUrl;
    }

    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return fallbackUrl;
  }
}
