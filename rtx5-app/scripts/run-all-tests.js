const { existsSync, readdirSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = process.cwd();
const TEST_ROOTS = ['src', 'tests'];
const BATCH_SIZE = 24;

const collectTests = (directory, output) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTests(absolutePath, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      output.push(relative(PROJECT_ROOT, absolutePath));
    }
  }
};

const testFiles = [];
for (const root of TEST_ROOTS) {
  collectTests(join(PROJECT_ROOT, root), testFiles);
}
testFiles.sort();

if (testFiles.length === 0) {
  console.error('No TypeScript tests were found.');
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npmExecPath = process.env.npm_execpath;
const npxCliPath = npmExecPath ? join(dirname(npmExecPath), 'npx-cli.js') : '';
const useNpxCli = process.platform === 'win32' && Boolean(npxCliPath) && existsSync(npxCliPath);
let failed = false;

for (let start = 0; start < testFiles.length; start += BATCH_SIZE) {
  const batch = testFiles.slice(start, start + BATCH_SIZE);
  const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
  const batchCount = Math.ceil(testFiles.length / BATCH_SIZE);
  console.log(`Running test batch ${batchNumber}/${batchCount} (${batch.length} files)`);

  const result = spawnSync(
    useNpxCli ? process.execPath : npxCommand,
    [...(useNpxCli ? [npxCliPath] : []), '--yes', 'tsx', '--test', ...batch],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    console.error(`Test batch ${batchNumber} could not start:`, result.error.message);
    failed = true;
    continue;
  }
  if (result.status !== 0) {
    if (result.stdout) {
      const failureSummary = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('✖ ') || line.startsWith('test at '));
      console.error(`Test batch ${batchNumber}/${batchCount} failed:`);
      console.error(failureSummary.length > 0 ? failureSummary.join('\n') : result.stdout);
    }
    if (result.stderr) process.stderr.write(result.stderr);
    failed = true;
  } else {
    console.log(`Test batch ${batchNumber}/${batchCount} passed.`);
  }
}

if (failed) {
  console.error('One or more test batches failed.');
  process.exit(1);
}

console.log(`All ${testFiles.length} test files passed.`);
