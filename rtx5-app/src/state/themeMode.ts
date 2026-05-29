import { NavigationContext, NavigationRouteContext } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
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

function useNavigationFocusState(): boolean {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const [isFocused, setIsFocused] = useState(() => !navigation || !route || navigation.isFocused());

  useEffect(() => {
    if (!navigation || !route) {
      setIsFocused(true);
      return undefined;
    }

    setIsFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', () => setIsFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setIsFocused(false));

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation, route]);

  return isFocused;
}

export function useThemeMode(): ThemeMode {
  const isFocused = useNavigationFocusState();
  const isFocusedRef = useRef(isFocused);
  const frozenThemeModeRef = useRef(useThemeModeState.getState().themeMode);

  isFocusedRef.current = isFocused;

  const themeMode = useThemeModeState(useCallback(
    (state) => (isFocusedRef.current ? state.themeMode : frozenThemeModeRef.current),
    [],
  ));
  frozenThemeModeRef.current = themeMode;

  return themeMode;
}

export function useIsDarkTheme(): boolean {
  return useThemeMode() === 'dark';
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
