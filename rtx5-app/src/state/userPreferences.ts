import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_CHART_SHOW_ON_CHART,
  buildChartShowOnChartSettingsFromLegacy,
  hasLegacyChartShowOnChartDefaults,
  normalizeChartShowOnChartSettings,
  type ChartShowOnChartKey,
  type ChartShowOnChartSettings,
} from '../features/chart/chartShowOnChart';
import {
  type PersistedChartDrawing,
  type PersistedChartDrawingsBySymbol,
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  sanitizePersistedChartDrawings,
} from '../features/chart/drawingPersistence';
import { DEFAULT_TRADE_VOLUME, normalizeTradeVolume } from '../utils/tradeVolume';
export type QuoteViewMode = 'list' | 'table' | 'edit';
export type ThemeMode = 'light' | 'dark';
export type LanguageCode =
  | 'en'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'it'
  | 'ru'
  | 'tr'
  | 'ar'
  | 'hi'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'id';
export type ChartColorScheme = 'green_on_black' | 'black_on_white' | 'yellow_on_black' | 'custom';
export type ChartVisualType = 'candles' | 'bars' | 'line' | 'hollow';

export type ChartColorsConfig = {
  background: string;
  foreground: string;
  grid: string;
  candlesUptrend: string;
  candlesDowntrend: string;
  hollowBody: string;
  barsUptrend: string;
  barsDowntrend: string;
  lineBody: string;
  tradeOpen?: string;
  tradeTpSl?: string;
  tradeStopOut?: string;
};

export type ChartDisplaySettings = {
  showTicker: boolean;
  showOHLC: boolean;
  showQuickTradingButtons: boolean;
  showBidPriceLine: boolean;
  showAskPriceLine: boolean;
  showLastPriceLine: boolean;
  showPeriodSeparators: boolean;
  showGrid: boolean;
  showTickVolumes: boolean;
  showRealVolumes: boolean;
  showObjectDescriptions: boolean;
  showTradeLevels: boolean;
  showTradeHistory: boolean;
};

export const CHART_COLOR_SCHEME_PRESETS: Record<Exclude<ChartColorScheme, 'custom'>, { label: string; colors: ChartColorsConfig }> = {
  green_on_black: {
    label: 'Green on Black',
    colors: {
      background: '#0E0E12',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.15)',
      candlesUptrend: '#10B981',
      candlesDowntrend: '#EF4444',
      hollowBody: '#0E0E12',
      barsUptrend: '#10B981',
      barsDowntrend: '#EF4444',
      lineBody: '#10B981',
    },
  },
  black_on_white: {
    label: 'Black on White',
    colors: {
      background: '#FFFFFF',
      foreground: '#0F172A',
      grid: 'rgba(15,23,42,0.12)',
      candlesUptrend: '#2563EB',
      candlesDowntrend: '#EF4444',
      hollowBody: '#FFFFFF',
      barsUptrend: '#2563EB',
      barsDowntrend: '#EF4444',
      lineBody: '#2563EB',
    },
  },
  yellow_on_black: {
    label: 'Yellow on Black',
    colors: {
      background: '#0E0E12',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.15)',
      candlesUptrend: '#FACC15',
      candlesDowntrend: '#F59E0B',
      hollowBody: '#0E0E12',
      barsUptrend: '#FACC15',
      barsDowntrend: '#F59E0B',
      lineBody: '#FACC15',
    },
  },
};

export const DEFAULT_CHART_COLORS: ChartColorsConfig = {
  background: '#080B11',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.04)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
};

type StructuralChartColors = Pick<ChartColorsConfig, 'background' | 'foreground' | 'grid' | 'hollowBody'>;

const LIGHT_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
  foreground: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
  grid: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
};

const DARK_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: '#080B11',
  foreground: DEFAULT_CHART_COLORS.foreground,
  grid: DEFAULT_CHART_COLORS.grid,
  hollowBody: '#080B11',
};

