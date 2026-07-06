import { brokerApi } from '../api/brokerApi';
import { appQueryClient } from '../state/providers/AppProviders';
import { useLiveAccountState } from '../state/liveAccountState';
import { usePositionsState } from '../state/positionsState';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import { resolveTradingLoginString } from '../state/tradingLogin';
import { ACCOUNTS_LIST_KEY } from '../query/accounts';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { buildAccountDetailPath } from '../api/accountsRoutes';
import type { InstrumentContractSpec } from '../domain/account/equity';

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

const unwrapAccountRows = (value: unknown): unknown[] => {
  const rows = unwrapArray(value);
  if (rows.length > 0) return rows;
  return value && typeof value === 'object' && !Array.isArray(value) ? [value] : [];
};

const requestJson = async <T>(endpoint: string): Promise<T | null> => {
  try {
    return await brokerApi.getJson<T>(endpoint);
  } catch (error) {
    console.warn(`[Bootstrap] ${endpoint} failed`, error);
    return null;
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

export async function bootstrapApp(options: { accountLogin?: string | number } = {}): Promise<BootstrapResult> {
  const accountLogin = options.accountLogin ? String(options.accountLogin) : resolveTradingLoginString();
  const encodedAccountLogin = accountLogin ? encodeURIComponent(accountLogin) : '';

  const state = useUserPreferences.getState();
  if (state.isLoggedIn && state.accountDetails?.credentials?.accessToken) {
    brokerRealtimeService.connect();
  }

  // Start startup requests together and apply each result as soon as it lands.
  // This keeps quotes/account/positions from waiting on a slower endpoint.
  const mePromise = requestJson('/auth/me');
  const accountsPromise = accountLogin
    ? requestJson(buildAccountDetailPath(accountLogin)).then((accounts) => {
      if (accounts) {
        appQueryClient.setQueryData([ACCOUNTS_LIST_KEY], unwrapAccountRows(accounts));
        updateAccountMetricsFromBootstrap(accounts, accountLogin);
      }
      return accounts;
    })
    : Promise.resolve(null);
  const positionsPromise = accountLogin
    ? requestJson(`/positions/${encodedAccountLogin}`).then((positions) => {
      if (positions) {
        const resolvedRows = unwrapArray(positions);
        usePositionsState.getState().applyPositionsSnapshot(resolvedRows, accountLogin, {
          preserveMissingExisting: false,
        });
      }
      return positions;
    })
    : Promise.resolve(null);
  const ordersPromise = accountLogin
    ? requestJson(`/orders/${encodedAccountLogin}`).then((orders) => {
      if (orders) {
        appQueryClient.setQueryData(['orders', accountLogin], unwrapArray(orders));
      }
      return orders;
    })
    : Promise.resolve(null);
  const instrumentsPromise = requestJson('/instruments?favorites=true').then((instruments) => {
    if (instruments) {
      const instrumentRows = unwrapArray(instruments) as InstrumentContractSpec[];
      brokerRealtimeService.setInstrumentSpecs(instrumentRows);
      appQueryClient.setQueryData(['instruments', 'favorites'], instrumentRows);
    }
    return instruments;
  });
  const marketStatusPromise = requestJson('/market/status').then((marketStatus) => {
    if (marketStatus) {
      appQueryClient.setQueryData(['marketStatus'], marketStatus);
    }
    return marketStatus;
  });

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

  return {
    me,
    accounts,
    positions,
    orders,
    instruments,
    marketStatus,
  };
}
