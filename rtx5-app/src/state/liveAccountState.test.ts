import assert from 'node:assert/strict';
import test from 'node:test';

import { useLiveAccountState } from './liveAccountState.ts';

test('login-only live account updates do not mark financial metrics as ready', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200082);
  assert.equal(state.balance, 0);
  assert.equal(state.hasMetrics, false);
  assert.equal(state.metricFlags.balance, false);
});

test('financial live account updates mark metrics as ready even when balance is zero', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082, balance: 0, equity: 0 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200082);
  assert.equal(state.balance, 0);
  assert.equal(state.equity, 0);
  assert.equal(state.hasMetrics, true);
  assert.equal(state.metricFlags.balance, true);
  assert.equal(state.metricFlags.equity, true);
});

test('changing login clears stale financial metrics until new metrics arrive', () => {
  useLiveAccountState.getState().resetMetrics();
  useLiveAccountState.getState().updateMetrics({ login: 200082, balance: 119701.53 });

  useLiveAccountState.getState().updateMetrics({ login: 200083 });

  const state = useLiveAccountState.getState();
  assert.equal(state.login, 200083);
  assert.equal(state.balance, 0);
  assert.equal(state.hasMetrics, false);
  assert.equal(state.metricFlags.balance, false);
});

test('metric readiness is tracked per financial field', () => {
  useLiveAccountState.getState().resetMetrics();

  useLiveAccountState.getState().updateMetrics({ login: 200082, equity: 1000 });

  const state = useLiveAccountState.getState();
  assert.equal(state.hasMetrics, true);
  assert.equal(state.metricFlags.balance, false);
  assert.equal(state.metricFlags.equity, true);
});
