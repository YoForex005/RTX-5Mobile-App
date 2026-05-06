/**
 * Helpers for normalising order types/statuses and formatting overlay labels.
 */
import type { LoginOrder } from '../../../api/orders';
import { inferContractSize, resolvePointSize } from './symbolUtils';
import { TERMINAL_ORDER_STATUSES } from './types';

export const toUpper = (value: string): string => value.trim().toUpperCase();

export const formatPositionVolumeLabel = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';

export const formatTpSlOverlayLabel = (
  kind: 'tp' | 'sl',
  symbol: string,
  entryPrice: number,
  targetPrice: number,
  volume: number,
): string => {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(targetPrice) || targetPrice <= 0) {
    return kind.toUpperCase();
  }

  const contractSize = inferContractSize(symbol);
  const pointSize = resolvePointSize(symbol);
  const safeVolume = Number.isFinite(volume) && volume > 0 ? volume : 0;
  const usdValue = Math.abs(targetPrice - entryPrice) * contractSize * safeVolume;
  const pointDistance = Math.max(1, Math.round(Math.abs(targetPrice - entryPrice) / pointSize));
  const sign = kind === 'tp' ? '+' : '-';

  return `${kind.toUpperCase()}, ${sign} ${usdValue.toFixed(2)} USD, ${pointDistance} points`;
};

export const normalizeOrderType = (value: string | undefined): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export const normalizeOrderStatus = (value: string | undefined): string =>
  toUpper(
    String(value ?? '')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' '),
  );

export const isPendingOrderType = (value: string): boolean =>
  value.includes('limit') || value.includes('stop');

export const isActivePendingOrder = (order: LoginOrder): boolean => {
  const normalizedType = normalizeOrderType(order.type);
  if (!isPendingOrderType(normalizedType)) return false;

  const normalizedStatus = normalizeOrderStatus(order.status);
  return !TERMINAL_ORDER_STATUSES.has(normalizedStatus);
};

export const buildPendingOrderLabel = (order: LoginOrder): string => {
  const normalizedType = normalizeOrderType(order.type);
  const upperType = toUpper(normalizedType);
  const side = toUpper(order.side);
  const typeLabel =
    upperType.includes('BUY') || upperType.includes('SELL')
      ? upperType
      : `${side} ${upperType || 'ORDER'}`;

  return `${typeLabel} ${formatPositionVolumeLabel(Number(order.volume))}`.trim();
};
