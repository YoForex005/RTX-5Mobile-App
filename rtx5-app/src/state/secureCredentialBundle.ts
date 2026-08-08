import type { FeedAuthContext } from './activeBrokerSession';

export const AUTH_CREDENTIAL_BUNDLE_VERSION = 1 as const;
export const AUTH_CREDENTIAL_BUNDLE_KEY = 'rtx5_auth_credential_bundle_v1';

export const LEGACY_ACCESS_TOKEN_KEY = 'access_token';
export const LEGACY_REFRESH_TOKEN_KEY = 'refresh_token';
export const LEGACY_EXPIRES_AT_KEY = 'expires_at';
export const LEGACY_FEED_TOKEN_KEYS = [
  'feed_broker_token',
  'broker_feed_token',
  'feed_token',
  'ws_feed_token',
] as const;

export const LEGACY_AUTH_CREDENTIAL_KEYS = [
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  LEGACY_EXPIRES_AT_KEY,
  ...LEGACY_FEED_TOKEN_KEYS,
] as const;

export type SecureAuthCredentialBundle = {
  version: typeof AUTH_CREDENTIAL_BUNDLE_VERSION;
  brokerId: string;
  accountLogin: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  feedToken?: string;
  feedAuthContext: FeedAuthContext;
};

export type SecureAuthCredentialInput = {
  brokerId: string;
  accountLogin: string | number;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  feedToken?: string | null;
  feedAuthContext?: FeedAuthContext | null;
};

export type LegacyAuthCredentialInput = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  feedToken?: string | null;
};

export type SecureCredentialStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const normalizeBrokerId = (value: unknown): string => cleanString(value).toLowerCase();

const preserveNonBlankFeedToken = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const normalizeFeedAuthContext = (
  value: unknown,
  brokerId: string,
  hasFeedToken: boolean,
): FeedAuthContext => {
  const missing = (reason: 'missing_contract' | 'missing_credential'): FeedAuthContext =>
    Object.freeze({ mode: 'disabled_unconfigured', reason });
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

  if (!record) {
    if (brokerId !== 'achiever-financials' && hasFeedToken) {
      return Object.freeze({
        mode: 'query',
        credential: 'feed_token',
        tokenQueryParam: 'token',
        brokerIdQueryParam: 'broker_id',
      });
    }
    return missing('missing_contract');
  }
  if (
    record.mode === 'disabled_unconfigured' &&
    (record.reason === 'missing_contract' || record.reason === 'missing_credential')
  ) {
    return missing(record.reason);
  }
  if (record.mode === 'none') {
    return brokerId === 'achiever-financials'
      ? missing('missing_contract')
      : Object.freeze({ mode: 'none' });
  }
  if (
    record.mode !== 'query' ||
    (record.credential !== 'feed_token' && record.credential !== 'access_token')
  ) {
    return missing('missing_contract');
  }

  const tokenQueryParam = cleanString(record.tokenQueryParam);
  const brokerIdQueryParam = cleanString(record.brokerIdQueryParam);
  const accountLoginQueryParam = cleanString(record.accountLoginQueryParam);
  const params = [tokenQueryParam, brokerIdQueryParam, accountLoginQueryParam].filter(Boolean);
  const validParam = (param: string): boolean =>
    /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(param);
  if (
    !tokenQueryParam ||
    params.some((param) => !validParam(param)) ||
    new Set(params).size !== params.length ||
    (
      brokerId === 'achiever-financials' &&
      (
        record.credential !== 'feed_token' ||
        tokenQueryParam !== 'token' ||
        brokerIdQueryParam !== 'broker_id' ||
        Boolean(accountLoginQueryParam)
      )
    )
  ) {
    return missing('missing_contract');
  }
  if (record.credential === 'feed_token' && !hasFeedToken) {
    return missing('missing_credential');
  }
  return Object.freeze({
    mode: 'query',
    credential: record.credential,
    tokenQueryParam,
    ...(brokerIdQueryParam ? { brokerIdQueryParam } : {}),
    ...(accountLoginQueryParam ? { accountLoginQueryParam } : {}),
  });
};

const createBundle = (input: SecureAuthCredentialInput): SecureAuthCredentialBundle => {
  const brokerId = normalizeBrokerId(input.brokerId);
  const accountLogin = cleanString(input.accountLogin);
  const accessToken = cleanString(input.accessToken);
  if (!brokerId || !accountLogin || !accessToken) {
    throw new Error('Secure auth credentials require brokerId, accountLogin, and accessToken.');
  }

  const rawCandidateFeedToken = preserveNonBlankFeedToken(input.feedToken);
  const candidateFeedToken =
    brokerId === 'achiever-financials' && rawCandidateFeedToken === accessToken
      ? ''
      : rawCandidateFeedToken;
  const feedAuthContext = normalizeFeedAuthContext(
    input.feedAuthContext,
    brokerId,
    Boolean(candidateFeedToken),
  );
  const feedToken =
    feedAuthContext.mode === 'query' &&
    feedAuthContext.credential === 'feed_token'
      ? candidateFeedToken
      : '';
  return {
    version: AUTH_CREDENTIAL_BUNDLE_VERSION,
    brokerId,
    accountLogin,
    accessToken,
    refreshToken: cleanString(input.refreshToken),
    expiresAt: cleanString(input.expiresAt),
    ...(feedToken ? { feedToken } : {}),
    feedAuthContext,
  };
};

