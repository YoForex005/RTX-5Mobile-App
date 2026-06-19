export const APP_DISPLAY_VERSION = '1.1.10';

export function resolveAppDisplayVersion(fallbackVersion?: string | null): string {
  const displayVersion = APP_DISPLAY_VERSION.trim();
  if (displayVersion) {
    return displayVersion;
  }

  return fallbackVersion?.trim() || 'Local';
}
