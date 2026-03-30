/**
 * Core module: liveAccountState.ts
 */

import { create } from 'zustand';

/**
 * Represents the live financial metrics for the currently active trading account.
 * These values are typically pushed in real-time via WebSocket.
 */
export type LiveAccountData = {
  /** The unique numeric MT5 login ID for the account */
  login: number;
  /** The settled cash balance of the account */
  balance: number;
  /** The current equity (balance + floating PnL) */
  equity: number;
  /** The amount of margin currently tied up in open positions */
  margin: number;
  /** The available margin that can be used to open new positions */
  margin_free: number;
  /** The margin level percentage (equity / margin * 100) */
  margin_level: number;
  /** The current aggregate unrealized profit/loss from all open positions */
  floating: number;
};

/**
 * Zustand store interface for managing live account metrics.
 */
type LiveAccountState = LiveAccountData & {
  /**
   * Updates one or more properties of the live account state.
   * @param data - Partial metrics to merge into current state
   */
  updateMetrics: (data: Partial<LiveAccountData>) => void;
  /**
   * Resets the account metrics to their default (zero) state.
   */
  resetMetrics: () => void;
};

const initialState: LiveAccountData = {
  login: 0,
  balance: 0,
  equity: 0,
  margin: 0,
  margin_free: 0,
  margin_level: 0,
  floating: 0,
};

/**
 * Global Zustand store for real-time account financial metrics.
 * Designed to be updated frequently (e.g., via WebSocket) without triggering full UI re-renders
 * unless the specific subscribed metric changes.
 */
export const useLiveAccountState = create<LiveAccountState>((set) => ({
  ...initialState,
  updateMetrics: (data) => set((state) => ({ ...state, ...data })),
  resetMetrics: () => set(initialState),
}));

