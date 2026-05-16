import type { Ionicons } from '@expo/vector-icons';

export type AboutActionId = 'rate-experience' | 'user-guide' | 'contact-developer';

export type AboutAction = {
  id: AboutActionId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type AboutContactCategory = {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type AboutExternalLinks = {
  androidPackageName: string;
  iosAppStoreId?: string | null;
  iosSearchTerm: string;
  userGuideUrl: string;
  privacyPolicyUrl: string;
  developerEmail: string;
};

export type AboutStoreTarget = {
  primaryUrl: string;
  fallbackUrl: string;
  storeLabel: string;
};

export type AboutDeveloperMailOptions = {
  appName: string;
  appVersion: string;
  platform: string;
  category: AboutContactCategory | null;
  requesterName?: string;
  requesterEmail?: string;
  title?: string;
  message?: string;
  developerEmail?: string;
};

export const ABOUT_EXTERNAL_LINKS: AboutExternalLinks = {
  androidPackageName: 'com.rtx5.app',
  iosSearchTerm: 'RTX5',
  userGuideUrl: 'https://rtx5.app/user-guide',
  privacyPolicyUrl: 'https://rtx5.app/privacy-policy',
  developerEmail: 'support@rtx5.app',
};

export const ABOUT_ACTIONS: AboutAction[] = [
  {
    id: 'rate-experience',
    title: 'Rate your experience',
    icon: 'star',
  },
  {
    id: 'user-guide',
    title: 'User guide',
    icon: 'book-outline',
  },
  {
    id: 'contact-developer',
    title: 'Contact Developer',
    icon: 'mail-outline',
  },
];

export const ABOUT_CONTACT_CATEGORIES: AboutContactCategory[] = [
  {
    id: 'bug-report',
    label: 'Bug Report',
    subtitle: 'Report broken UI, crashes, or unexpected behavior.',
    icon: 'bug-outline',
  },
  {
    id: 'feature-request',
    label: 'Feature Request',
    subtitle: 'Suggest a product improvement for a future release.',
    icon: 'bulb-outline',
  },
  {
    id: 'trading-account-problem',
    label: 'Trading Account Problem',
    subtitle: 'Login, account, order ticket, position, or access issue.',
    icon: 'flash-outline',
  },
  {
    id: 'other',
    label: 'Other',
    subtitle: 'Send another developer support request.',
    icon: 'ellipsis-horizontal-outline',
  },
];

export function formatAboutPlatform(platform: string): string {
  switch (platform) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'web':
      return 'Web preview';
    default:
      return platform ? platform.toUpperCase() : 'Native';
  }
}

export function resolveAboutBuildLabel({
  platform,
  appVersion,
  androidVersionCode,
  iosBuildNumber,
}: {
  platform: string;
  appVersion: string;
  androidVersionCode?: number | string | null;
  iosBuildNumber?: number | string | null;
}): string {
  const nativeBuild = platform === 'android'
    ? androidVersionCode
    : platform === 'ios'
      ? iosBuildNumber
      : null;
  const normalizedBuild = String(nativeBuild ?? '').trim() || appVersion.trim() || 'Local';

  return `Build ${normalizedBuild}`;
}

export function getAboutStoreTarget(
  platform: string,
  links: AboutExternalLinks = ABOUT_EXTERNAL_LINKS,
): AboutStoreTarget {
  if (platform === 'android') {
    return {
      primaryUrl: `market://details?id=${encodeURIComponent(links.androidPackageName)}`,
      fallbackUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(links.androidPackageName)}`,
      storeLabel: 'Google Play',
    };
  }

  const encodedSearchTerm = encodeURIComponent(links.iosSearchTerm);
  const iosAppStoreId = links.iosAppStoreId?.trim();
  if (platform === 'ios') {
    if (iosAppStoreId) {
      return {
        primaryUrl: `itms-apps://itunes.apple.com/app/id${encodeURIComponent(iosAppStoreId)}`,
        fallbackUrl: `https://apps.apple.com/app/id${encodeURIComponent(iosAppStoreId)}`,
        storeLabel: 'App Store',
      };
    }

    return {
      primaryUrl: `itms-apps://itunes.apple.com/search?term=${encodedSearchTerm}&entity=software`,
      fallbackUrl: `https://apps.apple.com/us/search?term=${encodedSearchTerm}`,
      storeLabel: 'App Store',
    };
  }

  return {
    primaryUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(links.androidPackageName)}`,
    fallbackUrl: `https://apps.apple.com/us/search?term=${encodedSearchTerm}`,
    storeLabel: 'App store',
  };
}

export function buildDeveloperMailto({
  appName,
  appVersion,
  platform,
  category,
  requesterName,
  requesterEmail,
  title,
  message,
  developerEmail = ABOUT_EXTERNAL_LINKS.developerEmail,
}: AboutDeveloperMailOptions): string {
  const categoryLabel = category?.label ?? 'Unselected category';
  const trimmedTitle = title?.trim();
  const subject = trimmedTitle || `[${appName}] ${categoryLabel}`;
  const bodyLines = [
    `App: ${appName}`,
    `Version: ${appVersion}`,
    `Platform: ${platform}`,
    `Category: ${categoryLabel}`,
    `Name: ${requesterName?.trim() || 'Not provided'}`,
    `Email: ${requesterEmail?.trim() || 'Not provided'}`,
    `Title: ${trimmedTitle || 'Not provided'}`,
    '',
    message?.trim() || 'Describe the issue or feedback here.',
  ];

  return `mailto:${developerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
