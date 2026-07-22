export type FeedHealthStatus =
  | 'disabled_unconfigured'
  | 'connecting'
  | 'healthy'
  | 'stale_or_degraded'
  | 'reconnecting'
  | 'auth_failed'
  | 'provider_down'
  | 'market_unavailable';

export type FeedHealthReasonCategory =
  | 'session_unconfigured'
  | 'credentials_unavailable'
  | 'health_policy_unconfigured'
  | 'awaiting_server_health'
  | 'awaiting_live_tick'
  | 'server_status_incomplete'
  | 'server_status_stale'
  | 'local_tick_stale'
  | 'server_degraded'
  | 'transport_interrupted'
  | 'authentication'
  | 'provider_connectivity'
  | 'market_service'
  | 'scheduled_market_closed';

export type FeedHealthIdentity = Readonly<{
  brokerId: string;
  accountLogin: string;
  sessionEpoch: number;
}>;

/**
 * Values must come from an approved broker health contract. There are no app
 * defaults: absent/invalid values deliberately leave price actions disabled.
 */
export type FeedHealthThresholds = Readonly<{
  localTickStaleAfterMs: number;
  serverStatusStaleAfterMs: number;
}>;

export type FeedMarketSchedule = 'unknown' | 'open' | 'scheduled_closed';

type ServerHealthVerdict =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'unconfigured'
  | 'auth_failed'
  | 'provider_down'
  | 'market_unavailable';

export type FeedHealthState = Readonly<{
  identity: FeedHealthIdentity | null;
  status: FeedHealthStatus;
  reasonCategory: FeedHealthReasonCategory;
  transportConfigured: boolean;
  credentialApproved: boolean;
  thresholds: FeedHealthThresholds | null;
  marketSchedule: FeedMarketSchedule;
  serverVerdict: ServerHealthVerdict;
  lastServerStatusAt?: number;
  lastLocalTickAt?: number;
  lastSuccessAt?: number;
  localTickAcceptable: boolean;
}>;

export type NormalizedFeedServerHealth = Readonly<{
  observedAt: number;
  feedConfigured: boolean;
  authAccepted: boolean | null;
  providerConnected: boolean | null;
  upstreamConnected: boolean | null;
  marketAvailable: boolean | null;
  scheduledMarketClosed: boolean;
  stale: boolean;
  degraded: boolean;
  /** Broker-approved aging policy from the confirmed status response. */
  thresholds?: FeedHealthThresholds;
}>;

export type FeedHealthEvent =
  | {
      type: 'BIND_SESSION';
      identity: FeedHealthIdentity;
      transportConfigured: boolean;
      credentialApproved: boolean;
      /** undefined preserves an existing same-session policy; null clears it. */
      thresholds?: FeedHealthThresholds | null;
    }
  | { type: 'UNBIND_SESSION'; reasonCategory?: FeedHealthReasonCategory }
  | { type: 'CONNECTING'; identity: FeedHealthIdentity }
  | {
      type: 'LOCAL_TICK';
      identity: FeedHealthIdentity;
      receivedAt: number;
      bid: number;
      ask: number;
      transport: 'websocket' | 'rest_snapshot' | undefined;
      stale?: boolean;
      degraded?: boolean;
    }
  | { type: 'SERVER_STATUS'; identity: FeedHealthIdentity; health: NormalizedFeedServerHealth }
  | {
      type: 'SOCKET_CLOSED';
      identity: FeedHealthIdentity;
      authFailure?: boolean;
    }
  | { type: 'CREDENTIALS_REFRESHED'; identity: FeedHealthIdentity }
  | { type: 'RETRY_REQUESTED'; identity: FeedHealthIdentity }
  | { type: 'EVALUATE'; identity: FeedHealthIdentity; now: number };

export const initialFeedHealthState: FeedHealthState = Object.freeze({
  identity: null,
  status: 'disabled_unconfigured',
  reasonCategory: 'session_unconfigured',
  transportConfigured: false,
  credentialApproved: false,
  thresholds: null,
  marketSchedule: 'unknown',
  serverVerdict: 'unknown',
  localTickAcceptable: false,
});

const cleanIdentityPart = (value: unknown): string => String(value ?? '').trim();

const normalizeIdentity = (identity: FeedHealthIdentity): FeedHealthIdentity => Object.freeze({
  brokerId: cleanIdentityPart(identity.brokerId).toLowerCase(),
  accountLogin: cleanIdentityPart(identity.accountLogin),
  sessionEpoch: Number(identity.sessionEpoch),
});

export const isValidFeedHealthIdentity = (identity: FeedHealthIdentity): boolean => {
  const normalized = normalizeIdentity(identity);
  return Boolean(
    normalized.brokerId &&
    normalized.accountLogin &&
    Number.isSafeInteger(normalized.sessionEpoch) &&
    normalized.sessionEpoch > 0,
  );
};

