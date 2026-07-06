#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const CHANNELS = new Set(["preview", "staging", "production"]);
const channelArg = process.argv[2];
const channel = channelArg === "prod" ? "production" : channelArg;

if (!CHANNELS.has(channel)) {
  console.error("Usage: node ./scripts/eas-update.js <preview|staging|production> [eas update flags]");
  process.exit(1);
}

const easBin = process.platform === "win32" ? "eas.cmd" : "eas";
const updateArgs = ["update", "--channel", channel, "--environment", channel, "--platform", "all"];

updateArgs.push(...process.argv.slice(3));
const env = {
  ...process.env,
  CI: process.env.CI || "1",
};

const runNodeScript = (scriptPath, scriptArgs = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
};

const otaScriptsDir = path.join(__dirname, "ota");
runNodeScript(path.join(otaScriptsDir, "check-eas-env.js"), [channel]);
runNodeScript(path.join(otaScriptsDir, "print-update-context.js"), ["--channel", channel]);

if (channel === "production" || process.env.RTX5_OTA_BASE_REF) {
  runNodeScript(path.join(otaScriptsDir, "check-ota-safety.js"));
} else {
  console.warn(
    "[OTA safety] Skipped native-change comparison for non-production update because RTX5_OTA_BASE_REF is not set.",
  );
}

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
