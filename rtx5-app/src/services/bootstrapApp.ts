import {
  brokerApi,
  StaleBrokerSessionError,
  type BrokerApiJsonResponse,
} from '../api/brokerApi';
import { appQueryClient } from '../state/providers/AppProviders';
import { useLiveAccountState } from '../state/liveAccountState';
import { usePositionsState } from '../state/positionsState';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import { getAccountsListQueryKey } from '../query/accounts';
import { getOrdersByLoginQueryKey } from '../query/orders';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { buildAccountDetailPath } from '../api/accountsRoutes';
import { redactDiagnosticValue } from '../utils/securityRedaction';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { recordMarketDataEvent } from '../market/marketDataTelemetry';

type BootstrapResult = {
  me: unknown;
  accounts: unknown;
  positions: unknown;
  orders: unknown;
  instruments: unknown;
  marketStatus: unknown;
};

const unwrapArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['data', 'items', 'result', 'positions', 'orders', 'accounts', 'instruments']) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
};

type BootstrapOptions = {
  accountLogin?: string | number;
  expectedProvenance?: ActiveBrokerSessionProvenance;
};

const emptyBootstrapResult = (): BootstrapResult => ({
  me: null,
  accounts: null,
  positions: null,
  orders: null,
  instruments: null,
  marketStatus: null,
});

const unwrapAccountRows = (value: unknown): unknown[] => {
  const rows = unwrapArray(value);
  if (rows.length > 0) return rows;
  return value && typeof value === 'object' && !Array.isArray(value) ? [value] : [];
};

const requestJson = async <T>(endpoint: string): Promise<BrokerApiJsonResponse<T> | null> => {
  try {
    const result = await brokerApi.getJsonResponse<T>(endpoint);
    if (!result.ok) {
      throw { response: { status: result.status, data: result.data } };
    }
    return result;
  } catch (error) {
    console.warn(`[Bootstrap] ${endpoint} failed`, redactDiagnosticValue(error));
    return null;
  }
};

const commitBootstrapResponse = <T, R>(
  result: BrokerApiJsonResponse<T> | null,
  cacheNamespace: string,
  commit: (data: T) => R,
): R | null => {
  if (!result) return null;
  try {
    return brokerApi.commitJsonResponse(result, cacheNamespace, commit);
  } catch (error) {
    if (error instanceof StaleBrokerSessionError) return null;
    throw error;
  }
};

const updateAccountMetricsFromBootstrap = (accounts: unknown, accountLogin: string | undefined) => {
  const rows = unwrapAccountRows(accounts);
  const selected = rows.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.login ?? record.account_login ?? record.id ?? '') === String(accountLogin ?? '');
  }) ?? rows[0];
  const record = selected as Record<string, unknown> | undefined;
  if (!record) return;

  const login = Number(record.login ?? record.account_login ?? record.id);
  const balance = Number(record.balance);
  const credit = Number(record.credit);
  const equity = Number(record.equity);
  const margin = Number(record.margin ?? record.usedMargin ?? record.used_margin);
  const freeMargin = Number(record.margin_free ?? record.freeMargin ?? record.free_margin ?? record.margin_available);
  const marginLevel = Number(record.margin_level ?? record.marginLevel);
  const floating = Number(record.floating ?? record.floatingPnl ?? record.floating_pnl ?? record.unrealized_pl ?? record.pnl);

  useLiveAccountState.getState().updateMetrics({
    ...(Number.isFinite(login) ? { login } : {}),
    ...(Number.isFinite(balance) ? { balance } : {}),
    ...(Number.isFinite(equity) ? { equity } : {}),
    ...(Number.isFinite(margin) ? { margin } : {}),
    ...(Number.isFinite(freeMargin) ? { margin_free: freeMargin } : {}),
    ...(Number.isFinite(marginLevel) ? { margin_level: marginLevel } : {}),
    ...(Number.isFinite(floating) ? { floating } : {}),
  });

  if (Number.isFinite(balance) || Number.isFinite(equity)) {
    useTradingState.getState().setAccount({
      balance: Number.isFinite(balance) ? balance : 0,
      credit: Number.isFinite(credit) ? credit : 0,
      equity: Number.isFinite(equity) ? equity : Number.isFinite(balance) ? balance : 0,
      margin: Number.isFinite(margin) ? margin : 0,
      freeMargin: Number.isFinite(freeMargin) ? freeMargin : 0,
      marginLevel: Number.isFinite(marginLevel) ? marginLevel : 0,
      floating: Number.isFinite(floating) ? floating : 0,
      currency: String(record.currency ?? 'USD'),
    });
  }
};

