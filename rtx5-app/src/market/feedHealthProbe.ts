import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  type ActiveBrokerSessionIdentity,
  type FeedAuthContext,
} from '../state/activeBrokerSession';
import { resolveEffectiveFeedAuthForSession } from '../api/feedAuthContract';
import { timedFetch } from '../utils/apiLatency';
import { reportFeedServerStatus } from './feedHealthRuntime';
import type { NormalizedFeedServerHealth } from './feedHealthState';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const optionalBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

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
  if (auth.mode !== 'query' || !effective.feedToken) {
    return base;
  }
  try {
    const url = new URL(base);
    url.searchParams.set(auth.tokenQueryParam, effective.feedToken);
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
  const activeProvider = typeof record.feed_provider === 'string'
    ? providers.find((provider) => provider.id === record.feed_provider)
    : undefined;
  const providerConnected = optionalBoolean(activeProvider?.connected) ??
    optionalBoolean(record.cserver_connected);
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
  });
};

let activeProbeController: AbortController | null = null;

/** One bounded foreground/demand probe against the exact active status URL. */
export const probeActiveFeedHealth = async (
  expectedIdentity?: ActiveBrokerSessionIdentity,
): Promise<boolean> => {
  const capture = captureActiveBrokerSession();
  if (!capture) return false;
  const identity = getActiveBrokerSessionIdentity(capture.session);
  if (
    expectedIdentity &&
    (
      expectedIdentity.brokerId !== identity.brokerId ||
      expectedIdentity.accountLogin !== identity.accountLogin ||
      expectedIdentity.sessionEpoch !== identity.sessionEpoch
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
    if (!response.ok || !isActiveBrokerSessionCurrent(identity)) return false;
    const normalized = normalizeConfirmedFeedStatus(await response.json(), Date.now(), {
      credentialPresented,
    });
    if (!normalized || !isActiveBrokerSessionCurrent(identity)) return false;
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
