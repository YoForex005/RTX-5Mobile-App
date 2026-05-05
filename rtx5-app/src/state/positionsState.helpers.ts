import type { PositionItem } from '../dev/mock/tradingData';
import {
  UNKNOWN_POSITION_SYMBOL,
  isRenderablePositionSymbol,
  mapPositionToItem,
} from './positionsMapper';

const TERMINAL_POSITION_STATES = new Set([
  'CLOSED',
  'CLOSE',
  'POSITION CLOSE',
  'POSITION CLOSED',
  'POSITION CLOSE BY',
  'CLOSED BY',
  'CLOSE BY',
  'SL HIT',
  'TP HIT',
  'REMOVED',
  'DELETED',
]);

export function findExistingPosition(positions: PositionItem[], dto: any): PositionItem | undefined {
  const incomingId = dto?.ticket ?? dto?.position_ticket ?? dto?.order_ticket ?? dto?.id;
  if (incomingId !== undefined && incomingId !== null) {
    return positions.find((position) => String(position.id) === String(incomingId));
  }

  return undefined;
}

export function normalizeLifecycleState(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isTerminalPositionUpdate(dto: any): boolean {
  if (!dto || typeof dto !== 'object') {
    return false;
  }

  const source = dto as Record<string, unknown>;
  return [
    source.status,
    source.state,
    source.position_state,
    source.positionStatus,
    source.action,
    source.event,
  ].some((value) => TERMINAL_POSITION_STATES.has(normalizeLifecycleState(value)));
}

export function shouldClearPositionsForLoginSwitch(
  currentLogin: string | null,
  nextLogin: string,
): boolean {
  return Boolean(currentLogin && currentLogin !== nextLogin);
}

type BuildMergedPositionsOptions = {
  preserveOptimisticMs?: number;
  preserveModifiedMs?: number;
  preserveMissingExisting?: boolean;
};

function isRenderablePosition(position: PositionItem): boolean {
  return (
    String(position.id ?? '').trim().length > 0 &&
    isRenderablePositionSymbol(position.symbol) &&
    position.symbol !== UNKNOWN_POSITION_SYMBOL
  );
}

export function buildMergedPositions(
  currentPositions: PositionItem[],
  dtos: any[],
  options: BuildMergedPositionsOptions = {},
): PositionItem[] {
  const preserveOptimisticMs = options.preserveOptimisticMs ?? 60000;
  const preserveModifiedMs = options.preserveModifiedMs ?? 10000;
  const mapped = dtos
    .map((dto) => mapPositionToItem(dto, findExistingPosition(currentPositions, dto)))
    .filter(isRenderablePosition);
  const now = Date.now();
  const mappedIds = new Set(mapped.map((position) => position.id));
  const missingCurrentPositions = currentPositions.filter(
    (position) => isRenderablePosition(position) && !mappedIds.has(position.id),
  );

  const optimisticPositions = missingCurrentPositions.filter((position) => {
    const clientCreatedAt = position.clientCreatedAt ?? 0;
    if (!clientCreatedAt || preserveOptimisticMs <= 0) return false;

    const ageMs = now - clientCreatedAt;
    const isRecent = ageMs >= 0 && ageMs < preserveOptimisticMs;
    return isRecent;
  });
  const preservedMissingPositions = options.preserveMissingExisting
    ? missingCurrentPositions
    : optimisticPositions;

  const mergedMapped = mapped.map((mappedPosition) => {
    const existing = currentPositions.find((position) => position.id === mappedPosition.id);
    if (existing?.clientModifiedAt) {
      const modAgeMs = now - existing.clientModifiedAt;
      if (modAgeMs >= 0 && modAgeMs < preserveModifiedMs) {
        return {
          ...mappedPosition,
          sl: existing.sl,
          tp: existing.tp,
          clientCreatedAt: existing.clientCreatedAt,
          clientModifiedAt: existing.clientModifiedAt,
        };
      }
    }

    return {
      ...mappedPosition,
      clientCreatedAt: existing?.clientCreatedAt,
      clientModifiedAt: existing?.clientModifiedAt,
    };
  });

  return [...preservedMissingPositions, ...mergedMapped].sort(
    (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
  );
}
