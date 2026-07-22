/**
 * Shared SL/TP distance rules for the Modify Position screen.
 *
 * Brokers validate stops against the closing market price (bid for buy, ask
 * for sell). A level must sit on the correct side of that price and be at
 * least `minPoints` instrument points away.
 */

export const DEFAULT_MIN_STOP_DISTANCE_POINTS = 5;

/** Floating-point slack when comparing point distances (fraction of a point). */
const DISTANCE_EPSILON_POINTS = 1e-6;

export type StopTargetKind = 'sl' | 'tp';
export type TradeSide = 'buy' | 'sell';

export function resolveStopTargetDistancePoints(
  target: number,
  marketPrice: number,
  point: number,
): number {
  if (!(point > 0) || !(Number.isFinite(target) && target > 0) || !(Number.isFinite(marketPrice) && marketPrice > 0)) {
    return 0;
  }
  return Math.abs(target - marketPrice) / point;
}

/**
 * Buy SL / sell TP must stay below market; buy TP / sell SL must stay above.
 */
export function isStopTargetOnCorrectSide(
  kind: StopTargetKind,
  side: TradeSide,
  target: number,
  marketPrice: number,
): boolean {
  if (!(Number.isFinite(target) && target > 0) || !(Number.isFinite(marketPrice) && marketPrice > 0)) {
    return false;
  }
  const mustStayBelow = (side === 'buy') === (kind === 'sl');
  return mustStayBelow ? target < marketPrice : target > marketPrice;
}

export function isStopTargetDistanceValid(
  kind: StopTargetKind,
  side: TradeSide,
  target: number,
  marketPrice: number,
  point: number,
  minPoints: number = DEFAULT_MIN_STOP_DISTANCE_POINTS,
): boolean {
  if (!(point > 0) || !(minPoints > 0)) {
    return false;
  }
  if (!isStopTargetOnCorrectSide(kind, side, target, marketPrice)) {
    return false;
  }
  const pointsAway = resolveStopTargetDistancePoints(target, marketPrice, point);
  return pointsAway + DISTANCE_EPSILON_POINTS >= minPoints;
}

export function clampStopTargetToMinDistance(
  value: number,
  kind: StopTargetKind,
  side: TradeSide,
  marketPrice: number,
  minDistancePrice: number,
): number {
  if (!(Number.isFinite(value)) || !(marketPrice > 0) || !(minDistancePrice > 0)) {
    return value;
  }
  const mustStayBelow = (side === 'buy') === (kind === 'sl');
  return mustStayBelow
    ? Math.min(value, marketPrice - minDistancePrice)
    : Math.max(value, marketPrice + minDistancePrice);
}

export type StopValidationMessages = Readonly<{
  buySl: string;
  sellSl: string;
  buyTp: string;
  sellTp: string;
}>;

/**
 * Returns a human-readable violation for the first invalid level, or null when
 * both levels are clear / unset.
 */
export function validateStopTargetsDistance(options: {
  side: TradeSide;
  marketPrice: number;
  point: number;
  minPoints?: number;
  stopLoss: number | null;
  takeProfit: number | null;
  messages: StopValidationMessages;
}): string | null {
  const {
    side,
    marketPrice,
    point,
    minPoints = DEFAULT_MIN_STOP_DISTANCE_POINTS,
    stopLoss,
    takeProfit,
    messages,
  } = options;

  if (!(marketPrice > 0) || !(point > 0)) {
    return null;
  }

  if (stopLoss !== null && Number.isFinite(stopLoss) && stopLoss > 0) {
    if (!isStopTargetDistanceValid('sl', side, stopLoss, marketPrice, point, minPoints)) {
      return side === 'buy' ? messages.buySl : messages.sellSl;
    }
  }

  if (takeProfit !== null && Number.isFinite(takeProfit) && takeProfit > 0) {
    if (!isStopTargetDistanceValid('tp', side, takeProfit, marketPrice, point, minPoints)) {
      return side === 'buy' ? messages.buyTp : messages.sellTp;
    }
  }

  return null;
}