const BUILTIN_STRUCTURAL_VALUES: Record<keyof StructuralChartColors, Set<string>> = {
  background: new Set([
    '#000000', // legacy default — ensures persisted values get migrated
    '#0E141F', // previous card default
    DEFAULT_CHART_COLORS.background,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.background,
  ]),
  foreground: new Set([
    DEFAULT_CHART_COLORS.foreground,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.foreground,
  ]),
  grid: new Set([
    DEFAULT_CHART_COLORS.grid,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.grid,
  ]),
  hollowBody: new Set([
    DEFAULT_CHART_COLORS.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.hollowBody,
  ]),
};

export function resolveChartColorsForTheme(
  chartColors: Partial<ChartColorsConfig> | undefined,
  chartColorScheme: ChartColorScheme | undefined,
  isDark: boolean,
): ChartColorsConfig {
  const mergedColors: ChartColorsConfig = {
    ...DEFAULT_CHART_COLORS,
    ...(chartColors ?? {}),
  };

  const resolvedColors = { ...mergedColors };
  const themeStructuralColors = isDark ? DARK_THEME_CHART_FALLBACKS : LIGHT_THEME_CHART_FALLBACKS;
  const forceThemeStructure = Boolean(chartColorScheme && chartColorScheme !== 'custom');

  (Object.keys(themeStructuralColors) as Array<keyof StructuralChartColors>).forEach((key) => {
    if (forceThemeStructure || BUILTIN_STRUCTURAL_VALUES[key].has(mergedColors[key])) {
      resolvedColors[key] = themeStructuralColors[key];
    }
  });

  return resolvedColors;
}

export const DEFAULT_CHART_DISPLAY_SETTINGS: ChartDisplaySettings = {
  showTicker: true,
  showOHLC: false,
  showQuickTradingButtons: true,
  showBidPriceLine: true,
  showAskPriceLine: false,
  // true = show the colored axis label (box) for the last-close price on the
  // right price scale. This is standard in all professional trading apps
  // (MT5, TradingView, Dhan). Note: this no longer controls priceLineVisible
  // on the series — the BID price line is the only horizontal line on the
  // chart canvas.
  showLastPriceLine: true,
  showPeriodSeparators: false,
  showGrid: true,
  showTickVolumes: true,
  showRealVolumes: false,
  showObjectDescriptions: false,
  showTradeLevels: true,
  showTradeHistory: true,
};

const defaultSymbols: string[] = [];

