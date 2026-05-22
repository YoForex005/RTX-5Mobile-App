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

      // Default to TLS-only traffic. The test broker directory currently
      // includes one HTTP-only broker backend, so allow cleartext only for
      // that explicit host instead of weakening the whole app.
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">69.197.178.27</domain>
    </domain-config>
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
