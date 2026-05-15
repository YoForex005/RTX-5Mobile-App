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

export interface SignInRequest {
  username: string;
  password: string;
  brokerId: string;
}

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  expiresAtIso: string;
  accountLogin: string;
  accountName: string;
  serverName: string;
  brokerId: string;
  accountType: TradingAccountType;
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
}: SignInRequest): Promise<SignInResult> {
  const response: any = await loginAPI({
    username,
    password,
    broker_id: brokerId,
  });

  const accessToken = response.access_token ?? response.token;
  const refreshToken = response.refresh_token ?? response.refreshToken ?? '';
  const accountLoginRaw =
    response.account_login ??
    response.accountLogin ??
    response.user?.account_login ??
    response.user?.id;
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

  const expiresAtIso = (() => {
    if (typeof response.expires_at === 'number' && response.expires_at > 0) {
      const ms = response.expires_at > 1e12 ? response.expires_at : response.expires_at * 1000;
      return new Date(ms).toISOString();
    }
    const expiresInSec =
      typeof response.expires_in === 'number' ? response.expires_in : 86400;
    return new Date(Date.now() + expiresInSec * 1000).toISOString();
  })();

  return {
    accessToken,
    refreshToken,
    expiresAtIso,
    accountLogin: String(accountLoginRaw),
    accountName,
    serverName,
    brokerId: canonicalBrokerId,
    accountType,
  };
}
