"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUserPreferences = exports.DEFAULT_CHART_DISPLAY_SETTINGS = exports.DEFAULT_CHART_COLORS = exports.CHART_COLOR_SCHEME_PRESETS = void 0;
exports.resolveChartColorsForTheme = resolveChartColorsForTheme;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const zustand_1 = require("zustand");
const middleware_1 = require("zustand/middleware");
const chartShowOnChart_1 = require("../features/chart/chartShowOnChart");
const drawingPersistence_1 = require("../features/chart/drawingPersistence");
const tradeVolume_1 = require("../utils/tradeVolume");
exports.CHART_COLOR_SCHEME_PRESETS = {
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
exports.DEFAULT_CHART_COLORS = {
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
const LIGHT_THEME_CHART_FALLBACKS = {
    background: exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
    foreground: exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
    grid: exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    hollowBody: exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
};
const DARK_THEME_CHART_FALLBACKS = {
    background: '#080B11',
    foreground: exports.DEFAULT_CHART_COLORS.foreground,
    grid: exports.DEFAULT_CHART_COLORS.grid,
    hollowBody: '#080B11',
};
const BUILTIN_STRUCTURAL_VALUES = {
    background: new Set([
        '#000000', // legacy default — ensures persisted values get migrated
        '#0E141F', // previous card default
        exports.DEFAULT_CHART_COLORS.background,
        exports.CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
        exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
        exports.CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.background,
    ]),
    foreground: new Set([
        exports.DEFAULT_CHART_COLORS.foreground,
        exports.CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground,
        exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
        exports.CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.foreground,
    ]),
    grid: new Set([
        exports.DEFAULT_CHART_COLORS.grid,
        exports.CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid,
        exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
        exports.CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.grid,
    ]),
    hollowBody: new Set([
        exports.DEFAULT_CHART_COLORS.hollowBody,
        exports.CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
        exports.CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
        exports.CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.hollowBody,
    ]),
};
function resolveChartColorsForTheme(chartColors, chartColorScheme, isDark) {
    const mergedColors = {
        ...exports.DEFAULT_CHART_COLORS,
        ...(chartColors ?? {}),
    };
    const resolvedColors = { ...mergedColors };
    const themeStructuralColors = isDark ? DARK_THEME_CHART_FALLBACKS : LIGHT_THEME_CHART_FALLBACKS;
    const forceThemeStructure = Boolean(chartColorScheme && chartColorScheme !== 'custom');
    Object.keys(themeStructuralColors).forEach((key) => {
        if (forceThemeStructure || BUILTIN_STRUCTURAL_VALUES[key].has(mergedColors[key])) {
            resolvedColors[key] = themeStructuralColors[key];
        }
    });
    return resolvedColors;
}
exports.DEFAULT_CHART_DISPLAY_SETTINGS = {
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
const defaultSymbols = [];
exports.useUserPreferences = (0, zustand_1.create)()((0, middleware_1.persist)((set, get) => ({
    hasHydrated: false,
    themeMode: 'dark',
    quoteSymbols: defaultSymbols,
    quoteViewMode: 'list',
    chartSymbol: 'GBPUSD',
    chartTimeframe: 'H1',
    tradeVolume: tradeVolume_1.DEFAULT_TRADE_VOLUME,
    chartVisualType: 'candles',
    chartViewportShowVolumePane: false,
    chartDrawings: [],
    chartDrawingRecordsBySymbol: {},
    chartLockAll: false,
    chartHideAll: false,
    chartShowOnChart: { ...chartShowOnChart_1.DEFAULT_CHART_SHOW_ON_CHART },
    historySummaryDetailsVisible: true,
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
    chartColors: exports.DEFAULT_CHART_COLORS,
    chartDisplay: exports.DEFAULT_CHART_DISPLAY_SETTINGS,
    language: 'en',
    setLanguage: (lang) => set({ language: lang }),
    login: (id, name, server, tokens, brokerId) => set((state) => ({
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
    updateTokens: (accessToken, refreshToken, expiresAt) => set((state) => {
        if (!state.accountDetails)
            return state;
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
    setChartSymbol: (symbol) => set((state) => {
        const nextKey = (0, drawingPersistence_1.getChartDrawingBucketKey)(symbol);
        const nextDrawings = state.chartDrawingRecordsBySymbol[nextKey] ?? [];
        return {
            chartSymbol: symbol,
            chartDrawings: (0, drawingPersistence_1.getChartDrawingLabels)(nextDrawings),
        };
    }),
    setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
    setTradeVolume: (volume) => set({ tradeVolume: (0, tradeVolume_1.normalizeTradeVolume)(volume) }),
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
    setChartDrawingRecordsForSymbol: (symbol, drawings) => set((state) => {
        const bucketKey = (0, drawingPersistence_1.getChartDrawingBucketKey)(symbol);
        const nextDrawings = (0, drawingPersistence_1.sanitizePersistedChartDrawings)(drawings);
        const nextRecordsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
        };
        return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: (0, drawingPersistence_1.getChartDrawingBucketKey)(state.chartSymbol) === bucketKey
                ? (0, drawingPersistence_1.getChartDrawingLabels)(nextDrawings)
                : state.chartDrawings,
        };
    }),
    removeChartDrawingRecordForSymbol: (symbol, drawingId) => set((state) => {
        const bucketKey = (0, drawingPersistence_1.getChartDrawingBucketKey)(symbol);
        const currentDrawings = state.chartDrawingRecordsBySymbol[bucketKey] ?? [];
        const nextDrawings = currentDrawings.filter((drawing) => drawing.id !== drawingId);
        const nextRecordsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
        };
        return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: (0, drawingPersistence_1.getChartDrawingBucketKey)(state.chartSymbol) === bucketKey
                ? (0, drawingPersistence_1.getChartDrawingLabels)(nextDrawings)
                : state.chartDrawings,
        };
    }),
    setChartLockAll: (lock) => set({ chartLockAll: lock }),
    setChartHideAll: (hide) => set({ chartHideAll: hide }),
    setChartShowOnChartItem: (key, value) => set((state) => ({
        chartShowOnChart: {
            ...state.chartShowOnChart,
            [key]: value,
        },
    })),
    setHistorySummaryDetailsVisible: (visible) => set({ historySummaryDetailsVisible: visible }),
    setPriceSource: (source) => set({ priceSource: source }),
    setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
    setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
    setHistoryRange: (range) => set({ historyRange: range }),
    setHistoryDateRange: (fromMs, toMs) => set({ historyFromMs: fromMs, historyToMs: toMs }),
    setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
    setBrokerId: (id) => set({ brokerId: id }),
    setHasSetInitialSymbols: (hasSet) => set({ hasSetInitialSymbols: hasSet }),
    setChartColorScheme: (scheme) => set((state) => {
        if (scheme === 'custom') {
            return { chartColorScheme: scheme };
        }
        return {
            chartColorScheme: scheme,
            chartColors: { ...exports.CHART_COLOR_SCHEME_PRESETS[scheme].colors },
        };
    }),
    setChartColor: (key, color) => set((state) => ({
        chartColorScheme: 'custom',
        chartColors: { ...state.chartColors, [key]: color },
    })),
    setChartDisplaySetting: (key, value) => set((state) => ({
        chartDisplay: { ...state.chartDisplay, [key]: value },
    })),
    setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    updateAccountDetails: (updates) => set((state) => {
        if (!state.accountDetails)
            return state;
        return {
            accountDetails: {
                ...state.accountDetails,
                ...updates,
                credentials: updates.credentials ?? state.accountDetails.credentials,
            },
        };
    }),
}), {
    name: 'rtx5-user-preferences-v2',
    version: 11,
    storage: (0, middleware_1.createJSONStorage)(() => async_storage_1.default),
    migrate: (persistedState, version) => {
        const state = (persistedState ?? {});
        const legacyShowOnChartState = {
            showOpenPositions: state.showOpenPositions,
            showTpSlStopLimit: state.showTpSlStopLimit,
            showClosedPositions: state.showClosedPositions,
            showTradingSignals: state.showTradingSignals,
            showHmrPeriods: state.showHmrPeriods,
            showPriceAlerts: state.showPriceAlerts,
            showPotentialStopOut: state.showPotentialStopOut,
        };
        const shouldResetLegacyShowOnChartFlags = (version ?? 0) < 4 && (0, chartShowOnChart_1.hasLegacyChartShowOnChartDefaults)(legacyShowOnChartState);
        const nextChartShowOnChart = shouldResetLegacyShowOnChartFlags
            ? { ...chartShowOnChart_1.DEFAULT_CHART_SHOW_ON_CHART }
            : (0, chartShowOnChart_1.normalizeChartShowOnChartSettings)(state.chartShowOnChart ?? (0, chartShowOnChart_1.buildChartShowOnChartSettingsFromLegacy)(legacyShowOnChartState));
        const nextDrawingRecordsBySymbol = Object.fromEntries(Object.entries(state.chartDrawingRecordsBySymbol ?? {}).map(([symbol, drawings]) => [
            (0, drawingPersistence_1.getChartDrawingBucketKey)(symbol),
            (0, drawingPersistence_1.sanitizePersistedChartDrawings)(drawings),
        ]));
        const activeDrawingLabels = (0, drawingPersistence_1.getChartDrawingLabels)(nextDrawingRecordsBySymbol[(0, drawingPersistence_1.getChartDrawingBucketKey)(state.chartSymbol ?? 'GBPUSD')] ?? []);
        const nextHistoryRange = (version ?? 0) < 11 &&
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
            historySummaryDetailsVisible: state.historySummaryDetailsVisible ??
                state.tradeSummaryDetailsVisible ??
                true,
            chartDrawings: activeDrawingLabels.length > 0
                ? activeDrawingLabels
                : (state.chartDrawings ?? []),
            chartDrawingRecordsBySymbol: nextDrawingRecordsBySymbol,
            chartVisualType: state.chartVisualType ?? 'candles',
            chartViewportShowVolumePane: state.chartViewportShowVolumePane ?? false,
            tradeVolume: (0, tradeVolume_1.normalizeTradeVolume)(state.tradeVolume ?? tradeVolume_1.DEFAULT_TRADE_VOLUME),
            chartColorScheme: state.chartColorScheme ?? 'custom',
            chartColors: {
                ...exports.DEFAULT_CHART_COLORS,
                ...(state.chartColors ?? {}),
            },
            chartDisplay: {
                ...exports.DEFAULT_CHART_DISPLAY_SETTINGS,
                ...(state.chartDisplay ?? {}),
            },
        };
    },
    onRehydrateStorage: () => (state, error) => {
        if (error) {
            console.warn('[UserPreferences] Failed to rehydrate persisted preferences', error);
        }
        state?.setHasHydrated(true);
    },
}));
