const { spawn, spawnSync } = require('child_process');
const path = require('path');
const {
  buildAndroidEnv,
  formatDoctorReport,
  inspectAndroidEnv,
} = require('./androidEnv');

const projectRoot = path.resolve(__dirname, '..', '..');
const state = inspectAndroidEnv(projectRoot);

if (state.issues.length) {
  console.error(formatDoctorReport(state));
  console.error('\nAndroid environment is not ready for USB dev-client startup.');
  process.exit(1);
}

const env = buildAndroidEnv(process.env, state);

if (state.tools.adb) {
  const reverseResult = spawnSync(
    state.tools.adb,
    ['reverse', 'tcp:8081', 'tcp:8081'],
    {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    },
  );

  if (reverseResult.status !== 0) {
    console.warn('\n[android:usb] `adb reverse tcp:8081 tcp:8081` failed. Metro may fall back to LAN and Fast Refresh can become unreliable.');
  }
}

const expoArgs = ['expo', 'start', '--dev-client', '--localhost', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(command, expoArgs, {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start Expo USB dev-client session: ${error.message}`);
  process.exit(1);
});
