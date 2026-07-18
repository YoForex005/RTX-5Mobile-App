import { timedFetch } from '../../../utils/apiLatency';
import { normalizeConfirmedFeedStatus } from '../../../market/feedHealthProbe';

export type BrokerDirectoryHealthState =
  | 'provider_online_unverified'
  | 'healthy'
  | 'delayed'
  | 'market_closed'
  | 'auth_failed'
  | 'provider_down'
  | 'unavailable';

export type BrokerDirectoryHealthResult = Readonly<{
  state: BrokerDirectoryHealthState;
  label: string;
}>;

// Directory badges are informational snapshots, not durable feed state. Probe
// at a conservative foreground cadence and independently expire each result so
// a stalled request can never leave an old healthy badge on screen forever.
export const BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS = 30_000;
export const BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS = 45_000;

const RESULT: Record<BrokerDirectoryHealthState, BrokerDirectoryHealthResult> = {
  provider_online_unverified: Object.freeze({
    state: 'provider_online_unverified',
    label: 'Provider online · policy unverified',
  }),
  healthy: Object.freeze({ state: 'healthy', label: 'Market data available' }),
  delayed: Object.freeze({ state: 'delayed', label: 'Prices delayed' }),
  market_closed: Object.freeze({ state: 'market_closed', label: 'Market closed' }),
  auth_failed: Object.freeze({ state: 'auth_failed', label: 'Feed authentication unavailable' }),
  provider_down: Object.freeze({ state: 'provider_down', label: 'Provider unavailable' }),
  unavailable: Object.freeze({ state: 'unavailable', label: 'Status unavailable' }),
};

export const classifyBrokerDirectoryHealth = (
  payload: unknown,
  observedAt: number,
): BrokerDirectoryHealthResult => {
  const health = normalizeConfirmedFeedStatus(payload, observedAt);
  if (!health) return RESULT.unavailable;
  if (health.authAccepted === false) return RESULT.auth_failed;
  if (health.providerConnected === false || health.upstreamConnected === false) {
    return RESULT.provider_down;
  }
  if (health.scheduledMarketClosed) return RESULT.market_closed;
  if (health.stale || health.degraded || health.marketAvailable === false) {
    return RESULT.delayed;
  }
  // A directory card never upgrades provider connectivity into a universal
  // "live" claim. Healthy requires the broker status contract to positively
  // confirm authentication and market availability for this exact endpoint.
  if (health.authAccepted === true && health.marketAvailable === true) {
    return RESULT.healthy;
  }
  if (health.providerConnected === true || health.upstreamConnected === true) {
    return RESULT.provider_online_unverified;
  }
  return RESULT.unavailable;
};

export const probeBrokerDirectoryHealth = async (
  feedStatusUrl: string,
  signal?: AbortSignal,
): Promise<BrokerDirectoryHealthResult> => {
  if (!feedStatusUrl) return RESULT.unavailable;
  try {
    const response = await timedFetch(feedStatusUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    }, {
      label: 'broker.directoryFeedHealth',
      method: 'GET',
      endpoint: '/ws/feed/status',
      source: 'brokerDirectory',
      timeoutMs: 3_000,
    });
    if (!response.ok) return RESULT.unavailable;
    return classifyBrokerDirectoryHealth(await response.json(), Date.now());
  } catch {
    return RESULT.unavailable;
  }
};
