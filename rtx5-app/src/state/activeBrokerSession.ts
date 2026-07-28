import {
  revalidateBrokerSessionEndpointSet,
} from '../api/brokerRouting';
import {
  fingerprintMarketDataHost,
  recordMarketDataEvent,
} from '../market/marketDataTelemetry';

export type FeedAuthCredential = 'feed_token' | 'access_token';

export type FeedAuthContext = Readonly<
  | { mode: 'none' }
  | {
      mode: 'disabled_unconfigured';
      reason: 'missing_contract' | 'missing_credential';
    }
  | {
      mode: 'query';
      credential: FeedAuthCredential;
      tokenQueryParam: string;
      brokerIdQueryParam?: string;
      accountLoginQueryParam?: string;
    }
>;

export type ActiveBrokerSession = Readonly<{
  brokerId: string;
  accountLogin: string;
  apiBase: string;
  feedWsBase: string;
  tradeWsBase?: string;
  feedStatusUrl: string;
  servicesDomain: string;
  feedAuthContext: FeedAuthContext;
  cacheNamespace: string;
  sessionEpoch: number;
  configVersion: string;
}>;

export type ActiveBrokerCredentials = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  feedToken?: string;
}>;

export type ActiveBrokerSessionIdentity = Readonly<{
  brokerId: string;
  accountLogin: string;
  sessionEpoch: number;
}>;

export type ActiveBrokerSessionProvenance = Readonly<{
  identity: ActiveBrokerSessionIdentity;
  apiBase: string;
  cacheNamespace: string;
  credentialGeneration: number;
  credentialIdentity: string;
}>;

/**
 * Strong owner stamp for mutations and sockets whose callbacks must also be
 * invalidated by an in-place credential rotation.
 */
export type ActiveBrokerSessionOwnerStamp = Readonly<{
  brokerId: string;
  accountLogin: string;
  apiBase: string;
  cacheNamespace: string;
  sessionEpoch: number;
  credentialGeneration: number;
  credentialIdentity: string;
}>;

export type ActiveBrokerSessionCapture = Readonly<{
  session: ActiveBrokerSession;
  credentials: ActiveBrokerCredentials;
}>;

export type ActiveBrokerSessionTransition = Readonly<{
  sessionEpoch: number;
}>;

export type ActivateBrokerSessionInput = Readonly<{
  brokerId: string;
  accountLogin: string | number;
  apiBase: string;
  feedWsBase: string;
  tradeWsBase?: string | null;
  feedStatusUrl: string;
  servicesDomain: string;
  feedAuthContext: FeedAuthContext;
  configVersion: string | number;
}>;

export type ActiveBrokerSessionEvent = Readonly<{
  type: 'transition' | 'activated' | 'credentials_updated';
  sessionEpoch: number;
  previousSession: ActiveBrokerSession | null;
  activeSession: ActiveBrokerSession | null;
}>;

type ActiveBrokerSessionListener = (event: ActiveBrokerSessionEvent) => void;

let currentEpoch = 0;
let activeCapture: ActiveBrokerSessionCapture | null = null;
const listeners = new Set<ActiveBrokerSessionListener>();
let cacheNamespaceNonceSequence = 0;
let credentialGeneration = 0;
let credentialIdentity = '';

/**
 * Epochs intentionally remain small process-local counters for ordering, but
 * disk-backed caches also need a process/activation-unique component. Without
 * it, the first login after every cold start reused `broker:account:1` and
 * could hydrate positions/candles written by an earlier authenticated session.
 */
const createCacheNamespaceNonce = (): string => {
  cacheNamespaceNonceSequence += 1;
  const runtimeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    try {
      return runtimeCrypto.randomUUID();
    } catch {
      // Fall through to the dependency-free React Native-safe nonce below.
    }
  }

  return [
    Date.now().toString(36),
    cacheNamespaceNonceSequence.toString(36),
    Math.random().toString(36).slice(2, 14),
  ].join('-');
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const normalizeBrokerId = (value: unknown): string => cleanString(value).toLowerCase();

