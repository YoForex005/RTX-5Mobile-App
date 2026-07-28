export const CANONICAL_SLTP_BROKER_IDS = [
  'orrnn-demo',
  'gta_broker',
  'myprop-trade',
] as const;

export type CanonicalSltpBrokerId = (typeof CANONICAL_SLTP_BROKER_IDS)[number];

export type BrokerSltpCapabilities = Readonly<{
  existingPositionPersistence: boolean;
  serverManagedTriggerClose: boolean;
  newMarketOrderProtection: boolean;
  pendingOrderProtection: boolean;
  trailingStop: boolean;
  dynamicConstraints: boolean;
  venueBrokerConfirmation: boolean;
  revisionIdempotencySafety: boolean;
}>;

/**
 * No frontend flag may claim readiness until the exact physical broker
 * runtime has independently passed the backend certification checklist.
 */
export const NO_BROKER_SLTP_CAPABILITIES: BrokerSltpCapabilities = Object.freeze({
  existingPositionPersistence: false,
  serverManagedTriggerClose: false,
  newMarketOrderProtection: false,
  pendingOrderProtection: false,
  trailingStop: false,
  dynamicConstraints: false,
  venueBrokerConfirmation: false,
  revisionIdempotencySafety: false,
});

/**
 * Current safety verdict (2026-07-24 evidence):
 * - Orrnn Demo's inspected runtime was unhealthy.
 * - GTA and MyProp were not independently verified.
 *
 * There is intentionally no wildcard/default/hostname-derived entry and no
 * environment-variable path that can turn a capability on.
 */
export const BROKER_SLTP_CAPABILITIES: Readonly<
  Record<CanonicalSltpBrokerId, BrokerSltpCapabilities>
> = Object.freeze({
  'orrnn-demo': NO_BROKER_SLTP_CAPABILITIES,
  gta_broker: NO_BROKER_SLTP_CAPABILITIES,
  'myprop-trade': NO_BROKER_SLTP_CAPABILITIES,
});

export function canonicalBrokerId(
  raw: string | null | undefined,
): CanonicalSltpBrokerId | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === 'grow-trading-academy' || value === 'gta_broker') {
    return 'gta_broker';
  }
  if (value === 'orrnn-demo') return 'orrnn-demo';
  if (value === 'myprop-trade') return 'myprop-trade';
  return null;
}

export function resolveBrokerSltpCapabilities(
  brokerId: string | null | undefined,
): BrokerSltpCapabilities {
  const canonicalId = canonicalBrokerId(brokerId);
  return canonicalId
    ? BROKER_SLTP_CAPABILITIES[canonicalId]
    : NO_BROKER_SLTP_CAPABILITIES;
}

export function isExistingPositionSltpEnabled(
  capabilities: BrokerSltpCapabilities,
): boolean {
  return (
    capabilities.existingPositionPersistence === true &&
    capabilities.serverManagedTriggerClose === true
  );
}

export const SLTP_UNAVAILABLE_TITLE = 'SL/TP unavailable';

export function getSltpUnavailableMessage(
  brokerId: string | null | undefined,
): string {
  switch (canonicalBrokerId(brokerId)) {
    case 'orrnn-demo':
      return 'SL/TP is unavailable for this broker runtime. Server-managed protection was proven unhealthy on the verified runtime snapshot and has not been re-certified.';
    case 'gta_broker':
      return 'SL/TP is unavailable for GTA because this exact broker runtime has not been verified.';
    case 'myprop-trade':
      return 'SL/TP is unavailable for MyProp because this exact broker runtime has not been verified.';
    default:
      return 'SL/TP is unavailable because the selected broker could not be verified.';
  }
}
