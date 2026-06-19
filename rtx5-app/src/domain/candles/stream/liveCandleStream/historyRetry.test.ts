import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeHistoryRetryPlan } from './historyRetryPolicy';

// Backoff schedule is [1000, 3000] => 2 bounded retries for a failed initial load.

test('schedules the first retry after a failed initial load with no history', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 0 }, false);
  assert.deepEqual(plan, { shouldRetry: true, delayMs: 1000, nextAttempt: 1 });
});

test('schedules the second retry with a longer backoff', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 1 }, false);
  assert.deepEqual(plan, { shouldRetry: true, delayMs: 3000, nextAttempt: 2 });
});

test('stops retrying once the bounded budget is spent (no runaway loop)', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 2 }, false);
  assert.equal(plan.shouldRetry, false);
  assert.equal(plan.nextAttempt, 2);
});

test('does not retry when history already arrived (cache/prefetch healed it)', () => {
  const plan = computeHistoryRetryPlan({ historyCandles: [{}], historyRetryAttempt: 0 }, false);
  assert.equal(plan.shouldRetry, false);
});

test('never retries a pagination (older-history) failure', () => {
  // Even with an empty fresh budget, pagination must not trigger a full-window retry.
  const plan = computeHistoryRetryPlan({ historyCandles: [], historyRetryAttempt: 0 }, true);
  assert.equal(plan.shouldRetry, false);
});
