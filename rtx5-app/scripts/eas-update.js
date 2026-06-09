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
const updateArgs = ["update", "--channel", channel, "--platform", "all", ...process.argv.slice(3)];
const env = {
  ...process.env,
  CI: process.env.CI || "1",
};

const quoteWindowsShellArg = (value) => {
  const arg = String(value);
  if (!arg) return '""';
  if (!/[\s&()<>^|"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
};

const result =
  process.platform === "win32"
    ? spawnSync([easBin, ...updateArgs].map(quoteWindowsShellArg).join(" "), {
        env,
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(easBin, updateArgs, {
        env,
        stdio: "inherit",
      });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
