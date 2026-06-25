const appJson = require('./app.json');

const TRUE_VALUES = new Set(['1', 'true', 'yes']);

const isNativeOtaDisabled = TRUE_VALUES.has(
  String(process.env.EXPO_PUBLIC_DISABLE_OTA_UPDATES ?? '').trim().toLowerCase()
);
const forcedExpoVersion = String(process.env.RTX5_FORCE_EXPO_VERSION ?? '').trim();
const forcedRuntimeVersion = String(process.env.RTX5_FORCE_RUNTIME_VERSION ?? '').trim();

module.exports = ({ config }) => {
  const expoConfig = {
    ...config,
    ...appJson.expo,
    ...(forcedExpoVersion ? { version: forcedExpoVersion } : {}),
    ...(forcedRuntimeVersion ? { runtimeVersion: forcedRuntimeVersion } : {}),
    extra: {
      ...(config.extra ?? {}),
      ...(appJson.expo.extra ?? {}),
      sentryDsn:
        process.env.EXPO_PUBLIC_SENTRY_DSN ??
        config.extra?.sentryDsn ??
        appJson.expo.extra?.sentryDsn ??
        '',
    },
  };

  if (!isNativeOtaDisabled) {
    return expoConfig;
  }

  return {
    ...expoConfig,
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
  };
};