const normalizeQueryParam = (value: unknown, name: string): string => {
  const normalized = cleanString(value);
  if (!normalized || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(normalized)) {
    throw new Error(`Active broker feed auth has an invalid ${name}.`);
  }
  return normalized;
};

const normalizeFeedAuthContext = (value: FeedAuthContext): FeedAuthContext => {
  if (value?.mode === 'disabled_unconfigured') {
    if (value.reason !== 'missing_contract' && value.reason !== 'missing_credential') {
      throw new Error('Active broker feed auth disabled reason is invalid.');
    }
    return Object.freeze({ mode: value.mode, reason: value.reason });
  }
  if (!value || value.mode === 'none') {
    return Object.freeze({ mode: 'none' });
  }
  if (value.mode !== 'query' || !['feed_token', 'access_token'].includes(value.credential)) {
    throw new Error('Active broker feed auth mode is invalid.');
  }
  const params = [
    value.tokenQueryParam,
    value.brokerIdQueryParam,
    value.accountLoginQueryParam,
  ].filter((param): param is string => Boolean(param));
  if (new Set(params).size !== params.length) {
    throw new Error('Active broker feed auth query parameters must be distinct.');
  }
  return Object.freeze({
    mode: 'query',
    credential: value.credential,
    tokenQueryParam: normalizeQueryParam(value.tokenQueryParam, 'token query parameter'),
    ...(value.brokerIdQueryParam
      ? { brokerIdQueryParam: normalizeQueryParam(value.brokerIdQueryParam, 'broker ID query parameter') }
      : {}),
    ...(value.accountLoginQueryParam
      ? { accountLoginQueryParam: normalizeQueryParam(value.accountLoginQueryParam, 'account login query parameter') }
      : {}),
  });
};

const normalizeFeedAuthContextForBroker = (
  brokerId: string,
  value: FeedAuthContext,
): FeedAuthContext => {
  const normalized = normalizeFeedAuthContext(value);
  if (
    brokerId === 'achiever-financials' &&
    normalized.mode !== 'disabled_unconfigured' &&
    (
      normalized.mode !== 'query' ||
      normalized.credential !== 'feed_token' ||
      normalized.tokenQueryParam !== 'token' ||
      normalized.brokerIdQueryParam !== 'broker_id' ||
      Boolean(normalized.accountLoginQueryParam)
    )
  ) {
    throw new Error('Active Achiever feed auth contract is invalid.');
  }
  return normalized;
};

const normalizeCredentials = (
  credentials: ActiveBrokerCredentials,
): ActiveBrokerCredentials => {
  const accessToken = cleanString(credentials.accessToken);
  if (!accessToken) {
    throw new Error('Active broker credentials require an access token.');
  }
  const feedToken =
    typeof credentials.feedToken === 'string' && credentials.feedToken.trim()
      ? credentials.feedToken
      : '';
  return Object.freeze({
    accessToken,
    refreshToken: cleanString(credentials.refreshToken),
    expiresAt: cleanString(credentials.expiresAt),
    ...(feedToken ? { feedToken } : {}),
  });
};

const identityMatches = (
  session: ActiveBrokerSession,
  identity: ActiveBrokerSessionIdentity,
): boolean =>
  session.sessionEpoch === identity.sessionEpoch &&
  session.brokerId === normalizeBrokerId(identity.brokerId) &&
  session.accountLogin === cleanString(identity.accountLogin);

const emit = (event: ActiveBrokerSessionEvent): void => {
  for (const listener of [...listeners]) {
    listener(event);
  }
};

export function beginActiveBrokerSessionTransition(): ActiveBrokerSessionTransition {
  const previousSession = activeCapture?.session ?? null;
  currentEpoch += 1;
  activeCapture = null;
  const transition = Object.freeze({ sessionEpoch: currentEpoch });
  recordMarketDataEvent('session_epoch_changed', {
    phase: 'transition',
    sessionEpoch: currentEpoch,
    hadPreviousSession: Boolean(previousSession),
  });
  emit(Object.freeze({
    type: 'transition',
    sessionEpoch: currentEpoch,
    previousSession,
    activeSession: null,
  }));
  return transition;
}

/** Current transition generation, including the logged-out state. */
export function getActiveBrokerSessionEpoch(): number {
  return currentEpoch;
}

