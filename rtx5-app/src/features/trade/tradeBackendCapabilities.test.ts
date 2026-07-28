import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CHART_ORDER_TYPES } from '../chart/chartTradeOrderUtils';
import {
  BROKER_SLTP_CAPABILITIES,
  CANONICAL_SLTP_BROKER_IDS,
  NO_BROKER_SLTP_CAPABILITIES,
  canonicalBrokerId,
  getSltpUnavailableMessage,
  isDynamicSltpConstraintsBackendLocked,
  isExistingPositionModifyBackendLocked,
  isNewMarketOrderProtectionBackendLocked,
  isPendingOrderProtectionBackendLocked,
  isPendingOrderTypeBackendLocked,
  isRevisionedModifyBackendLocked,
  isTrailingStopBackendLocked,
  isVenueBrokerConfirmationBackendLocked,
  resolveTradeBackendCapabilities,
  type BrokerSltpCapabilities,
} from './tradeBackendCapabilities';

const resolveAppFile = (fileName: string) => {
  const candidates = [
    resolve(process.cwd(), fileName),
    resolve(process.cwd(), 'rtx5-app', fileName),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  assert.ok(path, `${fileName} was not found from the test working directory`);
  return path;
};

test('the fixed broker matrix exposes exactly eight independently false capabilities', () => {
  assert.deepEqual(
    Object.keys(BROKER_SLTP_CAPABILITIES).sort(),
    [...CANONICAL_SLTP_BROKER_IDS].sort(),
  );
  assert.equal(Object.isFrozen(BROKER_SLTP_CAPABILITIES), true);
  assert.equal(Object.isFrozen(NO_BROKER_SLTP_CAPABILITIES), true);

  const expectedKeys: Array<keyof BrokerSltpCapabilities> = [
    'existingPositionPersistence',
    'serverManagedTriggerClose',
    'newMarketOrderProtection',
    'pendingOrderProtection',
    'trailingStop',
    'dynamicConstraints',
    'venueBrokerConfirmation',
    'revisionIdempotencySafety',
  ];
  for (const brokerId of CANONICAL_SLTP_BROKER_IDS) {
    assert.deepEqual(
      Object.keys(BROKER_SLTP_CAPABILITIES[brokerId]).sort(),
      [...expectedKeys].sort(),
    );
    assert.deepEqual(BROKER_SLTP_CAPABILITIES[brokerId], NO_BROKER_SLTP_CAPABILITIES);
    assert.equal(Object.isFrozen(BROKER_SLTP_CAPABILITIES[brokerId]), true);
  }
});

test('only documented broker identifiers canonicalize and the GTA alias is exact', () => {
  assert.equal(canonicalBrokerId('orrnn-demo'), 'orrnn-demo');
  assert.equal(canonicalBrokerId(' GTA_BROKER '), 'gta_broker');
  assert.equal(canonicalBrokerId('grow-trading-academy'), 'gta_broker');
  assert.equal(canonicalBrokerId('MYPROP-TRADE'), 'myprop-trade');

  for (const unsafe of [
    null,
    undefined,
    '',
    '*',
    'default',
    'all',
    'gta',
    'gta_broker.example.com',
    'prefix-gta_broker',
    'myprop-trade-copy',
    'https://myprop-trade.example',
  ]) {
    assert.equal(canonicalBrokerId(unsafe), null, String(unsafe));
  }
});

test('public environment values cannot activate any broker SL/TP capability', () => {
  const hostileEnvironment = {
    EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES: JSON.stringify({
      '*': Object.fromEntries(
        Object.keys(NO_BROKER_SLTP_CAPABILITIES).map((key) => [key, true]),
      ),
      gta_broker: {
        existingPositionPersistence: true,
        serverManagedTriggerClose: true,
        newMarketOrderProtection: true,
        pendingOrderProtection: true,
        trailingStop: true,
        dynamicConstraints: true,
        venueBrokerConfirmation: true,
        revisionIdempotencySafety: true,
      },
    }),
  };

  for (const brokerId of [...CANONICAL_SLTP_BROKER_IDS, 'unknown']) {
    assert.deepEqual(
      resolveTradeBackendCapabilities(hostileEnvironment, brokerId).sltp,
      NO_BROKER_SLTP_CAPABILITIES,
    );
  }
});

test('existing-position SL/TP requires persistence and server trigger-close together', () => {
  const base = NO_BROKER_SLTP_CAPABILITIES;
  const capabilities = (sltp: BrokerSltpCapabilities) => ({
    pendingOrders: false,
    sltp,
  });

  assert.equal(isExistingPositionModifyBackendLocked(capabilities(base)), true);
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      existingPositionPersistence: true,
    })),
    true,
  );
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      serverManagedTriggerClose: true,
    })),
    true,
  );
  assert.equal(
    isExistingPositionModifyBackendLocked(capabilities({
      ...base,
      existingPositionPersistence: true,
      serverManagedTriggerClose: true,
    })),
    false,
  );
});

