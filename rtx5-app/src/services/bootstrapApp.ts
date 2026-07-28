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
import { quotesWsService } from '../api/ws/quotesSocket';
import { buildAccountDetailPath } from '../api/accountsRoutes';
import {
  mapRawAccount,
  type TradingAccount,
  type TradingAccountRaw,
} from '../api/accounts';
import { sanitizeApiLatencyEndpoint } from '../utils/apiLatency';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { recordMarketDataEvent } from '../market/marketDataTelemetry';
import { normalizeQuoteSymbolKey } from '../domain/symbols';
import { extractLiveAccountMetrics } from '../api/ws/accountSocket.helpers';
import {
  beginAccountEnvironmentRefresh,
  commitActiveAccountEnvironmentPayload,
} from './accountEnvironmentSession';

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
    console.warn('[Bootstrap] Request failed', {
      endpoint: sanitizeApiLatencyEndpoint(endpoint),
      errorName: error instanceof Error ? error.name : 'RequestError',
    });
    return null;
  }
};

const mapBootstrapAccountRows = (value: unknown): TradingAccount[] =>
  unwrapAccountRows(value)
    .filter(
      (row): row is TradingAccountRaw =>
        Boolean(row) && typeof row === 'object' && !Array.isArray(row),
    )
    .map(mapRawAccount);

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

  const parsedMetrics = extractLiveAccountMetrics(record) ?? {};
  const parseFiniteNumber = (value: unknown): number | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const login = parsedMetrics.login ?? parseFiniteNumber(record.id);
  const balance = parsedMetrics.balance;
  const credit = parseFiniteNumber(record.credit);
  const floating = parsedMetrics.floating;
  const margin = parsedMetrics.margin;
  const equity = parsedMetrics.equity ?? (balance !== undefined
    ? balance + (credit ?? 0) + (floating ?? 0)
    : undefined);
  const freeMargin = parsedMetrics.margin_free ?? (
    equity !== undefined && margin !== undefined ? equity - margin : undefined
  );
  const marginLevel = parsedMetrics.margin_level ?? (
    equity !== undefined && margin !== undefined
      ? margin > 0 ? (equity / margin) * 100 : 0
      : undefined
  );

  const liveMetrics = {
    ...(login !== undefined ? { login } : {}),
    ...(balance !== undefined ? { balance } : {}),
    ...(equity !== undefined ? { equity } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(freeMargin !== undefined ? { margin_free: freeMargin } : {}),
    ...(marginLevel !== undefined ? { margin_level: marginLevel } : {}),
    ...(floating !== undefined ? { floating } : {}),
  };
  if (Object.keys(liveMetrics).length > 0) {
    useLiveAccountState.getState().updateMetrics(liveMetrics);
  }

  const currency = typeof record.currency === 'string' && record.currency.trim()
    ? record.currency.trim()
    : undefined;
  const accountPatch = {
    ...(balance !== undefined ? { balance } : {}),
    ...(credit !== undefined ? { credit } : {}),
    ...(equity !== undefined ? { equity } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(freeMargin !== undefined ? { freeMargin } : {}),
    ...(marginLevel !== undefined ? { marginLevel } : {}),
    ...(floating !== undefined ? { floating } : {}),
    ...(currency !== undefined ? { currency } : {}),
  };
  if (Object.keys(accountPatch).length > 0) {
    // setAccount merges partial snapshots, so omitted/blank bootstrap fields do
    // not replace valid metrics that arrived earlier from realtime.
    useTradingState.getState().setAccount(accountPatch);
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
  const accountEnvironmentRefresh = beginAccountEnvironmentRefresh(activeProvenance);

  const state = useUserPreferences.getState();
  if (state.isLoggedIn && state.accountDetails?.credentials?.accessToken) {
    brokerRealtimeService.connect();
    // Warm the market quote socket before Quotes/Chart finish mounting so the
    // first watchlist paint is not waiting on React focus + health-probe serial work.
    const warmSymbols = Array.from(
      new Set(
        (state.quoteSymbols ?? [])
          .map((symbol) => normalizeQuoteSymbolKey(String(symbol ?? '')))
          .filter(Boolean),
      ),
    );
    if (warmSymbols.length > 0) {
      quotesWsService.setSubscriptions(warmSymbols);
    }
  }

  // Start startup requests together and apply each result as soon as it lands.
  // This keeps quotes/account/positions from waiting on a slower endpoint.
  const mePromise = requestJson('/auth/me').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (data) => data));
  const accountsPromise = accountLogin
    ? requestJson(buildAccountDetailPath(accountLogin)).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (accounts) => {
        const mappedAccounts = mapBootstrapAccountRows(accounts);
        appQueryClient.setQueryData<TradingAccount[]>(
          getAccountsListQueryKey(cacheNamespace),
          (existing) => existing ?? mappedAccounts,
        );
        updateAccountMetricsFromBootstrap(accounts, accountLogin);
        if (accountEnvironmentRefresh) {
          commitActiveAccountEnvironmentPayload(
            accounts,
            activeProvenance,
            accountEnvironmentRefresh,
          );
        }
        return accounts;
      }))
    : Promise.resolve(null);
  const positionsPromise = accountLogin
    ? requestJson(`/positions/${encodedAccountLogin}?limit=50&offset=0`).then((result) =>
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
