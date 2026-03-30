/**
 * Core module: positionsState.ts
 */

import { create } from 'zustand';
import { PositionItem } from '../mock/tradingData';
import { positionsApi, Position } from '../api/positions';

// ─────────────────────────────────────────────────────────────────────────────
// Global positions state (Zustand).
// Stores the list of open positions and exposes a refreshPositions action
// that fetches from the live API via positionsApi.getPositions().
// Used by TradeScreen, BulkOperationScreen, and anywhere that needs
// synchronous access to the current positions list outside React Query.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a raw Position DTO from the API into the app's PositionItem model.
 * Identical to the mapping in query/positions.ts — kept in sync here for
 * the imperative refreshPositions path that bypasses React Query.
 */
function mapPositionToItem(dto: any): PositionItem {
  // Safely parse openTime to avoid RangeError on invalid dates
  let openTimeStr = new Date().toISOString();
  try {
    if (dto.time_create) {
      if (typeof dto.time_create === 'number') {
        // Assume seconds from epoch (MT5 standard)
        openTimeStr = new Date(dto.time_create * 1000).toISOString();
      } else if (typeof dto.time_create === 'string') {
        openTimeStr = new Date(dto.time_create).toISOString();
      }
    }
  } catch (e) {
    console.warn('[PositionsState] Invalid time_create format:', dto.time_create);
  }

  return {
    id: String(dto.ticket || dto.id || Math.random()),
    symbol: dto.symbol || 'UNKNOWN',
    side: dto.side || 'buy',
    volume: dto.volume || 0,
    openPrice: dto.price_open || 0,
    currentPrice: dto.price_current || dto.price_open || 0,
    pnl: (Number(dto.profit) || 0) + (Number(dto.swap) || 0) + (Number(dto.commission) || 0),
    swap: Number(dto.swap) || 0,
    openTime: openTimeStr,
    sl: dto.price_sl || dto.sl || 0,
    tp: dto.price_tp || dto.tp || 0,
  };
}

type PositionsState = {
  positions: PositionItem[];
  isLoading: boolean;
  lastFetchLogin: string | null;
  lastError: string | null;
  setPositions: (positions: PositionItem[]) => void;
  upsertPosition: (dto: any) => void;
  refreshPositions: (accountLogin: string) => Promise<void>;
};

export const usePositionsState = create<PositionsState>((set) => ({
  positions: [],
  isLoading: false,
  lastFetchLogin: null,
  lastError: null,
  setPositions: (positions) => set({ positions }),
  
  upsertPosition: (dto: any) => {
    set((state) => {
      const newItem = mapPositionToItem(dto);
      // critically stamp WebSocket trades with a client timestamp so the 
      // REST polling loop doesn't instantly purge them before the DB catches up!
      newItem.clientCreatedAt = Date.now();
      
      const existsIdx = state.positions.findIndex(p => p.id === newItem.id);
      let newPositions = [...state.positions];
      
      if (existsIdx >= 0) {
        // Safe update: retain clientCreatedAt to prevent optimistic expiration bugs
        newPositions[existsIdx] = { ...newItem, clientCreatedAt: state.positions[existsIdx].clientCreatedAt };
      } else {
        newPositions = [newItem, ...newPositions];
      }
      
      // Keep sorted newest-first
      newPositions.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
      
      return { positions: newPositions };
    });
  },

  /**
   * Fetches open positions from the live trading API and updates state.
   * Routes through positionsApi.getPositions() which uses apiClient for
   * automatic Bearer token injection and 401 token refresh handling.
   *
   * @param accountLogin - The MT5 account login number as a string
   */
  refreshPositions: async (accountLogin: string) => {
    set({ isLoading: true, lastFetchLogin: accountLogin, lastError: null });

    try {
      const login = parseInt(accountLogin, 10);
      if (isNaN(login)) {
        console.warn('[PositionsState] Invalid account login:', accountLogin);
        set({
          isLoading: false,
          lastError: `Invalid account login: ${accountLogin}`,
        });
        return;
      }

      const data = await positionsApi.getPositions(login);
      
      // Handle both array and wrapped responses (e.g. { data: [...] } or { positions: [...] })
      let positionsArray: Position[];
      if (Array.isArray(data)) {
        positionsArray = data;
      } else if (data && typeof data === 'object') {
        // Try common wrapper keys first
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
          // Check if any value is an array
          const arrVal = Object.values(wrapped).find(Array.isArray);
          if (arrVal) {
            positionsArray = arrVal as Position[];
          } else if (wrapped.ticket || wrapped.id) {
            // It's a single position object!
            positionsArray = [wrapped];
          } else {
            // It might be a dictionary of positions
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
      const mapped = positionsArray.map(mapPositionToItem);
      
      set((state) => {
        const now = Date.now();
        // Preserve client-created optimistic positions briefly so a slow
        // /positions replication step does not blank the list right after
        // a filled order. Do not depend on server timestamps for this.
        const optimisticPositions = state.positions.filter(p => {
          const clientCreatedAt = p.clientCreatedAt ?? 0;
          if (!clientCreatedAt) return false;

          const ageMs = now - clientCreatedAt;
          const isRecent = ageMs >= 0 && ageMs < 60000;
          const existsInFetched = mapped.some(m => m.id === p.id);
          return isRecent && !existsInFetched;
        });

        // Override mapped properties with optimistic values if recently modified
        const mergedMapped = mapped.map((m) => {
          const existing = state.positions.find((p) => p.id === m.id);
          if (existing?.clientModifiedAt) {
            const modAgeMs = now - existing.clientModifiedAt;
            // Retain local client SL/TP bounds for 10 seconds post-modification
            // to allow the REST replica sequence to sync with MT5
            if (modAgeMs >= 0 && modAgeMs < 10000) {
              return { 
                ...m, 
                sl: existing.sl, 
                tp: existing.tp, 
                clientModifiedAt: existing.clientModifiedAt 
              };
            }
          }
          return m;
        });

        // Combine and optionally sort by time (newest first)
        const combined = [...optimisticPositions, ...mergedMapped].sort((a, b) => {
          return new Date(b.openTime).getTime() - new Date(a.openTime).getTime();
        });

        return {
          positions: combined,
          isLoading: false,
          lastError: null,
        };
      });
    } catch (e) {
      console.warn('[PositionsState] Failed to fetch positions', e);
      const message =
        (e as any)?.response?.data?.message
        || (e as Error)?.message
        || 'Failed to fetch open positions';
      set({ isLoading: false, lastError: message });
    }
  },
}));
