import { assertTradeSide } from '../../domain/tradeSide';
import type { PendingOrderType, PlacePendingOrderPayload } from './types';

const PENDING_ORDER_TYPES = new Set<PendingOrderType>([
  'buy_limit',
  'sell_limit',
  'buy_stop',
  'sell_stop',
]);

export class PendingOrderPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PendingOrderPayloadError';
  }
}

export const normalizePendingOrderType = (value: unknown): PendingOrderType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PENDING_ORDER_TYPES.has(normalized as PendingOrderType)
    ? (normalized as PendingOrderType)
    : null;
};

export const resolvePendingOrderTriggerPrice = (payload: PlacePendingOrderPayload): number => {
  const price = payload.price ?? payload.price_open;
  return typeof price === 'number' ? price : Number(price);
};

export function buildPendingOrderRequestBody(payload: PlacePendingOrderPayload): Record<string, unknown> {
  const login =
    typeof payload.account_login === 'string'
      ? parseInt(payload.account_login, 10)
      : payload.account_login;
  if (!Number.isFinite(login) || login <= 0) {
    throw new PendingOrderPayloadError('Invalid account login for pending order.');
  }

  const symbol = (payload.symbol ?? '').trim();
  if (!symbol) {
    throw new PendingOrderPayloadError('Pending order symbol is required.');
  }

  const orderType = normalizePendingOrderType(payload.type);
  if (!orderType) {
    throw new PendingOrderPayloadError(
      'This pending order type is not supported by the current trading API.',
    );
  }

  const price = resolvePendingOrderTriggerPrice(payload);
  if (!Number.isFinite(price) || price <= 0) {
    throw new PendingOrderPayloadError('Pending order trigger price must be greater than 0.');
  }

  const body: Record<string, unknown> = {
    login,
    symbol,
    side: assertTradeSide(payload.side),
    volume: payload.volume,
    type: orderType,
    price,
  };

  if (typeof payload.price_sl === 'number' && payload.price_sl > 0) {
    body.price_sl = payload.price_sl;
  }
  if (typeof payload.price_tp === 'number' && payload.price_tp > 0) {
    body.price_tp = payload.price_tp;
  }
  if (typeof payload.expiration === 'number' && payload.expiration > 0) {
    body.expiration = payload.expiration;
  }
  if (typeof payload.comment === 'string' && payload.comment.length > 0) {
    body.comment = payload.comment;
  }
  if (typeof payload.trailing_stop === 'number' && payload.trailing_stop > 0) {
    body.trailing_stop = payload.trailing_stop;
  }
  if (typeof payload.trailing_step === 'number' && payload.trailing_step > 0) {
    body.trailing_step = payload.trailing_step;
  }
  if (typeof payload.magic === 'number' && payload.magic > 0) {
    body.magic = payload.magic;
  }

  return body;
}
