import assert from 'node:assert/strict';
import test from 'node:test';

import { installSecurityRedactedConsole } from './securityRedactedConsole';

test('global console defense redacts every method and installs once', () => {
  const calls: Record<string, unknown[][]> = {
    debug: [], error: [], info: [], log: [], warn: [],
  };
  const target = {
    debug: (...args: unknown[]) => calls.debug.push(args),
    error: (...args: unknown[]) => calls.error.push(args),
    info: (...args: unknown[]) => calls.info.push(args),
    log: (...args: unknown[]) => calls.log.push(args),
    warn: (...args: unknown[]) => calls.warn.push(args),
  };

  installSecurityRedactedConsole(target);
  installSecurityRedactedConsole(target);
  target.error('Authorization: Bearer secret-access', { token: 'secret-feed' });

  assert.equal(calls.error.length, 1);
  const serialized = JSON.stringify(calls.error[0]);
  assert.doesNotMatch(serialized, /secret-access|secret-feed/);
  assert.match(serialized, /\[redacted\]/);
});
