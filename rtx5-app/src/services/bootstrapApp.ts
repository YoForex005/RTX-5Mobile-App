import { brokerApi } from '../api/brokerApi';
import { appQueryClient } from '../state/providers/AppProviders';
import { useLiveAccountState } from '../state/liveAccountState';
import { usePositionsState } from '../state/positionsState';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import { resolveTradingLoginString } from '../state/tradingLogin';
import { ACCOUNTS_LIST_KEY } from '../query/accounts';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
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

const requestJson = async <T>(endpoint: string): Promise<T | null> => {
  try {
    return await brokerApi.getJson<T>(endpoint);
  } catch (error) {
    console.warn(`[Bootstrap] ${endpoint} failed`, error);
    return null;
  }
};

const updateAccountMetricsFromBootstrap = (accounts: unknown, accountLogin: string | undefined) => {
  const rows = unwrapArray(accounts);
  const selected = rows.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.login ?? record.account_login ?? record.id ?? '') === String(accountLogin ?? '');
  }) ?? rows[0];
  const record = selected as Record<string, unknown> | undefined;
  if (!record) return;

  const login = Number(record.login ?? record.account_login ?? record.id);
  const balance = Number(record.balance);
  const equity = Number(record.equity);
  const margin = Number(record.margin ?? record.usedMargin);
  const freeMargin = Number(record.margin_free ?? record.freeMargin);
  const marginLevel = Number(record.margin_level ?? record.marginLevel);
  const floating = Number(record.floating ?? record.floatingPnl ?? record.pnl);

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

  let [
    me,
    accounts,
    positions,
    orders,
    instruments,
    marketStatus,
  ] = await Promise.all([
    requestJson('/auth/me'),
    requestJson('/accounts'),
    requestJson('/positions'),
    requestJson('/orders'),
    requestJson('/instruments?favorites=true'),
    requestJson('/market/status'),
  ]);

  if (!positions && accountLogin) {
    positions = await requestJson(`/positions/${encodeURIComponent(accountLogin)}`);
  }

  if (!orders && accountLogin) {
    orders = await requestJson(`/orders/${encodeURIComponent(accountLogin)}`);
  }

  if (accounts) {
    appQueryClient.setQueryData([ACCOUNTS_LIST_KEY], unwrapArray(accounts));
    updateAccountMetricsFromBootstrap(accounts, accountLogin);
  }

  if (positions) {
    usePositionsState.getState().applyPositionsSnapshot(unwrapArray(positions), accountLogin, {
      preserveMissingExisting: false,
    });
  }

  if (orders) {
    appQueryClient.setQueryData(['orders', accountLogin], unwrapArray(orders));
  }

  if (instruments) {
    const instrumentRows = unwrapArray(instruments) as InstrumentContractSpec[];
    brokerRealtimeService.setInstrumentSpecs(instrumentRows);
    appQueryClient.setQueryData(['instruments', 'favorites'], instrumentRows);
  }

  if (marketStatus) {
    appQueryClient.setQueryData(['marketStatus'], marketStatus);
  }

  const state = useUserPreferences.getState();
  if (state.isLoggedIn && state.accountDetails?.credentials?.accessToken) {
    brokerRealtimeService.connect();
  }

  return {
    me,
    accounts,
    positions,
    orders,
    instruments,
    marketStatus,
  };
}
