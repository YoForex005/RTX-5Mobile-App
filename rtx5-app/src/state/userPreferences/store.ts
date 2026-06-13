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
  ChartTradeVolumeDisplayMode,
  ChartVisualType,
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
let pendingThemeModeCommit: ThemeMode | null = null;
let themeModeCommitScheduled = false;
const PREFERENCES_STORAGE_VERSION = 17;
const CHART_DRAWING_RECORDS_STORAGE_KEY = 'rtx5-chart-drawing-records-v1';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asFiniteNumber = (value: unknown, fallback: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';
const isQuoteViewMode = (value: unknown): value is UserPreferencesState['quoteViewMode'] =>
  value === 'list' || value === 'table' || value === 'edit';
const isChartTradeVolumeDisplayMode = (value: unknown): value is ChartTradeVolumeDisplayMode =>
  value === 'lots' || value === 'margin';
const isChartVisualType = (value: unknown): value is ChartVisualType =>
  value === 'candles' || value === 'bars' || value === 'line' || value === 'hollow';
const isPriceSource = (value: unknown): value is UserPreferencesState['priceSource'] =>
  value === 'bid' || value === 'ask';
const isOpenOrderMode = (value: unknown): value is UserPreferencesState['openOrderMode'] =>
  value === 'Regular' || value === 'Risk calculator' || value === 'One-click';
const isChartColorScheme = (value: unknown): value is UserPreferencesState['chartColorScheme'] =>
  value === 'green_on_black' || value === 'black_on_white' || value === 'yellow_on_black' || value === 'custom';

const normalizeChartColors = (value: unknown): ChartColorsConfig => {
  const record = asRecord(value);
  const next: ChartColorsConfig = { ...DEFAULT_CHART_COLORS };
  (Object.keys(next) as Array<keyof ChartColorsConfig>).forEach((key) => {
    const color = asString(record[key]);
    if (color) {
      next[key] = color;
    }
  });
  return next;
};

const normalizeChartDisplay = (value: unknown): ChartDisplaySettings => {
  const record = asRecord(value);
  const next: ChartDisplaySettings = { ...DEFAULT_CHART_DISPLAY_SETTINGS };
  (Object.keys(next) as Array<keyof ChartDisplaySettings>).forEach((key) => {
    next[key] = asBoolean(record[key], next[key]);
  });
  return next;
};

const normalizeAccountDetails = (value: unknown): UserPreferencesState['accountDetails'] => {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  const credentials = asRecord(record.credentials);
  const accessToken = asString(credentials.accessToken);
  const refreshToken = asString(credentials.refreshToken);
  const expiresAt = asString(credentials.expiresAt);
  if (!accessToken) {
    return null;
  }

  return {
    id,
    name: asString(record.name, `Account ${id}`),
    server: asString(record.server),
    credentials: {
      accessToken,
      refreshToken,
      expiresAt,
    },
  };
};

const normalizeDrawingRecordsBySymbol = (value: unknown): PersistedChartDrawingsBySymbol => {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([symbol, drawings]) => [
      getChartDrawingBucketKey(symbol),
      sanitizePersistedChartDrawings(drawings),
    ]),
  );
};

const hasDrawingRecordBuckets = (value: PersistedChartDrawingsBySymbol): boolean =>
  Object.values(value).some((drawings) => drawings.length > 0);

function persistChartDrawingRecordsBySymbol(recordsBySymbol: PersistedChartDrawingsBySymbol): void {
  void AsyncStorage.setItem(CHART_DRAWING_RECORDS_STORAGE_KEY, JSON.stringify(recordsBySymbol)).catch((error) => {
    console.warn('[UserPreferences] Failed to persist chart drawings', error);
  });
}

async function readChartDrawingRecordsBySymbol(): Promise<PersistedChartDrawingsBySymbol> {
  try {
    const value = await AsyncStorage.getItem(CHART_DRAWING_RECORDS_STORAGE_KEY);
    const normalized = value ? normalizeDrawingRecordsBySymbol(JSON.parse(value)) : {};
    return normalized;
  } catch (error) {
    console.warn('[UserPreferences] Ignoring invalid persisted chart drawings', error);
    void AsyncStorage.removeItem(CHART_DRAWING_RECORDS_STORAGE_KEY).catch((removeError) => {
      console.warn('[UserPreferences] Failed to clear invalid persisted chart drawings', removeError);
    });
    return {};
  }
}

