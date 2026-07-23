import assert from 'node:assert/strict';
import test from 'node:test';

import { CHART_ORDER_TYPES } from '../chart/chartTradeOrderUtils';
import {
  isBrokerConfirmedModifyBackendLocked,
  isDynamicSltpConstraintsBackendLocked,
  isExistingPositionModifyBackendLocked,
  isNewMarketOrderProtectionBackendLocked,
  isPendingOrderProtectionBackendLocked,
  isPendingOrderTypeBackendLocked,
  isRevisionedModifyBackendLocked,
  resolveTradeBackendCapabilities,
} from './tradeBackendCapabilities';

const lockedSltp = {
  existingPositionModify: false,
  newMarketOrderProtection: false,
  pendingOrderProtection: false,
  dynamicConstraints: false,
  brokerConfirmedModify: false,
  revisionedModify: false,
} as const;

test('all broker SL/TP capabilities fail closed without broker-specific evidence', () => {
  assert.deepEqual(resolveTradeBackendCapabilities({}), {
    pendingOrders: false,
    sltp: lockedSltp,
  });
  assert.deepEqual(
    resolveTradeBackendCapabilities({
      EXPO_PUBLIC_PENDING_ORDERS_API_READY: 'yes',
      EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: '{"gta":{"existingPositionModify":true}}',
    }),
    {
      pendingOrders: false,
      sltp: lockedSltp,
    },
  );
});

test('legacy global SL/TP readiness cannot unlock any broker capability', () => {
  const legacyEnvironment = {
    EXPO_PUBLIC_SLTP_API_READY: 'true',
    EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: '{}',
  };

  assert.deepEqual(
    resolveTradeBackendCapabilities(legacyEnvironment, 'gta'),
    {
      pendingOrders: false,
      sltp: lockedSltp,
    },
  );
});

test('a wildcard broker capability entry cannot unlock a broker', () => {
  assert.deepEqual(
    resolveTradeBackendCapabilities({
      EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: '{"*":{"existingPositionModify":true}}',
    }, 'gta'),
    {
      pendingOrders: false,
      sltp: lockedSltp,
    },
  );
});

test('only exact true broker-scoped capability values unlock their own paths', () => {
  const capabilities = resolveTradeBackendCapabilities({
    EXPO_PUBLIC_PENDING_ORDERS_API_READY: ' TRUE ',
    EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: JSON.stringify({
      gta: {
        existingPositionModify: true,
        newMarketOrderProtection: true,
        pendingOrderProtection: false,
        dynamicConstraints: true,
        brokerConfirmedModify: 'true',
        revisionedModify: 1,
      },
    }),
  }, ' gta ');

  assert.deepEqual(capabilities, {
    pendingOrders: true,
    sltp: {
      existingPositionModify: true,
      newMarketOrderProtection: true,
      pendingOrderProtection: false,
      dynamicConstraints: true,
      brokerConfirmedModify: false,
      revisionedModify: false,
    },
  });
  assert.equal(isExistingPositionModifyBackendLocked(capabilities), false);
  assert.equal(isNewMarketOrderProtectionBackendLocked(capabilities), false);
  assert.equal(isPendingOrderProtectionBackendLocked(capabilities), true);
  assert.equal(isDynamicSltpConstraintsBackendLocked(capabilities), false);
  assert.equal(isBrokerConfirmedModifyBackendLocked(capabilities), true);
  assert.equal(isRevisionedModifyBackendLocked(capabilities), true);
});

test('pending-order creation stays independent from all six SL/TP capabilities', () => {
  const capabilities = {
    pendingOrders: false,
    sltp: lockedSltp,
  } as const;

  for (const orderType of CHART_ORDER_TYPES) {
    assert.equal(
      isPendingOrderTypeBackendLocked(orderType, capabilities),
      orderType !== 'Market Execution',
      `${orderType} lock state`,
    );
  }
});
