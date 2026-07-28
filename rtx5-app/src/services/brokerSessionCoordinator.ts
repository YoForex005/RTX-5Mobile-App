import { brokerApi } from '../api/brokerApi';
import { resolveEffectiveFeedAuthForSession } from '../api/feedAuthContract';
import { accountWsService } from '../api/ws/accountSocket';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { quotesWsService } from '../api/ws/quotesSocket';
import { wsService } from '../api/ws/socket';
import { candleMemoryCache } from '../domain/candles/stream/candleMemoryCache';
import { liveCandleStream } from '../domain/candles/stream/liveCandleStream';
import { candlesWsService } from '../domain/candles/ws/candlesSocket';
import { resetPersistedCandleCacheSession } from '../domain/candles/state/persistedCandleCache';
import { resetQuoteRuntimeState } from '../features/quotes/resetQuoteRuntimeState';
import { resetBrokerSymbolResolverCache } from '../api/orders/symbolResolver';
import { resetAcceptedMarketOrderSymbolCache } from '../api/orders/placeMarketOrder';
import { resetAcceptedPendingOrderSymbolCache } from '../api/orders/placePendingOrder';
import {
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  getActiveBrokerSessionEpoch,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  type ActivateBrokerSessionInput,
  type ActiveBrokerCredentials,
  type ActiveBrokerSessionCapture,
} from '../state/activeBrokerSession';
import {
  cancelBrokerSessionCommitAuthorization as cancelCommitAuthorization,
  consumeBrokerSessionCommitAuthorization,
  issueBrokerSessionCommitAuthorization,
  type BrokerSessionCommitAuthorization,
} from './brokerSessionCommitAuthorization';
import {
  clearActiveBrokerSessionManifest,
  createActiveBrokerSessionManifest,
  readActiveBrokerSessionManifest,
  writeActiveBrokerSessionManifest,
} from '../state/activeBrokerSessionStorage';
import {
  clearAuthSessionTokens,
  clearLegacySelectedBrokerSession,
  getStoredAuthSessionCredentials,
  replaceAuthSessionCredentials,
} from '../state/brokerSessionStorage';
import { useLiveAccountState } from '../state/liveAccountState';
import { resetPositionsSessionState } from '../state/positionsState';
import { appQueryClient } from '../state/providers/AppProviders';
import { resetSessionMarketData } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import {
  bindFeedHealthSession,
  unbindFeedHealthSession,
} from '../market/feedHealthRuntime';
import {
  normalizeBrokerHttpsUrl,
  normalizeBrokerWssUrl,
} from '../api/brokerRouting';
import {
  buildAccountEnvironmentKey,
  type AccountEnvironment,
  type AccountEnvironmentSource,
} from '../domain/accountType';

export type BrokerSessionAccountProfile = Readonly<{
  name: string;
  serverName: string;
  logoUrl?: string;
  accountType: AccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
}>;

export type CommitBrokerSessionInput = Readonly<{
  session: ActivateBrokerSessionInput;
  credentials: ActiveBrokerCredentials;
  account: BrokerSessionAccountProfile;
}>;

export type BrokerSessionRestoreResult =
  | { status: 'restored'; capture: ActiveBrokerSessionCapture }
  | { status: 'logged_out' }
  | { status: 'invalidated'; reason: string };

let mutationQueue: Promise<void> = Promise.resolve();

export type { BrokerSessionCommitAuthorization } from './brokerSessionCommitAuthorization';
export { isStaleBrokerSessionCommitError } from './brokerSessionCommitAuthorization';

/**
 * Called when a user starts an unauthenticated login/switch request. This does
 * not disturb the active session, but only the newest issued attempt may later
 * enter the atomic coordinator commit.
 */
export const authorizeBrokerSessionCommit = (): BrokerSessionCommitAuthorization =>
  issueBrokerSessionCommitAuthorization(getActiveBrokerSessionEpoch());

export const cancelBrokerSessionCommitAuthorization = (
  authorization: BrokerSessionCommitAuthorization | null | undefined,
): void => cancelCommitAuthorization(authorization);

const enqueueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const preserveNonBlankFeedToken = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const validateCommitInput = (
  input: CommitBrokerSessionInput,
): CommitBrokerSessionInput => {
  // Manifest validation covers identity and feed-auth metadata. Transport
  // normalization rejects cleartext, credentials in URLs, and malformed URLs.
  const manifest = createActiveBrokerSessionManifest(input.session);
  const apiBase = normalizeBrokerHttpsUrl(manifest.apiBase);
  const feedWsBase = normalizeBrokerWssUrl(manifest.feedWsBase);
  const tradeWsBase = manifest.tradeWsBase
    ? normalizeBrokerWssUrl(manifest.tradeWsBase)
    : '';
  const feedStatusUrl = normalizeBrokerHttpsUrl(manifest.feedStatusUrl);
  const accessToken = cleanString(input.credentials.accessToken);
  const feedToken = preserveNonBlankFeedToken(input.credentials.feedToken);
  const feedTokenRequired =
    manifest.feedAuthContext.mode === 'query' &&
    manifest.feedAuthContext.credential === 'feed_token';

  if (
    !apiBase ||
    !feedWsBase ||
    !feedStatusUrl ||
    (manifest.tradeWsBase && !tradeWsBase) ||
    !accessToken ||
    (feedTokenRequired && !feedToken)
  ) {
    throw new Error('Broker session handoff is missing a validated endpoint or access token.');
  }

  return Object.freeze({
    session: Object.freeze({
      brokerId: manifest.brokerId,
      accountLogin: manifest.accountLogin,
      apiBase,
      feedWsBase,
      ...(tradeWsBase ? { tradeWsBase } : {}),
      feedStatusUrl,
      servicesDomain: manifest.servicesDomain,
      feedAuthContext: manifest.feedAuthContext,
      configVersion: manifest.configVersion,
    }),
    credentials: Object.freeze({
      accessToken,
      refreshToken: cleanString(input.credentials.refreshToken),
      expiresAt: cleanString(input.credentials.expiresAt),
      ...(feedTokenRequired && feedToken
        ? { feedToken }
        : {}),
    }),
    account: Object.freeze({
      name: cleanString(input.account.name) || 'Trader',
      serverName: cleanString(input.account.serverName) || manifest.brokerId,
      ...(cleanString(input.account.logoUrl)
        ? { logoUrl: cleanString(input.account.logoUrl) }
        : {}),
      accountType: input.account.accountType,
      accountEnvironmentSource: input.account.accountEnvironmentSource,
    }),
  });
};

const bindCommittedFeedHealthSession = (
  capture: ActiveBrokerSessionCapture,
): void => {
  const { session, credentials } = capture;
  const identity = getActiveBrokerSessionIdentity(session);
  const effectiveFeed = resolveEffectiveFeedAuthForSession({
    brokerId: session.brokerId,
    feedAuthContext: session.feedAuthContext,
    feedToken: credentials.feedToken,
  });
  const feedAuth = effectiveFeed.feedAuthContext;
  const credentialApproved = feedAuth.mode === 'none'
    ? true
    : feedAuth.mode === 'query' && feedAuth.credential === 'feed_token'
      ? Boolean(effectiveFeed.feedToken)
      : feedAuth.mode === 'query'
        ? Boolean(credentials.accessToken)
        : false;
  bindFeedHealthSession({
    identity,
    transportConfigured: Boolean(
      session.feedWsBase &&
      session.feedStatusUrl &&
      feedAuth.mode !== 'disabled_unconfigured'
    ),
    credentialApproved,
    // The bound session starts fail-closed. Its authenticated status probe
    // installs the broker-approved health_policy for this exact identity.
  });
};

/**
 * Synchronous teardown portion of every handoff. The epoch has already moved
 * before this runs, so any late async completion is stale before caches clear.
 */
export const teardownBrokerSessionRuntime = async (): Promise<void> => {
  brokerApi.abortInFlightRequests();
  quotesWsService.disconnect();
  accountWsService.disconnect();
  candlesWsService.disconnect();
  brokerRealtimeService.disconnect();
  wsService.disconnect();
  unbindFeedHealthSession();
  liveCandleStream.dispose();
  candleMemoryCache.clear();
  resetQuoteRuntimeState();
  resetSessionMarketData();
  resetPositionsSessionState();
  resetBrokerSymbolResolverCache();
  resetAcceptedMarketOrderSymbolCache();
  resetAcceptedPendingOrderSymbolCache();
  resetPersistedCandleCacheSession();
  useLiveAccountState.getState().resetMetrics();
  await appQueryClient.cancelQueries();
  appQueryClient.clear();
};