export async function bootstrapApp(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const sessionCapture = captureActiveBrokerSession();
  if (!sessionCapture) {
    recordMarketDataEvent('bootstrap_gate', { outcome: 'blocked', reason: 'no_active_session' });
    return emptyBootstrapResult();
  }

  const activeProvenance = getActiveBrokerSessionProvenance(sessionCapture.session);
  if (
    options.expectedProvenance &&
    (
      options.expectedProvenance.cacheNamespace !== activeProvenance.cacheNamespace ||
      !isActiveBrokerSessionProvenanceCurrent(options.expectedProvenance)
    )
  ) {
    recordMarketDataEvent('bootstrap_gate', {
      outcome: 'blocked', reason: 'stale_provenance',
      brokerId: sessionCapture.session.brokerId,
      sessionEpoch: sessionCapture.session.sessionEpoch,
    });
    return emptyBootstrapResult();
  }

  const requestedAccountLogin = options.accountLogin === undefined || options.accountLogin === null
    ? sessionCapture.session.accountLogin
    : String(options.accountLogin).trim();
  if (!requestedAccountLogin || requestedAccountLogin !== sessionCapture.session.accountLogin) {
    recordMarketDataEvent('bootstrap_gate', {
      outcome: 'blocked', reason: 'account_mismatch',
      brokerId: sessionCapture.session.brokerId,
      sessionEpoch: sessionCapture.session.sessionEpoch,
    });
    return emptyBootstrapResult();
  }

  recordMarketDataEvent('bootstrap_gate', {
    outcome: 'started',
    brokerId: sessionCapture.session.brokerId,
    sessionEpoch: sessionCapture.session.sessionEpoch,
  });

  const accountLogin = requestedAccountLogin;
  const encodedAccountLogin = encodeURIComponent(accountLogin);
  const cacheNamespace = sessionCapture.session.cacheNamespace;

  const state = useUserPreferences.getState();
  if (state.isLoggedIn && state.accountDetails?.credentials?.accessToken) {
    brokerRealtimeService.connect();
  }

  // Start startup requests together and apply each result as soon as it lands.
  // This keeps quotes/account/positions from waiting on a slower endpoint.
  const mePromise = requestJson('/auth/me').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (data) => data));
  const accountsPromise = accountLogin
    ? requestJson(buildAccountDetailPath(accountLogin)).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (accounts) => {
        appQueryClient.setQueryData(
          getAccountsListQueryKey(cacheNamespace),
          unwrapAccountRows(accounts),
        );
        updateAccountMetricsFromBootstrap(accounts, accountLogin);
        return accounts;
      }))
    : Promise.resolve(null);
  const positionsPromise = accountLogin
    ? requestJson(`/positions/${encodedAccountLogin}`).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (positions) => {
        const resolvedRows = unwrapArray(positions);
        usePositionsState.getState().applyPositionsSnapshot(resolvedRows, accountLogin, {
          preserveMissingExisting: false,
        });
        return positions;
      }))
    : Promise.resolve(null);
  const ordersPromise = accountLogin
    ? requestJson(`/orders/${encodedAccountLogin}`).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (orders) => {
        appQueryClient.setQueryData(
          getOrdersByLoginQueryKey(cacheNamespace, Number(accountLogin)),
          unwrapArray(orders),
        );
        return orders;
      }))
    : Promise.resolve(null);
  const instrumentsPromise = requestJson('/instruments?favorites=true').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (instruments) => {
      const instrumentRows = unwrapArray(instruments);
      appQueryClient.setQueryData(
        ['instruments', cacheNamespace, 'favorites'],
        instrumentRows,
      );
      return instruments;
    }));
  const marketStatusPromise = requestJson('/market/status').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (marketStatus) => {
      appQueryClient.setQueryData(['marketStatus', cacheNamespace], marketStatus);
      return marketStatus;
    }));

  const [
    me,
    accounts,
    positions,
    orders,
    instruments,
    marketStatus,
  ] = await Promise.all([
    mePromise,
    accountsPromise,
    positionsPromise,
    ordersPromise,
    instrumentsPromise,
    marketStatusPromise,
  ]);

  recordMarketDataEvent('bootstrap_gate', {
    outcome: 'completed',
    brokerId: sessionCapture.session.brokerId,
    sessionEpoch: sessionCapture.session.sessionEpoch,
    completedSnapshots: [me, accounts, positions, orders, instruments, marketStatus]
      .filter((value) => value !== null).length,
  });

  return {
    me,
    accounts,
    positions,
    orders,
    instruments,
    marketStatus,
  };
}
