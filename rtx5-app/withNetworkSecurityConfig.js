const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurityConfig = (config) => {
  // 1. Point the manifest to the XML
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    // Remove the global usesCleartextTraffic if it exists to ensure strict security
    if (mainApplication.$['android:usesCleartextTraffic'] !== undefined) {
      delete mainApplication.$['android:usesCleartextTraffic'];
    }

    return config;
  });

  // 2. Create the XML file in Android app/src/main/res/xml
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resPath = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      const filePath = path.join(resPath, 'network_security_config.xml');

      // All backend traffic is TLS (https://backend.orrnn.com, wss://backend.orrnn.com).
      // Deny cleartext globally so a misconfigured URL can't silently downgrade to http/ws
      // on release APKs. Matches Android's API 28+ default but declares it explicitly.
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
`;

      if (!fs.existsSync(resPath)) {
        fs.mkdirSync(resPath, { recursive: true });
      }
      fs.writeFileSync(filePath, xmlContent);
      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;
