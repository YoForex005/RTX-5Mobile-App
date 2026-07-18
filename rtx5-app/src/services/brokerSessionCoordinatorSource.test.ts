import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/services/brokerSessionCoordinator.ts'),
  'utf8',
);

test('session coordinator carries approved services-domain provenance through commit and restore', () => {
  assert.match(source, /const manifest = createActiveBrokerSessionManifest\(input\.session\)/);
  assert.match(source, /servicesDomain: manifest\.servicesDomain/);
  assert.match(source, /await writeActiveBrokerSessionManifest\(input\.session\)/);
  assert.match(source, /manifest = await readActiveBrokerSessionManifest\(\)/);
  assert.match(source, /activateBrokerSession\(transition, manifest/);
});

test('secure restore failures advance the epoch and stay logged out', () => {
  const failClosedBody = source.slice(
    source.indexOf('const failClosed = async'),
    source.indexOf('const commitBrokerSessionInternal'),
  );
  assert.match(failClosedBody, /beginActiveBrokerSessionTransition\(\)/);
  assert.match(failClosedBody, /await teardownBrokerSessionRuntime\(\)/);
  assert.match(failClosedBody, /useUserPreferences\.getState\(\)\.logout\(\)/);
  assert.match(failClosedBody, /Promise\.allSettled/);
  assert.match(source, /catch \{\s*return failClosed\('Stored broker session manifest could not be read securely\.'/);
  assert.match(source, /catch \{\s*return failClosed\('Stored broker credentials could not be read securely\.'/);
});

test('interactive session commits are authorized at queued coordinator execution time', () => {
  assert.match(source, /export const authorizeBrokerSessionCommit = \(\): BrokerSessionCommitAuthorization =>[\s\S]*getActiveBrokerSessionEpoch\(\)/);
  const commitStart = source.indexOf('export const commitBrokerSession =');
  const restoreStart = source.indexOf('export const restoreBrokerSession =', commitStart);
  const commitBody = source.slice(commitStart, restoreStart);

  assert.match(commitBody, /authorization: BrokerSessionCommitAuthorization/);
  assert.match(commitBody, /enqueueMutation\(\(\) => \{/);
  assert.match(commitBody, /consumeBrokerSessionCommitAuthorization\([\s\S]*authorization,[\s\S]*getActiveBrokerSessionEpoch\(\),[\s\S]*\)/);
  assert.ok(
    commitBody.indexOf('consumeBrokerSessionCommitAuthorization') < commitBody.indexOf('commitBrokerSessionInternal'),
    'authorization must be consumed before the queued session mutation starts',
  );
});
