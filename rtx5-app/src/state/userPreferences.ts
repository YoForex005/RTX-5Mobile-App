import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { quotes } from '../mock/tradingData';

export type QuoteViewMode = 'list' | 'table' | 'edit';
export type ThemeMode = 'light' | 'dark';

const defaultSymbols = quotes.map((item) => item.symbol);

type UserPreferencesState = {
  themeMode: ThemeMode;
  quoteSymbols: string[];
  quoteViewMode: QuoteViewMode;
  chartSymbol: string;
  chartTimeframe: string;
  chartDrawings: string[];
  chartLockAll: boolean;
  chartHideAll: boolean;
  oneClickAccepted: boolean;
  historyRange: string;
  isDemoAccount: boolean;
  isLoggedIn: boolean;
  accountDetails: {
    id: string;
    name: string;
    server: string;
    credentials?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    };
  } | null;
  login: (id: string, name: string, server: string, tokens: { access_token: string; refresh_token: string; expires_at: string }) => void;
  logout: () => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresAt: string) => void;
  setQuoteViewMode: (mode: QuoteViewMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  addQuoteSymbol: (symbol: string) => void;
  removeQuoteSymbol: (symbol: string) => void;
  setChartSymbol: (symbol: string) => void;
  setChartTimeframe: (timeframe: string) => void;
  addChartDrawing: (drawing: string) => void;
  removeChartDrawing: (drawing: string) => void;
  setChartLockAll: (lock: boolean) => void;
  setChartHideAll: (hide: boolean) => void;
  setOneClickAccepted: (accepted: boolean) => void;
  setHistoryRange: (range: string) => void;
  setIsDemoAccount: (isDemo: boolean) => void;
};

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'BTCUSD',
      chartTimeframe: 'H1',
      chartDrawings: [],
      chartLockAll: false,
      chartHideAll: false,
      oneClickAccepted: false,
      historyRange: 'Last 6 months',
      isDemoAccount: true,
      isLoggedIn: false,
      accountDetails: null,
      login: (id, name, server, tokens) =>
        set({
          isLoggedIn: true,
          accountDetails: {
            id,
            name,
            server,
            credentials: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: tokens.expires_at,
            },
          },
        }),
      logout: () => {
        set({ isLoggedIn: false, accountDetails: null });
      },
      updateTokens: (accessToken, refreshToken, expiresAt) =>
        set((state) => {
          if (!state.accountDetails) return state;
          return {
            accountDetails: {
              ...state.accountDetails,
              credentials: {
                accessToken,
                refreshToken,
                expiresAt,
              },
            },
          };
        }),
      setQuoteViewMode: (mode) => set({ quoteViewMode: mode }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      addQuoteSymbol: (symbol) => {
        const current = get().quoteSymbols;
        if (!current.includes(symbol)) {
          set({ quoteSymbols: [...current, symbol] });
        }
      },
      removeQuoteSymbol: (symbol) => {
        set({ quoteSymbols: get().quoteSymbols.filter((item) => item !== symbol) });
      },
      setChartSymbol: (symbol) => set({ chartSymbol: symbol }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
      addChartDrawing: (drawing) => {
        const list = get().chartDrawings;
        set({ chartDrawings: [...list, drawing] });
      },
      removeChartDrawing: (drawing) => {
        set({ chartDrawings: get().chartDrawings.filter((item) => item !== drawing) });
      },
      setChartLockAll: (lock) => set({ chartLockAll: lock }),
      setChartHideAll: (hide) => set({ chartHideAll: hide }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
    }),
    {
      name: 'rtx5-user-preferences-v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
