/**
 * Core module: positionsState.ts
 */

import { create } from 'zustand';
import type { PositionItem } from '../mock/tradingData';
import { positionsApi, type Position } from '../api/positions';
import {
  classifyTradingError,
  createFrontendTradingError,
  type TradingErrorFeedback,
} from '../api/tradingErrors';
import { mapPositionToItem } from './positionsMapper';
import {
  buildMergedPositions,
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
  applyPositionsSnapshot: (dtos: any[], accountLogin?: string) => void;
  upsertPosition: (dto: any) => void;
  refreshPositions: (accountLogin: string) => Promise<void>;
};

export const usePositionsState = create<PositionsState>((set) => ({
  positions: [],
  positionSnapshots: {},
  isLoading: false,
  lastFetchLogin: null,
  hydratedLogin: null,
  lastError: null,
  setPositions: (positions) => set({ positions }),
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
    set((state) => ({
      positions: state.positions.filter((position) => String(position.id) !== String(positionId)),
      positionSnapshots: Object.fromEntries(
        Object.entries(state.positionSnapshots).filter(([id]) => id !== String(positionId)),
      ),
    })),
  applyPositionsSnapshot: (dtos, accountLogin) =>
    set((state) => ({
      positions: buildMergedPositions(state.positions, Array.isArray(dtos) ? dtos : []),
      lastFetchLogin: accountLogin ?? state.lastFetchLogin,
      hydratedLogin: accountLogin ?? state.hydratedLogin,
      lastError: null,
    })),

  upsertPosition: (dto: any) => {
    set((state) => {
      if (isTerminalPositionUpdate(dto)) {
        const existing = findExistingPosition(state.positions, dto);
        if (!existing) {
          return {};
        }

        return {
          positions: state.positions.filter((position) => position.id !== existing.id),
          positionSnapshots: Object.fromEntries(
            Object.entries(state.positionSnapshots).filter(([id]) => id !== String(existing.id)),
          ),
        };
      }

      const existing = findExistingPosition(state.positions, dto);
      const newItem = mapPositionToItem(dto, existing);
      newItem.clientCreatedAt = existing?.clientCreatedAt ?? Date.now();
      newItem.clientModifiedAt = existing?.clientModifiedAt;

      const existsIdx = state.positions.findIndex((position) => position.id === newItem.id);
      const nextPositions = [...state.positions];

      if (existsIdx >= 0) {
        nextPositions[existsIdx] = newItem;
      } else {
        nextPositions.unshift(newItem);
      }

      nextPositions.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
      return { positions: nextPositions };
    });
  },

  refreshPositions: async (accountLogin: string) => {
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

    try {
      const login = parseInt(accountLogin, 10);
      if (Number.isNaN(login)) {
        console.warn('[PositionsState] Invalid account login:', accountLogin);
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
        console.warn('[PositionsState] Unexpected response shape:', typeof data);
      }

      console.log('[PositionsState] Fetched', positionsArray.length, 'open positions for login', login);

      set((state) => {
        return {
          positions: buildMergedPositions(state.positions, positionsArray),
          isLoading: false,
          hydratedLogin: accountLogin,
          lastError: null,
        };
      });
    } catch (e) {
      console.warn('[PositionsState] Failed to fetch positions', e);
      set({
        isLoading: false,
        lastError: classifyTradingError(e, { action: 'load-positions' }),
      });
    }
  },
}));