type UserPreferencesState = {
  hasHydrated: boolean;
  themeMode: ThemeMode;
  quoteSymbols: string[];
  quoteViewMode: QuoteViewMode;
  chartSymbol: string;
  chartTimeframe: string;
  tradeVolume: number;
  chartVisualType: ChartVisualType;
  chartViewportShowVolumePane: boolean;
  chartDrawings: string[];
  chartDrawingRecordsBySymbol: PersistedChartDrawingsBySymbol;
  chartLockAll: boolean;
  chartHideAll: boolean;
  chartShowOnChart: ChartShowOnChartSettings;
  historySummaryDetailsVisible: boolean;
  tradeSummaryDetailsVisible: boolean;
  oneClickAccepted: boolean;
  historyRange: string;
  /**
   * Unix millisecond timestamps for the active history date filter.
   * Set alongside `historyRange` so query hooks can pass `from`/`to` params
   * to GET /api/v2/account/deals and similar range-aware endpoints.
   * null means "no explicit filter" — the server applies its own default.
   */
  historyFromMs: number | null;
  historyToMs: number | null;
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
  chartColorScheme: ChartColorScheme;
  chartColors: ChartColorsConfig;
  chartDisplay: ChartDisplaySettings;
  language: LanguageCode;

  setLanguage: (lang: LanguageCode) => void;
  login: (id: string, name: string, server: string, tokens: { access_token: string; refresh_token: string; expires_at: string }, brokerId?: string) => void;
  logout: () => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresAt: string) => void;
  setQuoteViewMode: (mode: QuoteViewMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  addQuoteSymbol: (symbol: string) => void;
  removeQuoteSymbol: (symbol: string) => void;
  setQuoteSymbols: (symbols: string[]) => void;
  setChartSymbol: (symbol: string) => void;
  setChartTimeframe: (timeframe: string) => void;
  setTradeVolume: (volume: number) => void;
  setChartVisualType: (chartType: ChartVisualType) => void;
  setChartViewportShowVolumePane: (visible: boolean) => void;
  addChartDrawing: (drawing: string) => void;
  removeChartDrawing: (drawing: string) => void;
  setChartDrawings: (drawings: string[]) => void;
  setChartDrawingRecordsForSymbol: (symbol: string, drawings: PersistedChartDrawing[]) => void;
  removeChartDrawingRecordForSymbol: (symbol: string, drawingId: string) => void;
  setChartLockAll: (lock: boolean) => void;
  setChartHideAll: (hide: boolean) => void;
  setChartShowOnChartItem: <K extends ChartShowOnChartKey>(key: K, value: ChartShowOnChartSettings[K]) => void;
  setHistorySummaryDetailsVisible: (visible: boolean) => void;
  setTradeSummaryDetailsVisible: (visible: boolean) => void;
  setPriceSource: (source: 'bid' | 'ask') => void;
  setOpenOrderMode: (mode: 'Regular' | 'Risk calculator' | 'One-click') => void;
  setOneClickAccepted: (accepted: boolean) => void;
  setHistoryRange: (range: string) => void;
  /** Persist the computed from/to Unix-ms timestamps alongside the range label. */
  setHistoryDateRange: (fromMs: number | null, toMs: number | null) => void;
  setIsDemoAccount: (isDemo: boolean) => void;
  /** Persist the broker_id from the login screen for app-wide broker config access */
  setBrokerId: (id: string) => void;
  setHasSetInitialSymbols: (hasSet: boolean) => void;
  setChartColorScheme: (scheme: ChartColorScheme) => void;
  setChartColor: (key: keyof ChartColorsConfig, color: string) => void;
  setChartDisplaySetting: <K extends keyof ChartDisplaySettings>(key: K, value: ChartDisplaySettings[K]) => void;
  setHasHydrated: (hydrated: boolean) => void;
  updateAccountDetails: (updates: Partial<NonNullable<UserPreferencesState['accountDetails']>>) => void;
};

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'GBPUSD',
      chartTimeframe: 'H1',
      tradeVolume: DEFAULT_TRADE_VOLUME,
      chartVisualType: 'candles',
      chartViewportShowVolumePane: false,
      chartDrawings: [],
      chartDrawingRecordsBySymbol: {},
      chartLockAll: false,
      chartHideAll: false,
      chartShowOnChart: { ...DEFAULT_CHART_SHOW_ON_CHART },
      historySummaryDetailsVisible: true,
      tradeSummaryDetailsVisible: true,
      priceSource: 'bid',
      openOrderMode: 'Regular',
      oneClickAccepted: false,
      historyRange: 'All time',
      historyFromMs: null,
      historyToMs: null,
      isDemoAccount: true,
      isLoggedIn: false,
      hasSetInitialSymbols: false,
      brokerId: '',
      accountDetails: null,
      chartColorScheme: 'custom',
      chartColors: DEFAULT_CHART_COLORS,
      chartDisplay: DEFAULT_CHART_DISPLAY_SETTINGS,
      language: 'en' as LanguageCode,
      setLanguage: (lang) => set({ language: lang }),
      login: (id, name, server, tokens, brokerId) =>
        set((state) => ({
          isLoggedIn: true,
          // Persist brokerId atomically with login to prevent race conditions.
          // Falls back to existing brokerId if not provided (e.g., for register flow).
          brokerId: brokerId || state.brokerId || '',
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
        })),
      logout: () => {
        // Clear auth state but preserve brokerId — it's not security-sensitive
        // and preserving it allows the saved-credentials auto-login flow to
        // work without requiring the user to re-enter the Broker ID.
        // Reset quoteSymbols and hasSetInitialSymbols so the next login
        // re-seeds from server watchlist or defaults (5 symbols).
        set({ isLoggedIn: false, accountDetails: null, quoteSymbols: [], hasSetInitialSymbols: false });
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
      setChartSymbol: (symbol) =>
        set((state) => {
          const nextKey = getChartDrawingBucketKey(symbol);
          const nextDrawings = state.chartDrawingRecordsBySymbol[nextKey] ?? [];
          return {
            chartSymbol: symbol,
            chartDrawings: getChartDrawingLabels(nextDrawings),
          };
        }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
      setTradeVolume: (volume) => set({ tradeVolume: normalizeTradeVolume(volume) }),
      setChartVisualType: (chartType) => set({ chartVisualType: chartType }),
      setChartViewportShowVolumePane: (visible) => set({ chartViewportShowVolumePane: visible }),
      addChartDrawing: (drawing) => {
        const list = get().chartDrawings;
        set({ chartDrawings: [...list, drawing] });
      },
      removeChartDrawing: (drawing) => {
        set({ chartDrawings: get().chartDrawings.filter((item) => item !== drawing) });
      },
      setChartDrawings: (drawings) => set({ chartDrawings: drawings }),
      setChartDrawingRecordsForSymbol: (symbol, drawings) =>
        set((state) => {
          const bucketKey = getChartDrawingBucketKey(symbol);
          const nextDrawings = sanitizePersistedChartDrawings(drawings);
          const nextRecordsBySymbol: PersistedChartDrawingsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
          };

          return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: getChartDrawingBucketKey(state.chartSymbol) === bucketKey
              ? getChartDrawingLabels(nextDrawings)
              : state.chartDrawings,
          };
        }),
      removeChartDrawingRecordForSymbol: (symbol, drawingId) =>
        set((state) => {
          const bucketKey = getChartDrawingBucketKey(symbol);
          const currentDrawings = state.chartDrawingRecordsBySymbol[bucketKey] ?? [];
          const nextDrawings = currentDrawings.filter((drawing) => drawing.id !== drawingId);
          const nextRecordsBySymbol: PersistedChartDrawingsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
          };

          return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: getChartDrawingBucketKey(state.chartSymbol) === bucketKey
              ? getChartDrawingLabels(nextDrawings)
              : state.chartDrawings,
          };
        }),
      setChartLockAll: (lock) => set({ chartLockAll: lock }),
      setChartHideAll: (hide) => set({ chartHideAll: hide }),
      setChartShowOnChartItem: (key, value) =>
        set((state) => ({
          chartShowOnChart: {
            ...state.chartShowOnChart,
            [key]: value,
          },
        })),
      setHistorySummaryDetailsVisible: (visible) => set({ historySummaryDetailsVisible: visible }),
      setTradeSummaryDetailsVisible: (visible) => set({ tradeSummaryDetailsVisible: visible }),
      setPriceSource: (source) => set({ priceSource: source }),
      setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setHistoryDateRange: (fromMs, toMs) => set({ historyFromMs: fromMs, historyToMs: toMs }),
      setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
      setBrokerId: (id) => set({ brokerId: id }),
      setHasSetInitialSymbols: (hasSet) => set({ hasSetInitialSymbols: hasSet }),
      setChartColorScheme: (scheme) =>
        set((state) => {
          if (scheme === 'custom') {
            return { chartColorScheme: scheme };
          }

          return {
            chartColorScheme: scheme,
            chartColors: { ...CHART_COLOR_SCHEME_PRESETS[scheme].colors },
          };
        }),
      setChartColor: (key, color) =>
        set((state) => ({
          chartColorScheme: 'custom',
          chartColors: { ...state.chartColors, [key]: color },
        })),
      setChartDisplaySetting: (key, value) =>
        set((state) => ({
          chartDisplay: { ...state.chartDisplay, [key]: value },
        })),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      updateAccountDetails: (updates) =>
        set((state) => {
          if (!state.accountDetails) return state;
          return {
            accountDetails: {
              ...state.accountDetails,
              ...updates,
              credentials: updates.credentials ?? state.accountDetails.credentials,
            },
          };
        }),
    }),
    {
      name: 'rtx5-user-preferences-v2',
      version: 12,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<UserPreferencesState> & {
          chartColors?: Partial<ChartColorsConfig>;
          chartDisplay?: Partial<ChartDisplaySettings>;
          chartDrawingRecordsBySymbol?: PersistedChartDrawingsBySymbol;
          chartShowOnChart?: Partial<ChartShowOnChartSettings>;
          historySummaryDetailsVisible?: boolean;
          tradeSummaryDetailsVisible?: boolean;
        };
        const legacyShowOnChartState = {
          showOpenPositions: (state as any).showOpenPositions,
          showTpSlStopLimit: (state as any).showTpSlStopLimit,
          showClosedPositions: (state as any).showClosedPositions,
          showTradingSignals: (state as any).showTradingSignals,
          showHmrPeriods: (state as any).showHmrPeriods,
          showPriceAlerts: (state as any).showPriceAlerts,
          showPotentialStopOut: (state as any).showPotentialStopOut,
        };
        const shouldResetLegacyShowOnChartFlags =
          (version ?? 0) < 4 && hasLegacyChartShowOnChartDefaults(legacyShowOnChartState);
        const nextChartShowOnChart = shouldResetLegacyShowOnChartFlags
          ? { ...DEFAULT_CHART_SHOW_ON_CHART }
          : normalizeChartShowOnChartSettings(
              state.chartShowOnChart ?? buildChartShowOnChartSettingsFromLegacy(legacyShowOnChartState),
            );
        const nextDrawingRecordsBySymbol: PersistedChartDrawingsBySymbol = Object.fromEntries(
          Object.entries(state.chartDrawingRecordsBySymbol ?? {}).map(([symbol, drawings]) => [
            getChartDrawingBucketKey(symbol),
            sanitizePersistedChartDrawings(drawings),
          ]),
        );
        const activeDrawingLabels = getChartDrawingLabels(
          nextDrawingRecordsBySymbol[getChartDrawingBucketKey(state.chartSymbol ?? 'GBPUSD')] ?? [],
        );

        const nextHistoryRange =
          (version ?? 0) < 11 &&
          state.historyRange === 'Last 6 months' &&
          state.historyFromMs == null &&
          state.historyToMs == null
            ? 'All time'
            : (state.historyRange ?? 'All time');

        return {
          ...state,
          hasHydrated: false,
          historyRange: nextHistoryRange,
          historyFromMs: state.historyFromMs ?? null,
          historyToMs: state.historyToMs ?? null,
          chartShowOnChart: nextChartShowOnChart,
          historySummaryDetailsVisible:
            state.historySummaryDetailsVisible ??
            ((version ?? 0) < 11 ? state.tradeSummaryDetailsVisible : undefined) ??
            true,
          tradeSummaryDetailsVisible:
            state.tradeSummaryDetailsVisible ??
            true,
          chartDrawings: activeDrawingLabels.length > 0
            ? activeDrawingLabels
            : (state.chartDrawings ?? []),
          chartDrawingRecordsBySymbol: nextDrawingRecordsBySymbol,
          chartVisualType: state.chartVisualType ?? 'candles',
          chartViewportShowVolumePane: state.chartViewportShowVolumePane ?? false,
          tradeVolume: normalizeTradeVolume((state as Partial<UserPreferencesState>).tradeVolume ?? DEFAULT_TRADE_VOLUME),
          chartColorScheme: state.chartColorScheme ?? 'custom',
          chartColors: {
            ...DEFAULT_CHART_COLORS,
            ...(state.chartColors ?? {}),
          },
          chartDisplay: {
            ...DEFAULT_CHART_DISPLAY_SETTINGS,
            ...(state.chartDisplay ?? {}),
          },
        } as UserPreferencesState;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[UserPreferences] Failed to rehydrate persisted preferences', error);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
