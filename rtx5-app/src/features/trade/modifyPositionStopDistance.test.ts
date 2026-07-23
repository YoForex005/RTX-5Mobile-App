import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isStopTargetOnCorrectSide,
  resolveStopTargetPresetDirection,
  snapStopTargetToTickSize,
} from './modifyPositionStopDistance.ts';

const MARKET = 1.1;

test('buy uses Bid-side directions and sell uses Ask-side directions', () => {
  assert.equal(isStopTargetOnCorrectSide('sl', 'buy', 1.09999, MARKET), true);
  assert.equal(isStopTargetOnCorrectSide('tp', 'buy', 1.10001, MARKET), true);
  assert.equal(isStopTargetOnCorrectSide('sl', 'sell', 1.10001, MARKET), true);
  assert.equal(isStopTargetOnCorrectSide('tp', 'sell', 1.09999, MARKET), true);

  assert.equal(isStopTargetOnCorrectSide('sl', 'buy', MARKET, MARKET), false);
  assert.equal(isStopTargetOnCorrectSide('tp', 'buy', 1.09999, MARKET), false);
  assert.equal(isStopTargetOnCorrectSide('sl', 'sell', 1.09999, MARKET), false);
  assert.equal(isStopTargetOnCorrectSide('tp', 'sell', 1.10001, MARKET), false);
});

test('preset direction is correct for every Buy/Sell SL/TP combination', () => {
  assert.equal(resolveStopTargetPresetDirection('sl', 'buy'), -1);
  assert.equal(resolveStopTargetPresetDirection('tp', 'buy'), 1);
  assert.equal(resolveStopTargetPresetDirection('sl', 'sell'), 1);
  assert.equal(resolveStopTargetPresetDirection('tp', 'sell'), -1);
});

test('tick snapping is deterministic for common precision and preserves clear zero', () => {
  assert.equal(snapStopTargetToTickSize(123.456, 0.01, 2), 123.46);
  assert.equal(snapStopTargetToTickSize(1.23456, 0.001, 3), 1.235);
  assert.equal(snapStopTargetToTickSize(1.23456, 0.0001, 4), 1.2346);
  assert.equal(snapStopTargetToTickSize(1.234567, 0.00001, 5), 1.23457);
  assert.equal(snapStopTargetToTickSize(0, Number.NaN, 5), 0);
});

test('missing/invalid tick size never invents a point or constraint', () => {
  assert.throws(() => snapStopTargetToTickSize(1.2, 0, 5), /positive broker tick size/);
  assert.throws(() => snapStopTargetToTickSize(1.2, Number.NaN, 5), /positive broker tick size/);
  assert.throws(() => snapStopTargetToTickSize(Number.POSITIVE_INFINITY, 0.01, 2), /finite non-negative/);
});
