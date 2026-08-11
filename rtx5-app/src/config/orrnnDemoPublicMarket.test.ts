import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORRNN_DEMO_PUBLIC_BROKER_ID,
  ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
  resolveBrokerConnectionWithPublicDemoDefault,
} from './orrnnDemoPublicMarket';

test('a clean logged-out install explicitly selects the public demo broker', () => {
  assert.deepEqual(
    resolveBrokerConnectionWithPublicDemoDefault({
      brokerId: '',
      serverUrl: '',
      isLoggedIn: false,
    }),
    {
      brokerId: ORRNN_DEMO_PUBLIC_BROKER_ID,
      serverUrl: ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
    },
  );
});

test('the public demo default never overwrites another broker or an authenticated state', () => {
  assert.deepEqual(
    resolveBrokerConnectionWithPublicDemoDefault({
      brokerId: 'other-broker',
      serverUrl: 'https://other.example',
      isLoggedIn: false,
    }),
    {
      brokerId: 'other-broker',
      serverUrl: 'https://other.example',
    },
  );
  assert.deepEqual(
    resolveBrokerConnectionWithPublicDemoDefault({
      brokerId: '',
      serverUrl: '',
      isLoggedIn: true,
    }),
    { brokerId: '', serverUrl: '' },
  );
});

test('an existing exact demo selection receives the fixed gateway when it has no server URL', () => {
  assert.deepEqual(
    resolveBrokerConnectionWithPublicDemoDefault({
      brokerId: ORRNN_DEMO_PUBLIC_BROKER_ID,
      serverUrl: '',
      isLoggedIn: false,
    }),
    {
      brokerId: ORRNN_DEMO_PUBLIC_BROKER_ID,
      serverUrl: ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
    },
  );
});
