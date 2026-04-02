import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { quotes } from '../mock/tradingData';

export type QuoteViewMode = 'list' | 'table' | 'edit';
export type ThemeMode = 'light' | 'dark';

export type ChartColorsConfig = {
  candlesUptrend: string;
  candlesDowntrend: string;
  hollowBody: string;
  barsUptrend: string;
  barsDowntrend: string;
  lineBody: string;
};

const defaultSymbols: string[] = [];

type UserPreferencesState = {
  themeMode: ThemeMode;
  quoteSymbols: string[];
  quoteViewMode: QuoteViewMode;
  chartSymbol: string;
  chartTimeframe: string;
  chartDrawings: string[];
  chartLockAll: boolean;
  chartHideAll: boolean;
  showOpenPositions: boolean;
  showTpSlStopLimit: boolean;
  showClosedPositions: boolean;
  showHmrPeriods: boolean;
  showPriceAlerts: boolean;
  showPotentialStopOut: boolean;
  oneClickAccepted: boolean;
  historyRange: string;
  showTradingSignals: boolean;
  priceSource: 'bid' | 'ask';
  openOrderMode: 'Regular' | 'Risk calculator' | 'One-click';
  isDemoAccount: boolean;
  isLoggedIn: boolean;
  hasSetInitialSymbols: boolean;
  /** Broker ID entered at login — used by GET /broker/config to fetch broker-specific settings */
  brokerId: string;
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
  chartColors: ChartColorsConfig;

  login: (id: string, name: string, server: string, tokens: { access_token: string; refresh_token: string; expires_at: string }) => void;
  logout: () => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresAt: string) => void;
  setQuoteViewMode: (mode: QuoteViewMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  addQuoteSymbol: (symbol: string) => void;
  removeQuoteSymbol: (symbol: string) => void;
  setQuoteSymbols: (symbols: string[]) => void;
  setChartSymbol: (symbol: string) => void;
  setChartTimeframe: (timeframe: string) => void;
  addChartDrawing: (drawing: string) => void;
  removeChartDrawing: (drawing: string) => void;
  setChartLockAll: (lock: boolean) => void;
  setChartHideAll: (hide: boolean) => void;
  setShowOpenPositions: (show: boolean) => void;
  setShowTpSlStopLimit: (show: boolean) => void;
  setShowClosedPositions: (show: boolean) => void;
  setShowHmrPeriods: (show: boolean) => void;
  setShowPriceAlerts: (show: boolean) => void;
  setShowPotentialStopOut: (show: boolean) => void;
  setShowTradingSignals: (show: boolean) => void;
  setPriceSource: (source: 'bid' | 'ask') => void;
  setOpenOrderMode: (mode: 'Regular' | 'Risk calculator' | 'One-click') => void;
  setOneClickAccepted: (accepted: boolean) => void;
  setHistoryRange: (range: string) => void;
  setIsDemoAccount: (isDemo: boolean) => void;
  /** Persist the broker_id from the login screen for app-wide broker config access */
  setBrokerId: (id: string) => void;
  setHasSetInitialSymbols: (hasSet: boolean) => void;
  setChartColor: (key: keyof ChartColorsConfig, color: string) => void;
};

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'GBPUSD',
      chartTimeframe: 'H1',
      chartDrawings: [],
      chartLockAll: false,
      chartHideAll: false,
      showOpenPositions: true,
      showTpSlStopLimit: true,
      showClosedPositions: false,
      showHmrPeriods: true,
      showPriceAlerts: true,
      showPotentialStopOut: true,
      showTradingSignals: false,
      priceSource: 'bid',
      openOrderMode: 'Regular',
      oneClickAccepted: false,
      historyRange: 'Last 6 months',
      isDemoAccount: true,
      isLoggedIn: false,
      hasSetInitialSymbols: false,
      brokerId: '',
      accountDetails: null,
      chartColors: {
        candlesUptrend: '#2962FF',
        candlesDowntrend: '#EF5350',
        hollowBody: '#1E293B',
        barsUptrend: '#2962FF',
        barsDowntrend: '#EF5350',
        lineBody: '#1E293B',
      },
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
        // Clear broker context along with auth state on logout
        set({ isLoggedIn: false, accountDetails: null, brokerId: '' });
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
      setQuoteSymbols: (symbols) => set({ quoteSymbols: symbols }),
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
      setShowOpenPositions: (show) => set({ showOpenPositions: show }),
      setShowTpSlStopLimit: (show) => set({ showTpSlStopLimit: show }),
      setShowClosedPositions: (show) => set({ showClosedPositions: show }),
      setShowHmrPeriods: (show) => set({ showHmrPeriods: show }),
      setShowPriceAlerts: (show) => set({ showPriceAlerts: show }),
      setShowPotentialStopOut: (show) => set({ showPotentialStopOut: show }),
      setShowTradingSignals: (show) => set({ showTradingSignals: show }),
      setPriceSource: (source) => set({ priceSource: source }),
      setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
      setBrokerId: (id) => set({ brokerId: id }),
      setHasSetInitialSymbols: (hasSet) => set({ hasSetInitialSymbols: hasSet }),
      setChartColor: (key, color) =>
        set((state) => ({
          chartColors: { ...state.chartColors, [key]: color },
        })),
    }),
    {
      name: 'rtx5-user-preferences-v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
