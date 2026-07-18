import {
  areFeedHealthStatesEquivalent,
  feedHealthCanSafelyRetry,
  initialFeedHealthState,
  reduceFeedHealth,
  sameFeedHealthIdentity,
  type FeedHealthEvent,
  type FeedHealthIdentity,
  type FeedHealthState,
  type FeedHealthThresholds,
  type NormalizedFeedServerHealth,
} from './feedHealthState';
import { recordMarketDataEvent } from './marketDataTelemetry';

type FeedHealthListener = () => void;

let snapshot: FeedHealthState = initialFeedHealthState;
let evaluationTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<FeedHealthListener>();

const clearEvaluationTimer = (): void => {
  if (evaluationTimer) {
    clearTimeout(evaluationTimer);
    evaluationTimer = null;
  }
};

const scheduleFreshnessEvaluation = (): void => {
  clearEvaluationTimer();
  if (!snapshot.identity || !snapshot.thresholds || !snapshot.lastServerStatusAt) {
    return;
  }

  const deadlines = [
    snapshot.lastServerStatusAt + snapshot.thresholds.serverStatusStaleAfterMs,
  ];
  if (snapshot.marketSchedule === 'open' && snapshot.lastLocalTickAt) {
    deadlines.push(snapshot.lastLocalTickAt + snapshot.thresholds.localTickStaleAfterMs);
  }
  const now = Date.now();
  const nextDeadline = Math.min(...deadlines.filter((deadline) => deadline > now));
  if (!Number.isFinite(nextDeadline)) {
    return;
  }

  const expectedIdentity = snapshot.identity;
  evaluationTimer = setTimeout(() => {
    evaluationTimer = null;
    dispatchFeedHealthEvent({
      type: 'EVALUATE',
      identity: expectedIdentity,
      now: Date.now(),
    });
  }, Math.max(0, nextDeadline - now));
};

const publish = (next: FeedHealthState): void => {
  if (areFeedHealthStatesEquivalent(snapshot, next)) {
    snapshot = next;
    scheduleFreshnessEvaluation();
    return;
  }
  const previous = snapshot;
  snapshot = next;
  recordMarketDataEvent('health_transition', {
    from: previous.status,
    to: next.status,
    reason: next.reasonCategory,
    brokerId: next.identity?.brokerId,
    sessionEpoch: next.identity?.sessionEpoch,
  });
  scheduleFreshnessEvaluation();
  for (const listener of [...listeners]) {
    listener();
  }
};

export const dispatchFeedHealthEvent = (event: FeedHealthEvent): FeedHealthState => {
  publish(reduceFeedHealth(snapshot, event));
  return snapshot;
};

export const getFeedHealthSnapshot = (): FeedHealthState => snapshot;

export const subscribeFeedHealth = (listener: FeedHealthListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export type BindFeedHealthSessionInput = Readonly<{
  identity: FeedHealthIdentity;
  transportConfigured: boolean;
  credentialApproved: boolean;
  /**
   * Omit to preserve a previously approved policy for this exact identity.
   * Pass null only when the contract is explicitly absent/revoked.
   */
  thresholds?: FeedHealthThresholds | null;
}>;

export const bindFeedHealthSession = (input: BindFeedHealthSessionInput): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'BIND_SESSION', ...input });

export const unbindFeedHealthSession = (): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'UNBIND_SESSION' });

export const reportFeedConnecting = (identity: FeedHealthIdentity): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'CONNECTING', identity });

export const reportFeedLocalTick = (
  identity: FeedHealthIdentity,
  tick: Readonly<{
    receivedAt: number;
    bid: number;
    ask: number;
    transport: 'websocket' | 'rest_snapshot' | undefined;
    stale?: boolean;
    degraded?: boolean;
  }>,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'LOCAL_TICK', identity, ...tick });

/** Accepts only an already-normalized, approved server-health contract. */
export const reportFeedServerStatus = (
  identity: FeedHealthIdentity,
  health: NormalizedFeedServerHealth,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'SERVER_STATUS', identity, health });

export const reportFeedSocketClosed = (
  identity: FeedHealthIdentity,
  authFailure = false,
): FeedHealthState => dispatchFeedHealthEvent({
  type: 'SOCKET_CLOSED',
  identity,
  authFailure,
});

/** Must be called only after an approved credential refresh has committed. */
export const reportFeedCredentialsRefreshed = (
  identity: FeedHealthIdentity,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'CREDENTIALS_REFRESHED', identity });

/**
 * Returns true only once the exact active identity has entered a retriable
 * state. The caller owns one bounded reconnect attempt; this module never
 * creates a second endpoint or recovery loop.
 */
export const requestFeedHealthRetry = (identity: FeedHealthIdentity): boolean => {
  if (!sameFeedHealthIdentity(snapshot.identity, identity) || !feedHealthCanSafelyRetry(snapshot)) {
    return false;
  }
  // The reducer deliberately preserves the truthful outage state until the
  // transport's one bounded server-health probe succeeds.
  dispatchFeedHealthEvent({ type: 'RETRY_REQUESTED', identity });
  return true;
};

export const __resetFeedHealthRuntimeForTests = (): void => {
  clearEvaluationTimer();
  snapshot = initialFeedHealthState;
  listeners.clear();
};
