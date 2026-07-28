import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyQuoteSocketClose,
  isQuoteSocketAuthenticationFailure,
} from './quoteSocketFailurePolicy';

test('explicit broker authentication close codes stop reconnect', () => {
  for (const code of [1008, 4001, 4401, 4403]) {
    assert.equal(
      classifyQuoteSocketClose({ code, reason: '', didOpen: false }),
      'authentication',
    );
  }
});

test('React Native 1006 close preserves HTTP authentication rejection', () => {
  for (const reason of [
    "Expected HTTP 101 response but was '401 Unauthorized'",
    'WebSocket upgrade failed with HTTP 403 Forbidden',
  ]) {
    assert.equal(
      isQuoteSocketAuthenticationFailure({ code: 1006, reason, didOpen: false }),
      true,
    );
  }
});

test('ordinary pre-open network failures remain retryable transport errors', () => {
  assert.equal(
    classifyQuoteSocketClose({
      code: 1006,
      reason: 'Failed to connect to host',
      didOpen: false,
    }),
    'transport',
  );
  assert.equal(
    classifyQuoteSocketClose({
      code: 1006,
      reason: "Expected HTTP 101 response but was '401 Unauthorized'",
      didOpen: true,
    }),
    'transport',
  );
});
