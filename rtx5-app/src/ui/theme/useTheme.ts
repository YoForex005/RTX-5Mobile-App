/**
 * Global theming utility and design-system configuration: useTheme.
 */

import { useMemo } from 'react';
import { GDark, GLight, ThemeColors } from './glass';
import { useUserPreferences } from '../../state/userPreferences';

export type { ThemeColors };

/**
 * Returns the current theme color set based on user preference.
 * Reactively updates when the user toggles between light/dark.
 */
export function useTheme(): ThemeColors {
  const themeMode = useUserPreferences((s) => s.themeMode);
  return useMemo(() => (themeMode === 'light' ? GLight : GDark), [themeMode]);
}
