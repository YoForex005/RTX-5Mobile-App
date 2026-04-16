import type { PositionItem } from '../mock/tradingData';
import { mapPositionToItem } from './positionsMapper';

const TERMINAL_POSITION_STATES = new Set([
  'CLOSED',
  'CLOSE',
  'CLOSED BY',
  'REMOVED',
  'DELETED',
]);

export function findExistingPosition(positions: PositionItem[], dto: any): PositionItem | undefined {
  const incomingId = dto?.ticket ?? dto?.id;
  if (incomingId !== undefined && incomingId !== null) {
    return positions.find((position) => String(position.id) === String(incomingId));
  }

  return undefined;
}

export function normalizeLifecycleState(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
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

export function buildMergedPositions(
  currentPositions: PositionItem[],
  dtos: any[],
  preserveOptimisticMs: number = 60000,
  preserveModifiedMs: number = 10000,
): PositionItem[] {
  const mapped = dtos.map((dto) => mapPositionToItem(dto, findExistingPosition(currentPositions, dto)));
  const now = Date.now();

  const optimisticPositions = currentPositions.filter((position) => {
    const clientCreatedAt = position.clientCreatedAt ?? 0;
    if (!clientCreatedAt || preserveOptimisticMs <= 0) return false;

    const ageMs = now - clientCreatedAt;
    const isRecent = ageMs >= 0 && ageMs < preserveOptimisticMs;
    const existsInFetched = mapped.some((mappedPosition) => mappedPosition.id === position.id);
    return isRecent && !existsInFetched;
  });

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

  return [...optimisticPositions, ...mergedMapped].sort(
    (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
  );
}
