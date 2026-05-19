import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

const OTA_CHECK_DELAY_MS = 1500;
const EAS_UPDATE_CHANNELS = new Set(['preview', 'staging', 'production']);

const getActiveUpdateChannel = () => Updates.channel ?? process.env.EXPO_PUBLIC_APP_ENV ?? null;

const canUseOtaUpdates = () =>
  Platform.OS !== 'web' &&
  (typeof __DEV__ === 'undefined' || !__DEV__) &&
  Updates.isEnabled &&
  Boolean(Updates.runtimeVersion) &&
  EAS_UPDATE_CHANNELS.has(getActiveUpdateChannel() ?? '');

export function useOtaUpdateOnLaunch() {
  useEffect(() => {
    if (!canUseOtaUpdates()) return;

    let isCancelled = false;

    const timeout = setTimeout(() => {
      if (AppState.currentState !== 'active') return;

      void (async () => {
        try {
          const checkResult = await Updates.checkForUpdateAsync();
          if (isCancelled || !checkResult.isAvailable) return;

          const fetchResult = await Updates.fetchUpdateAsync();
          if (isCancelled || !fetchResult.isNew) return;

          await Updates.reloadAsync();
        } catch (error) {
          if (__DEV__) {
            console.warn('[OTA] Update check failed:', error);
          }
        }
      })();
    }, OTA_CHECK_DELAY_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, []);
}
