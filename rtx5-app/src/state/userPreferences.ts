/**
 * Core module: userPreferences.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { quotes } from '../mock/tradingData';

/** Defines the layout style for the market quotes watchlists */
export type QuoteViewMode = 'list' | 'table' | 'edit';
/** Defines the global UI color palate mode */
export type ThemeMode = 'light' | 'dark';

const defaultSymbols = quotes.map((item) => item.symbol);

/**
 * Represents the locally persisted user preferences and device-bound state.
 * Data here survives app restarts and must remain backwards compatible.
 */
type UserPreferencesState = {
  /** Global UI theme mode */
  themeMode: ThemeMode;
  /** List of symbols currently saved to the user's quotes watchlist */
  quoteSymbols: string[];
  /** Display mode for the quotes screen */
  quoteViewMode: QuoteViewMode;
  
  /** Currently focused chart symbol across the app */
  chartSymbol: string;
  /** Currently selected chart timeframe string (e.g., 'M5', 'H1', 'D1') */
  chartTimeframe: string;
  /** Array of serialized drawing tools applied to the chart */
  chartDrawings: string[];
  /** Toggle to lock all current chart drawings from accidental movement */
  chartLockAll: boolean;
  /** Toggle to temporarily hide all chart drawings */
  chartHideAll: boolean;
  
  /** Has the user accepted the legal disclaimer to enable 1-tap fast execution? */
  oneClickAccepted: boolean;
  /** String rep of the date range applied to the historical trade view */
  historyRange: string;
  /** Indicates whether the chart should render buy/sell AI action signal markers */
  showTradingSignals: boolean;
  /** Which price line to render by default (bid or ask) */
  priceSource: 'bid' | 'ask';
  /** Order entry modal flow behavior */
  openOrderMode: 'Regular' | 'Risk calculator' | 'One-click';
  
  /** Whether the user is operating in a paper-trading demo environment */
  isDemoAccount: boolean;
  /** Indicates if a valid standard session exists */
  isLoggedIn: boolean;
  /** Broker ID entered at login — used by GET /broker/config to fetch broker-specific settings */
  brokerId: string;
  
  /** Raw connection details for the user's brokerage account / MT5 connection */
  accountDetails: {
    id: string;
    name: string;
    server: string;
    currency?: string;
    credentials?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    };
  } | null;

  // -- Action Methods --
  
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
  setShowTradingSignals: (show: boolean) => void;
  setPriceSource: (source: 'bid' | 'ask') => void;
  setOpenOrderMode: (mode: 'Regular' | 'Risk calculator' | 'One-click') => void;
  setOneClickAccepted: (accepted: boolean) => void;
  setHistoryRange: (range: string) => void;
  setIsDemoAccount: (isDemo: boolean) => void;
  /** Persist the broker_id from the login screen for app-wide broker config access */
  setBrokerId: (id: string) => void;
};

// ── Secure Persistence Adapter ──────────────────────────────────────────────
// Strips `accountDetails` out of the unencrypted payload destined for AsyncStorage
// and forces it into the platform's native encrypted Keystore / Keychain bounds.
const secureZustandStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const raw = await AsyncStorage.getItem(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Platform.OS !== 'web') {
        // Rehydrate the sensitive account block into the Zustand state
        const secureAcc = await SecureStore.getItemAsync(name + '_auth');
        if (secureAcc && parsed.state) {
          parsed.state.accountDetails = JSON.parse(secureAcc);
        }
      }
      return JSON.stringify(parsed);
    } catch {
      return raw;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.state?.accountDetails) {
        if (Platform.OS !== 'web') {
          // Vault the sensitive fields into native hardware encryption
          await SecureStore.setItemAsync(name + '_auth', JSON.stringify(parsed.state.accountDetails));
          // Sanitize the payload meant for the local filesystem
          parsed.state.accountDetails = null;
        }
      } else {
        if (Platform.OS !== 'web') {
          await SecureStore.deleteItemAsync(name + '_auth').catch(() => {});
        }
      }
      await AsyncStorage.setItem(name, JSON.stringify(parsed));
    } catch (e) {
      console.warn('[SecureStorage] Error persisting standard layout:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(name);
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(name + '_auth').catch(() => {});
    }
  }
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
      showTradingSignals: false,
      priceSource: 'bid',
      openOrderMode: 'Regular',
      oneClickAccepted: false,
      historyRange: 'Last 6 months',
      isDemoAccount: true,
      isLoggedIn: false,
      brokerId: '',
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
      setShowTradingSignals: (show) => set({ showTradingSignals: show }),
      setPriceSource: (source) => set({ priceSource: source }),
      setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
      setBrokerId: (id) => set({ brokerId: id }),
    }),
    {
      name: 'rtx5-user-preferences-v2',
      storage: createJSONStorage(() => secureZustandStorage),
    }
  )
);