export function normalizePersistedUserPreferencesState(
  persistedState: unknown,
  version = PREFERENCES_STORAGE_VERSION,
): PersistedUserPreferencesState {
  const state = asRecord(persistedState);
  const legacyShowOnChartState = {
    showOpenPositions: typeof state.showOpenPositions === 'boolean' ? state.showOpenPositions : undefined,
    showTpSlStopLimit: typeof state.showTpSlStopLimit === 'boolean' ? state.showTpSlStopLimit : undefined,
    showClosedPositions: typeof state.showClosedPositions === 'boolean' ? state.showClosedPositions : undefined,
    showTradingSignals: typeof state.showTradingSignals === 'boolean' ? state.showTradingSignals : undefined,
    showHmrPeriods: typeof state.showHmrPeriods === 'boolean' ? state.showHmrPeriods : undefined,
    showPriceAlerts: typeof state.showPriceAlerts === 'boolean' ? state.showPriceAlerts : undefined,
    showPotentialStopOut: typeof state.showPotentialStopOut === 'boolean' ? state.showPotentialStopOut : undefined,
  };
  const shouldResetLegacyShowOnChartFlags =
    (version ?? 0) < 4 && hasLegacyChartShowOnChartDefaults(legacyShowOnChartState);
  const nextChartShowOnChart = shouldResetLegacyShowOnChartFlags
    ? { ...DEFAULT_CHART_SHOW_ON_CHART }
    : normalizeChartShowOnChartSettings(
        state.chartShowOnChart ?? buildChartShowOnChartSettingsFromLegacy(legacyShowOnChartState),
      );
  const nextDrawingRecordsBySymbol = normalizeDrawingRecordsBySymbol(state.chartDrawingRecordsBySymbol);
  const chartSymbol = asString(state.chartSymbol, 'GBPUSD');
  const activeDrawingLabels = getChartDrawingLabels(
    nextDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [],
  );
  const accountDetails = normalizeAccountDetails(state.accountDetails);
  const isLoggedIn = asBoolean(state.isLoggedIn, false) && accountDetails !== null;
  const nextHistoryRange =
    (version ?? 0) < 11 &&
    state.historyRange === 'Last 6 months' &&
    state.historyFromMs == null &&
    state.historyToMs == null
      ? 'All time'
      : asString(state.historyRange, 'All time');

  return {
    themeMode: isThemeMode(state.themeMode) ? state.themeMode : 'dark',
    quoteSymbols: asStringArray(state.quoteSymbols),
    quoteViewMode: isQuoteViewMode(state.quoteViewMode) ? state.quoteViewMode : 'list',
    chartSymbol,
    chartTimeframe: normalizeCandleHistoryTimeframe(state.chartTimeframe),
    tradeVolume: normalizeTradeVolume(state.tradeVolume ?? DEFAULT_TRADE_VOLUME),
    chartTradeVolumeDisplayMode: isChartTradeVolumeDisplayMode(state.chartTradeVolumeDisplayMode)
      ? state.chartTradeVolumeDisplayMode
      : 'lots',
    chartVisualType: isChartVisualType(state.chartVisualType) ? state.chartVisualType : 'candles',
    chartViewportShowVolumePane: asBoolean(state.chartViewportShowVolumePane, false),
    chartViewportShowDrawingToolbar: asBoolean(state.chartViewportShowDrawingToolbar, false),
    chartDrawings: activeDrawingLabels.length > 0 ? activeDrawingLabels : asStringArray(state.chartDrawings),
    chartDrawingRecordsBySymbol: nextDrawingRecordsBySymbol,
    chartLockAll: asBoolean(state.chartLockAll, false),
    chartHideAll: asBoolean(state.chartHideAll, false),
    chartShowOnChart: nextChartShowOnChart,
    historySummaryDetailsVisible:
      typeof state.historySummaryDetailsVisible === 'boolean'
        ? state.historySummaryDetailsVisible
        : typeof state.tradeSummaryDetailsVisible === 'boolean'
          ? state.tradeSummaryDetailsVisible
          : true,
    tradeSummaryDetailsVisible: asBoolean(state.tradeSummaryDetailsVisible, true),
    priceSource: isPriceSource(state.priceSource) ? state.priceSource : 'bid',
    openOrderMode: isOpenOrderMode(state.openOrderMode) ? state.openOrderMode : 'Regular',
    oneClickAccepted: asBoolean(state.oneClickAccepted, false),
    historyRange: nextHistoryRange,
    marketNewsSavedIds: Array.from(new Set(asStringArray(state.marketNewsSavedIds))),
    historyFromMs: asFiniteNumber(state.historyFromMs, null),
    historyToMs: asFiniteNumber(state.historyToMs, null),
    isDemoAccount: asBoolean(state.isDemoAccount, true),
    isLoggedIn,
    hasSetInitialSymbols: asBoolean(state.hasSetInitialSymbols, false),
    brokerId: asString(state.brokerId),
    brokerServerUrl: asString(state.brokerServerUrl),
    brokerLogoUrl: asString(state.brokerLogoUrl),
    accountDetails,
    chartColorScheme: isChartColorScheme(state.chartColorScheme) ? state.chartColorScheme : 'custom',
    chartColors: normalizeChartColors(state.chartColors),
    chartDisplay: normalizeChartDisplay(state.chartDisplay),
    language: normalizeLanguageCode(state.language),
  };
}

