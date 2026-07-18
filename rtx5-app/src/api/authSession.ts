/**
 * Thin wrapper over loginAPI that normalizes the auth response.
 *
 * The V2 server's documented shape (`token` + nested `user`) differs from
 * older deployments (flat `access_token` + `account_login`). Both are
 * accepted here so callers never have to remember which keys to read.
 */

import { loginAPI } from './auth';
import {
  getTradingAccountTypeFromBackend,
  type TradingAccountType,
} from '../domain/accountType';
import { resolveSessionFeedAuth } from './feedAuthContract';
import type { FeedAuthContext } from '../state/activeBrokerSession';

export interface SignInRequest {
  username: string;
  password: string;
  brokerId: string;
  serverUrl?: string;
  logoUrl?: string;
  signal?: AbortSignal;
}

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  expiresAtIso: string;
  accountLogin: string;
  accountName: string;
  serverName: string;
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
  accountType: TradingAccountType;
  feedToken?: string;
  feedAuthContext: FeedAuthContext;
}

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

export async function signInWithCredentials({
  username,
  password,
  brokerId,
  serverUrl,
  logoUrl,
  signal,
}: SignInRequest): Promise<SignInResult> {
  const response: any = await loginAPI({
    username,
    password,
    broker_id: brokerId,
  }, { serverUrl, signal });

  const accessToken = response.access_token ?? response.token;
  const refreshToken = response.refresh_token ?? response.refreshToken ?? '';
  const accountLoginRaw =
    response.account_login ??
    response.accountLogin ??
    response.user?.account_login ??
    response.user?.id ??
    response.username ??
    response.user?.username ??
    username;
  const accountName =
    response.account_name ??
    response.accountName ??
    response.name ??
    response.user?.account_name ??
    response.user?.accountName ??
    response.user?.name ??
    response.username ??
    response.user?.username ??
    'Trader';
  const serverName =
    response.server ?? response.broker_server ?? response.brokerServer ?? '';
  const canonicalBrokerId = response.broker_id ?? response.brokerId ?? brokerId;
  const accountType = getTradingAccountTypeFromBackend(response);

  if (!accessToken) {
    throw new SignInError('Login server did not return an access token.');
  }
  if (accountLoginRaw === undefined || accountLoginRaw === null) {
    throw new SignInError('Login server did not return an account login.');
  }
  if (String(canonicalBrokerId).trim().toLowerCase() !== brokerId.trim().toLowerCase()) {
    throw new SignInError('Login response did not match the selected broker.');
  }

  const expiresAtIso = (() => {
    if (typeof response.expires_at === 'number' && response.expires_at > 0) {
      const ms = response.expires_at > 1e12 ? response.expires_at : response.expires_at * 1000;
      return new Date(ms).toISOString();
    }
    const expiresInSec =
      typeof response.expires_in === 'number' ? response.expires_in : 86400;
    return new Date(Date.now() + expiresInSec * 1000).toISOString();
  })();

  const sessionFeed = resolveSessionFeedAuth({
    response,
    brokerId: String(canonicalBrokerId),
  });

  return {
    accessToken,
    refreshToken,
    expiresAtIso,
    accountLogin: String(accountLoginRaw),
    accountName,
    serverName,
    brokerId: canonicalBrokerId,
    serverUrl: serverUrl ?? '',
    logoUrl: logoUrl ?? '',
    accountType,
    ...(sessionFeed.feedToken ? { feedToken: sessionFeed.feedToken } : {}),
    feedAuthContext: sessionFeed.feedAuthContext,
  };
}
