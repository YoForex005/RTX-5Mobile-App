import assert from 'node:assert/strict';
import test from 'node:test';

import { redactAuthPayload } from './authRedaction';

test('redactAuthPayload removes auth secrets from nested login payloads', () => {
  assert.deepEqual(
    redactAuthPayload({
      access_token: 'jwt',
      refreshToken: 'refresh',
      account_login: 160000,
      feed: {
        feedToken: 'feed-secret',
        status: 'ok',
      },
      user: {
        name: 'Trader',
        password: 'secret',
      },
    }),
    {
      access_token: '[redacted]',
      refreshToken: '[redacted]',
      account_login: 160000,
      feed: {
        feedToken: '[redacted]',
        status: 'ok',
      },
      user: {
        name: 'Trader',
        password: '[redacted]',
      },
    },
  );
});
