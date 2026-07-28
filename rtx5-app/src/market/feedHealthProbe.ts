import {
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionIdentity,
  type ActiveBrokerSessionOwnerStamp,
  type FeedAuthContext,
} from '../state/activeBrokerSession';
import { resolveEffectiveFeedAuthForSession } from '../api/feedAuthContract';
import { preserveNonBlankFeedToken } from '../api/feedAuth';
import { timedFetch } from '../utils/apiLatency';
import { reportFeedServerStatus } from './feedHealthRuntime';
import type {
  FeedHealthThresholds,
  NormalizedFeedServerHealth,
} from './feedHealthState';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const optionalBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const boundedMilliseconds = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= minimum && value <= maximum ? value : null;
};

/**
 * Accept only the broker-approved health policy carried by a confirmed status
 * response. Missing, partial, string-valued, or absurd policies stay absent so
 * execution continues to fail closed instead of inventing mobile defaults.
 */
export const normalizeFeedHealthThresholds = (
  value: unknown,
): FeedHealthThresholds | null => {
  const policy = asRecord(value);
  if (!policy) return null;
  const localTickStaleAfterMs = boundedMilliseconds(
    policy.local_tick_stale_after_ms ?? policy.localTickStaleAfterMs,
    500,
    60_000,
  );
  const serverStatusStaleAfterMs = boundedMilliseconds(
    policy.server_status_stale_after_ms ?? policy.serverStatusStaleAfterMs,
    5_000,
    300_000,
  );
  if (localTickStaleAfterMs === null || serverStatusStaleAfterMs === null) {
    return null;
  }
  return Object.freeze({ localTickStaleAfterMs, serverStatusStaleAfterMs });
};

/**
 * Status endpoints that require feed auth return auth_accepted=false without
 * credentials. Attach the same query contract used by the quote WebSocket so
 * the health probe does not falsely latch auth_failed / block the socket.
 */
export const buildAuthenticatedFeedStatusUrl = (
  feedStatusUrl: string,
  input: {
    brokerId: string;
    feedAuthContext: FeedAuthContext;
    feedToken?: string | null;
    accessToken?: string | null;
    accountLogin?: string;
  },
): string => {
  const base = String(feedStatusUrl ?? '').trim();
  if (!base) return base;
  const effective = resolveEffectiveFeedAuthForSession({
    brokerId: input.brokerId,
    feedAuthContext: input.feedAuthContext,
    feedToken: input.feedToken,
  });
  const auth = effective.feedAuthContext;
  const credential = auth.mode === 'query' && auth.credential === 'access_token'
    ? cleanString(input.accessToken)
    : preserveNonBlankFeedToken(effective.feedToken);
  if (auth.mode !== 'query' || !credential) {
    return base;
  }
  try {
    const url = new URL(base);
    url.searchParams.set(auth.tokenQueryParam, credential);
    if (auth.brokerIdQueryParam) {
      url.searchParams.set(auth.brokerIdQueryParam, input.brokerId);
    }
    if (auth.accountLoginQueryParam && input.accountLogin) {
      url.searchParams.set(auth.accountLoginQueryParam, input.accountLogin);
    }
    return url.toString();
  } catch {
    return base;
  }
};

export type NormalizeFeedStatusOptions = Readonly<{
  /**
   * True only when this status request included a feed credential.
   * MyProp (and similar bridges) may still return auth_accepted:false on
   * tokenless public probes — that must NOT be treated as auth rejection.
   */
  credentialPresented?: boolean;
}>;

/**
 * auth_accepted tri-state for health:
 * - omit/null → unknown (never auth_failed)
 * - false without credential → legacy tokenless probe → unknown
 * - false with credential → rejected
 * - true → accepted
 */
export const resolveAuthAcceptedForHealth = (
  rawAuthAccepted: boolean | null,
  credentialPresented: boolean,
): boolean | null => {
  if (rawAuthAccepted === true) return true;
  if (rawAuthAccepted === false && credentialPresented) return false;
  // omit/null, or false without presenting a credential → unknown
  return null;
};

export const isFeedAuthRejected = (
  authAccepted: boolean | null | undefined,
  credentialPresented: boolean,
): boolean => authAccepted === false && credentialPresented === true;

