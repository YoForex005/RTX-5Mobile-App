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
  return typeof price === 'number' ? price : Number(price?.trim());
};

export const resolvePendingOrderStopLimitPrice = (payload: PlacePendingOrderPayload): number => {
  const price = payload.stopLimitPrice ?? payload.stop_limit_price;
  return typeof price === 'number' ? price : Number(price);
};

const toCanonicalDecimalString = (
  value: number | string,
  label: string,
): string => {
  const numeric = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new PendingOrderPayloadError(`${label} must be a positive decimal.`);
  }
  const normalized = numeric.toFixed(8).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  if (!normalized || Number(normalized) !== numeric) {
    throw new PendingOrderPayloadError(`${label} supports at most 8 fractional digits.`);
  }
  return normalized;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4;
  }
  return bytes;
};

export function buildPendingOrderRequestBody(payload: PlacePendingOrderPayload): Record<string, unknown> {
  const login =
    typeof payload.account_login === 'string'
      ? parseInt(payload.account_login, 10)
      : payload.account_login;
  if (!Number.isFinite(login) || login <= 0) {
    throw new PendingOrderPayloadError('Invalid account login for pending order.');
  }

  const symbol = (payload.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    throw new PendingOrderPayloadError('Pending order symbol is required.');
  }
  if (utf8ByteLength(symbol) > 20) {
    throw new PendingOrderPayloadError('Pending order symbol must not exceed 20 bytes.');
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
    account_login: login,
    symbol,
    volume: toCanonicalDecimalString(payload.volume, 'Pending order volume'),
    type: orderType,
    price: toCanonicalDecimalString(price, 'Pending order trigger price'),
  };

  if (hasOwn(payload, 'sl') && hasOwn(payload, 'price_sl')) {
    throw new PendingOrderPayloadError('Use only the canonical pending Stop Loss field.');
  }
  if (hasOwn(payload, 'tp') && hasOwn(payload, 'price_tp')) {
    throw new PendingOrderPayloadError('Use only the canonical pending Take Profit field.');
  }
  const sl = hasOwn(payload, 'sl') ? payload.sl : payload.price_sl;
  const tp = hasOwn(payload, 'tp') ? payload.tp : payload.price_tp;
  if (sl !== undefined && sl !== null) {
    body.sl = toCanonicalDecimalString(sl, 'Pending Stop Loss');
  }
  if (tp !== undefined && tp !== null) {
    body.tp = toCanonicalDecimalString(tp, 'Pending Take Profit');
  }

  if (hasOwn(payload, 'expiry') && hasOwn(payload, 'expiration')) {
    throw new PendingOrderPayloadError('Use only the canonical pending expiry field.');
  }
  const expiry = hasOwn(payload, 'expiry') ? payload.expiry : payload.expiration;
  if (expiry !== undefined && expiry !== null) {
    if (
      typeof expiry !== 'number' ||
      !Number.isSafeInteger(expiry) ||
      expiry <= Math.floor(Date.now() / 1000)
    ) {
      throw new PendingOrderPayloadError(
        'Pending order expiry must be a future Unix-seconds value.',
      );
    }
    body.expiry = expiry;
  } else if (hasOwn(payload, 'expiry') && expiry === null) {
    body.expiry = null;
  }
  if (payload.fill_mode !== undefined) {
    if (payload.fill_mode !== 'return' && payload.fill_mode !== 'fok') {
      throw new PendingOrderPayloadError('Pending order fill mode is invalid.');
    }
    body.fill_mode = payload.fill_mode;
  }
  if (typeof payload.comment === 'string' && payload.comment.length > 0) {
    if (utf8ByteLength(payload.comment) > 1024) {
      throw new PendingOrderPayloadError('Pending order comment must not exceed 1024 bytes.');
    }
    body.comment = payload.comment;
  }
  return body;
}
