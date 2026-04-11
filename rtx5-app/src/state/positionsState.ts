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

type PositionsState = {
  positions: PositionItem[];
  isLoading: boolean;
  lastFetchLogin: string | null;
  lastError: TradingErrorFeedback | null;
  setPositions: (positions: PositionItem[]) => void;
  upsertPosition: (dto: any) => void;
  refreshPositions: (accountLogin: string) => Promise<void>;
};

function findExistingPosition(positions: PositionItem[], dto: any): PositionItem | undefined {
  const incomingId = dto?.ticket ?? dto?.id;
  if (incomingId !== undefined && incomingId !== null) {
    return positions.find((position) => String(position.id) === String(incomingId));
  }

  return undefined;
}

export const usePositionsState = create<PositionsState>((set) => ({
  positions: [],
  isLoading: false,
  lastFetchLogin: null,
  lastError: null,
  setPositions: (positions) => set({ positions }),

  upsertPosition: (dto: any) => {
    set((state) => {
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
    set({ isLoading: true, lastFetchLogin: accountLogin, lastError: null });

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
        const mapped = positionsArray.map((dto) => mapPositionToItem(dto, findExistingPosition(state.positions, dto)));
        const now = Date.now();

        const optimisticPositions = state.positions.filter((position) => {
          const clientCreatedAt = position.clientCreatedAt ?? 0;
          if (!clientCreatedAt) return false;

          const ageMs = now - clientCreatedAt;
          const isRecent = ageMs >= 0 && ageMs < 60000;
          const existsInFetched = mapped.some((mappedPosition) => mappedPosition.id === position.id);
          return isRecent && !existsInFetched;
        });

        const mergedMapped = mapped.map((mappedPosition) => {
          const existing = state.positions.find((position) => position.id === mappedPosition.id);
          if (existing?.clientModifiedAt) {
            const modAgeMs = now - existing.clientModifiedAt;
            if (modAgeMs >= 0 && modAgeMs < 10000) {
              return {
                ...mappedPosition,
                sl: existing.sl,
                tp: existing.tp,
                clientCreatedAt: existing.clientCreatedAt,
                clientModifiedAt: existing.clientModifiedAt,
              };
            }
          }

          return {
            ...mappedPosition,
            clientCreatedAt: existing?.clientCreatedAt,
            clientModifiedAt: existing?.clientModifiedAt,
          };
        });

        const combined = [...optimisticPositions, ...mergedMapped].sort(
          (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
        );

        return {
          positions: combined,
          isLoading: false,
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