export const sameFeedHealthIdentity = (
  left: FeedHealthIdentity | null | undefined,
  right: FeedHealthIdentity | null | undefined,
): boolean => {
  if (!left || !right) return false;
  const normalizedLeft = normalizeIdentity(left);
  const normalizedRight = normalizeIdentity(right);
  return normalizedLeft.brokerId === normalizedRight.brokerId &&
    normalizedLeft.accountLogin === normalizedRight.accountLogin &&
    normalizedLeft.sessionEpoch === normalizedRight.sessionEpoch;
};

const normalizeThresholds = (
  thresholds: FeedHealthThresholds | null | undefined,
): FeedHealthThresholds | null => {
  if (!thresholds) return null;
  const localTickStaleAfterMs = Number(thresholds.localTickStaleAfterMs);
  const serverStatusStaleAfterMs = Number(thresholds.serverStatusStaleAfterMs);
  if (
    !Number.isFinite(localTickStaleAfterMs) ||
    !Number.isFinite(serverStatusStaleAfterMs) ||
    localTickStaleAfterMs <= 0 ||
    serverStatusStaleAfterMs <= 0
  ) {
    return null;
  }
  return Object.freeze({ localTickStaleAfterMs, serverStatusStaleAfterMs });
};

const finiteTimestamp = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const withStatus = (
  state: FeedHealthState,
  status: FeedHealthStatus,
  reasonCategory: FeedHealthReasonCategory,
  changes: Partial<FeedHealthState> = {},
): FeedHealthState => Object.freeze({ ...state, ...changes, status, reasonCategory });

const evaluateBoundHealth = (state: FeedHealthState, now: number): FeedHealthState => {
  if (!state.identity || !state.transportConfigured) {
    return withStatus(state, 'disabled_unconfigured', 'session_unconfigured');
  }
  if (!state.credentialApproved) {
    return withStatus(state, 'auth_failed', 'credentials_unavailable');
  }

  switch (state.serverVerdict) {
    case 'unconfigured':
      return withStatus(state, 'disabled_unconfigured', 'session_unconfigured');
    case 'auth_failed':
      return withStatus(state, 'auth_failed', 'authentication');
    case 'provider_down':
      return withStatus(state, 'provider_down', 'provider_connectivity');
    case 'market_unavailable':
      return withStatus(state, 'market_unavailable', 'market_service');
    case 'degraded':
      return withStatus(state, 'stale_or_degraded', 'server_degraded');
    default:
      break;
  }

  if (!state.thresholds) {
    if (state.serverVerdict === 'unknown' && !state.lastLocalTickAt) {
      return withStatus(state, 'connecting', 'awaiting_server_health');
    }
    return withStatus(state, 'stale_or_degraded', 'health_policy_unconfigured');
  }

  const evaluatedAt = finiteTimestamp(now);
  if (!evaluatedAt) {
    return withStatus(state, 'stale_or_degraded', 'server_status_incomplete');
  }

  if (state.serverVerdict !== 'healthy' || !state.lastServerStatusAt) {
    return withStatus(state, 'connecting', 'awaiting_server_health');
  }

  if (evaluatedAt - state.lastServerStatusAt >= state.thresholds.serverStatusStaleAfterMs) {
    return withStatus(state, 'stale_or_degraded', 'server_status_stale');
  }

  // A scheduled close can legitimately have no ticks/provider session. Fresh,
  // explicit server health is enough to avoid falsely labelling the feed DOWN,
  // while the action guard below still blocks price-dependent execution.
  if (state.marketSchedule === 'scheduled_closed') {
    return withStatus(state, 'healthy', 'scheduled_market_closed');
  }

  if (!state.lastLocalTickAt) {
    return withStatus(state, 'connecting', 'awaiting_live_tick');
  }
  if (
    !state.localTickAcceptable ||
    evaluatedAt - state.lastLocalTickAt >= state.thresholds.localTickStaleAfterMs
  ) {
    return withStatus(state, 'stale_or_degraded', 'local_tick_stale');
  }

  return withStatus(state, 'healthy', 'awaiting_live_tick');
};


const bindSession = (
  state: FeedHealthState,
  event: Extract<FeedHealthEvent, { type: 'BIND_SESSION' }>,
): FeedHealthState => {
  if (!isValidFeedHealthIdentity(event.identity)) {
    return initialFeedHealthState;
  }

  const identity = normalizeIdentity(event.identity);
  const sameSession = sameFeedHealthIdentity(state.identity, identity);
  const thresholds = event.thresholds === undefined && sameSession
    ? state.thresholds
    : normalizeThresholds(event.thresholds);
  const base: FeedHealthState = sameSession
    ? Object.freeze({
        ...state,
        identity,
        transportConfigured: event.transportConfigured,
        credentialApproved: event.credentialApproved,
        thresholds,
      })
    : Object.freeze({
        identity,
        status: 'connecting',
        reasonCategory: 'awaiting_server_health',
        transportConfigured: event.transportConfigured,
        credentialApproved: event.credentialApproved,
        thresholds,
        marketSchedule: 'unknown',
        serverVerdict: 'unknown',
        localTickAcceptable: false,
      });

  return evaluateBoundHealth(base, Date.now());
};