const erasePersistedSession = async (): Promise<void> => {
  const results = await Promise.allSettled([
    clearAuthSessionTokens(),
    clearActiveBrokerSessionManifest(),
    clearLegacySelectedBrokerSession(),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    throw failure.reason;
  }
};

const failClosed = async (reason: string): Promise<BrokerSessionRestoreResult> => {
  beginActiveBrokerSessionTransition();
  await teardownBrokerSessionRuntime();
  useUserPreferences.getState().logout();
  // Storage can itself be the failure source. The epoch and memory state are
  // already invalidated; cleanup remains best-effort without re-enabling UI.
  await Promise.allSettled([
    clearAuthSessionTokens(),
    clearActiveBrokerSessionManifest(),
    clearLegacySelectedBrokerSession(),
  ]);
  return { status: 'invalidated', reason };
};

const commitBrokerSessionInternal = async (
  rawInput: CommitBrokerSessionInput,
): Promise<ActiveBrokerSessionCapture> => {
  const input = validateCommitInput(rawInput);
  const transition = beginActiveBrokerSessionTransition();
  // Tear down previous runtime and clear prefs in parallel with credential
  // persistence prep — sequential SecureStore + socket teardown was the bulk
  // of post-auth wait before router.replace.
  await teardownBrokerSessionRuntime();
  useUserPreferences.getState().logout();

  try {
    const [credentials] = await Promise.all([
      replaceAuthSessionCredentials({
        brokerId: input.session.brokerId,
        accountLogin: input.session.accountLogin,
        accessToken: input.credentials.accessToken,
        refreshToken: input.credentials.refreshToken,
        expiresAt: input.credentials.expiresAt,
        feedToken: input.credentials.feedToken,
        feedAuthContext: input.session.feedAuthContext,
      }),
      clearLegacySelectedBrokerSession(),
    ]);
    await writeActiveBrokerSessionManifest(input.session);

    const capture = activateBrokerSession(transition, input.session, {
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
      ...(credentials.feedToken ? { feedToken: credentials.feedToken } : {}),
    });
    bindCommittedFeedHealthSession(capture);

    useUserPreferences.getState().login(
      String(input.session.accountLogin),
      input.account.name,
      input.account.serverName,
      {
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expires_at: credentials.expiresAt,
      },
      input.session.brokerId,
      {
        serverUrl: input.session.apiBase,
        logoUrl: input.account.logoUrl,
        accountType: input.account.accountType,
        accountEnvironmentSource: input.account.accountEnvironmentSource,
      },
    );
    return capture;
  } catch (error) {
    if (captureActiveBrokerSession()) {
      beginActiveBrokerSessionTransition();
    }
    await teardownBrokerSessionRuntime();
    useUserPreferences.getState().logout();
    await Promise.allSettled([
      clearAuthSessionTokens(),
      clearActiveBrokerSessionManifest(),
      clearLegacySelectedBrokerSession(),
    ]);
    throw error;
  }
};

/** Commits credentials + the exact endpoint set before authenticated UI starts. */
export const commitBrokerSession = (
  input: CommitBrokerSessionInput,
  authorization: BrokerSessionCommitAuthorization,
): Promise<ActiveBrokerSessionCapture> =>
  enqueueMutation(() => {
    // This check deliberately runs inside the mutation queue. A logout,
    // completed switch, or newer login that wins while auth is in flight has
    // already changed either the epoch or the active attempt by this point.
    consumeBrokerSessionCommitAuthorization(
      authorization,
      getActiveBrokerSessionEpoch(),
    );
    return commitBrokerSessionInternal(input);
  });

export const restoreBrokerSession = (): Promise<BrokerSessionRestoreResult> =>
  enqueueMutation(async () => {
    const preferences = useUserPreferences.getState();
    if (!preferences.isLoggedIn || !preferences.accountDetails?.id) {
      beginActiveBrokerSessionTransition();
      await teardownBrokerSessionRuntime();
      await Promise.allSettled([
        clearAuthSessionTokens(),
        clearActiveBrokerSessionManifest(),
        clearLegacySelectedBrokerSession(),
      ]);
      return { status: 'logged_out' };
    }

    let manifest;
    try {
      manifest = await readActiveBrokerSessionManifest();
    } catch {
      return failClosed('Stored broker session manifest could not be read securely.');
    }
    const expectedBrokerId = cleanString(preferences.brokerId).toLowerCase();
    const expectedAccountLogin = cleanString(preferences.accountDetails.id);
    if (
      !manifest ||
      manifest.brokerId !== expectedBrokerId ||
      manifest.accountLogin !== expectedAccountLogin
    ) {
      return failClosed('Stored broker session identity or endpoint manifest is missing.');
    }

    let credentials;
    try {
      credentials = await getStoredAuthSessionCredentials({
        brokerId: manifest.brokerId,
        accountLogin: manifest.accountLogin,
      });
    } catch {
      return failClosed('Stored broker credentials could not be read securely.');
    }
    if (!credentials) {
      return failClosed('Stored broker credentials are missing or belong to another identity.');
    }

    const expectedAccountEnvironmentKey = buildAccountEnvironmentKey(
      manifest.brokerId,
      manifest.accountLogin,
    );
    const hasMatchingAccountEnvironment =
      preferences.accountEnvironmentKey === expectedAccountEnvironmentKey;
    const profile: BrokerSessionAccountProfile = {
      name: preferences.accountDetails.name,
      serverName: preferences.accountDetails.server,
      logoUrl: preferences.brokerLogoUrl,
      accountType: hasMatchingAccountEnvironment
        ? preferences.accountType
        : 'unknown',
      accountEnvironmentSource: hasMatchingAccountEnvironment
        ? preferences.accountEnvironmentSource
        : 'unknown',
    };
    const transition = beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    useUserPreferences.getState().logout();

    try {
      const restoredSession = Object.freeze({
        ...manifest,
        // The feed token and context are one secure atomic pair. The manifest
        // remains endpoint provenance only during restore.
        feedAuthContext: credentials.feedAuthContext,
      });
      const capture = activateBrokerSession(transition, restoredSession, {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
        ...(credentials.feedToken ? { feedToken: credentials.feedToken } : {}),
      });
      bindCommittedFeedHealthSession(capture);
      useUserPreferences.getState().login(
        manifest.accountLogin,
        profile.name,
        profile.serverName,
        {
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expires_at: credentials.expiresAt,
        },
        manifest.brokerId,
        {
          serverUrl: manifest.apiBase,
          logoUrl: profile.logoUrl,
          accountType: profile.accountType,
          accountEnvironmentSource: profile.accountEnvironmentSource,
        },
      );
      return { status: 'restored', capture };
    } catch {
      return failClosed('Stored broker session failed endpoint validation.');
    }
  });

export const logoutBrokerSession = (): Promise<void> =>
  enqueueMutation(async () => {
    beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    useUserPreferences.getState().logout();
    await erasePersistedSession();
  });

/** Used after refresh/auth integrity failure; never changes to another broker. */
export const invalidateBrokerSession = (
  brokerId: string,
  accountLogin: string,
  sessionEpoch: number,
): Promise<void> =>
  enqueueMutation(async () => {
    if (!isActiveBrokerSessionCurrent({ brokerId, accountLogin, sessionEpoch })) {
      return;
    }
    beginActiveBrokerSessionTransition();
    await teardownBrokerSessionRuntime();
    useUserPreferences.getState().logout();
    await erasePersistedSession();
  });

export const isCommittedBrokerSessionCurrent = (
  capture: ActiveBrokerSessionCapture,
): boolean => isActiveBrokerSessionCurrent(
  getActiveBrokerSessionIdentity(capture.session),
);

/** Recomputes fail-closed feed readiness after an atomic credential rotation. */
export const rebindActiveBrokerFeedHealthSession = (
  capture: ActiveBrokerSessionCapture,
): void => {
  if (isCommittedBrokerSessionCurrent(capture)) {
    bindCommittedFeedHealthSession(capture);
  }
};

brokerApi.setSessionInvalidationHandler((identity) =>
  invalidateBrokerSession(
    identity.brokerId,
    identity.accountLogin,
    identity.sessionEpoch,
  ),
);
