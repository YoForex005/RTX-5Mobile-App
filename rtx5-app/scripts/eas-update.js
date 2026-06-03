#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const CHANNELS = new Set(["preview", "staging", "production"]);
const channelArg = process.argv[2];
const channel = channelArg === "prod" ? "production" : channelArg;

if (!CHANNELS.has(channel)) {
  console.error("Usage: node ./scripts/eas-update.js <preview|staging|production> [eas update flags]");
  process.exit(1);
}

const easBin = process.platform === "win32" ? "eas.cmd" : "eas";
const env = {
  ...process.env,
  CI: process.env.CI || "1",
  EAS_SKIP_AUTO_FINGERPRINT: process.env.EAS_SKIP_AUTO_FINGERPRINT || "1",
};

const result = spawnSync(
  easBin,
  ["update", "--channel", channel, "--platform", "all", ...process.argv.slice(3)],
  {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
