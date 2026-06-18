import { useEffect } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { logStartupDiagnostic, logStartupError } from './startupDiagnostics';

const OTA_CHECK_DELAY_MS = 1500;
const EAS_UPDATE_CHANNELS = new Set(['preview', 'staging', 'production']);
const DISABLE_OTA_UPDATES = process.env.EXPO_PUBLIC_DISABLE_OTA_UPDATES === 'true';

const getActiveUpdateChannel = () => Updates.channel ?? process.env.EXPO_PUBLIC_APP_ENV ?? null;

const canUseOtaUpdates = () =>
  Platform.OS !== 'web' &&
  (typeof __DEV__ === 'undefined' || !__DEV__) &&
  !DISABLE_OTA_UPDATES &&
  Updates.isEnabled &&
  Boolean(Updates.runtimeVersion) &&
  EAS_UPDATE_CHANNELS.has(getActiveUpdateChannel() ?? '');

const promptToInstallUpdate = () => {
  Alert.alert(
    'Update available',
    'Install the latest version now?',
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Install latest version',
        onPress: () => {
          void Updates.reloadAsync();
        },
      },
    ],
  );
};

export function useOtaUpdateOnLaunch() {
  useEffect(() => {
    const canCheckForUpdates = canUseOtaUpdates();
    logStartupDiagnostic('updates.launch', {
      canCheckForUpdates,
      disabledByEnv: DISABLE_OTA_UPDATES,
      activeChannel: getActiveUpdateChannel(),
    });
    if (!canCheckForUpdates) return;

    let isCancelled = false;

    const timeout = setTimeout(() => {
      if (AppState.currentState !== 'active') {
        logStartupDiagnostic('updates.check.skipped', { appState: AppState.currentState });
        return;
      }

      void (async () => {
        try {
          logStartupDiagnostic('updates.check.started');
          const checkResult = await Updates.checkForUpdateAsync();
          logStartupDiagnostic('updates.check.finished', {
            isAvailable: checkResult.isAvailable,
            manifest: checkResult.isAvailable ? checkResult.manifest?.id ?? null : null,
          });
          if (isCancelled || !checkResult.isAvailable) return;

          const fetchResult = await Updates.fetchUpdateAsync();
          logStartupDiagnostic('updates.fetch.finished', {
            isNew: fetchResult.isNew,
            manifest: fetchResult.manifest?.id ?? null,
          });
          if (!isCancelled && fetchResult.isNew) {
            promptToInstallUpdate();
          }
        } catch (error) {
          logStartupError('updates.check.failed', error);
        }
      })();
    }, OTA_CHECK_DELAY_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, []);
}
