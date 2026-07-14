import type { BrokerServer } from '../../../api/broker';
import {
  PUBLIC_BROKER_DIRECTORY_BASE_URL,
  resolveBrokerServiceBaseUrl,
} from '../../../api/brokerRouting';
import { formatServerFromName } from './brokerData';

const PINNED_BROKER_NAMES = ['MetaQuotes Ltd.'];

export type BrokerDirectoryRow = {
  id: string;
  brokerId: string;
  name: string;
  server: string;
  serverUrl: string;
  logoUrl: string;
  region: string;
  protocol: string;
  domain?: string;
};

// Best-effort domains are used only after a broker does not provide a logo.
const KNOWN_BROKER_DOMAINS: Record<string, string> = {
  flexymarkets: 'flexymarkets.com',
  metaquotes: 'metaquotes.net',
  alphatrading: 'alphatrading.com',
  growtradingacademy: 'growtradingacademy.com',
  gtabroker: 'growtradingacademy.com',
  myprop: 'myprop.trade',
  myproptrade: 'myprop.trade',
  orrnn: 'orrnn.com',
  testorrnn: 'orrnn.com',
  achieverfinancials: 'achieverfinancials.com',
  alphafxmarkets: 'alphafxmarkets.com',
};

const BROKER_LOGO_KEYS = [
  'logo_url',
  'logoUrl',
  'logo',
  'logo_path',
  'logoPath',
  'image_url',
  'imageUrl',
  'icon_url',
  'iconUrl',
  'brand_logo_url',
  'brandLogoUrl',
] as const;

const BROKER_LOGO_NESTED_KEYS = [
  'brand',
  'branding',
  'config',
  'theme',
] as const;

const PUBLIC_BROKER_DIRECTORY_ORIGIN = (() => {
  try {
    return new URL(PUBLIC_BROKER_DIRECTORY_BASE_URL).origin;
  } catch {
    return PUBLIC_BROKER_DIRECTORY_BASE_URL.replace(/\/api\/v\d+\/?$/i, '');
  }
})();

function getLogoValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function resolveBrokerDomain(value: string): string | undefined {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [needle, domain] of Object.entries(KNOWN_BROKER_DOMAINS)) {
    if (key.includes(needle)) return domain;
  }
  return undefined;
}

export function normalizeBrokerLogoUrl(logoUrl?: string | null) {
  const raw = String(logoUrl ?? '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/^http:\/\//i, 'https://');
  }

  try {
    const base = raw.startsWith('/')
      ? `${PUBLIC_BROKER_DIRECTORY_ORIGIN}/`
      : `${PUBLIC_BROKER_DIRECTORY_BASE_URL.replace(/\/+$/, '')}/`;
    return new URL(raw, base).toString().replace(/^http:\/\//i, 'https://');
  } catch {
    return raw;
  }
}

export function resolveBrokerLogoUrl(broker: BrokerServer) {
  const record = broker as unknown as Record<string, unknown>;

  for (const key of BROKER_LOGO_KEYS) {
    const directLogo = normalizeBrokerLogoUrl(getLogoValue(record[key]));
    if (directLogo) return directLogo;
  }

  for (const key of BROKER_LOGO_NESTED_KEYS) {
    const nested = asUnknownRecord(record[key]);
    if (!nested) continue;
    for (const logoKey of BROKER_LOGO_KEYS) {
      const nestedLogo = normalizeBrokerLogoUrl(getLogoValue(nested[logoKey]));
      if (nestedLogo) return nestedLogo;
    }
  }

  return '';
}

export function buildBrokerDomainLogoUrl(domain?: string) {
  const cleanDomain = String(domain ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return cleanDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=128`
    : '';
}

export function formatBrokerInitials(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
  return initials || 'BR';
}

function isRawNetworkEndpoint(value: string) {
  const host = value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split('/')[0];

  return (
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(host)
  );
}

function formatVisibleServerName(broker: BrokerServer) {
  const server = broker.server?.trim() || '';
  if (!server || isRawNetworkEndpoint(server)) {
    return formatServerFromName(broker.broker_name);
  }

  return server;
}

export function buildBrokerDirectoryRows(
  brokerServers?: readonly BrokerServer[],
): BrokerDirectoryRow[] {
  const rows = (brokerServers ?? []).filter((broker) => broker.enabled !== false);
  const seen = new Set<string>();
  const deduped: BrokerServer[] = [];

  for (const broker of rows) {
    if (seen.has(broker.broker_id)) continue;
    seen.add(broker.broker_id);
    deduped.push(broker);
  }

  return deduped.map((broker) => ({
    id: `srv-${broker.id ?? broker.broker_id}`,
    brokerId: broker.broker_id,
    name: broker.broker_name,
    server: formatVisibleServerName(broker),
    serverUrl: resolveBrokerServiceBaseUrl(broker),
    logoUrl: resolveBrokerLogoUrl(broker),
    region: broker.region,
    protocol: broker.protocol,
    domain:
      resolveBrokerDomain(broker.broker_name)
      ?? resolveBrokerDomain(broker.broker_id)
      ?? resolveBrokerDomain(broker.domain_name ?? '')
      ?? resolveBrokerDomain(broker.services_domain ?? '')
      ?? resolveBrokerDomain(broker.server_domain ?? ''),
  }));
}

export function sortBrokerDirectoryRows(
  rows: readonly BrokerDirectoryRow[],
): BrokerDirectoryRow[] {
  const pinnedSet = new Set(PINNED_BROKER_NAMES.map((name) => name.toLowerCase()));
  return [...rows].sort((a, b) => {
    const aPinned = pinnedSet.has(a.name.toLowerCase()) ? 0 : 1;
    const bPinned = pinnedSet.has(b.name.toLowerCase()) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return a.name.localeCompare(b.name);
  });
}
