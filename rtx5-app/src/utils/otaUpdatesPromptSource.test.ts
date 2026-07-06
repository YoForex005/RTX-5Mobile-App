import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const otaSource = readFileSync(resolve(currentDir, 'otaUpdates.ts'), 'utf8');
const modalSource = readFileSync(
  resolve(currentDir, '../ui/components/OtaUpdateModal.tsx'),
  'utf8',
);

test('ota update prompt waits for user install and exposes download progress', () => {
  assert.match(otaSource, /Updates\.useUpdates\(\)/);
  assert.match(otaSource, /Platform\.OS !== 'web'/);
  assert.doesNotMatch(otaSource, /Platform\.OS === 'ios'/);
  assert.match(otaSource, /downloadProgress/);
  assert.match(otaSource, /checkForUpdateAsync/);
  assert.match(otaSource, /fetchUpdateAsync/);
  assert.doesNotMatch(otaSource, /Alert\.alert/);
  assert.match(modalSource, /Install latest version/);
  assert.match(modalSource, /Update \$\{targetVersion\} available/);
  assert.match(modalSource, /progressPercent/);
});