test('the remaining SL/TP locks stay independent', () => {
  const withCapability = (
    key: keyof BrokerSltpCapabilities,
  ) => ({
    pendingOrders: false,
    sltp: { ...NO_BROKER_SLTP_CAPABILITIES, [key]: true },
  });

  assert.equal(
    isNewMarketOrderProtectionBackendLocked(withCapability('newMarketOrderProtection')),
    false,
  );
  assert.equal(
    isPendingOrderProtectionBackendLocked(withCapability('pendingOrderProtection')),
    false,
  );
  assert.equal(isTrailingStopBackendLocked(withCapability('trailingStop')), false);
  assert.equal(
    isDynamicSltpConstraintsBackendLocked(withCapability('dynamicConstraints')),
    false,
  );
  assert.equal(
    isVenueBrokerConfirmationBackendLocked(withCapability('venueBrokerConfirmation')),
    false,
  );
  assert.equal(
    isRevisionedModifyBackendLocked(withCapability('revisionIdempotencySafety')),
    false,
  );
});

test('pending-order creation remains independent from SL/TP protection readiness', () => {
  const capabilities = {
    pendingOrders: false,
    sltp: NO_BROKER_SLTP_CAPABILITIES,
  } as const;

  for (const orderType of CHART_ORDER_TYPES) {
    assert.equal(
      isPendingOrderTypeBackendLocked(orderType, capabilities),
      orderType !== 'Market Execution',
      `${orderType} lock state`,
    );
  }
});

test('unsupported stop-limit pending types remain locked even if pending creation is enabled', () => {
  const capabilities = resolveTradeBackendCapabilities(
    { EXPO_PUBLIC_PENDING_ORDERS_API_READY: 'true' },
    'orrnn-demo',
  );

  assert.equal(isPendingOrderTypeBackendLocked('Buy Limit', capabilities), false);
  assert.equal(isPendingOrderTypeBackendLocked('Sell Stop', capabilities), false);
  assert.equal(isPendingOrderTypeBackendLocked('Buy Stop Limit', capabilities), true);
  assert.equal(isPendingOrderTypeBackendLocked('Sell Stop Limit', capabilities), true);
});

test('unavailable feedback is broker specific and fail closed for unknown identity', () => {
  assert.equal(
    getSltpUnavailableMessage('orrnn-demo'),
    'SL/TP is unavailable for this broker runtime. Server-managed protection was proven unhealthy on the verified runtime snapshot and has not been re-certified.',
  );
  assert.equal(
    getSltpUnavailableMessage('grow-trading-academy'),
    'SL/TP is unavailable for GTA because this exact broker runtime has not been verified.',
  );
  assert.equal(
    getSltpUnavailableMessage('myprop-trade'),
    'SL/TP is unavailable for MyProp because this exact broker runtime has not been verified.',
  );
  assert.equal(
    getSltpUnavailableMessage('unknown'),
    'SL/TP is unavailable because the selected broker could not be verified.',
  );
});

test('local and EAS build profiles contain no SL/TP activation', () => {
  const dotenvSource = readFileSync(resolveAppFile('.env'), 'utf8');
  const dotenvMatch = dotenvSource.match(
    /^EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES=(.+)$/m,
  );
  assert.ok(dotenvMatch, 'local SL/TP capability configuration is missing');
  const rawDotenvValue = dotenvMatch[1].trim();
  const dotenvValue =
    (
      (rawDotenvValue.startsWith("'") && rawDotenvValue.endsWith("'")) ||
      (rawDotenvValue.startsWith('"') && rawDotenvValue.endsWith('"'))
    )
      ? rawDotenvValue.slice(1, -1)
      : rawDotenvValue;
  assert.deepEqual(JSON.parse(dotenvValue), {});

  const easConfig = JSON.parse(readFileSync(resolveAppFile('eas.json'), 'utf8'));
  for (const [profileName, profile] of Object.entries(easConfig.build as Record<string, any>)) {
    const rawValue = profile.env?.EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES;
    assert.ok(rawValue, `${profileName} SL/TP capability map is missing`);
    assert.deepEqual(JSON.parse(rawValue), {}, `${profileName} SL/TP capability map`);
  }
});
