import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_DISPLAY_VERSION, resolveAppDisplayVersion } from './appDisplayVersion';

test('app display version is the OTA-visible app version', () => {
  assert.equal(APP_DISPLAY_VERSION, '1.1.9');
  assert.equal(resolveAppDisplayVersion('1.1.7'), '1.1.9');
  assert.equal(resolveAppDisplayVersion(''), '1.1.9');
});
