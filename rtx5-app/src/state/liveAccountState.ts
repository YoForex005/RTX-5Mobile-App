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

export type LiveAccountMetricFlags = Record<keyof Omit<LiveAccountData, 'login'>, boolean>;

/**
 * Zustand store interface for managing live account metrics.
 */
type LiveAccountState = LiveAccountData & {
  /**
   * True once at least one financial metric has arrived for the current login.
   * A known login alone is not enough because the numeric defaults are all zero.
   */
  hasMetrics: boolean;
  /**
   * Tracks which individual financial metrics have arrived for the current login.
   */
  metricFlags: LiveAccountMetricFlags;
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

const financialMetricKeys: Array<keyof Omit<LiveAccountData, 'login'>> = [
  'balance',
  'equity',
  'margin',
  'margin_free',
  'margin_level',
  'floating',
];

const initialMetricFlags: LiveAccountMetricFlags = {
  balance: false,
  equity: false,
  margin: false,
  margin_free: false,
  margin_level: false,
  floating: false,
};

function buildMetricFlags(
  data: Partial<LiveAccountData>,
  currentFlags: LiveAccountMetricFlags,
): LiveAccountMetricFlags {
  const nextFlags = { ...currentFlags };

  for (const key of financialMetricKeys) {
    if (key in data) {
      nextFlags[key] = true;
    }
  }

  return nextFlags;
}

function hasAnyMetric(flags: LiveAccountMetricFlags): boolean {
  return financialMetricKeys.some((key) => flags[key]);
}

/**
 * Global Zustand store for real-time account financial metrics.
 * Designed to be updated frequently (e.g., via WebSocket) without triggering full UI re-renders
 * unless the specific subscribed metric changes.
 */
export const useLiveAccountState = create<LiveAccountState>((set) => ({
  ...initialState,
  hasMetrics: false,
  metricFlags: initialMetricFlags,
  updateMetrics: (data) => set((state) => {
    const loginChanged = data.login !== undefined && data.login !== state.login;
    const nextMetricFlags = buildMetricFlags(
      data,
      loginChanged ? initialMetricFlags : state.metricFlags,
    );
    const baseState = loginChanged ? initialState : state;

    return {
      ...baseState,
      ...data,
      hasMetrics: hasAnyMetric(nextMetricFlags),
      metricFlags: nextMetricFlags,
    };
  }),
  resetMetrics: () => set({ ...initialState, hasMetrics: false, metricFlags: initialMetricFlags }),
}));

