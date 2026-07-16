import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { ThemeMode } from './userPreferences/types';

type ThemeModeState = {
  themeMode: ThemeMode;
  setImmediateThemeMode: (mode: ThemeMode) => void;
};

type ImmediateThemeVisualApplier = (mode: ThemeMode) => void;

const immediateThemeVisualAppliers = new Set<ImmediateThemeVisualApplier>();

export const useThemeModeState = create<ThemeModeState>()((set) => ({
  themeMode: 'dark',
  setImmediateThemeMode: (mode) =>
    set((state) => (state.themeMode === mode ? state : { themeMode: mode })),
}));

export function registerImmediateThemeVisualApplier(applier: ImmediateThemeVisualApplier) {
  immediateThemeVisualAppliers.add(applier);
  return () => {
    immediateThemeVisualAppliers.delete(applier);
  };
}

export function applyImmediateThemeVisuals(mode: ThemeMode) {
  immediateThemeVisualAppliers.forEach((applier) => {
    try {
      applier(mode);
    } catch (error) {
      console.warn('[ThemeMode] Failed to apply an immediate theme visual', error);
    }
  });
}

export function setImmediateThemeMode(mode: ThemeMode) {
  if (useThemeModeState.getState().themeMode === mode) {
    return;
  }
  // Imperative surfaces such as the retained chart WebView must repaint in
  // the press turn, before React reconciles the lightweight theme store.
  applyImmediateThemeVisuals(mode);
  useThemeModeState.getState().setImmediateThemeMode(mode);
}

/**
 * When false, the hook freezes on the last mode it observed so pre-mounted
 * hosts that opt out do not rebuild on every theme tap. Default is live so
 * every normal screen flips in the same toggle turn.
 */
export type UseThemeModeOptions = {
  active?: boolean;
};

/**
 * App-wide live theme by default.
 *
 * Hidden retained hosts may pass `{ active: false }` to skip theme-tap
 * re-renders while off-screen. When they become active again the selector
 * identity changes and they re-read the live store immediately.
 */
export function useThemeMode(options?: UseThemeModeOptions): ThemeMode {
  // Only explicit active:false freezes. Navigation blur must NOT freeze —
  // retained tabs (Quotes/Trade/Settings/etc.) should adopt the new palette
  // in the same turn as the toggle so open/navigate never shows a stale theme.
  const active = options?.active !== false;
  const frozenThemeModeRef = useRef(useThemeModeState.getState().themeMode);

  const themeMode = useThemeModeState(
    useCallback(
      (state) => (active ? state.themeMode : frozenThemeModeRef.current),
      [active],
    ),
  );

  if (active) {
    frozenThemeModeRef.current = themeMode;
    return themeMode;
  }

  return frozenThemeModeRef.current;
}

export function useIsDarkTheme(options?: UseThemeModeOptions): boolean {
  return useThemeMode(options) === 'dark';
}

export function useDeferredThemeMode(delayMs = 750): ThemeMode {
  const [themeMode, setThemeMode] = useState(() => useThemeModeState.getState().themeMode);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPendingTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const unsubscribe = useThemeModeState.subscribe((state, previousState) => {
      if (state.themeMode === previousState.themeMode) {
        return;
      }

      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setThemeMode(state.themeMode);
      }, delayMs);
    });

    return () => {
      clearPendingTimer();
      unsubscribe();
    };
  }, [delayMs]);

  return themeMode;
}
