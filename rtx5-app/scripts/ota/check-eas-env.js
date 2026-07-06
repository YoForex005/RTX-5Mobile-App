#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const environment = process.argv[2] || process.env.EAS_ENVIRONMENT || process.env.EXPO_PUBLIC_APP_ENV || '';
const allowed = new Set(['preview', 'staging', 'production']);

if (!allowed.has(environment)) {
  console.error('Usage: node ./scripts/ota/check-eas-env.js <preview|staging|production>');
  process.exit(1);
}

const requiredNames = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL',
  'EXPO_PUBLIC_DEMO_API_BASE_URL',
  'EXPO_PUBLIC_FEED_BROKER_TOKEN',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
];

const quoteWindowsArg = (value) => {
  const arg = String(value);
  if (!arg) return '""';
  if (!/[\s&()<>^|"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
};

const commandArgs = ['npx', '--yes', 'eas-cli@latest', 'env:list', '--environment', environment];
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', commandArgs.map(quoteWindowsArg).join(' ')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  : spawnSync('npx', commandArgs.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const output = result.stdout || '';
const present = new Set();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (match) {
    present.add(match[1]);
  }
}

const missing = requiredNames.filter((name) => !present.has(name));
if (missing.length > 0) {
  console.error(`[OTA env] ${environment} EAS environment is missing required public variables:`);
  missing.forEach((name) => console.error(`- ${name}`));
  console.error('Do not publish OTA for this channel until the EAS environment matches the app config.');
  process.exit(2);
}

console.log(`[OTA env] ${environment} contains required public env names: ${requiredNames.join(', ')}`);