export function activateBrokerSession(
  transition: ActiveBrokerSessionTransition,
  input: ActivateBrokerSessionInput,
  credentials: ActiveBrokerCredentials,
): ActiveBrokerSessionCapture {
  if (transition.sessionEpoch !== currentEpoch || activeCapture) {
    throw new Error('Active broker transition is stale or already committed.');
  }

  const brokerId = normalizeBrokerId(input.brokerId);
  const accountLogin = cleanString(input.accountLogin);
  const configVersion = cleanString(input.configVersion);
  const servicesDomain = cleanString(input.servicesDomain);

  if (!brokerId || !accountLogin) {
    throw new Error('Active broker session requires brokerId and accountLogin.');
  }
  if (!configVersion || !servicesDomain) {
    throw new Error('Active broker session requires versioned endpoint provenance.');
  }
  const resolution = revalidateBrokerSessionEndpointSet({
    brokerId,
    apiBase: input.apiBase,
    feedWsBase: input.feedWsBase,
    tradeWsBase: input.tradeWsBase,
    feedStatusUrl: input.feedStatusUrl,
    servicesDomain,
    configVersion,
  });
  if (!resolution.ok) {
    throw new Error(`Active broker session endpoint validation failed: ${resolution.message}`);
  }
  const endpoints = resolution.endpoints;

  const previousSession = null;
  const cacheNamespaceNonce = createCacheNamespaceNonce();
  const session = Object.freeze({
    brokerId,
    accountLogin,
    apiBase: endpoints.apiBase,
    feedWsBase: endpoints.feedWsBase,
    ...(endpoints.tradeWsBase ? { tradeWsBase: endpoints.tradeWsBase } : {}),
    feedStatusUrl: endpoints.feedStatusUrl,
    servicesDomain: endpoints.servicesDomain,
    feedAuthContext: normalizeFeedAuthContextForBroker(brokerId, input.feedAuthContext),
    cacheNamespace: `${brokerId}:${accountLogin}:${cacheNamespaceNonce}:${currentEpoch}`,
    sessionEpoch: currentEpoch,
    configVersion: endpoints.configVersion,
  });
  activeCapture = Object.freeze({
    session,
    credentials: normalizeCredentials(credentials),
  });
  credentialGeneration += 1;
  credentialIdentity = createCacheNamespaceNonce();
  recordMarketDataEvent('session_epoch_changed', {
    phase: 'activated',
    sessionEpoch: currentEpoch,
    brokerId,
    hostFingerprints: {
      api: fingerprintMarketDataHost(session.apiBase),
      feed: fingerprintMarketDataHost(session.feedWsBase),
      status: fingerprintMarketDataHost(session.feedStatusUrl),
      ...(session.tradeWsBase
        ? { trade: fingerprintMarketDataHost(session.tradeWsBase) }
        : {}),
    },
  });
  emit(Object.freeze({
    type: 'activated',
    sessionEpoch: currentEpoch,
    previousSession,
    activeSession: session,
  }));
  return activeCapture;
}

export const activateActiveBrokerSession = activateBrokerSession;

export function captureActiveBrokerSession(): ActiveBrokerSessionCapture | null {
  return activeCapture;
}

export function getActiveBrokerSession(): ActiveBrokerSession | null {
  return activeCapture?.session ?? null;
}

export function getActiveBrokerSessionIdentity(
  session: ActiveBrokerSession,
): ActiveBrokerSessionIdentity {
  return Object.freeze({
    brokerId: session.brokerId,
    accountLogin: session.accountLogin,
    sessionEpoch: session.sessionEpoch,
  });
}

export function getActiveBrokerSessionProvenance(
  session: ActiveBrokerSession,
): ActiveBrokerSessionProvenance {
  const owner = captureActiveBrokerSessionOwnerStamp();
  const belongsToCurrentOwner = Boolean(
    owner &&
    owner.brokerId === session.brokerId &&
    owner.accountLogin === session.accountLogin &&
    owner.apiBase === session.apiBase &&
    owner.cacheNamespace === session.cacheNamespace &&
    owner.sessionEpoch === session.sessionEpoch,
  );
  return Object.freeze({
    identity: getActiveBrokerSessionIdentity(session),
    apiBase: session.apiBase,
    cacheNamespace: session.cacheNamespace,
    credentialGeneration: belongsToCurrentOwner
      ? owner!.credentialGeneration
      : -1,
    credentialIdentity: belongsToCurrentOwner
      ? owner!.credentialIdentity
      : '',
  });
}