const serverStatusState = (
  state: FeedHealthState,
  health: NormalizedFeedServerHealth,
): FeedHealthState => {
  const observedAt = finiteTimestamp(health.observedAt);
  if (!observedAt) {
    return withStatus(state, 'stale_or_degraded', 'server_status_incomplete', {
      serverVerdict: 'degraded',
    });
  }

  const marketSchedule: FeedMarketSchedule = health.scheduledMarketClosed
    ? 'scheduled_closed'
    : 'open';
  let serverVerdict: ServerHealthVerdict;
  let reasonCategory: FeedHealthReasonCategory;

  // authAccepted tri-state (null = unknown / not checked):
  // only false is an explicit rejection of a presented credential.
  if (!health.feedConfigured) {
    serverVerdict = 'unconfigured';
    reasonCategory = 'session_unconfigured';
  } else if (health.authAccepted === false) {
    serverVerdict = 'auth_failed';
    reasonCategory = 'authentication';
  } else if (
    !health.scheduledMarketClosed &&
    (health.providerConnected === false || health.upstreamConnected === false)
  ) {
    serverVerdict = 'provider_down';
    reasonCategory = 'provider_connectivity';
  } else if (!health.scheduledMarketClosed && health.marketAvailable === false) {
    serverVerdict = 'market_unavailable';
    reasonCategory = 'market_service';
  } else if (
    health.stale ||
    health.degraded ||
    // null authAccepted is "unknown" — incomplete honesty, not auth_failed.
    // true is required for a fully healthy server verdict.
    health.authAccepted !== true ||
    (!health.scheduledMarketClosed && (
      health.marketAvailable !== true ||
      health.providerConnected !== true ||
      health.upstreamConnected !== true
    ))
  ) {
    serverVerdict = 'degraded';
    reasonCategory = health.stale || health.degraded
      ? 'server_degraded'
      : 'server_status_incomplete';
  } else {
    serverVerdict = 'healthy';
    reasonCategory = health.scheduledMarketClosed
      ? 'scheduled_market_closed'
      : 'awaiting_live_tick';
  }

  // Learn policy only from a confirmed status for this already-bound identity.
  // An omitted/malformed later policy preserves the last confirmed policy for
  // the same session; a new session still starts without one and fails closed.
  const confirmedThresholds = normalizeThresholds(health.thresholds);
  const updated = withStatus(state, state.status, reasonCategory, {
    marketSchedule,
    serverVerdict,
    lastServerStatusAt: observedAt,
    ...(confirmedThresholds ? { thresholds: confirmedThresholds } : {}),
  });
  return evaluateBoundHealth(updated, observedAt);
};

export const reduceFeedHealth = (
  state: FeedHealthState,
  event: FeedHealthEvent,
): FeedHealthState => {
  if (event.type === 'BIND_SESSION') {
    return bindSession(state, event);
  }
  if (event.type === 'UNBIND_SESSION') {
    return event.reasonCategory
      ? Object.freeze({ ...initialFeedHealthState, reasonCategory: event.reasonCategory })
      : initialFeedHealthState;
  }
  if (!state.identity || !sameFeedHealthIdentity(state.identity, event.identity)) {
    return state;
  }

  switch (event.type) {
    case 'CONNECTING':
      return withStatus(state, 'connecting', 'awaiting_server_health');
    case 'LOCAL_TICK': {
      const receivedAt = finiteTimestamp(event.receivedAt);
      const validPrices = Number.isFinite(event.bid) && event.bid > 0 &&
        Number.isFinite(event.ask) && event.ask > 0;
      if (!receivedAt || !validPrices || event.transport !== 'websocket') {
        return state;
      }
      const localTickAcceptable = event.stale !== true && event.degraded !== true;
      const updated = withStatus(state, state.status, state.reasonCategory, {
        lastLocalTickAt: receivedAt,
        ...(localTickAcceptable ? { lastSuccessAt: receivedAt } : {}),
        localTickAcceptable,
      });
      return evaluateBoundHealth(updated, receivedAt);
    }
    case 'SERVER_STATUS':
      // Socket/server authentication failures are latched. A generic health
      // success cannot silently make rejected credentials executable again.
      if (state.serverVerdict === 'auth_failed') return state;
      return serverStatusState(state, event.health);
    case 'SOCKET_CLOSED':
      return event.authFailure
        ? withStatus(state, 'auth_failed', 'authentication', { serverVerdict: 'auth_failed' })
        : withStatus(state, 'reconnecting', 'transport_interrupted');
    case 'CREDENTIALS_REFRESHED':
      return state.credentialApproved
        ? withStatus(state, 'connecting', 'awaiting_server_health', {
            serverVerdict: 'unknown',
            lastServerStatusAt: undefined,
          })
        : state;
    case 'RETRY_REQUESTED':
      // Keep the last server-authoritative outage visible until the bounded
      // retry probe actually succeeds. Moving to `connecting` here can hide a
      // provider outage and leaves zero-demand retries stuck without a probe.
      return state;
    case 'EVALUATE':
      return evaluateBoundHealth(state, event.now);
  }
};

