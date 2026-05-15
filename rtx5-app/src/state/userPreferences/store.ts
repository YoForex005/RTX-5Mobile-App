/**
 * Zustand store for user preferences. Backed by AsyncStorage with a versioned
 * `migrate` so old persisted shapes upgrade safely on app launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_CHART_SHOW_ON_CHART,
  buildChartShowOnChartSettingsFromLegacy,
  hasLegacyChartShowOnChartDefaults,
  normalizeChartShowOnChartSettings,
  type ChartShowOnChartSettings,
} from '../../features/chart/chartShowOnChart';
import {
  type PersistedChartDrawingsBySymbol,
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  sanitizePersistedChartDrawings,
} from '../../features/chart/drawingPersistence';
import { DEFAULT_TRADE_VOLUME, normalizeTradeVolume } from '../../utils/tradeVolume';
import { normalizeLanguageCode } from '../../i18n/translations';
import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLORS,
  DEFAULT_CHART_DISPLAY_SETTINGS,
} from './chartColors';
import type {
  ChartColorsConfig,
  ChartDisplaySettings,
  LanguageCode,
  ThemeMode,
  UserPreferencesState,
} from './types';

const defaultSymbols: string[] = [];

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'GBPUSD',
      chartTimeframe: 'M1',
      tradeVolume: DEFAULT_TRADE_VOLUME,
      chartTradeVolumeDisplayMode: 'lots',
      chartVisualType: 'candles',
      chartViewportShowVolumePane: false,
      chartViewportShowDrawingToolbar: false,
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
      marketNewsSavedIds: [],
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
      setLanguage: (lang) => set({ language: normalizeLanguageCode(lang) }),
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
      setTradeVolume: (volume) => {
        // The caller (ChartScreen) already normalizes against the active
        // instrument's bounds (min/max/stepVolume). Re-normalizing here
        // with default bounds (step = 0.01) would silently override
        // instrument-specific step rounding for symbols whose step isn't
        // 0.01 — e.g., a value the caller intended as "1.5 lots on a
        // step=0.5 instrument" stays 1.5, but if the caller passed a
        // raw user input like "0.001" we still need a finite-number
        // safety net. Just clamp to a positive finite number.
        const next = typeof volume === 'number' && Number.isFinite(volume) && volume > 0
          ? volume
          : normalizeTradeVolume(volume);
        set({ tradeVolume: next });
      },
      setChartTradeVolumeDisplayMode: (mode) => set({ chartTradeVolumeDisplayMode: mode }),
      setChartVisualType: (chartType) => set({ chartVisualType: chartType }),
      setChartViewportShowVolumePane: (visible) => set({ chartViewportShowVolumePane: visible }),
      setChartViewportShowDrawingToolbar: (visible) => set({ chartViewportShowDrawingToolbar: visible }),
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
        set((state) => {
          const nextChartShowOnChart = {
            ...state.chartShowOnChart,
            [key]: value,
          };
          console.log('[SHOW-ON-CHART]', {
            changedOption: key,
            enabled: value,
            chartShowOnChart: nextChartShowOnChart,
          });
          return {
            chartShowOnChart: nextChartShowOnChart,
          };
        }),
      setHistorySummaryDetailsVisible: (visible) => set({ historySummaryDetailsVisible: visible }),
      setTradeSummaryDetailsVisible: (visible) => set({ tradeSummaryDetailsVisible: visible }),
      setPriceSource: (source) => set({ priceSource: source }),
      setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setMarketNewsSavedIds: (newsIds) =>
        set({
          marketNewsSavedIds: Array.from(new Set(newsIds.map((id) => id.trim()).filter(Boolean))),
        }),
      toggleMarketNewsSavedId: (newsId) => {
        const normalizedId = newsId.trim();
        if (!normalizedId) return;

        set((state) => ({
          marketNewsSavedIds: state.marketNewsSavedIds.includes(normalizedId)
            ? state.marketNewsSavedIds.filter((id) => id !== normalizedId)
            : [...state.marketNewsSavedIds, normalizedId],
        }));
      },
      setHistoryDateRange: (fromMs, toMs) => set({ historyFromMs: fromMs, historyToMs: toMs }),
      setIsDemoAccount: (isDemo) => set({ isDemoAccount: isDemo }),
      setBrokerId: (id) => set({ brokerId: id }),
      setHasSetInitialSymbols: (hasSet) => set({ hasSetInitialSymbols: hasSet }),
      setChartColorScheme: (scheme) =>
        set(() => {
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
      version: 15,
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
          marketNewsSavedIds: Array.isArray(state.marketNewsSavedIds)
            ? Array.from(new Set(state.marketNewsSavedIds.map((id) => id.trim()).filter(Boolean)))
            : [],
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
          chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar ?? false,
          chartTimeframe:
            typeof state.chartTimeframe === 'string' && state.chartTimeframe.trim().length > 0
              ? state.chartTimeframe
              : 'M1',
          tradeVolume: normalizeTradeVolume((state as Partial<UserPreferencesState>).tradeVolume ?? DEFAULT_TRADE_VOLUME),
          chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode === 'margin' ? 'margin' : 'lots',
          chartColorScheme: state.chartColorScheme ?? 'custom',
          chartColors: {
            ...DEFAULT_CHART_COLORS,
            ...(state.chartColors ?? {}),
          },
          chartDisplay: {
            ...DEFAULT_CHART_DISPLAY_SETTINGS,
            ...(state.chartDisplay ?? {}),
          },
          language: normalizeLanguageCode(state.language),
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
