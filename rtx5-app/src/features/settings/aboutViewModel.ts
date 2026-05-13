import type { Ionicons } from '@expo/vector-icons';

export type AboutFilter = 'All' | 'Platform' | 'Trading' | 'Personalization' | 'Release';
export type AboutCapabilityCategory = Exclude<AboutFilter, 'All'>;
export type AboutCapabilityStatus = 'Active' | 'Guarded' | 'Local';

export type AboutMetric = {
  label: string;
  value: string;
};

export type AboutCapability = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: AboutCapabilityCategory;
  status: AboutCapabilityStatus;
  owner: string;
  proof: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type AboutSummary = {
  capabilityCount: number;
  guardedCount: number;
  localCount: number;
  releaseLabel: string;
};

export type ReleaseGuardrail = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const ABOUT_FILTERS: AboutFilter[] = ['All', 'Platform', 'Trading', 'Personalization', 'Release'];

export function buildAboutMetrics(appVersion: string): AboutMetric[] {
  return [
    { label: 'Version', value: appVersion },
    { label: 'Runtime', value: 'Gated' },
    { label: 'Updates', value: 'EAS' },
    { label: 'Scope', value: 'Frontend' },
  ];
}

export const ABOUT_CAPABILITIES: AboutCapability[] = [
  {
    id: 'expo-client',
    title: 'Expo Dev Client Experience',
    summary: 'Native iOS and Android trading terminal built through Expo Dev Client.',
    body: 'RTX5 ships as a React Native trading terminal through Expo with native iOS and Android targets.',
    category: 'Platform',
    status: 'Active',
    owner: 'Mobile platform',
    proof: 'Expo Dev Client',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'frontend-only',
    title: 'Frontend-only Trading App',
    summary: 'Typed API and WebSocket contracts are consumed without implementing backend trading services.',
    body: 'The app consumes typed API and WebSocket contracts without implementing backend trading services.',
    category: 'Trading',
    status: 'Guarded',
    owner: 'Trading shell',
    proof: 'No backend service changes',
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'local-preferences',
    title: 'Device-local Personalization',
    summary: 'Watchlists, chart state, drawings, terms acceptance, and filters stay on this device.',
    body: 'Watchlists, chart preferences, drawings, terms acceptance, and filters remain stored on this device.',
    category: 'Personalization',
    status: 'Local',
    owner: 'User preferences',
    proof: 'Versioned local state',
    icon: 'save-outline',
  },
  {
    id: 'ota-release',
    title: 'Staged OTA Release Model',
    summary: 'Preview, staging, and production channels remain separated by runtime compatibility gates.',
    body: 'Preview, staging, and production update channels are protected by runtime compatibility gates.',
    category: 'Release',
    status: 'Guarded',
    owner: 'Release operations',
    proof: 'EAS channel gating',
    icon: 'git-branch-outline',
  },
];

export const RELEASE_GUARDRAILS: ReleaseGuardrail[] = [
  {
    label: 'No backend service changes',
    value: 'Mobile releases do not add or replace server-side trading systems.',
    icon: 'server-outline',
  },
  {
    label: 'No-logo chart policy',
    value: 'Chart UI must remain free of third-party logo presentation.',
    icon: 'eye-off-outline',
  },
  {
    label: 'Runtime channel safety',
    value: 'OTA updates remain separated by preview, staging, and production channels.',
    icon: 'shield-checkmark-outline',
  },
];

export function buildAboutSummary(capabilities: AboutCapability[] = ABOUT_CAPABILITIES): AboutSummary {
  return {
    capabilityCount: capabilities.length,
    guardedCount: capabilities.filter((capability) => capability.status === 'Guarded').length,
    localCount: capabilities.filter((capability) => capability.status === 'Local').length,
    releaseLabel: 'EAS',
  };
}

export function filterAboutCapabilities(
  capabilities: AboutCapability[],
  filter: AboutFilter,
  query: string,
): AboutCapability[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCapabilities = filter === 'All'
    ? capabilities
    : capabilities.filter((capability) => capability.category === filter);

  if (!normalizedQuery) return filteredCapabilities;

  return filteredCapabilities.filter((capability) => {
    const searchableText = [
      capability.title,
      capability.summary,
      capability.body,
      capability.category,
      capability.status,
      capability.owner,
      capability.proof,
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getAboutCapabilityCountByCategory(category: AboutCapabilityCategory): number {
  return ABOUT_CAPABILITIES.filter((capability) => capability.category === category).length;
}
