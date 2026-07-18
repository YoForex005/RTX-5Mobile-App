import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBrokerExecutionEvidence } from './executionEvidence';

test('confirms a market execution only with both broker ticket and fill price', () => {
  assert.deepEqual(
    resolveBrokerExecutionEvidence({ position_ticket: 81001, price_open: 1.08421 }),
    { ticket: 81001, executionPrice: 1.08421, confirmed: true },
  );
});

test('keeps accepted responses without complete execution evidence unconfirmed', () => {
  assert.deepEqual(resolveBrokerExecutionEvidence({ status: 'accepted' }), { confirmed: false });
  assert.deepEqual(
    resolveBrokerExecutionEvidence({ ticket: 81002 }),
    { ticket: 81002, confirmed: false },
  );
  assert.deepEqual(
    resolveBrokerExecutionEvidence({ price: 1.08422 }),
    { executionPrice: 1.08422, confirmed: false },
  );
});

test('never confirms an explicitly rejected response', () => {
  assert.deepEqual(
    resolveBrokerExecutionEvidence({ status: 'rejected', ticket: 81003, price: 1.08423 }),
    { ticket: 81003, executionPrice: 1.08423, confirmed: false },
  );
});
