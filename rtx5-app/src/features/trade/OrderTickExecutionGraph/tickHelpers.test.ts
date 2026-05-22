import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialTickHistory, isValidTickPoint } from './tickHelpers';

test('order execution graph ignores zero-price seed ticks', () => {
  assert.equal(isValidTickPoint({ time: Date.now(), bid: 0, ask: 0.00015 }), false);
  assert.equal(isValidTickPoint({ time: Date.now(), bid: 1.3444, ask: 1.3445 }), true);
});

test('order execution graph opens with a filled MT5-style initial trace', () => {
  const latest = { time: 100000, bid: 1.3444, ask: 1.3445 };
  const history = createInitialTickHistory(latest, 5, 100);

  assert.equal(history.length, 46);
  assert.deepEqual(history[history.length - 1], latest);
  assert.ok(history[0].time < latest.time);
  assert.ok(new Set(history.map((tick) => tick.bid)).size > 6);
  assert.ok(history.every(isValidTickPoint));
});
