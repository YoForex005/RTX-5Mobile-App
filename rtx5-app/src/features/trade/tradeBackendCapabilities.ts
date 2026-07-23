import {
  isPendingChartOrderType,
  type ChartOrderType,
} from '../chart/chartTradeOrderUtils';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';

export type BrokerSltpCapabilities = Readonly<{
  existingPositionModify: boolean;
  newMarketOrderProtection: boolean;
  pendingOrderProtection: boolean;
  dynamicConstraints: boolean;
  brokerConfirmedModify: boolean;
  revisionedModify: boolean;
}>;

export type TradeBackendCapabilities = Readonly<{
  pendingOrders: boolean;
  sltp: BrokerSltpCapabilities;
}>;

export type TradeBackendCapabilityEnvironment = Readonly<{
  EXPO_PUBLIC_PENDING_ORDERS_API_READY?: string;
  /**
   * JSON object keyed by normalized broker ID. Example:
   * {"gta":{"existingPositionModify":true}}
   *
   * Every omitted broker/capability remains false. A global combined SL/TP
   * switch is intentionally unsupported.
   */
  EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES?: string;
}>;

const LOCKED_SLTP_CAPABILITIES: BrokerSltpCapabilities = Object.freeze({
  existingPositionModify: false,
  newMarketOrderProtection: false,
  pendingOrderProtection: false,
  dynamicConstraints: false,
  brokerConfirmedModify: false,
  revisionedModify: false,
});

const isExplicitlyEnabled = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';

const normalizeBrokerId = (value: string | undefined | null): string =>
  String(value ?? '').trim().toLowerCase();

const parseBrokerCapabilityMap = (
  value: string | undefined,
): Record<string, unknown> => {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

export const resolveBrokerSltpCapabilities = (
  environment: TradeBackendCapabilityEnvironment,
  brokerId: string | undefined | null,
): BrokerSltpCapabilities => {
  const normalizedBrokerId = normalizeBrokerId(brokerId);
  if (!normalizedBrokerId) return LOCKED_SLTP_CAPABILITIES;
  const brokerConfig = parseBrokerCapabilityMap(
    environment.EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES,
  )[normalizedBrokerId];
  if (!brokerConfig || typeof brokerConfig !== 'object' || Array.isArray(brokerConfig)) {
    return LOCKED_SLTP_CAPABILITIES;
  }
  const source = brokerConfig as Record<string, unknown>;
  const enabled = (key: keyof BrokerSltpCapabilities) => source[key] === true;
  return Object.freeze({
    existingPositionModify: enabled('existingPositionModify'),
    newMarketOrderProtection: enabled('newMarketOrderProtection'),
    pendingOrderProtection: enabled('pendingOrderProtection'),
    dynamicConstraints: enabled('dynamicConstraints'),
    brokerConfirmedModify: enabled('brokerConfirmedModify'),
    revisionedModify: enabled('revisionedModify'),
  });
};

export const resolveTradeBackendCapabilities = (
  environment: TradeBackendCapabilityEnvironment,
  brokerId?: string | null,
): TradeBackendCapabilities => Object.freeze({
  pendingOrders: isExplicitlyEnabled(environment.EXPO_PUBLIC_PENDING_ORDERS_API_READY),
  sltp: resolveBrokerSltpCapabilities(environment, brokerId),
});

const ACTIVE_CAPABILITY_ENVIRONMENT: TradeBackendCapabilityEnvironment = Object.freeze({
  EXPO_PUBLIC_PENDING_ORDERS_API_READY:
    process.env.EXPO_PUBLIC_PENDING_ORDERS_API_READY,
  EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES:
    process.env.EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES,
});

export const getActiveTradeBackendCapabilities = (): TradeBackendCapabilities =>
  resolveTradeBackendCapabilities(
    ACTIVE_CAPABILITY_ENVIRONMENT,
    captureActiveBrokerSession()?.session.brokerId,
  );

export const isPendingOrderTypeBackendLocked = (
  orderType: ChartOrderType,
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => isPendingChartOrderType(orderType) && !capabilities.pendingOrders;

export const isExistingPositionModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.existingPositionModify;

export const isNewMarketOrderProtectionBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.newMarketOrderProtection;

export const isPendingOrderProtectionBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.pendingOrderProtection;

export const isDynamicSltpConstraintsBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.dynamicConstraints;

export const isBrokerConfirmedModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.brokerConfirmedModify;

export const isRevisionedModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.revisionedModify;

export const SLTP_COMING_SOON_TITLE = 'Coming Soon';
export const SLTP_COMING_SOON_MESSAGE =
  'This SL/TP capability is unavailable for the active broker.';
