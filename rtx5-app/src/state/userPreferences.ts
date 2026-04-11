import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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

const DEFAULT_SHOW_ON_CHART_FLAGS = {
  showOpenPositions: true,
  showTpSlStopLimit: true,
  showClosedPositions: false,
  showHmrPeriods: false,
  showPriceAlerts: false,
  showPotentialStopOut: false,
  showTradingSignals: false,
} as const;

const LEGACY_SHOW_ON_CHART_DEFAULTS = {
  showOpenPositions: true,
  showTpSlStopLimit: true,
  showClosedPositions: false,
  showHmrPeriods: true,
  showPriceAlerts: true,
  showPotentialStopOut: true,
  showTradingSignals: false,
} as const;

const hasLegacyShowOnChartDefaults = (
  state: Partial<
    Pick<
      UserPreferencesState,
      | 'showOpenPositions'
      | 'showTpSlStopLimit'
      | 'showClosedPositions'
      | 'showHmrPeriods'
      | 'showPriceAlerts'
      | 'showPotentialStopOut'
      | 'showTradingSignals'
    >
  >,
) =>
  state.showOpenPositions === LEGACY_SHOW_ON_CHART_DEFAULTS.showOpenPositions &&
  state.showTpSlStopLimit === LEGACY_SHOW_ON_CHART_DEFAULTS.showTpSlStopLimit &&
  state.showClosedPositions === LEGACY_SHOW_ON_CHART_DEFAULTS.showClosedPositions &&
  state.showHmrPeriods === LEGACY_SHOW_ON_CHART_DEFAULTS.showHmrPeriods &&
  state.showPriceAlerts === LEGACY_SHOW_ON_CHART_DEFAULTS.showPriceAlerts &&
  state.showPotentialStopOut === LEGACY_SHOW_ON_CHART_DEFAULTS.showPotentialStopOut &&
  state.showTradingSignals === LEGACY_SHOW_ON_CHART_DEFAULTS.showTradingSignals;

type UserPreferencesState = {
  themeMode: ThemeMode;
  quoteSymbols: string[];
  quoteViewMode: QuoteViewMode;
  chartSymbol: string;
  chartTimeframe: string;
  chartVisualType: ChartVisualType;
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
  /**
   * Unix millisecond timestamps for the active history date filter.
   * Set alongside `historyRange` so query hooks can pass `from`/`to` params
   * to GET /api/v2/account/deals and similar range-aware endpoints.
   * null means "no explicit filter" — the server applies its own default.
   */
  historyFromMs: number | null;
  historyToMs: number | null;
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
  setChartVisualType: (chartType: ChartVisualType) => void;
  addChartDrawing: (drawing: string) => void;
  removeChartDrawing: (drawing: string) => void;
  setChartDrawings: (drawings: string[]) => void;
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
  /** Persist the computed from/to Unix-ms timestamps alongside the range label. */
  setHistoryDateRange: (fromMs: number | null, toMs: number | null) => void;
  setIsDemoAccount: (isDemo: boolean) => void;
  /** Persist the broker_id from the login screen for app-wide broker config access */
  setBrokerId: (id: string) => void;
  setHasSetInitialSymbols: (hasSet: boolean) => void;
  setChartColorScheme: (scheme: ChartColorScheme) => void;
  setChartColor: (key: keyof ChartColorsConfig, color: string) => void;
  setChartDisplaySetting: <K extends keyof ChartDisplaySettings>(key: K, value: ChartDisplaySettings[K]) => void;
};

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'GBPUSD',
      chartTimeframe: 'H1',
      chartVisualType: 'candles',
      chartDrawings: [],
      chartLockAll: false,
      chartHideAll: false,
      showOpenPositions: DEFAULT_SHOW_ON_CHART_FLAGS.showOpenPositions,
      showTpSlStopLimit: DEFAULT_SHOW_ON_CHART_FLAGS.showTpSlStopLimit,
      showClosedPositions: DEFAULT_SHOW_ON_CHART_FLAGS.showClosedPositions,
      showHmrPeriods: DEFAULT_SHOW_ON_CHART_FLAGS.showHmrPeriods,
      showPriceAlerts: DEFAULT_SHOW_ON_CHART_FLAGS.showPriceAlerts,
      showPotentialStopOut: DEFAULT_SHOW_ON_CHART_FLAGS.showPotentialStopOut,
      showTradingSignals: DEFAULT_SHOW_ON_CHART_FLAGS.showTradingSignals,
      priceSource: 'bid',
      openOrderMode: 'Regular',
      oneClickAccepted: false,
      historyRange: 'Last 6 months',
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
      setChartSymbol: (symbol) => set({ chartSymbol: symbol }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
      setChartVisualType: (chartType) => set({ chartVisualType: chartType }),
      addChartDrawing: (drawing) => {
        const list = get().chartDrawings;
        set({ chartDrawings: [...list, drawing] });
      },
      removeChartDrawing: (drawing) => {
        set({ chartDrawings: get().chartDrawings.filter((item) => item !== drawing) });
      },
      setChartDrawings: (drawings) => set({ chartDrawings: drawings }),
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
    }),
    {
      name: 'rtx5-user-preferences-v2',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<UserPreferencesState> & {
          chartColors?: Partial<ChartColorsConfig>;
          chartDisplay?: Partial<ChartDisplaySettings>;
        };
        const shouldResetLegacyShowOnChartFlags = (version ?? 0) < 4 && hasLegacyShowOnChartDefaults(state);

        return {
          ...state,
          showOpenPositions: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showOpenPositions
            : (state.showOpenPositions ?? DEFAULT_SHOW_ON_CHART_FLAGS.showOpenPositions),
          showTpSlStopLimit: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showTpSlStopLimit
            : (state.showTpSlStopLimit ?? DEFAULT_SHOW_ON_CHART_FLAGS.showTpSlStopLimit),
          showClosedPositions: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showClosedPositions
            : (state.showClosedPositions ?? DEFAULT_SHOW_ON_CHART_FLAGS.showClosedPositions),
          showHmrPeriods: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showHmrPeriods
            : (state.showHmrPeriods ?? DEFAULT_SHOW_ON_CHART_FLAGS.showHmrPeriods),
          showPriceAlerts: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showPriceAlerts
            : (state.showPriceAlerts ?? DEFAULT_SHOW_ON_CHART_FLAGS.showPriceAlerts),
          showPotentialStopOut: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showPotentialStopOut
            : (state.showPotentialStopOut ?? DEFAULT_SHOW_ON_CHART_FLAGS.showPotentialStopOut),
          showTradingSignals: shouldResetLegacyShowOnChartFlags
            ? DEFAULT_SHOW_ON_CHART_FLAGS.showTradingSignals
            : (state.showTradingSignals ?? DEFAULT_SHOW_ON_CHART_FLAGS.showTradingSignals),
          chartVisualType: state.chartVisualType ?? 'candles',
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
    }
  )
);
