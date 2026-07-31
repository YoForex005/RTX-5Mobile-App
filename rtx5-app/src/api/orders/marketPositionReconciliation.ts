import type { Position } from '../positions';
import type { PlaceOrderResponse } from './types';

export const MARKET_POSITION_RECONCILIATION_ATTEMPTS = 10;
export const MARKET_POSITION_RECONCILIATION_DELAY_MS = 400;

type ReconciliationResult = 'committed' | 'stale' | 'unresolved';

type MarketPositionReconciliationDependencies = {
  readPositions: () => Promise<Position[]>;
  commitPositions: (positions: Position[]) => void;
  isOwnerCurrent: () => boolean;
  wait?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const waitFor = (delayMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, delayMs);
});

const toTicketKey = (value: unknown): string | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null;
};

const getResponseTicket = (response: PlaceOrderResponse | null): string | null =>
  toTicketKey(response?.position_ticket ?? response?.ticket);

const candidateContainsTicket = (positions: Position[], ticket: string): boolean =>
  positions.some((position) => toTicketKey(position.ticket) === ticket);

const getResponseAction = (response: PlaceOrderResponse | null): string =>
  typeof response?.action === 'string' ? response.action.trim().toLowerCase() : '';

const responseWasRejected = (response: PlaceOrderResponse | null): boolean => {
  const status = typeof response?.status === 'string' ? response.status.trim().toLowerCase() : '';
  return ['rejected', 'failed', 'error'].includes(status);
};

/**
 * A broker's first ledger read can arrive before its accepted market mutation.
 * Keep that candidate off-screen until it agrees with the execution ticket.
 */
export function hasMarketPositionReconciliationConverged(
  response: PlaceOrderResponse | null,
  positions: Position[],
  attempt: number,
): boolean {
  const ticket = getResponseTicket(response);
  if (!ticket || responseWasRejected(response)) {
    // For an unknown transport outcome there is no safe ticket assertion. A
    // second full read is the minimum backstop before replacing the ledger.
    return attempt >= 1;
  }

  const action = getResponseAction(response);
  const ticketPresent = candidateContainsTicket(positions, ticket);
  if (action === 'closed') {
    return !ticketPresent;
  }
  if (action === 'opened' || action === 'open') {
    return ticketPresent;
  }
  if (['increased', 'decreased', 'reversed'].includes(action)) {
    return ticketPresent && attempt >= 1;
  }

  // An empty/unknown action can represent netting on older gateways. Require
  // both ticket presence and a second read so an already-open ticket does not
  // make the pre-commit candidate look converged.
  return ticketPresent && attempt >= 1;
}

export async function reconcileMarketOrderPositions(
  response: PlaceOrderResponse | null,
  dependencies: MarketPositionReconciliationDependencies,
): Promise<ReconciliationResult> {
  const wait = dependencies.wait ?? waitFor;
  const maxAttempts = Math.max(
    1,
    dependencies.maxAttempts ?? MARKET_POSITION_RECONCILIATION_ATTEMPTS,
  );
  const retryDelayMs = Math.max(
    0,
    dependencies.retryDelayMs ?? MARKET_POSITION_RECONCILIATION_DELAY_MS,
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!dependencies.isOwnerCurrent()) return 'stale';

    try {
      const positions = await dependencies.readPositions();
      if (!dependencies.isOwnerCurrent()) return 'stale';
      if (hasMarketPositionReconciliationConverged(response, positions, attempt)) {
        dependencies.commitPositions(positions);
        return 'committed';
      }
    } catch {
      // A later strict read can still converge. Invalid response shapes are
      // never reinterpreted as an empty authoritative ledger.
    }

    if (attempt + 1 < maxAttempts) {
      await wait(retryDelayMs);
    }
  }

  // A candidate that contradicts confirmed execution evidence must not erase
  // the current UI. Normal polling resumes after the mutation barrier releases.
  return dependencies.isOwnerCurrent() ? 'unresolved' : 'stale';
}
