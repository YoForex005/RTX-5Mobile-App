/**
 * Zustand store for user preferences. Backed by AsyncStorage with a versioned
 * `migrate` so old persisted shapes upgrade safely on app launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
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
import { normalizeCandleHistoryTimeframe } from '../../domain/candles/core/candles';
import { DEFAULT_TRADE_VOLUME, normalizeTradeVolume } from '../../utils/tradeVolume';
import { normalizeLanguageCode } from '../../i18n/translations';
import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLORS,
  DEFAULT_CHART_DISPLAY_SETTINGS,
} from './chartColors';
import { setImmediateThemeMode } from '../themeMode';
import type {
  ChartColorsConfig,
  ChartDisplaySettings,
  LanguageCode,
  ThemeMode,
  UserPreferencesState,
} from './types';

const defaultSymbols: string[] = [];
type PersistedUserPreferencesState = Omit<
  UserPreferencesState,
  | 'hasHydrated'
  | 'setLanguage'
  | 'login'
  | 'logout'
  | 'updateTokens'
  | 'setQuoteViewMode'
  | 'setThemeMode'
  | 'addQuoteSymbol'
  | 'removeQuoteSymbol'
  | 'setQuoteSymbols'
  | 'setChartSymbol'
  | 'setChartTimeframe'
  | 'setTradeVolume'
  | 'setChartTradeVolumeDisplayMode'
  | 'setChartVisualType'
  | 'setChartViewportShowVolumePane'
  | 'setChartViewportShowDrawingToolbar'
  | 'addChartDrawing'
  | 'removeChartDrawing'
  | 'setChartDrawings'
  | 'setChartDrawingRecordsForSymbol'
  | 'removeChartDrawingRecordForSymbol'
  | 'setChartLockAll'
  | 'setChartHideAll'
  | 'setChartShowOnChartItem'
  | 'setHistorySummaryDetailsVisible'
  | 'setTradeSummaryDetailsVisible'
  | 'setPriceSource'
  | 'setOpenOrderMode'
  | 'setOneClickAccepted'
  | 'setHistoryRange'
  | 'setMarketNewsSavedIds'
  | 'toggleMarketNewsSavedId'
  | 'setHistoryDateRange'
  | 'setIsDemoAccount'
  | 'setBrokerId'
  | 'setBrokerConnection'
  | 'setHasSetInitialSymbols'
  | 'setChartColorScheme'
  | 'setChartColor'
  | 'setChartDisplaySetting'
  | 'setHasHydrated'
  | 'updateAccountDetails'
>;

const pendingPreferenceWrites = new Map<string, StorageValue<PersistedUserPreferencesState>>();
let preferenceWriteScheduled = false;
let pendingThemeModeCommit: ThemeMode | null = null;
let themeModeCommitScheduled = false;

function flushPendingPreferenceWrites() {
  preferenceWriteScheduled = false;
  const writes = Array.from(pendingPreferenceWrites.entries());
  pendingPreferenceWrites.clear();

  writes.forEach(([name, value]) => {
    void AsyncStorage.setItem(name, JSON.stringify(value)).catch((error) => {
      console.warn('[UserPreferences] Failed to persist preferences', error);
    });
  });
}

function schedulePreferenceWriteFlush() {
  if (preferenceWriteScheduled) return;
  preferenceWriteScheduled = true;

  const scheduleAfterFrame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

  scheduleAfterFrame(() => {
    setTimeout(flushPendingPreferenceWrites, 0);
  });
}

function scheduleAfterAcknowledgementFrame(action: () => void) {
  const scheduleAfterFrame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

  scheduleAfterFrame(() => {
    setTimeout(action, 0);
  });
}

function schedulePersistedThemeModeCommit(
  mode: ThemeMode,
  commit: (mode: ThemeMode) => void,
) {
  pendingThemeModeCommit = mode;
  if (themeModeCommitScheduled) return;
  themeModeCommitScheduled = true;

  scheduleAfterAcknowledgementFrame(() => {
    themeModeCommitScheduled = false;
    const nextMode = pendingThemeModeCommit;
    pendingThemeModeCommit = null;
    if (nextMode) {
      commit(nextMode);
    }
  });
}

const userPreferencesStorage: PersistStorage<PersistedUserPreferencesState, void> = {
  getItem: async (name) => {
    const value = await AsyncStorage.getItem(name);
    return value ? (JSON.parse(value) as StorageValue<PersistedUserPreferencesState>) : null;
  },
  setItem: (name, value) => {
    pendingPreferenceWrites.set(name, value);
    schedulePreferenceWriteFlush();
  },
  removeItem: (name) => {
    pendingPreferenceWrites.delete(name);
    void AsyncStorage.removeItem(name);
  },
};

function partializeUserPreferences(state: UserPreferencesState): PersistedUserPreferencesState {
  return {
    themeMode: state.themeMode,
    quoteSymbols: state.quoteSymbols,
    quoteViewMode: state.quoteViewMode,
    chartSymbol: state.chartSymbol,
    chartTimeframe: state.chartTimeframe,
    tradeVolume: state.tradeVolume,
    chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
    chartVisualType: state.chartVisualType,
    chartViewportShowVolumePane: state.chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
    chartDrawings: state.chartDrawings,
    chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
    chartLockAll: state.chartLockAll,
    chartHideAll: state.chartHideAll,
    chartShowOnChart: state.chartShowOnChart,
    historySummaryDetailsVisible: state.historySummaryDetailsVisible,
    tradeSummaryDetailsVisible: state.tradeSummaryDetailsVisible,
    priceSource: state.priceSource,
    openOrderMode: state.openOrderMode,
    oneClickAccepted: state.oneClickAccepted,
    historyRange: state.historyRange,
    marketNewsSavedIds: state.marketNewsSavedIds,
    historyFromMs: state.historyFromMs,
    historyToMs: state.historyToMs,
    isDemoAccount: state.isDemoAccount,
    isLoggedIn: state.isLoggedIn,
    hasSetInitialSymbols: state.hasSetInitialSymbols,
    brokerId: state.brokerId,
    brokerServerUrl: state.brokerServerUrl,
    brokerLogoUrl: state.brokerLogoUrl,
    accountDetails: state.accountDetails,
    chartColorScheme: state.chartColorScheme,
    chartColors: state.chartColors,
    chartDisplay: state.chartDisplay,
    language: state.language,
  };
}

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
      brokerServerUrl: '',
      brokerLogoUrl: '',
      accountDetails: null,
      chartColorScheme: 'custom',
      chartColors: DEFAULT_CHART_COLORS,
      chartDisplay: DEFAULT_CHART_DISPLAY_SETTINGS,
      language: 'en' as LanguageCode,
      setLanguage: (lang) => set({ language: normalizeLanguageCode(lang) }),
      login: (id, name, server, tokens, brokerId, brokerConnection) =>
        set((state) => ({
          isLoggedIn: true,
          ...(typeof brokerConnection?.isDemoAccount === 'boolean'
            ? { isDemoAccount: brokerConnection.isDemoAccount }
            : {}),
          // Persist brokerId atomically with login to prevent race conditions.
          // Falls back to existing brokerId if not provided (e.g., for register flow).
          brokerId: brokerId || state.brokerId || '',
          brokerServerUrl: brokerConnection?.serverUrl ?? state.brokerServerUrl ?? '',
          brokerLogoUrl: brokerConnection?.logoUrl ?? state.brokerLogoUrl ?? '',
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
      setThemeMode: (mode) => {
        setImmediateThemeMode(mode);
        if (get().themeMode === mode) return;
        schedulePersistedThemeModeCommit(mode, (nextMode) => {
          if (get().themeMode !== nextMode) {
            set({ themeMode: nextMode });
          }
        });
      },
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
      setChartTimeframe: (timeframe) => set({ chartTimeframe: normalizeCandleHistoryTimeframe(timeframe) }),
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
      setBrokerConnection: (brokerId, serverUrl = '', logoUrl = '') =>
        set({ brokerId, brokerServerUrl: serverUrl, brokerLogoUrl: logoUrl }),
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
      version: 16,
      storage: userPreferencesStorage,
      partialize: partializeUserPreferences,
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
          brokerServerUrl: state.brokerServerUrl ?? '',
          brokerLogoUrl: state.brokerLogoUrl ?? '',
          chartDrawings: activeDrawingLabels.length > 0
            ? activeDrawingLabels
            : (state.chartDrawings ?? []),
          chartDrawingRecordsBySymbol: nextDrawingRecordsBySymbol,
          chartVisualType: state.chartVisualType ?? 'candles',
          chartViewportShowVolumePane: state.chartViewportShowVolumePane ?? false,
          chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar ?? false,
          chartTimeframe: normalizeCandleHistoryTimeframe(state.chartTimeframe),
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
        if (state?.themeMode) {
          setImmediateThemeMode(state.themeMode);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