function flushPendingPreferenceWrites() {
  const writes = Array.from(pendingPreferenceWrites.entries());
  pendingPreferenceWrites.clear();

  writes.forEach(([name, value]) => {
    void AsyncStorage.setItem(name, JSON.stringify(value)).catch((error) => {
      console.warn('[UserPreferences] Failed to persist preferences', error);
    });
  });
}

function scheduleThemeModePreferenceCommit(commit: () => void) {
  if (themeModeCommitScheduled) return;
  themeModeCommitScheduled = true;

  const scheduleAfterFrame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

  scheduleAfterFrame(() => {
    setTimeout(() => {
      themeModeCommitScheduled = false;
      commit();
    }, 0);
  });
}

const userPreferencesStorage: PersistStorage<PersistedUserPreferencesState, void> = {
  getItem: async (name) => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value ? (JSON.parse(value) as StorageValue<PersistedUserPreferencesState>) : null;
    } catch (error) {
      console.warn('[UserPreferences] Ignoring invalid persisted preferences', error);
      void AsyncStorage.removeItem(name).catch((removeError) => {
        console.warn('[UserPreferences] Failed to clear invalid persisted preferences', removeError);
      });
      return null;
    }
  },
  setItem: (name, value) => {
    pendingPreferenceWrites.set(name, value);
    flushPendingPreferenceWrites();
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
        if (get().themeMode === mode) {
          pendingThemeModeCommit = null;
          return;
        }

        pendingThemeModeCommit = mode;
        scheduleThemeModePreferenceCommit(() => {
          const nextMode = pendingThemeModeCommit;
          pendingThemeModeCommit = null;
          if (!nextMode || get().themeMode === nextMode) return;
          set({ themeMode: nextMode });
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
          persistChartDrawingRecordsBySymbol(nextRecordsBySymbol);

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
          persistChartDrawingRecordsBySymbol(nextRecordsBySymbol);

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
      version: PREFERENCES_STORAGE_VERSION,
      storage: userPreferencesStorage,
      partialize: partializeUserPreferences,
      migrate: (persistedState, version) => normalizePersistedUserPreferencesState(persistedState, version),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedUserPreferencesState(persistedState),
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[UserPreferences] Failed to rehydrate persisted preferences', error);
        }
        if (state?.themeMode) {
          setImmediateThemeMode(state.themeMode);
        }
        void readChartDrawingRecordsBySymbol()
          .then((storedRecordsBySymbol) => {
            if (!state || !hasDrawingRecordBuckets(storedRecordsBySymbol)) {
              return;
            }

            Object.entries(storedRecordsBySymbol).forEach(([symbol, drawings]) => {
              state.setChartDrawingRecordsForSymbol(symbol, drawings);
            });
          })
          .finally(() => {
            state?.setHasHydrated(true);
          });
      },
    }
  )
);