const parseBundle = (value: string | null): SecureAuthCredentialBundle | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SecureAuthCredentialBundle> | null;
    if (!parsed || parsed.version !== AUTH_CREDENTIAL_BUNDLE_VERSION) {
      return null;
    }
    return createBundle({
      brokerId: parsed.brokerId ?? '',
      accountLogin: parsed.accountLogin ?? '',
      accessToken: parsed.accessToken ?? '',
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      feedToken: parsed.feedToken,
      feedAuthContext: parsed.feedAuthContext,
    });
  } catch {
    return null;
  }
};

const matchesIdentity = (
  bundle: SecureAuthCredentialBundle,
  brokerId?: string | null,
  accountLogin?: string | number | null,
): boolean => {
  const expectedBrokerId = normalizeBrokerId(brokerId);
  const expectedAccountLogin = cleanString(accountLogin);
  return (
    (!expectedBrokerId || bundle.brokerId === expectedBrokerId) &&
    (!expectedAccountLogin || bundle.accountLogin === expectedAccountLogin)
  );
};

export class SecureCredentialBundleStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: SecureCredentialStorage) {}

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async removeLegacyCredentials(): Promise<void> {
    const results = await Promise.allSettled(
      LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      throw failed.reason;
    }
  }

  private async readBundle(): Promise<SecureAuthCredentialBundle | null> {
    return parseBundle(await this.storage.getItem(AUTH_CREDENTIAL_BUNDLE_KEY));
  }

  async get(
    expected?: { brokerId?: string | null; accountLogin?: string | number | null },
  ): Promise<SecureAuthCredentialBundle | null> {
    await this.mutationQueue;
    const bundle = await this.readBundle();
    if (!bundle || !matchesIdentity(bundle, expected?.brokerId, expected?.accountLogin)) {
      return null;
    }
    return bundle;
  }

  replace(input: SecureAuthCredentialInput): Promise<SecureAuthCredentialBundle> {
    return this.enqueueMutation(async () => {
      const bundle = createBundle(input);
      // One versioned value makes credential replacement atomic at the secure
      // storage boundary. Legacy individual keys are cleanup-only afterwards.
      await this.storage.setItem(AUTH_CREDENTIAL_BUNDLE_KEY, JSON.stringify(bundle));
      try {
        await this.removeLegacyCredentials();
      } catch (error) {
        await Promise.allSettled([
          this.storage.removeItem(AUTH_CREDENTIAL_BUNDLE_KEY),
          ...LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
        ]);
        throw error;
      }
      return bundle;
    });
  }

  clear(): Promise<void> {
    return this.enqueueMutation(async () => {
      await Promise.all([
        this.storage.removeItem(AUTH_CREDENTIAL_BUNDLE_KEY),
        ...LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
      ]);
    });
  }

  migrateLegacy(input: {
    brokerId: string;
    accountLogin: string | number;
    credentials?: LegacyAuthCredentialInput | null;
  }): Promise<SecureAuthCredentialBundle | null> {
    return this.enqueueMutation(async () => {
      const brokerId = normalizeBrokerId(input.brokerId);
      const accountLogin = cleanString(input.accountLogin);
      if (!brokerId || !accountLogin) {
        await this.removeLegacyCredentials();
        return null;
      }

      const existingBundle = await this.readBundle();
      if (existingBundle) {
        await this.removeLegacyCredentials();
        if (matchesIdentity(existingBundle, brokerId, accountLogin)) {
          return existingBundle;
        }

        // The plain preference blob may be stale when its AsyncStorage write
        // failed. It must never delete or overwrite a valid secure bundle that
        // belongs to the session manifest for another broker/account.
        return null;
      }

      const supplied = input.credentials ?? {};
      // Only the broker/account-bound legacy preference blob is eligible for
      // migration. Individual legacy secure keys have no account binding, so
      // treating them as credentials for the selected broker could recreate
      // the exact cross-broker/sticky-token defect this store must eliminate.
      const accessToken = cleanString(supplied.accessToken);
      const refreshToken = cleanString(supplied.refreshToken);
      const expiresAt = cleanString(supplied.expiresAt);
      const feedToken = preserveNonBlankFeedToken(supplied.feedToken);

      if (!accessToken) {
        await this.removeLegacyCredentials();
        return null;
      }

      const bundle = createBundle({
        brokerId,
        accountLogin,
        accessToken,
        refreshToken,
        expiresAt,
        feedToken,
      });
      await this.storage.setItem(AUTH_CREDENTIAL_BUNDLE_KEY, JSON.stringify(bundle));
      await this.removeLegacyCredentials();
      return bundle;
    });
  }
}
