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
const extraArgs = process.argv.slice(2);

function hasExplicitHostArg(args) {
  return args.includes('--localhost')
    || args.includes('--lan')
    || args.includes('--tunnel')
    || args.includes('--offline')
    || args.includes('--host');
}

let reverseSucceeded = false;

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

  reverseSucceeded = reverseResult.status === 0;

  if (!reverseSucceeded) {
    console.warn('\n[android:usb] `adb reverse tcp:8081 tcp:8081` failed. Falling back to LAN host mode so asset/font requests do not target 127.0.0.1 on the device.');
  }
}

const hostArg = hasExplicitHostArg(extraArgs)
  ? null
  : reverseSucceeded
    ? '--localhost'
    : '--lan';

const expoArgs = ['expo', 'start', '--dev-client'];

if (hostArg) {
  expoArgs.push(hostArg);
}

expoArgs.push(...extraArgs);
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
