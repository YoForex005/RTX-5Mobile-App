import { useIsFocused } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import React from 'react';
import { StyleSheet, type GestureResponderEvent, View } from 'react-native';
import { RegisterHandoffPreview } from '../src/features/settings/RegisterHandoffPreview';
import { subscribeRegisterScreenReady } from '../src/features/settings/registerHandoffState';
import { getPreloadedRegisterScreen, preloadRegisterScreen } from '../src/features/settings/registerScreenPreload';
import { safeRouterBack } from '../src/utils/navigation';

type RegisterScreenComponent = React.ComponentType;

const REGISTER_ENTRY_FORM_IMPORT_DELAY_MS = 0;
const REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS = 0;
const REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS = 3200;
const REGISTER_BACK_FALLBACK_HREF = '/(tabs)/settings';

export default function RegisterEntryScreen() {
  const isScreenFocused = useIsFocused();
  const [RegisterScreen, setRegisterScreen] = React.useState<RegisterScreenComponent | null>(null);
  const [previewVisible, setPreviewVisible] = React.useState(true);
  const loadRegisterTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const loadCancelledRef = React.useRef(false);
  const registerScreenLoadedRef = React.useRef(false);
  const backNavigationStartedRef = React.useRef(false);

  const clearHandoffTimers = React.useCallback(() => {
    if (loadRegisterTimerRef.current) {
      clearTimeout(loadRegisterTimerRef.current);
      loadRegisterTimerRef.current = null;
    }
    if (readyHideTimerRef.current) {
      clearTimeout(readyHideTimerRef.current);
      readyHideTimerRef.current = null;
    }
    if (fallbackHideTimerRef.current) {
      clearTimeout(fallbackHideTimerRef.current);
      fallbackHideTimerRef.current = null;
    }
    if (readyUnsubscribeRef.current) {
      readyUnsubscribeRef.current();
      readyUnsubscribeRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!isScreenFocused) {
      return undefined;
    }

    loadCancelledRef.current = false;
    backNavigationStartedRef.current = false;
    setPreviewVisible(true);

    readyUnsubscribeRef.current = subscribeRegisterScreenReady(() => {
      if (fallbackHideTimerRef.current) {
        clearTimeout(fallbackHideTimerRef.current);
        fallbackHideTimerRef.current = null;
      }
      if (readyHideTimerRef.current) {
        clearTimeout(readyHideTimerRef.current);
      }
      readyHideTimerRef.current = setTimeout(() => {
        readyHideTimerRef.current = null;
        if (readyUnsubscribeRef.current) {
          readyUnsubscribeRef.current();
          readyUnsubscribeRef.current = null;
        }
        setPreviewVisible(false);
      }, REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS);
    });

    const preloadedScreen = getPreloadedRegisterScreen();
    if (preloadedScreen) {
      registerScreenLoadedRef.current = true;
      setRegisterScreen(() => preloadedScreen);
    } else {
      loadRegisterTimerRef.current = setTimeout(() => {
        loadRegisterTimerRef.current = null;
        void preloadRegisterScreen().then((screenComponent) => {
          if (!loadCancelledRef.current) {
            registerScreenLoadedRef.current = true;
            setRegisterScreen(() => screenComponent);
          }
        });
      }, REGISTER_ENTRY_FORM_IMPORT_DELAY_MS);
    }

    fallbackHideTimerRef.current = setTimeout(() => {
      fallbackHideTimerRef.current = null;
      if (readyUnsubscribeRef.current) {
        readyUnsubscribeRef.current();
        readyUnsubscribeRef.current = null;
      }
      if (registerScreenLoadedRef.current) {
        setPreviewVisible(false);
      }
    }, REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS);

    return () => {
      loadCancelledRef.current = true;
      clearHandoffTimers();
    };
  }, [clearHandoffTimers, isScreenFocused]);

  const handleBack = React.useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (backNavigationStartedRef.current) {
      return;
    }

    backNavigationStartedRef.current = true;
    loadCancelledRef.current = true;
    clearHandoffTimers();
    safeRouterBack(router, REGISTER_BACK_FALLBACK_HREF);
  }, [clearHandoffTimers]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        {RegisterScreen ? <RegisterScreen /> : null}
        {previewVisible ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <RegisterHandoffPreview
              onBack={handleBack}
              backLatencyLabel="register.entry.back"
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
});
