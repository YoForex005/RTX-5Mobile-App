const appJson = require('./app.json');

const TRUE_VALUES = new Set(['1', 'true', 'yes']);

const isNativeOtaDisabled = TRUE_VALUES.has(
  String(process.env.EXPO_PUBLIC_DISABLE_OTA_UPDATES ?? '').trim().toLowerCase()
);

module.exports = ({ config }) => {
  const expoConfig = {
    ...config,
    ...appJson.expo,
    extra: {
      ...(config.extra ?? {}),
      ...(appJson.expo.extra ?? {}),
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