export const feedHealthCanSafelyRetry = (state: FeedHealthState): boolean =>
  Boolean(
    state.identity &&
    state.transportConfigured &&
    state.credentialApproved &&
    (
      state.status === 'stale_or_degraded' ||
      state.status === 'reconnecting' ||
      state.status === 'provider_down' ||
      state.status === 'market_unavailable'
    ),
  );

/** Hard server/session states that must never be followed by a socket open. */
export const feedHealthBlocksSocketConnection = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
): boolean => Boolean(
  !sameFeedHealthIdentity(state.identity, identity) ||
  !state.transportConfigured ||
  !state.credentialApproved ||
  state.status === 'disabled_unconfigured' ||
  state.status === 'auth_failed' ||
  state.status === 'provider_down' ||
  state.status === 'market_unavailable',
);

/**
 * Compatibility gate for broker status responses that do not publish a
 * health_policy. Quote-local execution checks still require a fresh,
 * explicitly tradable WebSocket tick; this gate only prevents an absent
 * optional policy from permanently disabling Buy/Sell. Explicit session,
 * credential, transport, provider, market, and socket failures remain hard
 * blocks. Once a broker publishes thresholds, the stricter policy gate below
 * is authoritative and this fallback is not used.
 */
export const feedHealthAllowsFreshQuoteFallback = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
): boolean => Boolean(
  !state.thresholds &&
  !feedHealthBlocksSocketConnection(state, identity) &&
  state.status !== 'reconnecting' &&
  state.marketSchedule !== 'scheduled_closed' &&
  state.lastLocalTickAt &&
  state.localTickAcceptable,
);

export const feedHealthAllowsPriceActions = (
  state: FeedHealthState,
  now: number = Date.now(),
): boolean => {
  if (
    state.status !== 'healthy' ||
    !state.identity ||
    !state.transportConfigured ||
    !state.credentialApproved ||
    !state.thresholds ||
    state.marketSchedule !== 'open' ||
    state.serverVerdict !== 'healthy' ||
    !state.lastServerStatusAt ||
    !state.lastLocalTickAt ||
    !state.localTickAcceptable
  ) {
    return false;
  }

  const evaluatedAt = finiteTimestamp(now);
  return Boolean(
    evaluatedAt &&
    evaluatedAt - state.lastServerStatusAt < state.thresholds.serverStatusStaleAfterMs &&
    evaluatedAt - state.lastLocalTickAt < state.thresholds.localTickStaleAfterMs,
  );
};

/** Useful for tests and UI guards that must not display another broker's state. */
export const feedHealthStateMatchesIdentity = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
): boolean => sameFeedHealthIdentity(state.identity, identity);

/**
 * Internal equality helper used by the runtime to avoid redundant subscriber
 * notifications. Deliberately ignores the pure-bookkeeping timestamps
 * (lastServerStatusAt / lastLocalTickAt / lastSuccessAt): they move on every
 * websocket tick, and comparing them made a 40Hz tick stream notify every
 * subscribed screen per tick. Staleness driven by those timestamps still
 * surfaces here as a status/serverVerdict/localTickAcceptable transition via
 * the runtime's scheduled EVALUATE events, and the degraded banner reads its
 * "last success" from the snapshot taken at that transition.
 */
export const areFeedHealthStatesEquivalent = (
  left: FeedHealthState,
  right: FeedHealthState,
): boolean =>
  left === right || (
    sameFeedHealthIdentity(left.identity, right.identity) &&
    left.status === right.status &&
    left.reasonCategory === right.reasonCategory &&
    left.transportConfigured === right.transportConfigured &&
    left.credentialApproved === right.credentialApproved &&
    left.marketSchedule === right.marketSchedule &&
    left.serverVerdict === right.serverVerdict &&
    left.localTickAcceptable === right.localTickAcceptable &&
    left.thresholds?.localTickStaleAfterMs === right.thresholds?.localTickStaleAfterMs &&
    left.thresholds?.serverStatusStaleAfterMs === right.thresholds?.serverStatusStaleAfterMs
  );
