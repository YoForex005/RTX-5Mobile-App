import { create } from 'zustand';
import type { ThemeMode } from './userPreferences/types';

type ThemeModeState = {
  themeMode: ThemeMode;
  setImmediateThemeMode: (mode: ThemeMode) => void;
};

export const useThemeModeState = create<ThemeModeState>()((set) => ({
  themeMode: 'dark',
  setImmediateThemeMode: (mode) =>
    set((state) => (state.themeMode === mode ? state : { themeMode: mode })),
}));

export function setImmediateThemeMode(mode: ThemeMode) {
  useThemeModeState.getState().setImmediateThemeMode(mode);
}

export function useThemeMode(): ThemeMode {
  return useThemeModeState((state) => state.themeMode);
}

export function useIsDarkTheme(): boolean {
  return useThemeModeState((state) => state.themeMode === 'dark');
}
