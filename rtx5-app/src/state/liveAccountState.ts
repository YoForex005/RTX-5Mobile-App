import { create } from 'zustand';

export type LiveAccountData = {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  floating: number;
};

type LiveAccountState = LiveAccountData & {
  updateMetrics: (data: Partial<LiveAccountData>) => void;
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

export const useLiveAccountState = create<LiveAccountState>((set) => ({
  ...initialState,
  updateMetrics: (data) => set((state) => ({ ...state, ...data })),
  resetMetrics: () => set(initialState),
}));