export const normalizeConfirmedFeedStatus = (
  payload: unknown,
  observedAt: number,
  options?: NormalizeFeedStatusOptions,
): NormalizedFeedServerHealth | null => {
  const record = asRecord(payload);
  if (!record || !Number.isFinite(observedAt) || observedAt <= 0) return null;
  const providers = Array.isArray(record.providers)
    ? record.providers.map(asRecord).filter((provider): provider is Record<string, unknown> => Boolean(provider))
    : [];
  const declaredProviderId = cleanString(record.feed_provider).toLowerCase();
  const activeProvider = declaredProviderId
    ? providers.find((provider) => cleanString(provider.id).toLowerCase() === declaredProviderId)
    : undefined;
  // `cserver_connected` describes only the cserver leg. Some broker status
  // payloads declare a different active provider (for example rtx5_hub/t4b)
  // without including a provider row for the declared id. Falling back to an
  // unrelated cserver=false in that case falsely marks the live feed DOWN and
  // prevents the quote socket from opening at all. Preserve unknown (null)
  // unless cserver is explicitly the declared provider or no provider id was
  // supplied by a legacy status response.
  const providerConnected = activeProvider
    ? optionalBoolean(activeProvider.connected)
    : declaredProviderId === '' || declaredProviderId === 'cserver'
      ? optionalBoolean(record.cserver_connected)
      : null;
  const upstreamConnected = optionalBoolean(record.upstream_connected);
  const marketAvailable = optionalBoolean(
    record.market_available ?? record.marketAvailable,
  );
  const scheduledMarketClosed =
    record.scheduled_market_closed === true ||
    record.market_schedule === 'closed';
  const symbolStatus = Array.isArray(record.symbol_status)
    ? record.symbol_status.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  const hasFreshTradableSymbol = symbolStatus.some((entry) => (
    entry.fresh === true && entry.stale !== true && entry.tradable === true
  ));
  const hasAnyStatusSignal = Boolean(
    record.feed_active_source ||
    Array.isArray(record.available_symbols) ||
    providers.length > 0 ||
    upstreamConnected !== null,
  );
  if (!hasAnyStatusSignal) return null;

  const credentialPresented = options?.credentialPresented === true;
  // Only hard-fail auth when a credential was presented and explicitly rejected.
  // Tokenless legacy false / omit / null stay unknown (null).
  const authAccepted = resolveAuthAcceptedForHealth(
    optionalBoolean(record.auth_accepted),
    credentialPresented,
  );
  const thresholds = normalizeFeedHealthThresholds(
    record.health_policy ?? record.healthPolicy,
  );

  return Object.freeze({
    observedAt,
    feedConfigured: Boolean(
      record.feed_active_source ||
      (Array.isArray(record.available_symbols) && record.available_symbols.length > 0)
    ),
    authAccepted,
    providerConnected,
    upstreamConnected,
    marketAvailable: marketAvailable ?? (hasFreshTradableSymbol ? true : null),
    scheduledMarketClosed,
    stale: record.stale === true,
    degraded: record.degraded === true,
    ...(thresholds ? { thresholds } : {}),
  });
};

let activeProbeController: AbortController | null = null;

/** One bounded foreground/demand probe against the exact active status URL. */
export const probeActiveFeedHealth = async (
  expectedOwner?: ActiveBrokerSessionOwnerStamp,
): Promise<boolean> => {
  const capture = captureActiveBrokerSession();
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!capture || !owner) return false;
  const identity = getActiveBrokerSessionIdentity(capture.session);
  if (
    expectedOwner &&
    (
      expectedOwner.brokerId !== owner.brokerId ||
      expectedOwner.accountLogin !== owner.accountLogin ||
      expectedOwner.sessionEpoch !== owner.sessionEpoch ||
      expectedOwner.credentialGeneration !== owner.credentialGeneration ||
      expectedOwner.credentialIdentity !== owner.credentialIdentity
    )
  ) {
    return false;
  }

  activeProbeController?.abort();
  const controller = new AbortController();
  activeProbeController = controller;
  try {
    const statusUrl = buildAuthenticatedFeedStatusUrl(capture.session.feedStatusUrl, {
      brokerId: capture.session.brokerId,
      feedAuthContext: capture.session.feedAuthContext,
      feedToken: capture.credentials.feedToken,
      accessToken: capture.credentials.accessToken,
      accountLogin: capture.session.accountLogin,
    });
    // Did we actually attach a feed credential to this status request?
    const credentialPresented = (() => {
      try {
        const probe = new URL(statusUrl);
        const bare = new URL(capture.session.feedStatusUrl);
        return probe.search !== bare.search && (
          probe.searchParams.has('token') ||
          [...probe.searchParams.keys()].some((k) => k.toLowerCase().includes('token'))
        );
      } catch {
        return statusUrl !== capture.session.feedStatusUrl;
      }
    })();
    const response = await timedFetch(statusUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }, {
      label: 'market.feedHealth',
      method: 'GET',
      endpoint: '/ws/feed/status',
      source: 'marketHealth',
      timeoutMs: 3_000,
    });
    if (!response.ok || !isActiveBrokerSessionOwnerStampCurrent(owner)) return false;
    const normalized = normalizeConfirmedFeedStatus(await response.json(), Date.now(), {
      credentialPresented,
    });
    if (!normalized || !isActiveBrokerSessionOwnerStampCurrent(owner)) return false;
    reportFeedServerStatus(identity, normalized);
    return true;
  } catch {
    return false;
  } finally {
    if (activeProbeController === controller) activeProbeController = null;
  }
};

export const cancelActiveFeedHealthProbe = (): void => {
  activeProbeController?.abort();
  activeProbeController = null;
};
