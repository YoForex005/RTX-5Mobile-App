import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampStopTargetToMinDistance,
  isStopTargetDistanceValid,
  isStopTargetOnCorrectSide,
  resolveStopTargetDistancePoints,
  validateStopTargetsDistance,
} from './modifyPositionStopDistance.ts';

const POINT = 0.00001;
const MARKET = 1.10000;
const MESSAGES = {
  buySl: 'buy-sl',
  sellSl: 'sell-sl',
  buyTp: 'buy-tp',
  sellTp: 'sell-tp',
} as const;

test('distance points are measured from the closing market price', () => {
  assert.ok(Math.abs(resolveStopTargetDistancePoints(1.09995, MARKET, POINT) - 5) < 1e-6);
  assert.ok(Math.abs(resolveStopTargetDistancePoints(1.09996, MARKET, POINT) - 4) < 1e-6);
});

test('buy SL must be below market by at least 5 points', () => {
  assert.equal(isStopTargetOnCorrectSide('sl', 'buy', 1.09990, MARKET), true);
  assert.equal(isStopTargetOnCorrectSide('sl', 'buy', 1.10010, MARKET), false);
  assert.equal(isStopTargetDistanceValid('sl', 'buy', 1.09995, MARKET, POINT), true);
  assert.equal(isStopTargetDistanceValid('sl', 'buy', 1.09996, MARKET, POINT), false);
  assert.equal(isStopTargetDistanceValid('sl', 'buy', 1.10000, MARKET, POINT), false);
});

test('sell SL must be above market by at least 5 points', () => {
  assert.equal(isStopTargetDistanceValid('sl', 'sell', 1.10005, MARKET, POINT), true);
  assert.equal(isStopTargetDistanceValid('sl', 'sell', 1.10004, MARKET, POINT), false);
  assert.equal(isStopTargetDistanceValid('sl', 'sell', 1.09990, MARKET, POINT), false);
});

test('buy/sell TP enforce the opposite side and five-point floor', () => {
  assert.equal(isStopTargetDistanceValid('tp', 'buy', 1.10005, MARKET, POINT), true);
  assert.equal(isStopTargetDistanceValid('tp', 'buy', 1.10004, MARKET, POINT), false);
  assert.equal(isStopTargetDistanceValid('tp', 'sell', 1.09995, MARKET, POINT), true);
  assert.equal(isStopTargetDistanceValid('tp', 'sell', 1.09996, MARKET, POINT), false);
});

test('validateStopTargetsDistance reports the first invalid level', () => {
  assert.equal(
    validateStopTargetsDistance({
      side: 'buy',
      marketPrice: MARKET,
      point: POINT,
      stopLoss: 1.09996,
      takeProfit: null,
      messages: MESSAGES,
    }),
    'buy-sl',
  );
  assert.equal(
    validateStopTargetsDistance({
      side: 'buy',
      marketPrice: MARKET,
      point: POINT,
      stopLoss: 1.09990,
      takeProfit: 1.10004,
      messages: MESSAGES,
    }),
    'buy-tp',
  );
  assert.equal(
    validateStopTargetsDistance({
      side: 'buy',
      marketPrice: MARKET,
      point: POINT,
      stopLoss: 1.09990,
      takeProfit: 1.10010,
      messages: MESSAGES,
    }),
    null,
  );
});

test('clamp snaps stepper values onto the legal side of the five-point band', () => {
  assert.equal(
    clampStopTargetToMinDistance(1.09999, 'sl', 'buy', MARKET, POINT * 5),
    MARKET - POINT * 5,
  );
  assert.equal(
    clampStopTargetToMinDistance(1.10001, 'tp', 'buy', MARKET, POINT * 5),
    MARKET + POINT * 5,
  );
});