export function captureActiveBrokerSessionProvenance(): ActiveBrokerSessionProvenance | null {
  return activeCapture
    ? getActiveBrokerSessionProvenance(activeCapture.session)
    : null;
}

export function captureActiveBrokerSessionOwnerStamp(): ActiveBrokerSessionOwnerStamp | null {
  if (!activeCapture || !credentialIdentity || credentialGeneration <= 0) {
    return null;
  }
  return Object.freeze({
    brokerId: activeCapture.session.brokerId,
    accountLogin: activeCapture.session.accountLogin,
    apiBase: activeCapture.session.apiBase,
    cacheNamespace: activeCapture.session.cacheNamespace,
    sessionEpoch: activeCapture.session.sessionEpoch,
    credentialGeneration,
    credentialIdentity,
  });
}

export function isActiveBrokerSessionOwnerStampCurrent(
  owner: ActiveBrokerSessionOwnerStamp,
): boolean {
  return Boolean(
    activeCapture &&
    owner.brokerId === activeCapture.session.brokerId &&
    owner.accountLogin === activeCapture.session.accountLogin &&
    owner.apiBase === activeCapture.session.apiBase &&
    owner.cacheNamespace === activeCapture.session.cacheNamespace &&
    owner.sessionEpoch === activeCapture.session.sessionEpoch &&
    owner.credentialGeneration === credentialGeneration &&
    owner.credentialIdentity === credentialIdentity,
  );
}

export function isActiveBrokerSessionProvenanceCurrent(
  provenance: ActiveBrokerSessionProvenance,
): boolean {
  return Boolean(
    activeCapture &&
    activeCapture.session.apiBase === provenance.apiBase &&
    activeCapture.session.cacheNamespace === provenance.cacheNamespace &&
    identityMatches(activeCapture.session, provenance.identity) &&
    provenance.credentialGeneration === credentialGeneration &&
    provenance.credentialIdentity === credentialIdentity,
  );
}

export function isActiveBrokerSessionCurrent(
  identity: ActiveBrokerSessionIdentity,
): boolean {
  return Boolean(activeCapture && identityMatches(activeCapture.session, identity));
}

export function updateActiveBrokerSessionCredentials(
  identity: ActiveBrokerSessionIdentity,
  credentials: ActiveBrokerCredentials,
  feedAuthContext?: FeedAuthContext,
): boolean {
  if (!activeCapture || !identityMatches(activeCapture.session, identity)) {
    return false;
  }
  const previousSession = activeCapture.session;
  const nextSession = feedAuthContext
    ? Object.freeze({
        ...previousSession,
        feedAuthContext: normalizeFeedAuthContextForBroker(
          previousSession.brokerId,
          feedAuthContext,
        ),
      })
    : previousSession;
  activeCapture = Object.freeze({
    session: nextSession,
    credentials: normalizeCredentials(credentials),
  });
  credentialGeneration += 1;
  credentialIdentity = createCacheNamespaceNonce();
  recordMarketDataEvent('refresh_outcome', {
    outcome: 'credentials_committed',
    sessionEpoch: currentEpoch,
  });
  emit(Object.freeze({
    type: 'credentials_updated',
    sessionEpoch: currentEpoch,
    previousSession,
    activeSession: nextSession,
  }));
  return true;
}

export function subscribeActiveBrokerSession(
  listener: ActiveBrokerSessionListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearActiveBrokerSession(): ActiveBrokerSessionTransition {
  return beginActiveBrokerSessionTransition();
}

export function __resetActiveBrokerSessionForTests(): void {
  activeCapture = null;
  currentEpoch = 0;
  credentialGeneration = 0;
  credentialIdentity = '';
  listeners.clear();
}
