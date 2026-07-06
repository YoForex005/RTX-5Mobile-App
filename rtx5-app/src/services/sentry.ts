import Constants from 'expo-constants';
import type { ErrorInfo } from 'react';
import * as Sentry from '@sentry/react-native';

type SentryExpoExtra = {
  sentryDsn?: unknown;
};

const expoExtra = Constants.expoConfig?.extra as SentryExpoExtra | undefined;

const resolveSentryDsn = () => {
  const value = process.env.EXPO_PUBLIC_SENTRY_DSN ?? expoExtra?.sentryDsn;
  return typeof value === 'string' ? value.trim() : '';
};

const sentryDsn = resolveSentryDsn();

export const isSentryEnabled = sentryDsn.length > 0;

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: isSentryEnabled,
  enableLogs: false,
  enableAutoConsoleLogs: false,
  maxBreadcrumbs: 0,
  sendDefaultPii: false,
});

export const wrapWithSentry = Sentry.wrap;

export const captureErrorBoundaryException = (error: Error, errorInfo: ErrorInfo) => {
  if (!isSentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setContext('react', {
      componentStack: errorInfo.componentStack ?? null,
    });
    Sentry.captureException(error);
  });
};
