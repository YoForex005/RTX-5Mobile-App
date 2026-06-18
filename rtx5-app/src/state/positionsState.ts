/**
 * Core module: positionsState.ts
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PositionItem } from '../dev/mock/tradingData';
import { positionsApi, type Position } from '../api/positions';
import { appQueryClient } from './providers/AppProviders';
import { resolveTradingLoginString } from './tradingLogin';
import {
  classifyTradingError,
  createFrontendTradingError,
  type TradingApiError,
  type TradingErrorFeedback,
} from '../api/tradingErrors';
import { UNKNOWN_POSITION_SYMBOL, mapPositionToItem } from './positionsMapper';
import {
  buildMergedPositions,
  dedupePositionsById,
  findExistingPosition,
  isTerminalPositionUpdate,
  shouldClearPositionsForLoginSwitch,
} from './positionsState.helpers';

type PositionsState = {
  positions: PositionItem[];
  positionSnapshots: Record<string, PositionItem>;
  isLoading: boolean;
  lastFetchLogin: string | null;
  hydratedLogin: string | null;
  lastError: TradingErrorFeedback | null;
  setPositions: (positions: PositionItem[]) => void;
  clearPositions: () => void;
  primePositionSnapshot: (position: PositionItem) => void;
  clearPositionSnapshot: (positionId?: string | number) => void;
  removePosition: (positionId: string | number) => void;
  beginOptimisticClose: (positionId: string | number) => void;
  finishOptimisticClose: (positionId: string | number) => void;
  rollbackOptimisticClose: (position: PositionItem) => void;
  applyPositionsSnapshot: (
    dtos: any[],
    accountLogin?: string,
    options?: Parameters<typeof buildMergedPositions>[2],
  ) => void;
  upsertPosition: (dto: any) => void;
  hydrateCachedPositions: (accountLogin: string) => Promise<void>;
  refreshPositions: (accountLogin: string) => Promise<void>;
};

const DEBUG_POSITIONS_STATE =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_POSITIONS_STATE === 'true';
const DEFAULT_RATE_LIMIT_BACKOFF_SECONDS = 30;
const positionsRateLimitUntilByLogin = new Map<string, number>();
const OPEN_POSITIONS_CACHE_PREFIX = 'rtx5-open-positions-v1';
const OPTIMISTIC_CLOSE_SUPPRESS_MS = 60_000;
// After a close tap we hide that ticket immediately. This guard stops a stale
// positions poll from briefly adding the same position back before backend sync.
const optimisticCloseUntilByPositionId = new Map<string, number>();

type CachedOpenPositionsPayload = {
  version: 1;
  accountLogin: string;
  savedAt: number;
  positions: PositionItem[];
};

const pendingOpenPositionsCacheWrites = new Map<string, PositionItem[]>();
let openPositionsCacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

const logPositionsStateDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_STATE) {
    console.log(...args);
  }
};

const warnPositionsStateDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (DEBUG_POSITIONS_STATE) {
    console.warn(...args);
  }
};

const getOpenPositionsCacheKey = (accountLogin: string): string =>
  `${OPEN_POSITIONS_CACHE_PREFIX}:${accountLogin}`;

const resolvePositionId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = source.ticket ?? source.position_ticket ?? source.order_ticket ?? source.id;
  if (id === undefined || id === null) {
    return null;
  }

  const normalized = String(id).trim();
  return normalized ? normalized : null;
};

const markPositionOptimisticallyClosing = (positionId: string | number) => {
  optimisticCloseUntilByPositionId.set(String(positionId), Date.now() + OPTIMISTIC_CLOSE_SUPPRESS_MS);
};

const clearPositionOptimisticallyClosing = (positionId: string | number) => {
  optimisticCloseUntilByPositionId.delete(String(positionId));
};

const isPositionOptimisticallyClosing = (positionId: string | number | null | undefined): boolean => {
  if (positionId === undefined || positionId === null) {
    return false;
  }

  const key = String(positionId);
  const suppressUntil = optimisticCloseUntilByPositionId.get(key);
  if (!suppressUntil) {
    return false;
  }

  if (suppressUntil <= Date.now()) {
    optimisticCloseUntilByPositionId.delete(key);
    return false;
  }

  return true;
};

const sortPositionsNewestFirst = (positions: PositionItem[]): PositionItem[] =>
  [...positions].sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());

const withoutOptimisticallyClosingPositions = (positions: PositionItem[]): PositionItem[] =>
  positions.filter((position) => !isPositionOptimisticallyClosing(position.id));

const clonePositionForCache = (position: PositionItem): PositionItem => ({
  id: String(position.id),
  symbol: position.symbol,
  side: position.side === 'sell' ? 'sell' : 'buy',
  volume: Number(position.volume) || 0,
  openPrice: Number(position.openPrice) || 0,
  currentPrice: Number(position.currentPrice) || Number(position.openPrice) || 0,
  pnl: Number(position.pnl) || 0,
  swap: Number(position.swap) || 0,
  commission: Number(position.commission) || 0,
  openTime: position.openTime,
  sl: Number(position.sl) || 0,
  tp: Number(position.tp) || 0,
  clientCreatedAt: position.clientCreatedAt,
  clientModifiedAt: position.clientModifiedAt,
});

const normalizeCachedPositions = (positions: unknown): PositionItem[] => {
  if (!Array.isArray(positions)) {
    return [];
  }

  return buildMergedPositions([], positions, { preserveMissingExisting: true }).map(clonePositionForCache);
};

const flushOpenPositionsCacheWrites = () => {
  openPositionsCacheWriteTimer = null;
  const writes = Array.from(pendingOpenPositionsCacheWrites.entries());
  pendingOpenPositionsCacheWrites.clear();

  writes.forEach(([accountLogin, positions]) => {
    const key = getOpenPositionsCacheKey(accountLogin);
    if (positions.length === 0) {
      void AsyncStorage.removeItem(key).catch((error) => {
        warnPositionsStateDiagnostic('[PositionsState] Failed to clear cached positions', error);
      });
      return;
    }

    const payload: CachedOpenPositionsPayload = {
      version: 1,
      accountLogin,
      savedAt: Date.now(),
      positions: positions.map(clonePositionForCache),
    };
    void AsyncStorage.setItem(key, JSON.stringify(payload)).catch((error) => {
      warnPositionsStateDiagnostic('[PositionsState] Failed to persist cached positions', error);
    });
  });
};

const scheduleOpenPositionsCacheWrite = (accountLogin: string | null | undefined, positions: PositionItem[]) => {
  if (!accountLogin) {
    return;
  }

  pendingOpenPositionsCacheWrites.set(accountLogin, normalizeCachedPositions(positions));
  if (openPositionsCacheWriteTimer) {
    return;
  }

  openPositionsCacheWriteTimer = setTimeout(flushOpenPositionsCacheWrites, 250);
};

const readCachedOpenPositions = async (accountLogin: string): Promise<PositionItem[]> => {
  try {
    const rawValue = await AsyncStorage.getItem(getOpenPositionsCacheKey(accountLogin));
    if (!rawValue) {
      return [];
    }

    const payload = JSON.parse(rawValue) as Partial<CachedOpenPositionsPayload> | PositionItem[];
    const rawPositions = Array.isArray(payload)
      ? payload
      : payload.accountLogin === accountLogin
        ? payload.positions
        : [];

    return normalizeCachedPositions(rawPositions);
  } catch (error) {
    warnPositionsStateDiagnostic('[PositionsState] Failed to hydrate cached positions', error);
    return [];
  }
};

const getRetryAfterSeconds = (error: unknown): number | null => {
  const headers = (error as TradingApiError | undefined)?.headers;
  const retryAfter = headers?.['retry-after'];
  if (!retryAfter) {
    return null;
  }

  const seconds = Number.parseInt(retryAfter, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export const usePositionsState = create<PositionsState>((set, get) => ({
  positions: [],
  positionSnapshots: {},
  isLoading: false,
  lastFetchLogin: null,
  hydratedLogin: null,
  lastError: null,
  setPositions: (positions) => {
    const nextPositions = withoutOptimisticallyClosingPositions(dedupePositionsById(positions));
    const accountLogin = get().lastFetchLogin ?? get().hydratedLogin ?? resolveTradingLoginString();
    scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
    set({ positions: nextPositions });
  },
  clearPositions: () =>
    set({
      positions: [],
      positionSnapshots: {},
      isLoading: false,
      lastError: null,
      lastFetchLogin: null,
      hydratedLogin: null,
    }),
  primePositionSnapshot: (position) =>
    set((state) => ({
      positionSnapshots: {
        ...state.positionSnapshots,
        [String(position.id)]: { ...position },
      },
    })),
  clearPositionSnapshot: (positionId) =>
    set((state) => {
      if (positionId === undefined) {
        return { positionSnapshots: {} };
      }

      const nextSnapshots = { ...state.positionSnapshots };
      delete nextSnapshots[String(positionId)];
      return { positionSnapshots: nextSnapshots };
    }),
  removePosition: (positionId) =>
    set((state) => {
      const nextPositions = state.positions.filter((position) => String(position.id) !== String(positionId));
      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
      return {
        positions: nextPositions,
        positionSnapshots: Object.fromEntries(
          Object.entries(state.positionSnapshots).filter(([id]) => id !== String(positionId)),
        ),
      };
    }),
  beginOptimisticClose: (positionId) => {
    markPositionOptimisticallyClosing(positionId);
    get().removePosition(positionId);
  },
  finishOptimisticClose: (positionId) => {
    markPositionOptimisticallyClosing(positionId);
    get().removePosition(positionId);
  },
  rollbackOptimisticClose: (position) => {
    clearPositionOptimisticallyClosing(position.id);
    set((state) => {
      const restoredPositions = sortPositionsNewestFirst(dedupePositionsById([
        position,
        ...state.positions.filter((item) => String(item.id) !== String(position.id)),
      ]));
      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(accountLogin, restoredPositions);
      return {
        positions: restoredPositions,
        positionSnapshots: {
          ...state.positionSnapshots,
          [String(position.id)]: { ...position },
        },
      };
    });
  },
  applyPositionsSnapshot: (dtos, accountLogin, options) =>
    set((state) => {
      const incomingDtos = Array.isArray(dtos)
        ? dtos.filter((dto) => !isPositionOptimisticallyClosing(resolvePositionId(dto)))
        : [];
      const nextPositions = withoutOptimisticallyClosingPositions(
        buildMergedPositions(state.positions, incomingDtos, options),
      );
      const nextLogin = accountLogin ?? state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(nextLogin, nextPositions);
      return {
        positions: nextPositions,
        lastFetchLogin: accountLogin ?? state.lastFetchLogin,
        hydratedLogin: accountLogin ?? state.hydratedLogin,
        lastError: null,
      };
    }),

  upsertPosition: (dto: any) => {
    set((state) => {
      if (isPositionOptimisticallyClosing(resolvePositionId(dto))) {
        return {};
      }

      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      if (isTerminalPositionUpdate(dto)) {
        const existing = findExistingPosition(state.positions, dto);
        if (!existing) {
          return {};
        }

        // A position was closed (SL/TP hit, server-side close, etc.).
        // Invalidate history caches so the History tab shows it immediately.
        appQueryClient.invalidateQueries({ queryKey: ['positionHistory'] });
        appQueryClient.invalidateQueries({ queryKey: ['accountDeals'] });
        appQueryClient.invalidateQueries({ queryKey: ['deals'] });
        appQueryClient.invalidateQueries({ queryKey: ['accountSummary'] });

        const nextPositions = state.positions.filter((position) => position.id !== existing.id);
        scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
        return {
          positions: nextPositions,
          positionSnapshots: Object.fromEntries(
            Object.entries(state.positionSnapshots).filter(([id]) => id !== String(existing.id)),
          ),
        };
      }

      const existing = findExistingPosition(state.positions, dto);
      const newItem = mapPositionToItem(dto, existing);
      if (!existing && newItem.symbol === UNKNOWN_POSITION_SYMBOL) {
        return {};
      }
      const source = dto && typeof dto === 'object' ? (dto as Record<string, unknown>) : {};
      const incomingClientCreatedAt =
        typeof source.clientCreatedAt === 'number' && Number.isFinite(source.clientCreatedAt)
          ? source.clientCreatedAt
          : undefined;
      if (incomingClientCreatedAt !== undefined) {
        newItem.clientCreatedAt = incomingClientCreatedAt;
      } else {
        delete newItem.clientCreatedAt;
      }
      newItem.clientModifiedAt = existing?.clientModifiedAt;

      const existsIdx = state.positions.findIndex((position) => position.id === newItem.id);
      const nextPositions = [...state.positions];

      if (existsIdx >= 0) {
        nextPositions[existsIdx] = newItem;
      } else {
        nextPositions.unshift(newItem);
      }

      const sortedPositions = dedupePositionsById(nextPositions).sort(
        (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
      );
      scheduleOpenPositionsCacheWrite(accountLogin, sortedPositions);

      return {
        positions: sortedPositions,
      };
    });
  },

  hydrateCachedPositions: async (accountLogin: string) => {
    const normalizedLogin = String(accountLogin ?? '').trim();
    if (!normalizedLogin) {
      return;
    }

    // Guard before the async cache read: if the app already knows a different
    // account is active, never hydrate rows from the requested login.
    const activeLogin = resolveTradingLoginString();
    if (activeLogin && activeLogin !== normalizedLogin) {
      return;
    }

    const state = get();
    if (state.hydratedLogin === normalizedLogin && state.lastFetchLogin === normalizedLogin) {
      return;
    }

    const cachedPositions = await readCachedOpenPositions(normalizedLogin);
    set((latestState) => {
      // Guard again after AsyncStorage returns. The active account may have
      // changed while the cache read was in flight.
      const latestActiveLogin = resolveTradingLoginString();
      if (latestActiveLogin && latestActiveLogin !== normalizedLogin) {
        return {};
      }

      if (latestState.hydratedLogin === normalizedLogin && latestState.lastFetchLogin === normalizedLogin) {
        return {};
      }

      const loginChanged = shouldClearPositionsForLoginSwitch(
        latestState.lastFetchLogin ?? latestState.hydratedLogin,
        normalizedLogin,
      );
      const nextPositions = loginChanged
        ? cachedPositions
        : dedupePositionsById([...latestState.positions, ...cachedPositions]);

      // This is only a device-cache hydrate. The focused refresh still asks the
      // backend, but the Trade screen does not have to flash a fake empty state.
      // For the same account we merge cache + memory; for a real account switch
      // we replace old-account rows so stale trades are not shown.
      return {
        positions: withoutOptimisticallyClosingPositions(nextPositions),
        positionSnapshots: loginChanged ? {} : latestState.positionSnapshots,
        lastFetchLogin: loginChanged ? normalizedLogin : latestState.lastFetchLogin ?? normalizedLogin,
        hydratedLogin: normalizedLogin,
        lastError: loginChanged ? null : latestState.lastError,
      };
    });
  },

  refreshPositions: async (accountLogin: string) => {
    const state = get();
    if (state.isLoading && state.lastFetchLogin === accountLogin) {
      return;
    }

    const rateLimitUntilMs = positionsRateLimitUntilByLogin.get(accountLogin) ?? 0;
    if (rateLimitUntilMs > Date.now()) {
      if (state.hydratedLogin !== accountLogin) {
        const cachedPositions = await readCachedOpenPositions(accountLogin);
        set((latestState) => ({
          positions: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, accountLogin)
            ? cachedPositions
            : dedupePositionsById([...latestState.positions, ...cachedPositions]),
          lastFetchLogin: accountLogin,
          hydratedLogin: accountLogin,
        }));
      }
      return;
    }

      set((state) => ({
        isLoading: true,
        lastFetchLogin: accountLogin,
        lastError: null,
        // Drop old-account positions immediately so the chart never keeps
        // drawing stale trades while a new account fetch is in flight.
        positions: shouldClearPositionsForLoginSwitch(state.lastFetchLogin, accountLogin)
          ? []
          : state.positions,
        positionSnapshots: shouldClearPositionsForLoginSwitch(state.lastFetchLogin, accountLogin)
          ? {}
          : state.positionSnapshots,
        hydratedLogin: shouldClearPositionsForLoginSwitch(state.lastFetchLogin, accountLogin)
          ? null
          : state.hydratedLogin,
      }));

    if (state.hydratedLogin !== accountLogin) {
      const cachedPositions = await readCachedOpenPositions(accountLogin);
      set((latestState) => ({
        positions: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, accountLogin)
          ? cachedPositions
          : dedupePositionsById([...latestState.positions, ...cachedPositions]),
        hydratedLogin: accountLogin,
      }));
    }

    try {
      const login = parseInt(accountLogin, 10);
      if (Number.isNaN(login)) {
        warnPositionsStateDiagnostic('[PositionsState] Invalid account login:', accountLogin);
        set({
          isLoading: false,
          lastError: createFrontendTradingError(
            'Account Error',
            `The app could not resolve a valid trading account login from local state: ${accountLogin}.`,
          ),
        });
        return;
      }

      const data = await positionsApi.getPositions(login);

      let positionsArray: Position[];
      if (Array.isArray(data)) {
        positionsArray = data;
      } else if (data && typeof data === 'object') {
        const wrapped = data as any;
        if (Array.isArray(wrapped.data)) {
          positionsArray = wrapped.data;
        } else if (Array.isArray(wrapped.positions)) {
          positionsArray = wrapped.positions;
        } else if (Array.isArray(wrapped.items)) {
          positionsArray = wrapped.items;
        } else if (Array.isArray(wrapped.result)) {
          positionsArray = wrapped.result;
        } else {
          const arrVal = Object.values(wrapped).find(Array.isArray);
          if (arrVal) {
            positionsArray = arrVal as Position[];
          } else if (wrapped.ticket || wrapped.id) {
            positionsArray = [wrapped];
          } else {
            const vals = Object.values(wrapped);
            if (vals.length > 0 && typeof vals[0] === 'object' && (vals[0] as any).ticket) {
              positionsArray = vals as Position[];
            } else {
              positionsArray = [];
            }
          }
        }
        } else {
          positionsArray = [];
        warnPositionsStateDiagnostic('[PositionsState] Unexpected response shape:', typeof data);
      }

      logPositionsStateDiagnostic('[PositionsState] Fetched', positionsArray.length, 'open positions for login', login);

      set((state) => {
        const nextPositions = buildMergedPositions(state.positions, positionsArray);
        scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
        return {
          positions: nextPositions,
          isLoading: false,
          hydratedLogin: accountLogin,
          lastError: null,
        };
      });
    } catch (e) {
      const feedback = classifyTradingError(e, { action: 'load-positions' });
      if (feedback.kind === 'rate-limit') {
        const retryAfterSeconds = feedback.retryAfterSeconds ?? getRetryAfterSeconds(e) ?? DEFAULT_RATE_LIMIT_BACKOFF_SECONDS;
        positionsRateLimitUntilByLogin.set(accountLogin, Date.now() + retryAfterSeconds * 1000);
      } else {
        warnPositionsStateDiagnostic('[PositionsState] Failed to fetch positions', e);
      }
      set({
        isLoading: false,
        lastError: feedback,
      });
    }
  },
}));
