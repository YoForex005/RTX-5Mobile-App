import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { serializeStartupError } from './errorSerialization';

export { serializeStartupError } from './errorSerialization';

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

type GlobalWithReactNativeHandlers = typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike;
  onunhandledrejection?: ((event: unknown) => void) | null;
};

let globalHandlersInstalled = false;

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const getStartupDiagnostics = () => ({
  platform: Platform.OS,
  appVersion: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null,
  nativeBuildVersion: Constants.nativeBuildVersion ?? null,
  runtimeVersion: Updates.runtimeVersion ?? null,
  channel: Updates.channel ?? null,
  updateId: Updates.updateId ?? null,
  isEnabled: Updates.isEnabled,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  createdAt: toIsoString(Updates.createdAt),
  emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
});

export function logStartupDiagnostic(event: string, details: Record<string, unknown> = {}) {
  console.info(`[Startup] ${event}`, {
    ...getStartupDiagnostics(),
    ...details,
  });
}

export function logStartupError(
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  console.error(`[Startup] ${event}`, {
    ...getStartupDiagnostics(),
    ...details,
    error: serializeStartupError(error),
  });
}

export function installGlobalStartupErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  const globalRef = globalThis as GlobalWithReactNativeHandlers;
  const previousGlobalHandler = globalRef.ErrorUtils?.getGlobalHandler?.();
  globalRef.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    logStartupError('global-js-error', error, { isFatal: Boolean(isFatal) });
    previousGlobalHandler?.(error, isFatal);
  });

  const previousUnhandledRejection = globalRef.onunhandledrejection;
  globalRef.onunhandledrejection = (event: unknown) => {
    const reason = event && typeof event === 'object' && 'reason' in event
      ? (event as { reason?: unknown }).reason
      : event;
    logStartupError('unhandled-promise-rejection', reason);
    previousUnhandledRejection?.(event);
  };
}
