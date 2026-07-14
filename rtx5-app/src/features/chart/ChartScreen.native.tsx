import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Core Charting Interface for iOS/Android
 * 
 * This component provides high-performance charting for mobile devices using a WebView bridge.
 * It strictly decouples heavy data crunching from the React Native JS thread.
 * 
 * Key Architecture:
 * - WebView Bridge: Injects tradingview lightweight-charts HTML/JS into an isolated web view context.
 * - Zero-Latency Streams: Pipes WebSocket ticks directly into the WebView using injectJavaScript() and requestAnimationFrame, 
 *   bypassing the React Native bridge's slow JSON serialization.
 * - Micro-Components: Extracts fast-updating UI (like the live price pill) into memoized blocks isolated from the main layout.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Dimensions, Keyboard, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import { useLatchedFlag } from '../../hooks/useLatchedFlag';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import {
  ChartTapRadialMenu,
  type ChartTapMenuAnchor,
  type ChartTapMenuBounds,
} from './components/ChartTapRadialMenu';
import { ChartTimeframePickerOverlay } from './components/ChartTimeframePickerSheet';
import {
  ChartDrawingToolsSidebar,
} from './components/ChartDrawingToolsFeature';
import { createDrawingToolsActionSheetActions } from './drawingTools';
import {
  TextLevelEditOverlay,
  type TextLevelEditRequest,
} from './drawingTools/TextLevelEditOverlay';
import type { FixedHorizontalGridPlotArea } from './components/ChartFixedHorizontalGridOverlay';
import {
  ChartTradeInlineFooter,
  ChartTradeOverlayLayer,
} from './components/ChartTradeFeature';
import { ChartTradeButtons } from './components/ChartTradeButtonsFeature';
import { LiveOrderTickExecutionGraph } from '../trade/OrderTickExecutionGraph';
import { Screen } from '../../ui/components/Screen';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../ui/components/sidebarDrawerController';
import { useTranslation } from '../../i18n/useTranslation';
import {
  type ChartDisplaySettings,
  type ChartTradeVolumeDisplayMode,
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { useTheme } from '../../ui/theme/useTheme';
import { resolveBottomTabBarHeight } from '../../ui/layout/bottomTabBar';
import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { liveCandlesEngine } from '../../api/ws/liveCandlesEngine';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useOrdersByLoginQuery } from '../../query/orders';
import { TradeFeedbackModal, TradeFeedbackState, TRADE_MODAL_INITIAL } from '../../ui/components/TradeFeedbackModal';
import { ordersApi } from '../../api/orders';
import { positionsApi } from '../../api/positions';
import { classifyTradingError, createFrontendTradingError } from '../../api/tradingErrors';


import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAlertsQuery } from '../../query/alerts';
import { useMarketSymbols } from '../../query/market';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketStatus } from '../../query/marketStatus';
import { WebView } from 'react-native-webview';
import { hasLiveQuoteFeedData, useLiveSymbolQuote } from '../../query/websocket';
import { normalizeTimeframe } from '../../domain/candles/core/candles';
import { sanitizeCandlesForChart } from '../../domain/candles/normalization/chartAdapter';
import {
  getBucketGapCount,
  getExpectedNextCandleTime,
} from '../../domain/candles/core/timeframeUtils';
import {
  buildChartPositionStopDragKey,
  buildChartOverlayPayload,
  CHART_LINE_STYLE,
  normalizeChartOverlaySymbol,
  parseChartPositionStopDragKey,
  type ChartOverlayPriceLine,
  type ChartPositionStopDragTarget,
} from './chartOverlays';
import { resolveChartDisplayDecimals } from './chartPricePrecision';
import { isPriceCoherentWithCandle } from '../../domain/candles/series/priceCoherence';
import {
  getChartDrawingBucketKey,
  sanitizePersistedChartDrawings,
  type PersistedChartDrawing,
} from './drawingPersistence';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
  resolveLatestCandleGap,
} from './liveChartSync';
import { getMarketCloseSeparator, getPeriodSeparators } from './periodSeparators';
import { useShallow } from 'zustand/shallow';
import { recordUiFeedGap } from '../../dev/uiInteractionDiagnostics';
import { runImmediateAction } from '../../utils/actionLatency';
import { scheduleAfterFirstFrame, scheduleIdleWork } from '../../utils/startupScheduler';
import { getDevRefreshKey, hashDevRefreshSource } from '../../dev/devRefreshKey';
import {
  formatTradeVolume,
  incrementTradeVolume,
  isValidTradeVolume,
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import {
  filterCandlesForChartTimeRange,
  resolveChartVisibleRange,
  type ChartTimeRange,
} from './timeRangePresets';
import {
  CHART_ORDER_TYPES,
  getChartOrderSide,
  isPendingChartOrderType,
  isPendingChartTradeValid,
  isStopLimitChartOrderType,
  resolveStablePendingChartTradeEnabled,
  resolveDefaultStopLimitPrice,
  validateChartTradeProtectionLevels,
  type ChartOrderType,
} from './chartTradeOrderUtils';
import {
  type FooterLotPickerMode,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetMaxHeight,
  resolveChartTradeSheetTopInset,
  resolveChartTradeSheetHostHeight,
  resolveFooterLotCommitDraft as resolveFooterLotCommitDraftValue,
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
  resolveFooterTradeRowState,
  shouldSuppressChartTapMenu,
  shouldHideChartTabBarForTradeInput,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils';
import { prefetchInstrument } from '../../utils/navigationPrefetch';
import { CH_HTML } from "./rendering/ChartWebViewHtml";
import { makeStyles } from "./ChartScreen.styles";
import { PendingOrderPreviewChart } from "./components/PendingOrderPreviewChart";
import { LiveQuotePairHeader } from "./components/ChartLiveHeaders";
import { ChartStepperModal, ChartFooterLotPicker, ChartTradeVolumeSlider } from "./components/ChartTradeControls";
import { resolveChartTradeButtonQuote } from "./components/ChartTradeButtonsFeature/quoteFallback";
import { TvLayers } from "./components/ChartToolbarIcons";
import { ChartTapMenuViewport, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING, CHART_DRAWING_MAGNET_THRESHOLD_PX, CHART_GRID_LINE_STYLE, CHART_MARKET_PRICE_LINE_SYNC_INTERVAL_MS, CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH, CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS, CHART_SYMBOL_PICKER_PREFETCH_LIMIT, CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS, CHART_TIME_SCALE_FIX_LEFT_EDGE, CHART_TIME_SCALE_FIX_RIGHT_EDGE, CHART_TRADE_COMPACT_SHEET_TOP_GAP, CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT, CHART_TRADE_SHEET_TOP_GAP, CHART_VIEWPORT_TOUCH_FAILSAFE_MS, formatLooseTradeVolumeLabel, resolveMaxTradeVolumeForMargin, getChartTradeContractSize, resolveTradeStopPreviewPrice, timeframes, ChartTradeTypeTabLayout, ChartTradePreviewDragKey, TextInputCommitEvent } from "./ChartScreen.constants";
import {
  DEFAULT_CHART_SYMBOLS,
  SYMBOL_FLAGS,
  SYMBOL_LOGOS,
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
  resolveChartSymbolKey,
} from './chartSymbolMetadata';
import { type ChartShowOnChartKey } from './chartShowOnChart';

// Micro-component: isolated 4fps render cycle, 0 DOM depth
// Uses quotes WS (bid/ask) as primary price source and falls back to candle close.
// Micro-component: isolated 1fps render cycle for the clock
const buildAvailableChartSymbols = (chartSymbol: string, apiSymbols: readonly string[]): string[] => {
  const ordered: string[] = [];
  const indexByKey = new Map<string, number>();
  const push = (symbol: string | null | undefined) => {
    const trimmed = symbol?.trim();
    if (!trimmed) return;
    const key = trimmed.toUpperCase();
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      if (trimmed === key && ordered[existingIndex] !== key) {
        ordered[existingIndex] = trimmed;
      }
      return;
    }
    indexByKey.set(key, ordered.length);
    ordered.push(trimmed);
  };

  push(chartSymbol);
  apiSymbols.forEach(push);
  DEFAULT_CHART_SYMBOLS.forEach(push);
  return ordered;
};

const getSentimentForSymbol = (symbol: string) => {
  const now = new Date();
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Rotate every hour using day + hour so sentiment feels live
  const seed = Math.abs(hash + now.getDate() * 24 + now.getHours());
  // Add minute-based micro-drift (±3%) so it shifts slightly within the hour
  const drift = (now.getMinutes() % 7) - 3;
  const buyPct = Math.max(10, Math.min(90, 15 + (seed % 71) + drift));
  return { buyPct, sellPct: 100 - buyPct };
};

const CHART_SOURCE = { html: CH_HTML };
const CHART_DEV_SOURCE_KEY = getDevRefreshKey(
  'chart-native-webview',
  hashDevRefreshSource(CH_HTML),
);
const CHART_BRIDGE_DEBUG = false;
// Match the Quotes screen: every bid/ask tick should reach the live candle immediately.
const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 0;
const CHART_SYMBOL_HEADER_HIT_SLOP = { top: 10, bottom: 18, left: 16, right: 48 };
const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF';
const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A';
const CHART_OHLC_HIGH_COLOR = '#089981';
const CHART_OHLC_LOW_COLOR = '#F23645';
const CHART_SCALE_DISPLAY_ITEMS: Array<{
  key: keyof ChartDisplaySettings;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'showTicker', label: 'Show ticker', icon: 'pricetag-outline' },
  { key: 'showOHLC', label: 'Show OHLC', icon: 'stats-chart-outline' },
  { key: 'showQuickTradingButtons', label: 'Show quick trading buttons', icon: 'flash-outline' },
  { key: 'showLivePriceLine', label: 'Show live price line', icon: 'pulse-outline' },
  { key: 'showLastPriceLine', label: 'Show last price line', icon: 'ellipse-outline' },
  { key: 'showGrid', label: 'Show grid', icon: 'grid-outline' },
  { key: 'periodSeparators', label: 'Period separators', icon: 'reorder-three-outline' },
  { key: 'showObjectDescriptions', label: 'Show object descriptions', icon: 'text-outline' },
  { key: 'showTradeLevels', label: 'Show trade levels', icon: 'shield-checkmark-outline' },
];

const CHART_DISPLAY_TO_SHOW_ON_CHART_KEY: Partial<Record<keyof ChartDisplaySettings, ChartShowOnChartKey>> = {
  showTradeLevels: 'slTpLevels',
};

type ChartLiveQuoteTickFields = {
  time?: unknown;
  timestamp?: unknown;
  t?: unknown;
};

const buildChartTickPayload = (
  candle: { time: number; open: number; high: number; low: number; close: number; volume?: number },
  chartType: 'candles' | 'bars' | 'line' | 'hollow',
) => {
  if (chartType === 'line') {
    return { time: candle.time, value: candle.close };
  }

  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  };
};

// Stable empty reference for the display series so the "no history yet" branch
// of `sanitizedCandles` doesn't churn referential identity each render.
const EMPTY_DISPLAY_CANDLES = Object.freeze(
  [],
) as unknown as ReturnType<typeof sanitizeCandlesForChart>;

const getChartSnapshotSignature = (snapshot: ReturnType<typeof buildChartSeriesSnapshot>): string =>
  [
    snapshot.length,
    snapshot.firstTime ?? 'null',
    snapshot.lastTime ?? 'null',
    snapshot.lastSignature,
    snapshot.previousLastSignature,
    snapshot.tailWithoutLastSignature,
  ].join('|');

type ChartDrawingPriceCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

const LEGACY_DRAWING_PRICE_RANGE_MULTIPLE = 4;
const LEGACY_DRAWING_RELATIVE_PRICE_TOLERANCE = 0.2;
const LEGACY_UNSCOPED_DRAWING_KINDS = new Set<PersistedChartDrawing['kind']>(['fib', 'measure']);
const CHART_NO_DRAWING_TOOL = 'none';
const CHART_CROSSHAIR_TOOL = 'crosshair';
const isChartDrawingInputTool = (tool: string | null | undefined): tool is string =>
  typeof tool === 'string' && tool !== CHART_NO_DRAWING_TOOL && tool !== CHART_CROSSHAIR_TOOL;

const isChartDrawingRecordForCurrentChart = (
  drawing: PersistedChartDrawing,
  chartSymbol: string,
  chartTimeframe: string,
): boolean => {
  if (LEGACY_UNSCOPED_DRAWING_KINDS.has(drawing.kind) && (!drawing.symbol || !drawing.timeframe)) {
    return false;
  }

  if (drawing.symbol && getChartDrawingBucketKey(drawing.symbol) !== getChartDrawingBucketKey(chartSymbol)) {
    return false;
  }

  if (drawing.timeframe && normalizeTimeframe(drawing.timeframe) !== normalizeTimeframe(chartTimeframe)) {
    return false;
  }

  return true;
};

const isDrawingPriceCompatibleWithCandles = (
  drawing: PersistedChartDrawing,
  candles: readonly ChartDrawingPriceCandle[],
): boolean => {
  if (candles.length === 0 || drawing.points.length === 0) {
    return true;
  }

  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  candles.forEach((candle) => {
    minPrice = Math.min(minPrice, candle.open, candle.high, candle.low, candle.close);
    maxPrice = Math.max(maxPrice, candle.open, candle.high, candle.low, candle.close);
  });

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return true;
  }

  const span = Math.max(0, maxPrice - minPrice);
  const reference = Math.max(Math.abs(maxPrice), Math.abs(minPrice), 1);
  const tolerance = Math.max(
    span * LEGACY_DRAWING_PRICE_RANGE_MULTIPLE,
    reference * LEGACY_DRAWING_RELATIVE_PRICE_TOLERANCE,
  );

  return drawing.points.every((point) => {
    if (!Number.isFinite(point.price)) {
      return false;
    }

    return point.price >= minPrice - tolerance && point.price <= maxPrice + tolerance;
  });
};

const filterChartDrawingRecordsForCurrentChart = (
  drawings: readonly PersistedChartDrawing[],
  chartSymbol: string,
  chartTimeframe: string,
  candles: readonly ChartDrawingPriceCandle[] = [],
): PersistedChartDrawing[] =>
  drawings.filter(
    (drawing) =>
      isChartDrawingRecordForCurrentChart(drawing, chartSymbol, chartTimeframe) &&
      isDrawingPriceCompatibleWithCandles(drawing, candles),
  );

const CHART_RUNTIME_ACTIVE_DELAY_MS = 0;
const CHART_FOCUS_WORK_DELAY_MS = 650;
const CHART_SURFACE_MOUNT_DELAY_MS = 650;
// Background pre-warm: FastTabNavigator mounts the chart before its first visit.
// Start the expensive WebView immediately after the app's first painted frame;
// delaying it by seconds makes its multi-second boot overlap a normal first
// Chart tap. Live REST/WS hooks remain gated by chartRuntimeActive below, so the
// hidden warm surface does not retain live market subscriptions.
const CHART_WATCHDOG_INTERVAL_MS = 3000;
const CHART_INIT_RETRY_MIN_MS = 5000;
const MT5_LIGHT_GRID_COLOR = 'rgba(0,0,0,0.09)';
const MT5_DARK_AXIS_BORDER_COLOR = 'rgba(148,163,184,0.38)';
const MT5_LIGHT_AXIS_BORDER_COLOR = '#CBD5E1';

const ChartScreenInner = React.memo(function ChartScreenInner({ isChartRouteActive }: { isChartRouteActive: boolean }) {
  const T = useTheme();
  const { t } = useTranslation();
  // isChartRouteActive is provided by the thin ChartScreen wrapper below, so this
  // giant component (memoized) only re-renders when the chart's active state
  // actually flips — NOT on every unrelated tab switch. (usePathname re-renders
  // on any path change, which was re-rendering this 5000-line tree ~1s on every
  // bottom-tab switch and was the dominant tab-switch cost.)
  const isScreenFocused = isChartRouteActive;
  const chartRuntimeActive = useDeferredActiveFlag(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS);
  // Mount-once keep-alive: a focused cold start has a short fallback delay, but
  // the eager hidden tab starts the WebView immediately after the first app
  // frame. The surface then stays mounted; hidden live work is still paused via
  // chartRuntimeActive.
  const chartSurfaceActivated = useDeferredActiveFlag(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS);
  const [chartSurfacePrewarmed, setChartSurfacePrewarmed] = useState(false);
  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[CHART] screen mounted; surface pre-warm scheduled');
    }
    return scheduleAfterFirstFrame(() => setChartSurfacePrewarmed(true));
  }, []);
  const chartSurfaceReady = useLatchedFlag(chartSurfaceActivated || chartSurfacePrewarmed);
  // Derive login reactively from Zustand so the positions fetch re-triggers
  // when auth completes (login goes from undefined → valid number).
  const liveLogin = useLiveAccountState((s) => s.login);
  const persistedLoginId = useUserPreferences((s) => s.accountDetails?.id);
  const accountLogin = useMemo(() => {
    if (Number.isFinite(liveLogin) && liveLogin > 0) return liveLogin;
    const parsed = Number(persistedLoginId);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return undefined;
  }, [liveLogin, persistedLoginId]);

  // Hydrate positions on page refresh
  const refreshPositions = usePositionsState((s) => s.refreshPositions);
  // Fetch positions on mount AND poll every 10s so new trades always appear
  // on the chart even if the account WebSocket misses an event.
  useEffect(() => {
    if (!chartRuntimeActive || !accountLogin) return;
    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);
    return () => clearInterval(interval);
  }, [accountLogin, chartRuntimeActive, refreshPositions]);

  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    chartColors,
    chartColorScheme,
    chartDisplay,
    chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar,
    chartOneClickPanelAtBottom,
    chartVerticalScrollingLocked,
    chartAutoScaleEnabled,
    chartDrawingRecordsBySymbol,
    tradeVolume,
    chartTradeVolumeDisplayMode,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    setChartViewportShowVolumePane,
    setChartViewportShowDrawingToolbar,
    setChartOneClickPanelAtBottom,
    setChartVerticalScrollingLocked,
    setChartAutoScaleEnabled,
    setChartDisplaySetting,
    setTradeVolume,
    setChartTradeVolumeDisplayMode,
    chartLockAll,
    chartHideAll,
    setChartLockAll,
    setChartHideAll,
    setChartDrawingRecordsForSymbol,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartTimeframe: state.chartTimeframe,
      chartVisualType: state.chartVisualType,
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      chartViewportShowVolumePane: state.chartViewportShowVolumePane,
      chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
      chartOneClickPanelAtBottom: state.chartOneClickPanelAtBottom,
      chartVerticalScrollingLocked: state.chartVerticalScrollingLocked,
      chartAutoScaleEnabled: state.chartAutoScaleEnabled,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      tradeVolume: state.tradeVolume,
      chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartSymbol: state.setChartSymbol,
      setChartViewportShowVolumePane: state.setChartViewportShowVolumePane,
      setChartViewportShowDrawingToolbar: state.setChartViewportShowDrawingToolbar,
      setChartOneClickPanelAtBottom: state.setChartOneClickPanelAtBottom,
      setChartVerticalScrollingLocked: state.setChartVerticalScrollingLocked,
      setChartAutoScaleEnabled: state.setChartAutoScaleEnabled,
      setChartDisplaySetting: state.setChartDisplaySetting,
      setTradeVolume: state.setTradeVolume,
      setChartTradeVolumeDisplayMode: state.setChartTradeVolumeDisplayMode,
      chartLockAll: state.chartLockAll,
      chartHideAll: state.chartHideAll,
      setChartLockAll: state.setChartLockAll,
      setChartHideAll: state.setChartHideAll,
      setChartDrawingRecordsForSymbol: state.setChartDrawingRecordsForSymbol,
    })),
  );
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;
  const positions = usePositionsState((s) => s.positions);
  const preferencesHydrated = useUserPreferences((s) => s.hasHydrated);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const setChartShowOnChartItem = useUserPreferences((s) => s.setChartShowOnChartItem);
  const isVerticalScrollingLocked = chartVerticalScrollingLocked;
  const isChartAutoScaleEnabled = chartAutoScaleEnabled;
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartGridColor = useMemo(
    () => (isDark ? resolvedChartColors.grid : MT5_LIGHT_GRID_COLOR),
    [isDark, resolvedChartColors.grid],
  );
  const chartAxisBorderColor = useMemo(
    () => (isDark ? MT5_DARK_AXIS_BORDER_COLOR : MT5_LIGHT_AXIS_BORDER_COLOR),
    [isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const chartDrawingBucketKey = useMemo(() => getChartDrawingBucketKey(chartSymbol), [chartSymbol]);
  const persistedChartDrawingRecords = useMemo(
    () => chartDrawingRecordsBySymbol[chartDrawingBucketKey] ?? [],
    [chartDrawingBucketKey, chartDrawingRecordsBySymbol],
  );
  const scopedChartDrawingRecords = useMemo(
    () => filterChartDrawingRecordsForCurrentChart(persistedChartDrawingRecords, chartSymbol, chartTimeframe),
    [chartSymbol, chartTimeframe, persistedChartDrawingRecords],
  );

  const { data: apiSymbols = [] } = useMarketSymbols(chartRuntimeActive);
  const availableSymbols = useMemo(
    () => buildAvailableChartSymbols(chartSymbol, apiSymbols),
    [apiSymbols, chartSymbol],
  );
  const { data: chartInstrumentMeta } = useInstrumentMeta(chartSymbol, chartRuntimeActive);
  const { data: chartMarketStatus } = useMarketStatus(chartSymbol, chartRuntimeActive);
  const tradeVolumeBounds = useMemo(
    () => ({
      minVolume: chartInstrumentMeta?.minVolume,
      maxVolume: chartInstrumentMeta?.maxVolume,
      stepVolume: chartInstrumentMeta?.stepVolume,
    }),
    [chartInstrumentMeta?.maxVolume, chartInstrumentMeta?.minVolume, chartInstrumentMeta?.stepVolume],
  );
  const [lotInput, setLotInput] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));
  const footerLotDraftRef = useRef(lotInput);
  const [footerLotEditorFocused, setFooterLotEditorFocused] = useState(false);
  const [footerLotEditorOpening, setFooterLotEditorOpening] = useState(false);
  const footerLotEditorInputRef = useRef<TextInput>(null);
  const [footerLotPickerMode, setFooterLotPickerMode] = useState<FooterLotPickerMode | null>(null);
  const showFooterLotPicker = footerLotPickerMode !== null;
  // MT5-style invalid-lot state: when the user manually types a lot that isn't a
  // valid step/range, we keep it visible + flagged and block trading instead of
  // silently snapping it. `footerLotInvalidDisplay` holds the exact typed text.
  const [footerLotInvalid, setFooterLotInvalid] = useState(false);
  const [footerLotInvalidDisplay, setFooterLotInvalidDisplay] = useState('');
  // Synchronous "lot editor active" flag. The chart-viewport freeze is driven by
  // React state (footerLotEditorFocused/Opening), so a keyboard-resize layout can
  // fire BEFORE that state propagates to the onLayout closure — the chart shrinks
  // + reflows once (the visible "jump"). This ref flips true the instant the lot
  // editor opens so onLayout can freeze the very first shrink.
  const footerLotEditorActiveRef = useRef(false);
  const [chartTradeVolumeInputFocused, setChartTradeVolumeInputFocused] = useState(false);
  const [chartTradeVolumeDraft, setChartTradeVolumeDraft] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));
  const chartTradeVolumeDraftRef = useRef(chartTradeVolumeDraft);
  const setFooterLotDraft = useCallback((nextDraft: string) => {
    footerLotDraftRef.current = nextDraft;
    setLotInput(nextDraft);
  }, []);
  const setChartTradeVolumeDraftValue = useCallback((nextDraft: string) => {
    chartTradeVolumeDraftRef.current = nextDraft;
    setChartTradeVolumeDraft(nextDraft);
  }, []);

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => resolveChartSymbolKey(chartSymbol), [chartSymbol]);
  const isCryptoChartSymbol = useMemo(
    () => resolveChartSymbolCategory(chartSymbol) === 'CRYPTO',
    [chartSymbol],
  );
  const chartLiveQuote = useLiveSymbolQuote(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS);
  const chartLiveQuoteTickFields = chartLiveQuote as ChartLiveQuoteTickFields | undefined;
  const chartLiveQuoteDigitsSource = (chartLiveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLiveChartQuote = hasLiveQuoteFeedData(chartLiveQuote);
  const chartTradeTickTimestamp = useMemo(() => {
    const candidates = [
      chartLiveQuote?.lastReceivedAt,
      chartLiveQuoteTickFields?.time,
      chartLiveQuoteTickFields?.timestamp,
      chartLiveQuoteTickFields?.t,
      chartLiveQuote?.lastTickAt,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }

    return null;
  }, [
    chartLiveQuote?.lastReceivedAt,
    chartLiveQuote?.lastTickAt,
    chartLiveQuoteTickFields?.t,
    chartLiveQuoteTickFields?.time,
    chartLiveQuoteTickFields?.timestamp,
  ]);
  const { data: closedPositions = [], refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin, {
    enabled: chartRuntimeActive,
  });
  const { data: orders = [], refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin, {
    enabled: chartRuntimeActive,
  });
  const { data: alerts = [], refetch: refetchAlerts } = useAlertsQuery({
    enabled: chartRuntimeActive,
  });
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(
    accountLogin ? String(accountLogin) : undefined,
    { enabled: chartRuntimeActive },
  );
  const liveAccountEquity = useLiveAccountState((s) => s.equity);
  const liveAccountMargin = useLiveAccountState((s) => s.margin);
  const liveAccountMarginLevel = useLiveAccountState((s) => s.margin_level);
  const liveAccountBalance = useLiveAccountState((s) => s.balance);
  const overlayAccountMetrics = useMemo(() => {
    const hasLiveMetrics =
      (Number.isFinite(liveAccountEquity) && liveAccountEquity > 0) ||
      (Number.isFinite(liveAccountMargin) && liveAccountMargin > 0) ||
      (Number.isFinite(liveAccountMarginLevel) && liveAccountMarginLevel > 0);

    return {
      equity: hasLiveMetrics ? liveAccountEquity : accountSummary?.equity ?? 0,
      margin: hasLiveMetrics ? liveAccountMargin : accountSummary?.margin ?? 0,
      marginLevel: hasLiveMetrics ? liveAccountMarginLevel : accountSummary?.marginLevel ?? 0,
    };
  }, [
    liveAccountEquity,
    liveAccountMargin,
    liveAccountMarginLevel,
    accountSummary?.equity,
    accountSummary?.margin,
    accountSummary?.marginLevel,
  ]);

  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    if (!footerLotEditorFocused && !footerLotInvalid) {
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
    }
    if (!chartTradeVolumeInputFocused) {
      setChartTradeVolumeDraftValue(formatTradeVolume(normalized, tradeVolumeBounds));
    }
  }, [
    chartTradeVolumeInputFocused,
    footerLotEditorFocused,
    footerLotInvalid,
    setChartTradeVolumeDraftValue,
    setFooterLotDraft,
    setTradeVolume,
    tradeVolume,
    tradeVolumeBounds,
  ]);

  const updateTradeVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, tradeVolumeBounds);
      setTradeVolume(normalized);
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
      setChartTradeVolumeDraftValue(formatTradeVolume(normalized, tradeVolumeBounds));
      setFooterLotInvalid(false);
    },
    [setChartTradeVolumeDraftValue, setFooterLotDraft, setTradeVolume, tradeVolumeBounds],
  );
  const resolveFooterLotCommitDraft = useCallback((draftOverride?: string) => resolveFooterLotCommitDraftValue({
    draftOverride,
    draftRef: footerLotDraftRef.current,
    currentDraft: lotInput,
  }), [lotInput]);
  const commitLotDraft = useCallback((draftOverride?: string) => {
    const nextDraft = resolveFooterLotCommitDraft(draftOverride);

    if (!nextDraft.trim()) {
      // Use the freshest committed lot from the store, not the closure's
      // captured `tradeVolume` — otherwise rapid commits can revert the
      // input to a value that's already been replaced by another commit.
      const latestVolume = useUserPreferences.getState().tradeVolume;
      setFooterLotDraft(formatTradeVolume(latestVolume, tradeVolumeBounds));
      setFooterLotInvalid(false);
      return;
    }
    if (!isValidTradeVolume(nextDraft, tradeVolumeBounds)) {
      // MT5 parity: don't silently snap a non-step / out-of-range lot. Keep the
      // typed value visible and flagged; trading stays blocked until it's valid.
      setFooterLotDraft(nextDraft);
      setFooterLotInvalidDisplay(nextDraft);
      setFooterLotInvalid(true);
      return;
    }
    updateTradeVolume(nextDraft);
  }, [resolveFooterLotCommitDraft, setFooterLotDraft, tradeVolumeBounds, updateTradeVolume]);
  const handleOpenFooterLotPicker = useCallback((mode: FooterLotPickerMode = 'absolute') => {
    commitLotDraft();
    setFooterLotEditorFocused(false);
    setFooterLotEditorOpening(false);
    Keyboard.dismiss();
    setFooterLotPickerMode((current) => (current === mode ? null : mode));
  }, [commitLotDraft]);
  const handleCloseFooterLotPicker = useCallback(() => {
    setFooterLotPickerMode(null);
  }, []);
  const handleSelectFooterLot = useCallback(
    (nextVolume: number) => {
      updateTradeVolume(nextVolume);
      setFooterLotPickerMode((current) => (current === 'absolute' ? null : current));
    },
    [updateTradeVolume],
  );

  const handleFooterLotDraftChange = useCallback((text: string) => {
    setFooterLotDraft(sanitizeTradeVolumeDraft(text));
  }, [setFooterLotDraft]);
  const handleFocusFooterLotEditor = useCallback(() => {
    // Engage the chart freeze synchronously (before the keyboard resize lands).
    footerLotEditorActiveRef.current = true;
    setFooterLotPickerMode(null);
    setFooterLotDraft(
      footerLotInvalid ? footerLotInvalidDisplay : formatTradeVolume(tradeVolume, tradeVolumeBounds),
    );
    setFooterLotEditorOpening(Platform.OS === 'android');
    setFooterLotEditorFocused(true);
  }, [footerLotInvalid, footerLotInvalidDisplay, setFooterLotDraft, tradeVolume, tradeVolumeBounds]);
  const finishFooterLotEditor = useCallback((draftOverride?: string) => {
    // Always prefer the ref (latest typed value) when no explicit override given
    commitLotDraft(draftOverride ?? footerLotDraftRef.current);
    footerLotEditorActiveRef.current = false;
    setFooterLotEditorOpening(false);
    setFooterLotEditorFocused(false);
  }, [commitLotDraft]);
  const handleBlurFooterLotEditor = useCallback(() => {
    finishFooterLotEditor();
  }, [finishFooterLotEditor]);
  const handleEndFooterLotEditor = useCallback((event: TextInputCommitEvent) => {
    finishFooterLotEditor(event.nativeEvent.text);
  }, [finishFooterLotEditor]);
  const handleSubmitFooterLotEditor = useCallback((event?: TextInputCommitEvent) => {
    finishFooterLotEditor(event?.nativeEvent.text);
    Keyboard.dismiss();
  }, [finishFooterLotEditor]);
  const handleStepFooterLotEditor = useCallback((direction: -1 | 1) => {
    // Read the latest committed lot from the store rather than the closure's
    // captured `tradeVolume`. Without this, two rapid chevron presses both
    // compute the next value off the same stale lot — the second press
    // becomes a silent no-op and the user perceives "decrease doesn't work".
    const latestVolume = useUserPreferences.getState().tradeVolume;
    const nextVolume = incrementTradeVolume(latestVolume, direction, tradeVolumeBounds);
    updateTradeVolume(nextVolume);
  }, [tradeVolumeBounds, updateTradeVolume]);
  const committedLotDisplay = useMemo(
    () => formatTradeVolume(tradeVolume, tradeVolumeBounds),
    [tradeVolume, tradeVolumeBounds],
  );
  const passiveLotDisplay = footerLotEditorFocused
    ? lotInput || committedLotDisplay
    : committedLotDisplay;

  const [tradeFeedback, setTradeFeedback] = useState<TradeFeedbackState>(TRADE_MODAL_INITIAL);
  const handleTradeFeedbackClose = useCallback(() => setTradeFeedback(TRADE_MODAL_INITIAL), []);
  const handleChartTradeResult = useCallback((feedback: TradeFeedbackState) => {
    if (feedback.type !== 'success') {
      setTradeFeedback(feedback);
      return;
    }

    setTradeFeedback(feedback);
    if (chartRuntimeActive) {
      if (accountLogin) {
        void refreshPositions(String(accountLogin));
      }
      void refetchOrders();
      void refetchAccountSummary();
    }
  }, [
    accountLogin,
    chartRuntimeActive,
    refetchAccountSummary,
    refetchOrders,
    refreshPositions,
  ]);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const [showChartTradeSheet, setShowChartTradeSheet] = useState(false);
  const [chartTradeOrderType, setChartTradeOrderType] = useState<ChartOrderType>('Market Execution');
  const [chartTradePrice, setChartTradePrice] = useState(0);
  const [chartTradeStopLimitPrice, setChartTradeStopLimitPrice] = useState(0);
  const [chartTradeSlEnabled, setChartTradeSlEnabled] = useState(false);
  const [chartTradeSlPrice, setChartTradeSlPrice] = useState(0);
  const [chartTradeTpEnabled, setChartTradeTpEnabled] = useState(false);
  const [chartTradeTpPrice, setChartTradeTpPrice] = useState(0);
  const [chartTradeComment, setChartTradeComment] = useState('');
  const [chartTradeCommentFocused, setChartTradeCommentFocused] = useState(false);
  const [chartTradeExpiration, setChartTradeExpiration] = useState<'GTC' | 'Today' | 'Date and Time' | 'Date'>('GTC');
  const [chartExpirationMenuOpen, setChartExpirationMenuOpen] = useState(false);
  const [chartStepperEditor, setChartStepperEditor] = useState<{ kind: 'price' | 'stopLimitPrice' | 'tp' | 'sl' | 'volume' } | null>(null);
  const [chartPendingOrderSubmitting, setChartPendingOrderSubmitting] = useState(false);
  const [chartTradeStopUnit, setChartTradeStopUnit] = useState<'Price' | 'Pips' | 'Currency'>('Price');
  const [chartTradeSlLocked, setChartTradeSlLocked] = useState(false);
  const [chartTradeTpLocked, setChartTradeTpLocked] = useState(false);
  const [chartTradeSheetMode, setChartTradeSheetMode] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [keyboardVisibleHeight, setKeyboardVisibleHeight] = useState(0);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);
  const [chartTradeSheetHostHeight, setChartTradeSheetHostHeight] = useState(0);
  const [chartTradeSheetHostTopOffset, setChartTradeSheetHostTopOffset] = useState(0);
  const [chartTradeKeyboardFreeHostHeight, setChartTradeKeyboardFreeHostHeight] = useState(0);
  const [chartTradeInlineFooterHeight, setChartTradeInlineFooterHeight] = useState(0);
  const [chartTradeTopToolbarBottomOffset, setChartTradeTopToolbarBottomOffset] = useState(0);
  const [chartTradeCompactHeaderHeight, setChartTradeCompactHeaderHeight] = useState(0);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const setChartInlineInputActive = useUIState((s) => s.setChartInlineInputActive);
  const setChartTabBarKeyboardLift = useUIState((s) => s.setChartTabBarKeyboardLift);
  const showChartActionSheet = useUIState((s) => s.showChartActionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const safeInsets = useSafeAreaInsets();
  const handleOpenSidebar = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);
  const keyboardInset = useMemo(
    () => (keyboardVisibleHeight > 0 ? Math.max(0, keyboardVisibleHeight - safeInsets.bottom + 12) : 0),
    [keyboardVisibleHeight, safeInsets.bottom],
  );
  const androidFooterHostResizedForKeyboard = useMemo(() => {
    return resolveKeyboardResizesHost({
      platform: Platform.OS,
      footerLotEditorFocused,
      showChartTradeSheet,
      keyboardVisibleHeight,
      keyboardFreeHostHeight: chartTradeKeyboardFreeHostHeight,
      currentHostHeight: chartTradeSheetHostHeight,
    });
  }, [
    chartTradeKeyboardFreeHostHeight,
    chartTradeSheetHostHeight,
    footerLotEditorFocused,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  const chartTabBarKeyboardLift = useMemo(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      androidFooterHostResizedForKeyboard ||
      keyboardVisibleHeight <= 0
    ) {
      return 0;
    }

    return keyboardVisibleHeight;
  }, [
    androidFooterHostResizedForKeyboard,
    footerLotEditorFocused,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  const chartBottomTabBarHeight = useMemo(
    () => resolveBottomTabBarHeight({
      safeAreaBottom: safeInsets.bottom,
      isChartTab: true,
    }),
    [safeInsets.bottom],
  );
  const footerKeyboardAvoidanceOffset = useMemo(() => {
    if (chartTabBarKeyboardLift <= 0) {
      return 0;
    }

    return chartTabBarKeyboardLift + chartBottomTabBarHeight;
  }, [chartBottomTabBarHeight, chartTabBarKeyboardLift]);
  const resolveKeyboardDockOffsetForFrame = useCallback((coords?: { height?: number; screenY?: number | null }) => {
    const liveWindowHeight = Dimensions.get('window').height;
    return resolveKeyboardDockOffset({
      platform: Platform.OS,
      keyboardHeight: Math.max(0, coords?.height ?? 0),
      keyboardScreenY: typeof coords?.screenY === 'number' ? coords.screenY : null,
      containerBottom: footerTradeRowAnchorBottomRef.current ?? chartTradeHostBottomRef.current,
      screenHeight: liveWindowHeight,
      safeAreaBottom: safeInsets.bottom,
    });
  }, [safeInsets.bottom]);
  const measureChartTradeHostFrame = useCallback((onMeasured?: () => void) => {
    if (!chartTradeHostRef.current) {
      onMeasured?.();
      return;
    }

    chartTradeHostRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        const nextTopOffset = Math.max(0, Math.round(y));
        setChartTradeSheetHostTopOffset((current) => (
          current === nextTopOffset ? current : nextTopOffset
        ));
        chartTradeHostBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureFooterTradeRowAnchorFrame = useCallback((onMeasured?: () => void) => {
    if (!footerTradeRowAnchorRef.current) {
      onMeasured?.();
      return;
    }

    footerTradeRowAnchorRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        footerTradeRowAnchorBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureKeyboardDockAnchors = useCallback((onMeasured?: () => void) => {
    measureChartTradeHostFrame(() => {
      measureFooterTradeRowAnchorFrame(onMeasured);
    });
  }, [measureChartTradeHostFrame, measureFooterTradeRowAnchorFrame]);
  const recomputeKeyboardDockOffset = useCallback((frameOverride?: { height: number; screenY: number | null }) => {
    const nextDockOffset = resolveKeyboardDockOffsetForFrame(frameOverride ?? keyboardFrameRef.current);
    setKeyboardDockOffset(nextDockOffset);
    return nextDockOffset;
  }, [resolveKeyboardDockOffsetForFrame]);
  const readKeyboardMetricsFrame = useCallback(() => {
    const keyboardController = Keyboard as typeof Keyboard & {
      metrics?: () => { height?: number; screenY?: number } | undefined;
    };
    const metrics = keyboardController.metrics?.();
    return {
      height: Math.max(0, metrics?.height ?? 0),
      screenY: typeof metrics?.screenY === 'number' ? metrics.screenY : null,
    };
  }, []);
  const syncKeyboardHeightFromMetrics = useCallback(() => {
    const metrics = readKeyboardMetricsFrame();
    keyboardFrameRef.current = {
      height: metrics.height,
      screenY: metrics.screenY,
    };
    const nextDockOffset = recomputeKeyboardDockOffset(keyboardFrameRef.current);

    if (metrics.height > 0 || nextDockOffset > 0) {
      setKeyboardVisibleHeight(metrics.height);
    }

    return {
      ...metrics,
      dockOffset: nextDockOffset,
    };
  }, [readKeyboardMetricsFrame, recomputeKeyboardDockOffset]);
  const screenHeight = Dimensions.get('window').height;
  const fullscreenChartMinHeight = Math.max(320, screenHeight);
  const chartTradeSheetCollapsedHeight = 120;
  const fullscreenToolbarTouchBuffer = 18;
  const fullscreenToolbarTopPadding = safeInsets.top + fullscreenToolbarTouchBuffer;
  const chartHeaderTopPadding = (Platform.OS === 'web' ? 0 : Math.max(safeInsets.top, 0)) + 6;
  const focusedLotChartViewportHeight = useMemo(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet
    ) {
      return 0;
    }

    const headerHeight =
      chartTradeCompactHeaderHeight > 0
        ? chartTradeCompactHeaderHeight
        : chartHeaderTopPadding + 84;
    const hostViewportHeight =
      chartTradeSheetHostHeight > 0
        ? chartTradeSheetHostHeight
        : Math.max(0, screenHeight - headerHeight);
    const keyboardReserve =
      chartTabBarKeyboardLift > 0
        ? chartTabBarKeyboardLift + Math.max(safeInsets.bottom, 0)
        : 0;
    const inlineFooterHeight =
      chartTradeInlineFooterHeight > 0
        ? chartTradeInlineFooterHeight
        : CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT;
    const bottomNavigationReserve =
      chartTabBarKeyboardLift > 0 ? chartBottomTabBarHeight : 0;
    const reservedBottomStack =
      keyboardReserve +
      bottomNavigationReserve +
      inlineFooterHeight;

    return Math.max(320, Math.round(hostViewportHeight - reservedBottomStack));
  }, [
    chartBottomTabBarHeight,
    chartHeaderTopPadding,
    chartTabBarKeyboardLift,
    chartTradeCompactHeaderHeight,
    chartTradeInlineFooterHeight,
    chartTradeSheetHostHeight,
    footerLotEditorFocused,
    safeInsets.bottom,
    screenHeight,
    showChartTradeSheet,
  ]);
  const fullscreenChartTradeSheetTopInset = fullscreenToolbarTopPadding + 36;
  const chartTradeSheetToolbarBottomInset =
    isChartExpanded && chartTradeTopToolbarBottomOffset > 0
      ? Math.max(chartTradeTopToolbarBottomOffset, fullscreenChartTradeSheetTopInset)
      : isChartExpanded
        ? fullscreenChartTradeSheetTopInset
        : 0;
  const chartTradeSheetTopGap = isChartExpanded
    ? CHART_TRADE_SHEET_TOP_GAP
    : CHART_TRADE_COMPACT_SHEET_TOP_GAP;
  const chartTradeSheetTopInset = resolveChartTradeSheetTopInset({
    isFullscreen: isChartExpanded,
    toolbarBottomInset: chartTradeSheetToolbarBottomInset,
    topGap: chartTradeSheetTopGap,
    compactHeaderHeight: chartTradeCompactHeaderHeight,
    hostTopOffset: chartTradeSheetHostTopOffset,
  });
  const chartTradeSheetFallbackHostHeight = Math.max(
    chartTradeSheetCollapsedHeight + 180,
    screenHeight - Math.max(safeInsets.top, 0),
  );
  const resolvedChartTradeSheetHostHeight =
    chartTradeSheetHostHeight > 0 ? chartTradeSheetHostHeight : chartTradeSheetFallbackHostHeight;
  const chartTradeSheetHeaderLift = resolveChartTradeSheetHeaderLift({
    topInset: chartTradeSheetTopInset,
    compactHeaderHeight: chartTradeCompactHeaderHeight,
    isFullscreen: isChartExpanded,
  });
  // The SL/TP sheet is opened from the chart toolbar and covers the footer
  // area while open, so the sell/lot/buy row never shows through a cutout.
  const showInlineFooterWhileChartTradeSheetOpen = false;
  useEffect(() => {
    if (!isChartExpanded) {
      setChartTradeTopToolbarBottomOffset(0);
    }
  }, [isChartExpanded]);
  const chartTradeSheetBottomInset = !isChartExpanded && showInlineFooterWhileChartTradeSheetOpen
    ? (chartTradeInlineFooterHeight > 0 ? chartTradeInlineFooterHeight : CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT)
    : 0;
  const chartTradeSheetMaxHeight = resolveChartTradeSheetMaxHeight({
    collapsedHeight: chartTradeSheetCollapsedHeight,
    hostHeight: resolvedChartTradeSheetHostHeight,
    topInset: chartTradeSheetTopInset,
    headerLift: chartTradeSheetHeaderLift,
    bottomInset: chartTradeSheetBottomInset,
  });
  const chartTradeSheetExpandedTranslateY = 0;
  const chartTradeSheetCollapsedTranslateY = Math.max(0, chartTradeSheetMaxHeight - chartTradeSheetCollapsedHeight);
  const chartTradeSheetHiddenTranslateY = chartTradeSheetMaxHeight + 18;
  const fullscreenDrawingToolsSheetTopInset = fullscreenToolbarTopPadding + 72;
  const drawingToolsSheetTopInset = isChartExpanded
    ? fullscreenDrawingToolsSheetTopInset + 24
    : safeInsets.top + 80;
  const chartScrollRef = useRef<ScrollView>(null);
  const chartTradeHostRef = useRef<View>(null);
  const footerTradeRowAnchorRef = useRef<View>(null);
  const chartTradeSheetScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsInlineScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsInlineLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsOverlayViewportWidthRef = useRef(0);
  const chartTradeTypeTabsInlineViewportWidthRef = useRef(0);
  const chartTradeCommentInputRef = useRef<TextInput>(null);
  const chartTradeCommentSubmitIntentRef = useRef(false);
  const chartTradeSheetScrollOffsetRef = useRef(0);
  const keyboardFrameRef = useRef<{ height: number; screenY: number | null }>({ height: 0, screenY: null });
  const chartTradeHostBottomRef = useRef<number | null>(null);
  const footerTradeRowAnchorBottomRef = useRef<number | null>(null);
  const [activeTool, setActiveTool] = useState<string>(CHART_NO_DRAWING_TOOL);
  const [chartDrawingInputActive, setChartDrawingInputActive] = useState(false);
  const [chartTapMenuAnchor, setChartTapMenuAnchor] = useState<ChartTapMenuAnchor | null>(null);
  const [timeframePickerVisible, setTimeframePickerVisible] = useState(false);
  const [chartTapMenuBounds, setChartTapMenuBounds] = useState<ChartTapMenuBounds>({ width: 0, height: 0 });
  const [chartTapMenuViewport, setChartTapMenuViewport] = useState<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const [, setChartPlotArea] = useState<FixedHorizontalGridPlotArea | null>(null);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [drawingMagnetMode, setDrawingMagnetMode] = useState(false);
  const [textLevelEditRequest, setTextLevelEditRequest] = useState<TextLevelEditRequest | null>(null);
  const [chartViewportTouchActive, setChartViewportTouchActive] = useState(false);
  const pendingChartDrawingTool = useUIState((s) => s.pendingChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((s) => s.clearPendingChartDrawingTool);
  const pendingChartCommand = useUIState((s) => s.pendingChartCommand);
  const clearPendingChartCommand = useUIState((s) => s.clearPendingChartCommand);
  const shouldCaptureChartGestures =
    isChartExpanded || chartDrawingInputActive || Boolean(pendingChartDrawingTool);

  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!timeframePickerVisible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setTimeframePickerVisible(false);
      return true;
    });

    return () => subscription.remove();
  }, [timeframePickerVisible]);
  const pendingObjectsDrawingSyncRef = useRef(false);
  const chartViewportRef = useRef<View>(null);
  const chartTapMenuBoundsRef = useRef<ChartTapMenuBounds>({ width: 0, height: 0 });
  const chartTapMenuViewportRef = useRef<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const chartTapMenuSuppressUntilRef = useRef(0);
  const lastChartViewportSizeRef = useRef({ width: 0, height: 0 });
  const pendingChartViewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const chartViewportResizeFrameRef = useRef<number | null>(null);
  const chartViewportResizeCommitFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryTokenRef = useRef(0);
  const chartViewportTouchReleaseFrameRef = useRef<number | null>(null);
  const chartViewportTouchFailsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartTradeSheetTranslateY = useSharedValue(chartTradeSheetHiddenTranslateY);
  const chartTradeSheetDragStartY = useSharedValue(chartTradeSheetCollapsedTranslateY);
  const chartTradeSheetLastVisibleOffsetRef = useRef(chartTradeSheetCollapsedTranslateY);
  const flushChartViewportResize = useCallback((force: boolean = false) => {
    const pending = pendingChartViewportSizeRef.current;
    if (!pending) {
      return;
    }
    const current = lastChartViewportSizeRef.current;
    if (!force && current.width === pending.width && current.height === pending.height) {
      return;
    }
    lastChartViewportSizeRef.current = pending;
    webViewRef.current?.injectJavaScript(`
      if (typeof resizeChartViewport === 'function') {
        resizeChartViewport(${pending.width}, ${pending.height});
      }
      true;
    `);
  }, []);
  const recoverChartViewportSurface = useCallback((width: number, height: number) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!webViewRef.current) {
      return;
    }
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    webViewRef.current.injectJavaScript(`
      try {
        if (typeof recoverChartSurface === 'function') {
          recoverChartSurface(${nextWidth}, ${nextHeight});
        }
      } catch (_) {}
      true;
    `);
  }, []);
  const scheduleChartViewportResize = useCallback((width: number, height: number, force: boolean = false) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    pendingChartViewportSizeRef.current = { width: nextWidth, height: nextHeight };
    if (force) {
      if (chartViewportResizeFrameRef.current !== null) {
        cancelAnimationFrame(chartViewportResizeFrameRef.current);
        chartViewportResizeFrameRef.current = null;
      }
      if (chartViewportResizeCommitFrameRef.current !== null) {
        cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
        chartViewportResizeCommitFrameRef.current = null;
      }
      chartViewportResizeFrameRef.current = requestAnimationFrame(() => {
        chartViewportResizeFrameRef.current = null;
        flushChartViewportResize(true);
      });
      return;
    }
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
    }
    chartViewportResizeFrameRef.current = requestAnimationFrame(() => {
      chartViewportResizeFrameRef.current = null;
      chartViewportResizeCommitFrameRef.current = requestAnimationFrame(() => {
        chartViewportResizeCommitFrameRef.current = null;
        flushChartViewportResize(force);
      });
    });
  }, [flushChartViewportResize]);
  const handleChartViewportTouchStart = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
    }
    chartViewportTouchFailsafeTimerRef.current = setTimeout(() => {
      chartViewportTouchFailsafeTimerRef.current = null;
      setChartViewportTouchActive(false);
    }, CHART_VIEWPORT_TOUCH_FAILSAFE_MS);
    if (footerLotEditorFocused || footerLotEditorOpening || footerLotPickerMode !== null) {
      chartTapMenuSuppressUntilRef.current = Date.now() + CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS;
      setChartTapMenuAnchor(null);
    }
    if (!showChartTradeSheet) {
      if (footerLotPickerMode !== null) {
        setFooterLotPickerMode(null);
      }
      if (footerLotEditorFocused) {
        finishFooterLotEditor();
        Keyboard.dismiss();
      }
    }
    setChartViewportTouchActive((current) => (current ? current : true));
  }, [finishFooterLotEditor, footerLotEditorFocused, footerLotEditorOpening, footerLotPickerMode, showChartTradeSheet]);
  const handleChartViewportTouchEnd = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
    chartViewportTouchReleaseFrameRef.current = requestAnimationFrame(() => {
      chartViewportTouchReleaseFrameRef.current = null;
      setChartViewportTouchActive(false);
    });
  }, []);
  useEffect(() => {
    chartTapMenuBoundsRef.current = chartTapMenuBounds;
  }, [chartTapMenuBounds]);
  useEffect(() => {
    chartTapMenuViewportRef.current = chartTapMenuViewport;
  }, [chartTapMenuViewport]);

  const syncChartViewportFrame = useCallback((onMeasured?: (viewport: ChartTapMenuViewport) => void) => {
    requestAnimationFrame(() => {
      if (!chartViewportRef.current) {
        onMeasured?.(chartTapMenuViewportRef.current);
        return;
      }
      chartViewportRef.current?.measureInWindow((x, y, width, height) => {
        const hasValidFrame =
          [x, y, width, height].every((value) => Number.isFinite(value)) &&
          width > 0 &&
          height > 0;
        const nextViewport = hasValidFrame
          ? { x, y, width, height }
          : chartTapMenuViewportRef.current;
        chartTapMenuViewportRef.current = nextViewport;
        setChartTapMenuViewport((current) =>
          current.x === nextViewport.x &&
            current.y === nextViewport.y &&
            current.width === nextViewport.width &&
            current.height === nextViewport.height
            ? current
            : nextViewport,
        );
        onMeasured?.(nextViewport);
      });
    });
  }, []);
  const cancelChartViewportRecovery = useCallback(() => {
    chartViewportRecoveryTokenRef.current += 1;
    if (chartViewportRecoveryFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportRecoveryFrameRef.current);
      chartViewportRecoveryFrameRef.current = null;
    }
  }, []);
  const requestChartViewportRecovery = useCallback((passes: number = 4) => {
    const initialBounds = chartTapMenuBoundsRef.current;

    cancelChartViewportRecovery();
    const token = chartViewportRecoveryTokenRef.current;
    let passesRemaining = Math.max(0, Math.round(passes));

    const runRecoveryPass = () => {
      if (chartViewportRecoveryTokenRef.current !== token) {
        return;
      }

      const fallbackBounds = chartTapMenuBoundsRef.current;
      syncChartViewportFrame((viewport) => {
        if (chartViewportRecoveryTokenRef.current !== token) {
          return;
        }

        const fallbackWidth = fallbackBounds.width > 0 ? fallbackBounds.width : initialBounds.width;
        const fallbackHeight = fallbackBounds.height > 0 ? fallbackBounds.height : initialBounds.height;
        const resizeWidth = viewport.width > 0 ? viewport.width : fallbackWidth;
        const resizeHeight = viewport.height > 0 ? viewport.height : fallbackHeight;
        if (resizeWidth <= 0 || resizeHeight <= 0) {
          return;
        }

        scheduleChartViewportResize(resizeWidth, resizeHeight, true);
        if (passesRemaining <= 0) {
          recoverChartViewportSurface(resizeWidth, resizeHeight);
          chartViewportRecoveryFrameRef.current = null;
          return;
        }

        passesRemaining -= 1;
        chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
      });
    };

    chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
  }, [cancelChartViewportRecovery, recoverChartViewportSurface, scheduleChartViewportResize, syncChartViewportFrame]);
  const scheduleChartViewportColdStartRecovery = useCallback(() => {
    requestChartViewportRecovery(6);
    const recoveryTimers = [180, 650, 1400, 2600].map((delayMs) =>
      setTimeout(() => {
        requestChartViewportRecovery(delayMs >= 1400 ? 4 : 5);
      }, delayMs),
    );

    return () => {
      recoveryTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [requestChartViewportRecovery]);
  useEffect(() => () => {
    cancelChartViewportRecovery();
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
  }, [cancelChartViewportRecovery]);
  useEffect(() => {
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    cancelChartViewportRecovery();
    pendingChartViewportSizeRef.current = null;
    setChartTradeSheetHostHeight(0);
  }, [cancelChartViewportRecovery, isChartExpanded]);
  useEffect(() => {
    const { width, height } = chartTapMenuBounds;
    if (width <= 0 || height <= 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      syncChartViewportFrame((viewport) => {
        const resizeWidth = viewport.width > 0 ? viewport.width : width;
        const resizeHeight = viewport.height > 0 ? viewport.height : height;
        scheduleChartViewportResize(resizeWidth, resizeHeight);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTapMenuBounds.height, chartTapMenuBounds.width, scheduleChartViewportResize, syncChartViewportFrame]);
  useEffect(() => {
    requestChartViewportRecovery(4);
    return cancelChartViewportRecovery;
  }, [
    isChartExpanded,
    chartTapMenuBounds.height,
    chartTapMenuBounds.width,
    cancelChartViewportRecovery,
    requestChartViewportRecovery,
  ]);
  useEffect(() => {
    if (!isScreenFocused || !chartRuntimeActive || !chartSurfaceReady) {
      return;
    }

    // The chart WebView is kept alive and can be prewarmed while hidden.
    // Re-entering the route measures the native viewport directly, so a hidden
    // prewarm layout cannot leave the canvas compressed on first Chart open.
    const cancelColdStartRecovery = scheduleChartViewportColdStartRecovery();
    return () => {
      cancelColdStartRecovery();
      cancelChartViewportRecovery();
    };
  }, [
    chartRuntimeActive,
    chartSurfaceReady,
    cancelChartViewportRecovery,
    isScreenFocused,
    scheduleChartViewportColdStartRecovery,
  ]);
  const chartDataActive = chartRuntimeActive;
  const {
    candles,
    paginate,
    loading: chartDataLoading,
    error: chartDataError,
  } = useLiveCandles(chartSymbol, chartTimeframe, chartDataActive);
  const sanitizedBackendCandles = useMemo(
    () => (
      candles.length > 0
        ? sanitizeCandlesForChart(candles, {
          timeframe: chartTimeframe,
          pruneSyntheticFlatLiveTail: chartMarketStatus?.status === 'closed' && !isCryptoChartSymbol,
        })
        : EMPTY_DISPLAY_CANDLES
    ),
    [candles, chartMarketStatus?.status, chartTimeframe, isCryptoChartSymbol],
  );
  const chartDrawingRecords = useMemo(
    () =>
      filterChartDrawingRecordsForCurrentChart(
        scopedChartDrawingRecords,
        chartSymbol,
        chartTimeframe,
        sanitizedBackendCandles,
      ),
    [chartSymbol, chartTimeframe, sanitizedBackendCandles, scopedChartDrawingRecords],
  );
  const chartDrawingSignature = useMemo(() => JSON.stringify(chartDrawingRecords), [chartDrawingRecords]);
  const latestChartPrecisionPrices = useMemo(() => {
    const latest = sanitizedBackendCandles[sanitizedBackendCandles.length - 1];
    return latest ? [latest.open, latest.high, latest.low, latest.close] : [];
  }, [sanitizedBackendCandles]);
  const hasCoherentLiveChartQuote = useMemo(() => {
    if (!hasLiveChartQuote) {
      return false;
    }

    const latestBackendCandle = sanitizedBackendCandles[sanitizedBackendCandles.length - 1];
    if (!latestBackendCandle) {
      return true;
    }

    const quotePrices = [chartLiveQuote?.bid, chartLiveQuote?.ask].filter(
      (price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0,
    );

    if (quotePrices.length === 0) {
      return false;
    }

    return quotePrices.every((price) => isPriceCoherentWithCandle(latestBackendCandle, price));
  }, [chartLiveQuote?.ask, chartLiveQuote?.bid, hasLiveChartQuote, sanitizedBackendCandles]);
  const rawDisplayDecimals = useMemo(() => {
    return resolveChartDisplayDecimals({
      instrumentDigits: chartInstrumentMeta?.digits,
      instrumentPoint: chartInstrumentMeta?.point,
      instrumentTickSize: chartInstrumentMeta?.tickSize,
      liveQuoteDigits: chartLiveQuote?.digits,
      liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend',
      liveQuotePoint: chartLiveQuote?.point,
      liveQuoteTickSize: chartLiveQuote?.tickSize,
      liveQuoteBid: chartLiveQuote?.bid,
      liveQuoteAsk: chartLiveQuote?.ask,
      liveQuoteLast: chartLiveQuote?.close,
      candlePrices: latestChartPrecisionPrices,
    });
  }, [
    chartInstrumentMeta?.digits,
    chartInstrumentMeta?.point,
    chartInstrumentMeta?.tickSize,
    chartLiveQuote?.ask,
    chartLiveQuote?.bid,
    chartLiveQuote?.close,
    chartLiveQuote?.digits,
    chartLiveQuote?.point,
    chartLiveQuote?.tickSize,
    chartLiveQuoteDigitsSource,
    hasCoherentLiveChartQuote,
    latestChartPrecisionPrices,
  ]);
  // Stabilize price precision per symbol/timeframe. When the broker doesn't
  // expose stable instrument digits, resolveChartDisplayDecimals() infers them
  // from live tick prices, which jitter bar-to-bar (e.g. BTCUSD alternating
  // 2<->3 decimals as round ticks arrive). Because displayDecimals is part of
  // the chart re-init signature (currentSig), that jitter forced a full chart
  // rebuild — the "Loading chart data..." flash — several times a minute. Latch
  // the resolved value once real candles exist and hold it steady until the
  // symbol or timeframe changes, so transient per-tick precision can't churn
  // the rebuild signature.
  const displayDecimalsLatchRef = useRef<{ key: string; value: number; settled: boolean }>({
    key: '',
    value: rawDisplayDecimals,
    settled: false,
  });
  const displayDecimalsKey = `${chartSymbol}::${chartTimeframe}`;
  if (
    displayDecimalsLatchRef.current.key !== displayDecimalsKey ||
    !displayDecimalsLatchRef.current.settled
  ) {
    displayDecimalsLatchRef.current = {
      key: displayDecimalsKey,
      value: rawDisplayDecimals,
      settled: sanitizedBackendCandles.length > 0,
    };
  }
  const displayDecimals = displayDecimalsLatchRef.current.value;
  const sanitizedCandles = useMemo(
    () => {
      if (sanitizedBackendCandles.length === 0) {
        return EMPTY_DISPLAY_CANDLES;
      }
      return sanitizedBackendCandles;
    },
    [sanitizedBackendCandles],
  );
  const latestChartClose = useMemo(
    () => sanitizedCandles[sanitizedCandles.length - 1]?.close ?? 0,
    [sanitizedCandles],
  );
  const { bid: chartBid, ask: chartAsk } = useMemo(
    () =>
      resolveChartTradeButtonQuote({
        liveBid: hasLiveChartQuote ? chartLiveQuote?.bid : undefined,
        liveAsk: hasLiveChartQuote ? chartLiveQuote?.ask : undefined,
        fallbackBid: latestChartClose,
        fallbackAsk: latestChartClose,
      }),
    [chartLiveQuote?.ask, chartLiveQuote?.bid, hasLiveChartQuote, latestChartClose],
  );
  const chartLivePriceLine = useMemo(() => {
    return hasLiveChartQuote &&
      typeof chartLiveQuote?.bid === 'number' &&
      Number.isFinite(chartLiveQuote.bid) &&
      chartLiveQuote.bid > 0
      ? chartLiveQuote.bid
      : null;
  }, [chartLiveQuote?.bid, hasLiveChartQuote]);
  // Trade P/L labels should follow the fresh quote feed even when candle
  // history is still catching up. Display precision stays guarded by
  // hasCoherentLiveChartQuote above so bad quote metadata cannot churn chart
  // rebuilds.
  const overlayLiveBid = useMemo(
    () => {
      const liveBid =
        hasLiveChartQuote &&
        typeof chartLiveQuote?.bid === 'number' &&
        Number.isFinite(chartLiveQuote.bid) &&
        chartLiveQuote.bid > 0
          ? chartLiveQuote.bid
          : null;
      if (liveBid !== null) {
        return liveBid;
      }

      return Number.isFinite(chartBid) && chartBid > 0 ? chartBid : null;
    },
    [chartBid, chartLiveQuote?.bid, hasLiveChartQuote],
  );
  const overlayLiveAsk = useMemo(
    () => {
      const liveAsk =
        hasLiveChartQuote &&
        typeof chartLiveQuote?.ask === 'number' &&
        Number.isFinite(chartLiveQuote.ask) &&
        chartLiveQuote.ask > 0
          ? chartLiveQuote.ask
          : null;
      if (liveAsk !== null) {
        return liveAsk;
      }

      return Number.isFinite(chartAsk) && chartAsk > 0 ? chartAsk : null;
    },
    [chartAsk, chartLiveQuote?.ask, hasLiveChartQuote],
  );
  const chartPointSize = useMemo(() => {
    if (displayDecimals <= 0) return 1;
    return Math.pow(10, -displayDecimals);
  }, [displayDecimals]);
  const chartPendingOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 250;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 1.5;
    return chartPointSize * 75;
  }, [baseSymbol, chartPointSize]);
  const chartStopOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 350;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 2;
    return chartPointSize * 90;
  }, [baseSymbol, chartPointSize]);
  const chartStopLimitOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 125;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 0.75;
    return Math.max(chartPointSize * 35, chartPendingOffset / 2);
  }, [baseSymbol, chartPendingOffset, chartPointSize]);
  const roundTradePrice = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return 0;
      return Number(value.toFixed(Math.max(displayDecimals, 0)));
    },
    [displayDecimals],
  );
  const resolveSingleChartPositionStopTarget = useCallback(() => {
    const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
    const latestPositions = usePositionsState.getState().positions;
    const seenPositionIds = new Set<string>();
    const matchingPositions = [...latestPositions, ...positions].filter((position) => {
      const positionId = String(position.id);
      if (seenPositionIds.has(positionId)) {
        return false;
      }
      seenPositionIds.add(positionId);
      return normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol;
    });

    return matchingPositions.length === 1 ? matchingPositions[0] : null;
  }, [chartSymbol, positions]);
  const chartTradePositionStopTarget = useMemo(
    () => resolveSingleChartPositionStopTarget(),
    [resolveSingleChartPositionStopTarget],
  );
  const resolveDefaultPendingPrice = useCallback(
    (orderType: ChartOrderType) => {
      const bid = chartBid > 0 ? chartBid : latestChartClose;
      const ask = chartAsk > 0 ? chartAsk : bid;
      switch (orderType) {
        case 'Buy Limit':
          return roundTradePrice(ask - chartPendingOffset);
        case 'Sell Limit':
          return roundTradePrice(bid + chartPendingOffset);
        case 'Buy Stop':
        case 'Buy Stop Limit':
          return roundTradePrice(ask + chartPendingOffset);
        case 'Sell Stop':
        case 'Sell Stop Limit':
          return roundTradePrice(bid - chartPendingOffset);
        default:
          return roundTradePrice(ask);
      }
    },
    [chartAsk, chartBid, chartPendingOffset, latestChartClose, roundTradePrice],
  );

  const injectChartScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script} true;`);
  }, []);

  const handleCommitTextLevelEdit = useCallback((recordId: string, text: string) => {
    setTextLevelEditRequest(null);
    injectChartScript(
      `if (typeof applyDrawingTextEdit === 'function') { applyDrawingTextEdit(${JSON.stringify(recordId)}, ${JSON.stringify(text)}); }`,
    );
  }, []);

  const handleCancelTextLevelEdit = useCallback((recordId: string) => {
    setTextLevelEditRequest(null);
    injectChartScript(
      `if (typeof cancelDrawingTextEdit === 'function') { cancelDrawingTextEdit(${JSON.stringify(recordId)}); }`,
    );
  }, []);

  const closeChartTapMenu = useCallback(() => {
    setChartTapMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (activeTool !== CHART_NO_DRAWING_TOOL) {
      closeChartTapMenu();
    }
  }, [activeTool, closeChartTapMenu]);

  useEffect(() => {
    closeChartTapMenu();
  }, [chartSymbol, chartTimeframe, chartVisualType, isChartExpanded, closeChartTapMenu]);

  const handleSetTool = (tool: string) => {
    closeChartTapMenu();
    const nextDrawingInputActive = !chartLockAll && isChartDrawingInputTool(tool);
    setActiveTool(tool);
    setChartDrawingInputActive(nextDrawingInputActive);
    injectChartScript(`setDrawingTool(${JSON.stringify(tool)}, { startDrawing: ${nextDrawingInputActive} });`);
  };

  const handleClearDrawings = () => {
    closeChartTapMenu();
    setActiveTool(CHART_NO_DRAWING_TOOL);
    setChartDrawingInputActive(false);
    allowNextEmptyDrawingSyncRef.current = true;
    hasAcceptedNonEmptyWebViewDrawingsRef.current = false;
    setChartDrawingRecordsForSymbol(chartSymbol, []);
    lastWebViewDrawingSignatureRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    injectChartScript('clearDrawings();');
  };

  const handleUndoDrawing = () => {
    closeChartTapMenu();
    allowNextEmptyDrawingSyncRef.current = true;
    injectChartScript('undoDrawingAction();');
  };

  const handleRedoDrawing = () => {
    closeChartTapMenu();
    allowNextEmptyDrawingSyncRef.current = true;
    injectChartScript('redoDrawingAction();');
  };

  const handleToggleStickyMode = () => {
    closeChartTapMenu();
    const next = !stickyDrawingMode;
    setStickyDrawingMode(next);
    injectChartScript(`setStayInDrawingMode(${next});`);
  };

  const handleToggleMagnetMode = () => {
    closeChartTapMenu();
    const next = !drawingMagnetMode;
    setDrawingMagnetMode(next);
    injectChartScript(`setDrawingMagnetMode(${next});`);
  };

  const handleToggleLock = () => {
    closeChartTapMenu();
    const next = !chartLockAll;
    setChartLockAll(next);
    if (next) {
      setActiveTool(CHART_NO_DRAWING_TOOL);
      setChartDrawingInputActive(false);
    }
    injectChartScript(`setDrawingsLocked(${next});`);
  };

  const handleToggleHide = () => {
    closeChartTapMenu();
    const next = !chartHideAll;
    setChartHideAll(next);
    injectChartScript(`setDrawingsHidden(${next});`);
  };

  const handleZoomTool = () => {
    closeChartTapMenu();
    injectChartScript('zoomChart();');
  };

  const handleToggleVerticalScrollingLock = () => {
    closeChartTapMenu();
    const next = !isVerticalScrollingLocked;
    setChartVerticalScrollingLocked(next);
    injectChartScript(`setVerticalScrollingLocked(${next});`);
  };

  const executeScrollToLastBar = useCallback(() => {
    injectChartScript(`
      try {
        if (typeof window.__rtx5ScrollToLastBar === 'function') {
          window.__rtx5ScrollToLastBar();
        } else if (chart && chart.timeScale && typeof chart.timeScale().scrollToRealTime === 'function') {
          chart.timeScale().scrollToRealTime();
        }
      } catch (_) {}
    `);
  }, [injectChartScript]);

  const handleScrollToLastBar = () => {
    runImmediateAction('chart.radial.scrollToLastBar', () => {
      hideActionSheet();
      closeChartTapMenu();
      executeScrollToLastBar();
    });
  };

  const executeResetVerticalScale = useCallback(() => {
    injectChartScript(`
      try {
        if (typeof window.__rtx5ResetPriceScale === 'function') {
          window.__rtx5ResetPriceScale();
        }
      } catch (_) {}
    `);
  }, [injectChartScript]);

  const handleResetVerticalScale = () => {
    runImmediateAction('chart.radial.resetVerticalScale', () => {
      hideActionSheet();
      closeChartTapMenu();
      executeResetVerticalScale();
    });
  };

  const handleToggleChartAutoScale = () => {
    runImmediateAction('chart.radial.toggleAutoScale', () => {
      hideActionSheet();
      closeChartTapMenu();
      const next = !isChartAutoScaleEnabled;
      setChartAutoScaleEnabled(next);
      injectChartScript(`setChartAutoScaleEnabled(${next});`);
    });
  };

  const handleToggleOneClickPanelAtBottom = () => {
    runImmediateAction('chart.radial.toggleOneClickPanelAtBottom', () => {
      hideActionSheet();
      closeChartTapMenu();
      setChartOneClickPanelAtBottom(!chartOneClickPanelAtBottom);
    });
  };

  const getChartDisplayActionEnabled = useCallback(
    (key: keyof ChartDisplaySettings) => {
      const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
      if (linkedShowOnChartKey) {
        return chartShowOnChart[linkedShowOnChartKey];
      }
      return Boolean(chartDisplay[key]);
    },
    [chartDisplay, chartShowOnChart],
  );

  const handleToggleChartDisplayAction = useCallback(
    (key: keyof ChartDisplaySettings) => {
      runImmediateAction(`chart.radial.toggleDisplay.${key}`, () => {
        hideActionSheet();
        closeChartTapMenu();
        const next = !getChartDisplayActionEnabled(key);
        setChartDisplaySetting(key, next);
        const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
        if (linkedShowOnChartKey) {
          setChartShowOnChartItem(linkedShowOnChartKey, next);
        }
      });
    },
    [
      closeChartTapMenu,
      getChartDisplayActionEnabled,
      hideActionSheet,
      setChartDisplaySetting,
      setChartShowOnChartItem,
    ],
  );

  const resolveChartTradeSheetTranslateY = useCallback(
    (mode: 'hidden' | 'collapsed' | 'expanded') => {
      if (mode === 'expanded') {
        return chartTradeSheetExpandedTranslateY;
      }
      if (mode === 'collapsed') {
        return chartTradeSheetCollapsedTranslateY;
      }
      return chartTradeSheetHiddenTranslateY;
    },
    [
      chartTradeSheetCollapsedTranslateY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
    ],
  );

  const finalizeChartTradeSheetHide = useCallback(() => {
    chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
    setChartTradeSheetMode('hidden');
    setShowChartTradeSheet(false);
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
  ]);

  const commitChartTradeSheetOffset = useCallback((offset: number) => {
    chartTradeSheetLastVisibleOffsetRef.current = offset;
    setChartTradeSheetMode(offset >= chartTradeSheetCollapsedTranslateY - 12 ? 'collapsed' : 'expanded');
  }, [chartTradeSheetCollapsedTranslateY]);

  const snapTradeSheet = useCallback((mode: 'hidden' | 'collapsed' | 'expanded') => {
    const target = resolveChartTradeSheetTranslateY(mode);
    chartTradeSheetDragStartY.value = target;

    if (mode === 'hidden') {
      if (!showChartTradeSheet) {
        finalizeChartTradeSheetHide();
        return;
      }

      chartTradeSheetTranslateY.value = withTiming(target, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(finalizeChartTradeSheetHide)();
        }
      });
      return;
    }

    if (!showChartTradeSheet) {
      chartTradeSheetTranslateY.value = mode === 'expanded' ? target : chartTradeSheetHiddenTranslateY;
      setShowChartTradeSheet(true);
    }

    chartTradeSheetLastVisibleOffsetRef.current = target;
    setChartTradeSheetMode(mode);
    requestAnimationFrame(() => {
      chartTradeSheetTranslateY.value = withSpring(target, {
        damping: 26,
        stiffness: 240,
        overshootClamping: true,
      });
    });
  }, [
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
    finalizeChartTradeSheetHide,
    resolveChartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const resolveChartTradeEntryPrice = useCallback((orderType: ChartOrderType) => {
    if (isPendingChartOrderType(orderType)) {
      return resolveDefaultPendingPrice(orderType);
    }
    const side = getChartOrderSide(orderType);
    return roundTradePrice(side === 'buy' ? chartAsk : chartBid);
  }, [chartAsk, chartBid, resolveDefaultPendingPrice, roundTradePrice]);

  const resetChartTradePanelLevels = useCallback((orderType: ChartOrderType = chartTradeOrderType) => {
    const positionTarget = isPendingChartOrderType(orderType) ? null : resolveSingleChartPositionStopTarget();
    const side = positionTarget?.side ?? getChartOrderSide(orderType);
    const entryPrice = positionTarget ? roundTradePrice(Number(positionTarget.openPrice)) : resolveChartTradeEntryPrice(orderType);
    const positionSl = Number(positionTarget?.sl);
    const positionTp = Number(positionTarget?.tp);
    const hasPositionSl = Number.isFinite(positionSl) && positionSl > 0;
    const hasPositionTp = Number.isFinite(positionTp) && positionTp > 0;
    setChartTradePrice(entryPrice);
    setChartTradeStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, entryPrice, chartStopLimitOffset, roundTradePrice),
    );
    setChartTradeSlEnabled(hasPositionSl);
    setChartTradeTpEnabled(hasPositionTp);
    setChartTradeSlPrice(hasPositionSl ? roundTradePrice(positionSl) : resolveTradeStopPreviewPrice('sl', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeTpPrice(hasPositionTp ? roundTradePrice(positionTp) : resolveTradeStopPreviewPrice('tp', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeComment('');
    setChartTradeCommentFocused(false);
  }, [
    chartStopLimitOffset,
    chartStopOffset,
    chartTradeOrderType,
    resolveChartTradeEntryPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
  ]);

  const openChartTradeSheet = useCallback((orderType: ChartOrderType = chartTradeOrderType) => {
    closeChartTapMenu();
    setFooterLotPickerMode(null);
    if (footerLotEditorFocused) {
      finishFooterLotEditor();
    } else {
      setFooterLotEditorOpening(false);
    }
    Keyboard.dismiss();
    setChartTradeOrderType(orderType);
    resetChartTradePanelLevels(orderType);
    snapTradeSheet('collapsed');
  }, [
    chartTradeOrderType,
    closeChartTapMenu,
    finishFooterLotEditor,
    footerLotEditorFocused,
    resetChartTradePanelLevels,
    snapTradeSheet,
  ]);

  const handleOpenChartTradeSheet = useCallback(() => {
    runImmediateAction('chart.tradeSheet.open', () => {
      openChartTradeSheet();
    });
  }, [openChartTradeSheet]);


  const scrollChartTradeTypeTabsToOrderType = useCallback((orderType: ChartOrderType, animated: boolean = true) => {
    const scrollListToOrderType = (
      scrollRef: React.RefObject<ScrollView | null>,
      layoutsRef: React.MutableRefObject<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>,
      viewportWidthRef: React.MutableRefObject<number>,
    ) => {
      const layout = layoutsRef.current[orderType];
      if (!layout || viewportWidthRef.current <= 0) {
        return;
      }

      const targetX = Math.max(0, layout.x - Math.max(16, (viewportWidthRef.current - layout.width) / 2));
      scrollRef.current?.scrollTo({ x: targetX, animated });
    };

    requestAnimationFrame(() => {
      scrollListToOrderType(
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsOverlayLayoutsRef,
        chartTradeTypeTabsOverlayViewportWidthRef,
      );
      scrollListToOrderType(
        chartTradeTypeTabsInlineScrollRef,
        chartTradeTypeTabsInlineLayoutsRef,
        chartTradeTypeTabsInlineViewportWidthRef,
      );
    });
  }, []);

  const handleChartTradeOrderTypeSelect = useCallback((orderType: ChartOrderType) => {
    runImmediateAction(`chart.tradeSheet.orderType.${orderType}`, () => {
      setChartTradeOrderType(orderType);
      const side = getChartOrderSide(orderType);
      const nextEntry = resolveChartTradeEntryPrice(orderType);
      setChartTradePrice(nextEntry);
      setChartTradeStopLimitPrice(
        resolveDefaultStopLimitPrice(orderType, nextEntry, chartStopLimitOffset, roundTradePrice),
      );
      setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', nextEntry, side, chartStopOffset, roundTradePrice));
      setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', nextEntry, side, chartStopOffset, roundTradePrice));
      // Don't force-expand on tab switch — keep the sheet at its current
      // snap position so the tabs stay in place and only the content changes.
      // Reset the scroll position so the new tab's content starts at the top.
      chartTradeSheetScrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  }, [chartStopLimitOffset, chartStopOffset, resolveChartTradeEntryPrice, roundTradePrice, chartTradeSheetScrollRef]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }

    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType, showChartTradeSheet]);

  const commitChartPositionStopLevels = useCallback(
    (positionId: string | number, requestedSlRaw: number, requestedTpRaw: number) => {
      const requestedSl = Number.isFinite(requestedSlRaw) && requestedSlRaw > 0 ? roundTradePrice(requestedSlRaw) : 0;
      const requestedTp = Number.isFinite(requestedTpRaw) && requestedTpRaw > 0 ? roundTradePrice(requestedTpRaw) : 0;
      const positionKey = String(positionId);
      const latestPositions = usePositionsState.getState().positions;
      const position = latestPositions.find((item) => String(item.id) === positionKey)
        ?? positions.find((item) => String(item.id) === positionKey);
      if (!position) {
        const feedback = createFrontendTradingError(
          'Position Not Found',
          'The selected position is no longer open. Refresh positions and try again.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return false;
      }

      const entryPrice = Number(position.openPrice);
      const validation = validateChartTradeProtectionLevels({
        side: position.side,
        entryPrice,
        slEnabled: requestedSl > 0,
        slPrice: requestedSl,
        tpEnabled: requestedTp > 0,
        tpPrice: requestedTp,
        pointSize: chartPointSize,
      });
      if (!validation.valid) {
        const feedback = createFrontendTradingError('Invalid SL/TP', validation.message);
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: position.side });
        return false;
      }

      const accountState = useUserPreferences.getState();
      if (!accountState.accountDetails?.credentials?.accessToken) {
        const feedback = createFrontendTradingError(
          'Sign In Required',
          'Please sign in to your trading account before modifying SL/TP.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return false;
      }

      const previousPosition = { ...position };
      const previousSl = Number(position.sl) > 0 ? Number(position.sl) : 0;
      const previousTp = Number(position.tp) > 0 ? Number(position.tp) : 0;
      if (requestedSl === previousSl && requestedTp === previousTp) {
        return true;
      }

      const applyLocalStopPatch = (sl: number, tp: number) => {
        const modifiedAt = Date.now();
        usePositionsState.setState((state) => {
          const snapshotBase = state.positionSnapshots[positionKey] ?? previousPosition;
          return {
            positions: state.positions.map((item) =>
              String(item.id) === positionKey
                ? { ...item, sl, tp, clientModifiedAt: modifiedAt }
                : item,
            ),
            positionSnapshots: {
              ...state.positionSnapshots,
              [positionKey]: {
                ...snapshotBase,
                sl,
                tp,
                clientModifiedAt: modifiedAt,
              },
            },
          };
        });
      };

      applyLocalStopPatch(requestedSl, requestedTp);

      void positionsApi
        .modifyPosition(position.id, {
          price_sl: requestedSl,
          price_tp: requestedTp,
        })
        .then((modifyResult) => {
          const readStopValue = (value: unknown, fallback: number) => {
            const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
            return Number.isFinite(parsed) ? parsed : fallback;
          };
          const result = modifyResult as any;
          applyLocalStopPatch(
            readStopValue(result?.price_sl ?? result?.sl, requestedSl),
            readStopValue(result?.price_tp ?? result?.tp, requestedTp),
          );
          if (accountLogin) {
            void refreshPositions(String(accountLogin));
          }
          void refetchAccountSummary();
        })
        .catch((error) => {
          usePositionsState.setState((state) => ({
            positions: state.positions.map((item) =>
              String(item.id) === positionKey ? previousPosition : item,
            ),
            positionSnapshots: {
              ...state.positionSnapshots,
              [positionKey]: previousPosition,
            },
          }));
          const feedback = classifyTradingError(error, { action: 'modify-position' });
          setTradeFeedback({
            visible: true,
            type: 'error',
            title: feedback.title,
            message: feedback.message,
          });
          if (accountLogin) {
            void refreshPositions(String(accountLogin));
          }
        });

      return true;
    },
    [accountLogin, chartPointSize, positions, refetchAccountSummary, refreshPositions, roundTradePrice],
  );

  const commitChartTradeSheetStopsForPosition = useCallback(
    (position: typeof chartTradePositionStopTarget, nextSl: number, nextTp: number) => {
      if (!position || isPendingChartOrderType(chartTradeOrderType)) {
        return;
      }
      commitChartPositionStopLevels(position.id, nextSl, nextTp);
    },
    [chartTradeOrderType, commitChartPositionStopLevels],
  );

  const handleEnableChartTradeStops = useCallback(() => {
    runImmediateAction('chart.tradeSheet.enableStops', () => {
      const positionTarget = isPendingChartOrderType(chartTradeOrderType) ? null : resolveSingleChartPositionStopTarget();
      const baseEntry = isPendingChartOrderType(chartTradeOrderType)
        ? chartTradePrice
        : positionTarget
          ? roundTradePrice(Number(positionTarget.openPrice))
          : resolveChartTradeEntryPrice(chartTradeOrderType);
      const side = positionTarget?.side ?? getChartOrderSide(chartTradeOrderType);
      const nextSl = chartTradeSlEnabled && chartTradeSlPrice > 0
        ? chartTradeSlPrice
        : resolveTradeStopPreviewPrice('sl', baseEntry, side, chartStopOffset, roundTradePrice);
      const nextTp = chartTradeTpEnabled && chartTradeTpPrice > 0
        ? chartTradeTpPrice
        : resolveTradeStopPreviewPrice('tp', baseEntry, side, chartStopOffset, roundTradePrice);
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextSl);
      setChartTradeTpEnabled(true);
      setChartTradeTpPrice(nextTp);
      setChartShowOnChartItem('slTpLevels', true);
      commitChartTradeSheetStopsForPosition(positionTarget, nextSl, nextTp);
      snapTradeSheet('expanded');
    });
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlPrice,
    chartTradeSlEnabled,
    chartTradeTpPrice,
    chartTradeTpEnabled,
    commitChartTradeSheetStopsForPosition,
    resolveChartTradeEntryPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
    setChartShowOnChartItem,
    snapTradeSheet,
  ]);

  const handleToggleChartTradeStopLevel = useCallback((kind: 'sl' | 'tp') => {
    const positionTarget = isPendingChartOrderType(chartTradeOrderType) ? null : resolveSingleChartPositionStopTarget();
    const baseEntry = isPendingChartOrderType(chartTradeOrderType)
      ? chartTradePrice
      : positionTarget
        ? roundTradePrice(Number(positionTarget.openPrice))
        : resolveChartTradeEntryPrice(chartTradeOrderType);
    const side = positionTarget?.side ?? getChartOrderSide(chartTradeOrderType);
    const nextPrice = resolveTradeStopPreviewPrice(kind, baseEntry, side, chartStopOffset, roundTradePrice);
    const currentSl = chartTradeSlEnabled && chartTradeSlPrice > 0 ? chartTradeSlPrice : 0;
    const currentTp = chartTradeTpEnabled && chartTradeTpPrice > 0 ? chartTradeTpPrice : 0;

    if (kind === 'sl') {
      if (chartTradeSlEnabled) {
        setChartTradeSlEnabled(false);
        commitChartTradeSheetStopsForPosition(positionTarget, 0, currentTp);
        return;
      }
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextPrice);
      setChartShowOnChartItem('slTpLevels', true);
      commitChartTradeSheetStopsForPosition(positionTarget, nextPrice, currentTp);
      return;
    }

    if (chartTradeTpEnabled) {
      setChartTradeTpEnabled(false);
      commitChartTradeSheetStopsForPosition(positionTarget, currentSl, 0);
      return;
    }
    setChartTradeTpEnabled(true);
    setChartTradeTpPrice(nextPrice);
    setChartShowOnChartItem('slTpLevels', true);
    commitChartTradeSheetStopsForPosition(positionTarget, currentSl, nextPrice);
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    commitChartTradeSheetStopsForPosition,
    resolveChartTradeEntryPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
    setChartShowOnChartItem,
  ]);
  const handleSubmitPendingTradeFromSheet = useCallback(() => {
    if (chartPendingOrderSubmitting) {
      return;
    }

    const submitPendingOrder = async () => {
      if (!isPendingChartOrderType(chartTradeOrderType)) {
        const feedback = createFrontendTradingError(
          'Order Type Error',
          'Select a pending order type before placing a pending order.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const side = getChartOrderSide(chartTradeOrderType);
      if (!isPendingChartTradeValid({
        orderType: chartTradeOrderType,
        entryPrice: chartTradePrice,
        stopLimitPrice: chartTradeStopLimitPrice,
        bid: chartBid,
        ask: chartAsk,
        pointSize: chartPointSize,
      })) {
        const feedback = createFrontendTradingError(
          'Invalid Pending Order',
          'Check the pending price and stop-limit price before placing the order.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const protectionValidation = validateChartTradeProtectionLevels({
        side,
        entryPrice: chartTradePrice,
        slEnabled: chartTradeSlEnabled,
        slPrice: chartTradeSlPrice,
        tpEnabled: chartTradeTpEnabled,
        tpPrice: chartTradeTpPrice,
        pointSize: chartPointSize,
      });
      if (!protectionValidation.valid) {
        const feedback = createFrontendTradingError('Invalid SL/TP', protectionValidation.message);
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side });
        return;
      }

      const accountState = useUserPreferences.getState();
      if (!accountState.accountDetails?.credentials?.accessToken) {
        const feedback = createFrontendTradingError(
          'Sign In Required',
          'Please sign in to your trading account before placing orders.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const tradingLogin = resolveTradingLogin();
      if (!tradingLogin) {
        const feedback = createFrontendTradingError(
          'No Trading Account',
          'No active trading account is selected. Open the account menu and choose one, then try again.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const volume = Number(tradeVolume);
      if (!Number.isFinite(volume) || volume <= 0) {
        const feedback = createFrontendTradingError(
          'Invalid Lot Size',
          `Volume must be greater than 0. Current: ${tradeVolume}`,
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const trimmedComment = chartTradeComment.trim();
      const payload = {
        account_login: tradingLogin,
        symbol: chartSymbol,
        side,
        volume,
        price: chartTradePrice,
        ...(isStopLimitChartOrderType(chartTradeOrderType) && chartTradeStopLimitPrice > 0
          ? { stopLimitPrice: chartTradeStopLimitPrice }
          : {}),
        ...(chartTradeSlEnabled && chartTradeSlPrice > 0 ? { price_sl: chartTradeSlPrice } : {}),
        ...(chartTradeTpEnabled && chartTradeTpPrice > 0 ? { price_tp: chartTradeTpPrice } : {}),
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        type: chartTradeOrderType.toLowerCase().replace(/\s+/g, '_'),
      };

      setChartPendingOrderSubmitting(true);
      try {
        const data = await ordersApi.placePendingOrder(payload);
        if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
          const feedback = classifyTradingError(
            { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
            { action: 'place-order' },
          );
          handleChartTradeResult({
            visible: true,
            type: 'error',
            title: feedback.title,
            message: feedback.message,
            side,
          });
          return;
        }

        await Promise.allSettled([
          refetchOrders(),
          refetchAccountSummary(),
          refreshPositions(String(tradingLogin)),
        ]);

        handleChartTradeResult({
          visible: true,
          type: 'success',
          side,
          symbol: chartSymbol,
          ticket: String(data.ticket ?? data.order_ticket ?? data.position_ticket ?? 'Confirmed'),
          price: Number(data.price_open ?? data.price ?? chartTradePrice),
          volume,
          executedAt: new Date().toLocaleTimeString(),
        });
        snapTradeSheet('collapsed');
      } catch (error: any) {
        const feedback = classifyTradingError(error, { action: 'place-order' });
        const rawMsg = error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || '';
        handleChartTradeResult({
          visible: true,
          type: 'error',
          title: feedback.title,
          message: rawMsg ? `${feedback.message}\n\nServer: ${rawMsg}` : feedback.message,
          side,
        });
      } finally {
        setChartPendingOrderSubmitting(false);
      }
    };

    runImmediateAction('chart.tradeSheet.pending.submit', () => {
      void submitPendingOrder();
    });
  }, [
    chartAsk,
    chartBid,
    chartPendingOrderSubmitting,
    chartPointSize,
    chartSymbol,
    chartTradeComment,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    handleChartTradeResult,
    refetchAccountSummary,
    refetchOrders,
    refreshPositions,
    snapTradeSheet,
    tradeVolume,
  ]);
  const handleToggleChartTradeSheetMode = useCallback(() => {
    snapTradeSheet(chartTradeSheetMode === 'expanded' ? 'collapsed' : 'expanded');
  }, [chartTradeSheetMode, snapTradeSheet]);
  const chartTradeExpirationActions = useMemo(
    () => [
      {
        icon: <Ionicons name="infinite-outline" size={20} color={TEXT_MUTED} />,
        label: t('GTC'),
        onPress: () => setChartTradeExpiration('GTC'),
      },
      {
        icon: <Ionicons name="today-outline" size={20} color={TEXT_MUTED} />,
        label: t('Today'),
        onPress: () => setChartTradeExpiration('Today'),
      },
      {
        icon: <Ionicons name="time-outline" size={20} color={TEXT_MUTED} />,
        label: t('Date and Time'),
        onPress: () => setChartTradeExpiration('Date and Time'),
      },
      {
        icon: <Ionicons name="calendar-outline" size={20} color={TEXT_MUTED} />,
        label: t('Date'),
        onPress: () => setChartTradeExpiration('Date'),
      },
    ],
    [TEXT_MUTED, t],
  );
  const handleOpenChartExpirationMenu = useCallback(() => {
    runImmediateAction('chart.tradeSheet.expiration.open', () => {
      setFooterLotPickerMode(null);
      setChartTradeCommentFocused(false);
      Keyboard.dismiss();
      showChartActionSheet({
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'auto',
        instantOpen: true,
        runActionAfterClose: false,
        actions: chartTradeExpirationActions,
      });
    });
  }, [chartTradeExpirationActions, showChartActionSheet]);
  const handleFocusChartTradeComment = useCallback(() => {
    runImmediateAction('chart.tradeSheet.comment.focus', () => {
      if (chartTradeSheetMode !== 'expanded') {
        snapTradeSheet('expanded');
      }
      setChartTradeCommentFocused(true);
    });
  }, [chartTradeSheetMode, snapTradeSheet]);
  const handleBlurChartTradeComment = useCallback(() => {
    if (chartTradeCommentSubmitIntentRef.current) {
      chartTradeCommentSubmitIntentRef.current = false;
      return;
    }

    if (Platform.OS === 'android' && showChartTradeSheet) {
      requestAnimationFrame(() => {
        chartTradeCommentInputRef.current?.focus();
      });
      return;
    }

    setChartTradeCommentFocused(false);
  }, [showChartTradeSheet]);
  const handleSubmitChartTradeComment = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = false;
    const nextComment = chartTradeComment.trim();
    if (nextComment !== chartTradeComment) {
      setChartTradeComment(nextComment);
    }
    setChartTradeCommentFocused(false);
    Keyboard.dismiss();
  }, [chartTradeComment]);
  const handlePrepareChartTradeCommentSubmit = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = true;
  }, []);
  const handleChangeChartTradeComment = useCallback((text: string) => {
    setChartTradeComment(text.slice(0, 50));
  }, []);
  const handleChartTradeSheetScroll = useCallback((offsetY: number) => {
    chartTradeSheetScrollOffsetRef.current = offsetY;
  }, []);
  const handleOverlayTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsOverlayViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleInlineTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsInlineViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleOverlayTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsOverlayLayoutsRef.current[orderType] = layout;
  }, []);
  const handleInlineTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsInlineLayoutsRef.current[orderType] = layout;
  }, []);
  const handleOpenChartTradeVolumeStepper = useCallback(() => {
    setChartTradeVolumeInputFocused(false);
    const nextDraft = resolveFooterLotCommitDraftValue({
      draftRef: chartTradeVolumeDraftRef.current,
      currentDraft: chartTradeVolumeDraft,
    });
    if (nextDraft.trim()) {
      updateTradeVolume(nextDraft);
    }
    runImmediateAction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
  }, [chartTradeVolumeDraft, updateTradeVolume]);
  const handleFocusChartTradeVolumeInput = useCallback(() => {
    setChartTradeVolumeDraftValue(formatTradeVolume(tradeVolume, tradeVolumeBounds));
    setChartTradeVolumeInputFocused(true);
  }, [setChartTradeVolumeDraftValue, tradeVolume, tradeVolumeBounds]);
  const handleChartTradeVolumeDraftChange = useCallback((text: string) => {
    setChartTradeVolumeDraftValue(sanitizeTradeVolumeDraft(text));
  }, [setChartTradeVolumeDraftValue]);
  const commitChartTradeVolumeDraft = useCallback((draftOverride?: string) => {
    const nextDraft = resolveFooterLotCommitDraftValue({
      draftOverride,
      draftRef: chartTradeVolumeDraftRef.current,
      currentDraft: chartTradeVolumeDraft,
    });
    if (!nextDraft.trim()) {
      const latestVolume = useUserPreferences.getState().tradeVolume;
      setChartTradeVolumeDraftValue(formatTradeVolume(latestVolume, tradeVolumeBounds));
      return;
    }
    updateTradeVolume(nextDraft);
  }, [chartTradeVolumeDraft, setChartTradeVolumeDraftValue, tradeVolumeBounds, updateTradeVolume]);
  const handleBlurChartTradeVolumeDraft = useCallback(() => {
    commitChartTradeVolumeDraft();
    setChartTradeVolumeInputFocused(false);
  }, [commitChartTradeVolumeDraft]);
  const handleEndChartTradeVolumeDraft = useCallback((event: TextInputCommitEvent) => {
    commitChartTradeVolumeDraft(event.nativeEvent.text);
  }, [commitChartTradeVolumeDraft]);
  const handleSubmitChartTradeVolumeDraft = useCallback((event?: TextInputCommitEvent) => {
    commitChartTradeVolumeDraft(event?.nativeEvent.text);
    setChartTradeVolumeInputFocused(false);
  }, [commitChartTradeVolumeDraft]);
  const handleOpenChartTradePriceStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
  }, []);
  const handleOpenChartTradeStopLimitPriceStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () => setChartStepperEditor({ kind: 'stopLimitPrice' }));
  }, []);
  const handleSelectChartTradeStopUnit = useCallback((unit: 'Price' | 'Pips' | 'Currency') => {
    runImmediateAction(`chart.tradeSheet.stopUnit.${unit}`, () => setChartTradeStopUnit(unit));
  }, []);
  const handleOpenChartTradeSlStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }));
  }, []);
  const handleOpenChartTradeTpStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }));
  }, []);
  const handleToggleChartTradeSlLock = useCallback(() => {
    runImmediateAction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((value) => !value));
  }, []);
  const handleToggleChartTradeTpLock = useCallback(() => {
    runImmediateAction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((value) => !value));
  }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const scheduleKeyboardLayoutAnimation =
      (Keyboard as typeof Keyboard & { scheduleLayoutAnimation?: (event: unknown) => void }).scheduleLayoutAnimation;

    const showSub = Keyboard.addListener(showEvent, (event) => {
      // Let the keyboard layout animation run so a keyboard-driven resize glides.
      scheduleKeyboardLayoutAnimation?.(event);
      // When a global action sheet (e.g. the symbol picker's search field) owns
      // the keyboard, stop here. The chart's own keyboardVisibleHeight reflow +
      // dock-offset remeasure run on the same frame the sheet resizes to clear
      // the keyboard and shove the layout under the sheet — the focus-time jump.
      const ui = useUIState.getState();
      const actionSheetOwnsKeyboard =
        ui.actionSheet !== null ||
        (ui.actionSheetScope != null && ui.scopedActionSheets[ui.actionSheetScope] !== null);
      if (actionSheetOwnsKeyboard) {
        return;
      }
      const nextHeight = Math.max(0, event.endCoordinates.height);
      keyboardFrameRef.current = {
        height: nextHeight,
        screenY: typeof event.endCoordinates.screenY === 'number' ? event.endCoordinates.screenY : null,
      };
      setKeyboardVisibleHeight(nextHeight);
      setFooterLotEditorOpening(false);
      measureKeyboardDockAnchors(() => {
        recomputeKeyboardDockOffset(keyboardFrameRef.current);
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (event) {
        scheduleKeyboardLayoutAnimation?.(event);
      }
      keyboardFrameRef.current = { height: 0, screenY: null };
      setKeyboardVisibleHeight(0);
      setKeyboardDockOffset(0);
      setFooterLotEditorOpening(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [measureKeyboardDockAnchors, recomputeKeyboardDockOffset]);
  useEffect(() => {
    if (!chartTradeCommentFocused || !showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chartTradeCommentInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTradeCommentFocused, showChartTradeSheet]);

  useEffect(() => {
    if (!footerLotEditorFocused || showChartTradeSheet) {
      return;
    }
    let cancelled = false;
    let frame: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 8;

    const focusLotInput = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      footerLotEditorInputRef.current?.focus();
      syncKeyboardHeightFromMetrics();

      if (attempts < maxAttempts) {
        timeoutId = setTimeout(focusLotInput, 80);
      }
    };

    frame = requestAnimationFrame(() => {
      requestAnimationFrame(focusLotInput);
    });

    return () => {
      cancelled = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [footerLotEditorFocused, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorOpening ||
      showChartTradeSheet
    ) {
      return;
    }

    if (keyboardVisibleHeight > 0 || keyboardDockOffset > 0) {
      setFooterLotEditorOpening(false);
    }
  }, [footerLotEditorOpening, keyboardDockOffset, keyboardVisibleHeight, showChartTradeSheet]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardDockOffset > 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilKeyboardVisible = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (metrics.dockOffset > 0 || metrics.height > 0 || attempts >= 24 || cancelled) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilKeyboardVisible);
      });
    };

    rafId = requestAnimationFrame(syncUntilKeyboardVisible);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [footerLotEditorFocused, keyboardDockOffset, measureKeyboardDockAnchors, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardVisibleHeight <= 0 ||
      keyboardDockOffset <= 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilDockSettles = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (cancelled || metrics.dockOffset <= 0 || attempts >= 16) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilDockSettles);
      });
    };

    rafId = requestAnimationFrame(syncUntilDockSettles);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    footerLotEditorFocused,
    keyboardDockOffset,
    keyboardVisibleHeight,
    measureKeyboardDockAnchors,
    showChartTradeSheet,
    syncKeyboardHeightFromMetrics,
  ]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      footerLotEditorOpening ||
      showChartTradeSheet ||
      keyboardVisibleHeight > 0 ||
      keyboardDockOffset > 0
    ) {
      return;
    }

    finishFooterLotEditor();
  }, [
    finishFooterLotEditor,
    footerLotEditorFocused,
    footerLotEditorOpening,
    keyboardDockOffset,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  useEffect(() => {
    if (!footerLotEditorFocused || showChartTradeSheet) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      chartScrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [footerLotEditorFocused, keyboardVisibleHeight, showChartTradeSheet]);

  useEffect(() => {
    if (showChartTradeSheet) {
      setFooterLotPickerMode(null);
      setFooterLotEditorFocused(false);
      setFooterLotEditorOpening(false);
      return;
    }
    setChartTradeCommentFocused(false);
    chartTradeCommentSubmitIntentRef.current = false;
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      chartTradeSheetScrollOffsetRef.current = 0;
      chartTradeSheetScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet || chartTradeSheetMode === 'hidden') {
      chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
      chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
      chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
      return;
    }

    const nextTranslateY = Math.min(
      chartTradeSheetCollapsedTranslateY,
      Math.max(chartTradeSheetExpandedTranslateY, chartTradeSheetLastVisibleOffsetRef.current),
    );
    chartTradeSheetTranslateY.value = nextTranslateY;
    chartTradeSheetDragStartY.value = nextTranslateY;
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetExpandedTranslateY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetMode,
    chartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const chartTradeSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chartTradeSheetTranslateY.value }],
  }));

  const chartTradeSheetDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-4, 4])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        })
        .onUpdate((event) => {
          chartTradeSheetTranslateY.value = Math.min(
            chartTradeSheetHiddenTranslateY,
            Math.max(
              chartTradeSheetExpandedTranslateY,
              chartTradeSheetDragStartY.value + event.translationY,
            ),
          );
        })
        .onEnd((event) => {
          const current = chartTradeSheetTranslateY.value;
          const hideOffsetThreshold = chartTradeSheetCollapsedTranslateY + 24;

          if (
            current > hideOffsetThreshold ||
            (event.velocityY > 900 && current > chartTradeSheetCollapsedTranslateY - 6)
          ) {
            runOnJS(snapTradeSheet)('hidden');
            return;
          }

          const restingOffset = Math.min(
            chartTradeSheetCollapsedTranslateY,
            Math.max(chartTradeSheetExpandedTranslateY, current),
          );

          chartTradeSheetTranslateY.value = withSpring(restingOffset, {
            damping: 28,
            stiffness: 260,
            overshootClamping: true,
          });
          chartTradeSheetDragStartY.value = restingOffset;
          runOnJS(commitChartTradeSheetOffset)(restingOffset);
        })
        .onFinalize(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        }),
    [
      chartTradeSheetCollapsedTranslateY,
      commitChartTradeSheetOffset,
      chartTradeSheetCollapsedTranslateY,
      chartTradeSheetDragStartY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
      chartTradeSheetTranslateY,
      snapTradeSheet,
    ],
  );

  const isPendingChartOrder = isPendingChartOrderType(chartTradeOrderType);
  // Keep one stable sheet shell across Market Execution and every pending tab.
  // Only the order-specific content should change when the user switches tabs.
  const useMtPendingTradeSheetLayout = false;
  const isStopLimitChartOrder = isStopLimitChartOrderType(chartTradeOrderType);
  // Keep auxiliary order metadata visible on every chart trade tab so
  // Market Execution and all pending-order variants share one consistent form.
  const showChartTradeExpiration = true;
  const showChartTradeComment = true;
  const chartTradeSheetSide = getChartOrderSide(chartTradeOrderType);
  const chartTradeEntryPrice = isPendingChartOrder
    ? chartTradePrice
    : chartTradeSheetSide === 'buy'
      ? chartAsk
      : chartBid;
  const chartTradeProtectionValidation = useMemo(() => validateChartTradeProtectionLevels({
    side: chartTradeSheetSide,
    entryPrice: chartTradeEntryPrice,
    slEnabled: chartTradeSlEnabled,
    slPrice: chartTradeSlPrice,
    tpEnabled: chartTradeTpEnabled,
    tpPrice: chartTradeTpPrice,
    pointSize: chartPointSize,
  }), [
    chartPointSize,
    chartTradeEntryPrice,
    chartTradeSheetSide,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
  ]);
  const [stablePendingTradePlaceButtonEnabled, setStablePendingTradePlaceButtonEnabled] = useState(true);
  const pendingTradeValidationConfigKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPendingChartOrder) {
      pendingTradeValidationConfigKeyRef.current = null;
      setStablePendingTradePlaceButtonEnabled(true);
      return;
    }

    const nextConfigKey = `${chartTradeOrderType}:${chartTradePrice}:${chartTradeStopLimitPrice}`;
    const shouldResetFromRawValidity = pendingTradeValidationConfigKeyRef.current !== nextConfigKey;
    const rawValidity = isPendingChartTradeValid({
      orderType: chartTradeOrderType,
      entryPrice: chartTradePrice,
      stopLimitPrice: chartTradeStopLimitPrice,
      bid: chartBid,
      ask: chartAsk,
      pointSize: chartPointSize,
    });

    setStablePendingTradePlaceButtonEnabled((previouslyEnabled) =>
      resolveStablePendingChartTradeEnabled({
        orderType: chartTradeOrderType,
        entryPrice: chartTradePrice,
        stopLimitPrice: chartTradeStopLimitPrice,
        bid: chartBid,
        ask: chartAsk,
        pointSize: chartPointSize,
        previouslyEnabled: shouldResetFromRawValidity ? rawValidity : previouslyEnabled,
      }),
    );

    pendingTradeValidationConfigKeyRef.current = nextConfigKey;
  }, [
    chartAsk,
    chartBid,
    chartPointSize,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeStopLimitPrice,
    isPendingChartOrder,
  ]);

  const disablePendingTradePlaceButton = isPendingChartOrder
    ? chartPendingOrderSubmitting
      || !stablePendingTradePlaceButtonEnabled
      || !chartTradeProtectionValidation.valid
    : false;
  const chartTradeCtaColor = chartTradeSheetSide === 'buy' ? BLUE : T.trading.sell.primary;
  const chartTradeMarginPerLot = useMemo(() => {
    const leverage = accountSummary?.leverage || 100;
    const contractSize = getChartTradeContractSize(chartSymbol);
    const referencePrice = chartTradeEntryPrice > 0 ? chartTradeEntryPrice : chartAsk;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      return 0;
    }
    return (contractSize * referencePrice) / leverage;
  }, [accountSummary?.leverage, chartAsk, chartSymbol, chartTradeEntryPrice]);
  const chartTradeMarginEstimate = useMemo(() => {
    if (!Number.isFinite(chartTradeMarginPerLot) || chartTradeMarginPerLot <= 0) {
      return 0;
    }
    return tradeVolume * chartTradeMarginPerLot;
  }, [chartTradeMarginPerLot, tradeVolume]);
  const applyChartTradePreviewDragPrice = useCallback(
    (dragKey: ChartTradePreviewDragKey, rawPrice: number) => {
      if (!showChartTradeSheet || !Number.isFinite(rawPrice) || rawPrice <= 0) {
        return;
      }

      const nextPrice = roundTradePrice(rawPrice);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      switch (dragKey) {
        case 'entry':
          if (!isPendingChartOrder) {
            return;
          }
          setChartTradePrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'stopLimit':
          if (!isStopLimitChartOrder) {
            return;
          }
          setChartTradeStopLimitPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'sl':
          if (!chartTradeSlEnabled) {
            return;
          }
          setChartTradeSlPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'tp':
          if (!chartTradeTpEnabled) {
            return;
          }
          setChartTradeTpPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
      }
    },
    [
      chartTradeSlEnabled,
      chartTradeTpEnabled,
      isPendingChartOrder,
      isStopLimitChartOrder,
      roundTradePrice,
      showChartTradeSheet,
    ],
  );
  const commitChartPositionStopDrag = useCallback(
    (target: ChartPositionStopDragTarget, rawPrice: number) => {
      const nextPrice = roundTradePrice(rawPrice);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      const latestPositions = usePositionsState.getState().positions;
      const position = latestPositions.find((item) => String(item.id) === target.positionId)
        ?? positions.find((item) => String(item.id) === target.positionId);
      if (!position) {
        const feedback = createFrontendTradingError(
          'Position Not Found',
          'The selected position is no longer open. Refresh positions and try again.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const previousSl = Number(position.sl) > 0 ? Number(position.sl) : 0;
      const previousTp = Number(position.tp) > 0 ? Number(position.tp) : 0;
      const requestedSl = target.kind === 'sl' ? nextPrice : previousSl;
      const requestedTp = target.kind === 'tp' ? nextPrice : previousTp;
      commitChartPositionStopLevels(position.id, requestedSl, requestedTp);
    },
    [commitChartPositionStopLevels, positions, roundTradePrice],
  );
  const handleChartPositionStopDragMessage = useCallback(
    (msg: any) => {
      const target = parseChartPositionStopDragKey(msg?.dragKey);
      if (!target) {
        return false;
      }

      if (msg?.phase === 'start') {
        closeChartTapMenu();
      }

      const phase = msg?.phase;
      if (phase !== 'start' && phase !== 'move' && phase !== 'end') {
        return true;
      }

      const nextPrice = typeof msg?.price === 'number' ? msg.price : NaN;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return true;
      }

      if (String(chartTradePositionStopTarget?.id) === target.positionId) {
        if (target.kind === 'sl') {
          setChartTradeSlEnabled(true);
          setChartTradeSlPrice(roundTradePrice(nextPrice));
        } else {
          setChartTradeTpEnabled(true);
          setChartTradeTpPrice(roundTradePrice(nextPrice));
        }
      }

      if (phase === 'end') {
        commitChartPositionStopDrag(target, nextPrice);
      }

      return true;
    },
    [chartTradePositionStopTarget?.id, closeChartTapMenu, commitChartPositionStopDrag, roundTradePrice],
  );
  const handleChartTradePreviewDragMessage = useCallback(
    (msg: any) => {
      const dragKey = msg?.dragKey;
      if (dragKey !== 'entry' && dragKey !== 'stopLimit' && dragKey !== 'sl' && dragKey !== 'tp') {
        return;
      }

      if (msg?.phase === 'start') {
        closeChartTapMenu();
      }

      const nextPrice = typeof msg?.price === 'number' ? msg.price : NaN;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      const phase = msg?.phase;
      if (phase !== 'start' && phase !== 'move' && phase !== 'end') {
        return;
      }

      applyChartTradePreviewDragPrice(dragKey, nextPrice);
    },
    [applyChartTradePreviewDragPrice, closeChartTapMenu],
  );
  const accountFreeMargin = Number((accountSummary as any)?.freeMargin ?? (accountSummary as any)?.free_margin ?? 0);
  const accountBalance = Number(liveAccountBalance > 0 ? liveAccountBalance : ((accountSummary as any)?.balance ?? 0));
  const chartTradeMaxVolume = useMemo(
    () => resolveMaxTradeVolumeForMargin(accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds),
    [accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds],
  );
  const chartTradeMaxVolumeDisplay = useMemo(
    () => (chartTradeMaxVolume > 0 ? formatLooseTradeVolumeLabel(chartTradeMaxVolume, tradeVolumeBounds) : '0'),
    [chartTradeMaxVolume, tradeVolumeBounds],
  );
  // The comment editor is always inline inside the trade sheet ScrollView.
  // No floating/detached comment editor – the ScrollView auto-scrolls to
  // keep the focused TextInput visible, and keyboard compensation keeps
  // the trade sheet at its full height on Android.
  const showFloatingChartTradeCommentEditor = false;
  const floatingChartTradeCommentOffset = 0;
  // On Android with adjustResize, the window shrinks when the keyboard opens.
  // The host-height freeze activates predictively (as soon as the user focuses
  // a TextInput) so the onLayout handler rejects the smaller height BEFORE the
  // window actually shrinks. This keeps chartTradeSheetHostHeight stable.
  const shouldFreezeChartTradeSheetHostHeight =
    Platform.OS === 'android' &&
    showChartTradeSheet &&
    (chartTradeCommentFocused || footerLotEditorFocused || keyboardVisibleHeight > 0);
  const shouldFreezeFooterLotChartViewport =
    Platform.OS === 'android' &&
    !showChartTradeSheet &&
    (footerLotEditorFocused || footerLotEditorOpening || keyboardVisibleHeight > 0);
  const shouldFreezeChartViewportResize =
    shouldFreezeChartTradeSheetHostHeight || shouldFreezeFooterLotChartViewport;
  // When the keyboard is visible and the freeze is active, give the overlay
  // layer an explicit fixed height equal to the frozen host height. This
  // makes the layer independent of parent bounds (which shrink due to
  // adjustResize). When the keyboard is not visible, use 0 to signal
  // "use absoluteFillObject as normal".
  const chartTradeSheetFrozenLayerHeight =
    Platform.OS === 'android' && shouldFreezeChartTradeSheetHostHeight && resolvedChartTradeSheetHostHeight > 0
      ? resolvedChartTradeSheetHostHeight
      : 0;
  const chartTradeSheetFooterDockReserve = 0;
  const chartTradeSheetContentBottomPadding = (
    safeInsets.bottom +
    chartTradeSheetFooterDockReserve +
    (keyboardInset > 0 ? keyboardInset + 16 : 14)
  );
  const {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  } = resolveFooterTradeRowState({
    platform: Platform.OS,
    footerLotEditorFocused,
    footerLotEditorOpening,
    showChartTradeSheet,
    keyboardVisibleHeight,
    keyboardDockOffset,
    keyboardResizesHost: androidFooterHostResizedForKeyboard,
  });
  const shouldHideChartTabBarForInlineInput = shouldHideChartTabBarForTradeInput({
    showChartTradeSheet,
    chartTradeCommentFocused,
  });
  const floatingFooterTradeReserveHeight = useSharedValue(0);
  const floatingFooterTradeReserveAnimatedStyle = useAnimatedStyle(() => ({
    minHeight: floatingFooterTradeReserveHeight.value,
  }));
  const frozenFooterLotChartViewportStyle =
    shouldFreezeFooterLotChartViewport && chartTapMenuBounds.height > 0
      ? { minHeight: chartTapMenuBounds.height }
      : null;
  const accountCurrency = accountSummary?.currency || 'USD';
  const isChartTradeMarginMode = chartTradeVolumeDisplayMode === 'margin';
  const chartTradeVolumePrimaryDisplay = isChartTradeMarginMode
    ? `${fmt.price(chartTradeMarginEstimate)} ${accountCurrency}`
    : passiveLotDisplay;
  const chartTradeVolumeModeLabel = isChartTradeMarginMode ? 'Margin' : 'Lots';
  const handleToggleChartTradeVolumeDisplayMode = useCallback(() => {
    runImmediateAction('chart.tradeSheet.volumeDisplay.toggle', () => {
      const nextMode: ChartTradeVolumeDisplayMode =
        chartTradeVolumeDisplayMode === 'margin'
          ? 'lots'
          : 'margin';
      setChartTradeVolumeDisplayMode(nextMode);
    });
  }, [chartTradeVolumeDisplayMode, setChartTradeVolumeDisplayMode]);
  const chartTradeStopUnitOptions = useMemo(() => {
    if (!isPendingChartOrder) {
      return [
        { key: 'Price' as const, label: 'Price' },
        { key: 'Pips' as const, label: 'Pips' },
      ];
    }

    return [
      { key: 'Price' as const, label: 'Price' },
      { key: 'Pips' as const, label: 'Pips' },
      { key: 'Currency' as const, label: 'Currency' },
    ];
  }, [isPendingChartOrder]);
  useEffect(() => {
    if (!isPendingChartOrder && chartTradeStopUnit === 'Currency') {
      setChartTradeStopUnit('Price');
    }
  }, [chartTradeStopUnit, isPendingChartOrder]);
  useEffect(() => {
    if (!showChartTradeComment) {
      setChartTradeCommentFocused(false);
      chartTradeCommentSubmitIntentRef.current = false;
    }
  }, [showChartTradeComment]);
  // When expiration visibility toggles off (e.g. order type changed), no need
  // to call hideActionSheet() — the global sheet manages its own lifecycle.
  useEffect(() => {
    setChartInlineInputActive(shouldHideChartTabBarForInlineInput);
    return () => {
      setChartInlineInputActive(false);
    };
  }, [setChartInlineInputActive, shouldHideChartTabBarForInlineInput]);
  useEffect(() => {
    setChartTabBarKeyboardLift(chartTabBarKeyboardLift);
    return () => {
      setChartTabBarKeyboardLift(0);
    };
  }, [chartTabBarKeyboardLift, setChartTabBarKeyboardLift]);
  useEffect(() => {
    floatingFooterTradeReserveHeight.value = withTiming(
      isFloatingFooterTradeRowVisible ? CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT : 0,
      {
        duration: 220,
      },
    );
  }, [floatingFooterTradeReserveHeight, isFloatingFooterTradeRowVisible]);
  const showChartTradePreviewLinesOnChart = shouldShowChartTradePreviewOnChart({
    showChartTradeSheet,
    chartTradeSheetMode,
  });
  const showChartTradeSheetHeader = shouldShowChartTradeSheetHeader({
    chartTradeSheetMode,
  });
  const showChartTradeStopLabelsOnChart = showChartTradePreviewLinesOnChart;
  const chartTradePreviewEntryLabel = useMemo(() => {
    if (!showChartTradePreviewLinesOnChart || !isPendingChartOrder) {
      return '';
    }

    return `${chartTradeOrderType.toUpperCase()} ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`.trim();
  }, [chartTradeOrderType, isPendingChartOrder, showChartTradePreviewLinesOnChart, tradeVolume, tradeVolumeBounds]);
  const chartTradePreviewLines = useMemo<ChartOverlayPriceLine[]>(() => {
    if (!showChartTradePreviewLinesOnChart) {
      return [];
    }

    const entryPrice = chartTradeEntryPrice;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return [];
    }

    const previewLines: ChartOverlayPriceLine[] = [];
    const contractSize = getChartTradeContractSize(chartSymbol);
    const pendingEntryColor = isDark ? '#94A3B8' : '#475569';
    const pointsFor = (targetPrice: number) => Math.max(1, Math.round(Math.abs(targetPrice - entryPrice) / chartPointSize));
    const usdFor = (targetPrice: number) => Math.abs(targetPrice - entryPrice) * contractSize * tradeVolume;
    const renderPositionStopsFromOpenPosition = !isPendingChartOrder && chartTradePositionStopTarget !== null;
    const chartTradeSlDragKey = chartTradePositionStopTarget
      ? buildChartPositionStopDragKey(chartTradePositionStopTarget.id, 'sl')
      : 'sl';
    const chartTradeTpDragKey = chartTradePositionStopTarget
      ? buildChartPositionStopDragKey(chartTradePositionStopTarget.id, 'tp')
      : 'tp';

    if (isPendingChartOrderType(chartTradeOrderType)) {
      previewLines.push({
        id: 'chart-trade-entry-preview',
        price: entryPrice,
        color: pendingEntryColor,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: chartTradePreviewEntryLabel,
        dragKey: 'entry',
      });
    }

    if (isStopLimitChartOrder && Number.isFinite(chartTradeStopLimitPrice) && chartTradeStopLimitPrice > 0) {
      previewLines.push({
        id: 'chart-trade-stop-limit-preview',
        price: chartTradeStopLimitPrice,
        color: BLUE,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? `STOP LIMIT ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`
          : '',
        dragKey: 'stopLimit',
      });
    }

    if (!renderPositionStopsFromOpenPosition && chartTradeTpEnabled && Number.isFinite(chartTradeTpPrice) && chartTradeTpPrice > 0) {
      previewLines.push({
        id: 'chart-trade-tp-preview',
        price: chartTradeTpPrice,
        color: resolvedChartColors.tradeTpSl || '#089981',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? `TP, + ${usdFor(chartTradeTpPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeTpPrice)} points`
          : '',
        labelPlacement: 'line',
        dragKey: chartTradeTpDragKey,
      });
    }

    if (!renderPositionStopsFromOpenPosition && chartTradeSlEnabled && Number.isFinite(chartTradeSlPrice) && chartTradeSlPrice > 0) {
      previewLines.push({
        id: 'chart-trade-sl-preview',
        price: chartTradeSlPrice,
        color: resolvedChartColors.tradeStopOut || '#F23645',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? `SL, - ${usdFor(chartTradeSlPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeSlPrice)} points`
          : '',
        labelPlacement: 'line',
        dragKey: chartTradeSlDragKey,
      });
    }

    return previewLines;
  }, [
    BLUE,
    T.trading.sell.primary,
    accountCurrency,
    chartPointSize,
    chartTradePreviewEntryLabel,
    chartSymbol,
    chartTradeEntryPrice,
    chartTradeOrderType,
    chartTradePositionStopTarget,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    isPendingChartOrderType,
    isStopLimitChartOrder,
    isDark,
    resolvedChartColors.tradeStopOut,
    resolvedChartColors.tradeTpSl,
    showChartTradeStopLabelsOnChart,
    showChartTradePreviewLinesOnChart,
    tradeVolume,
    tradeVolumeBounds,
  ]);

  const chartType = chartVisualType;
  const chartDataContextSig = useMemo(
    () => `${chartSymbol}-${normalizeTimeframe(chartTimeframe)}`,
    [chartSymbol, chartTimeframe],
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);
  const [hasPaintedChartOnce, setHasPaintedChartOnce] = useState(false);
  const [lastPaintedChartDataContextSig, setLastPaintedChartDataContextSig] = useState('');
  const requestChartDrawingSyncForObjects = useCallback(() => {
    if (!webViewRef.current || !webViewReady || !chartCanvasReady) {
      return false;
    }

    pendingObjectsDrawingSyncRef.current = true;
    webViewRef.current.injectJavaScript(`
      try {
        if (typeof publishSerializedDrawings === 'function') {
          publishSerializedDrawings();
        }
      } finally {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DRAWINGS_SYNCED_FOR_OBJECTS' }));
        }
      }
      true;
    `);
    setTimeout(() => {
      if (!pendingObjectsDrawingSyncRef.current) {
        return;
      }
      pendingObjectsDrawingSyncRef.current = false;
      router.push('/chart/objects');
    }, 700);
    return true;
  }, [chartCanvasReady, webViewReady]);

  const hasCandles = sanitizedCandles.length > 0;
  const timeRangeCandlesRef = useRef(sanitizedCandles);
  const chartCandles = useMemo(
    () =>
      filterCandlesForChartTimeRange(
        activeDateRange,
        sanitizedCandles,
        customDateValue,
      ),
    [activeDateRange, customDateValue, sanitizedCandles],
  );
  useEffect(() => {
    timeRangeCandlesRef.current = sanitizedCandles;
  }, [sanitizedCandles]);
  const formatChartValue = useCallback(
    (value: number | null | undefined) => (Number.isFinite(value) ? Number(value).toFixed(displayDecimals) : '--'),
    [displayDecimals],
  );
  // Keep the O/H/L/C row tied to the newest live candle under the symbol picker.
  // Crosshair messages can point at an older inspected candle, so they should not
  // hold this header row back while bid/ask ticks are moving.
  const chartMetaLiveLastCandle = sanitizedCandles.length > 0 ? sanitizedCandles[sanitizedCandles.length - 1] : null;
  const chartMetaLastCandle = chartMetaLiveLastCandle;
  const chartMetaNeutralColor = isDark ? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR;
  const chartLatestCandleGap = useMemo(
    () => resolveLatestCandleGap(chartCandles, chartTimeframe),
    [chartCandles, chartTimeframe],
  );
  const chartMetaItems = useMemo(
    () => {
      if (!chartMetaLastCandle) {
        return [];
      }

      const items = chartDisplay.showOHLC
        ? [
          { label: 'O', value: formatChartValue(chartMetaLastCandle.open), color: chartMetaNeutralColor },
          { label: 'H', value: formatChartValue(chartMetaLastCandle.high), color: CHART_OHLC_HIGH_COLOR },
          { label: 'L', value: formatChartValue(chartMetaLastCandle.low), color: CHART_OHLC_LOW_COLOR },
          { label: 'C', value: formatChartValue(chartMetaLastCandle.close), color: chartMetaNeutralColor },
        ]
        : [];

      return items;
    },
    [chartDisplay.showOHLC, chartLatestCandleGap, chartMetaLastCandle, chartMetaNeutralColor, formatChartValue],
  );
  const showChartMetaRow = chartMetaItems.length > 0;
  const showChartVolumePane = chartViewportShowVolumePane;
  const showChartDrawingToolbar = isChartExpanded && chartViewportShowDrawingToolbar;
  const overlayCandles = sanitizedBackendCandles.length > 0 ? sanitizedBackendCandles : sanitizedCandles;
  const applyNativeTimeRange = useCallback((range: ChartTimeRange, nextCustomDateValue?: Date | null) => {
    const visibleCandles = timeRangeCandlesRef.current;
    if (!webViewReady || !chartCanvasReady || visibleCandles.length === 0) {
      return;
    }

    if (range === 'auto') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ApplyRecentViewport === 'function') {
            window.__rtx5ApplyRecentViewport();
          } else if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
            if (typeof window.__rtx5ResetPriceScale === 'function') {
              window.__rtx5ResetPriceScale();
            }
          }
        } catch (_) {}
      `);
      return;
    }

    if (range === 'all') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          if (typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
      return;
    }

    const visibleRange = resolveChartVisibleRange(range, visibleCandles, nextCustomDateValue ?? customDateValue);
    if (!visibleRange) {
      return;
    }

    injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale && typeof chart.timeScale().setVisibleRange === 'function') {
            chart.timeScale().setVisibleRange({
              from: ${visibleRange.from},
              to: ${visibleRange.to},
            });
          }
          if (typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
  }, [chartCanvasReady, customDateValue, webViewReady]);


  const handleCustomDateRange = useCallback((selectedDate: Date) => {
    setCustomDateValue(selectedDate);
    setActiveDateRange('custom');
    setShowDatePicker(false);
    applyNativeTimeRange('custom', selectedDate);
  }, [applyNativeTimeRange]);

  const handleResetChartViewport = useCallback(() => {
    runImmediateAction('chart.viewport.reset', () => {
      hideActionSheet();
      closeChartTapMenu();
      applyNativeTimeRange(activeDateRange, customDateValue);
    });
  }, [activeDateRange, applyNativeTimeRange, closeChartTapMenu, customDateValue, hideActionSheet]);
  const resetChartActionSheetContext = useCallback(() => {
    closeChartTapMenu();
    setFooterLotPickerMode(null);
    setFooterLotEditorFocused(false);
    setChartTradeCommentFocused(false);
    // Keyboard.dismiss() is a native bridge call that can take 10-50ms on
    // Android. Defer it so it never blocks showActionSheet on the same frame.
    setTimeout(() => Keyboard.dismiss(), 0);
  }, [closeChartTapMenu]);
  const scheduleChartActionSheetContextReset = useCallback(() => {
    requestAnimationFrame(resetChartActionSheetContext);
  }, [resetChartActionSheetContext]);

  const prefetchChartTimeframeHistory = useCallback((nextSymbol: string, nextTimeframe: string) => {
    return liveCandlesEngine.prefetchHistory(nextSymbol, nextTimeframe);
  }, []);
  const prefetchSymbolPickerHistory = useCallback(() => {
    const currentSymbolKey = chartSymbol.trim().toUpperCase();
    const targets = availableSymbols
      .filter((symbol) => symbol.trim().toUpperCase() !== currentSymbolKey)
      .slice(0, CHART_SYMBOL_PICKER_PREFETCH_LIMIT);
    if (targets.length === 0 || !chartTimeframe) {
      return;
    }

    scheduleIdleWork(() => {
      targets.forEach((targetSymbol) => {
        void prefetchChartTimeframeHistory(targetSymbol, chartTimeframe).catch((error) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
            console.warn('[CHART-BRIDGE] symbol_picker_history_prefetch_failed', {
              symbol: targetSymbol,
              timeframe: chartTimeframe,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });
      });
    }, {
      delayMs: CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS,
      timeoutMs: 1500,
    });
  }, [availableSymbols, chartSymbol, chartTimeframe, prefetchChartTimeframeHistory]);
  const refreshSelectedChartHistory = useCallback((nextSymbol: string, nextTimeframe: string) => {
    void liveCandlesEngine.prefetchHistory(nextSymbol, nextTimeframe);
    liveCandlesEngine.refreshHistoryForContext(nextSymbol, nextTimeframe);
  }, []);
  const startupChartPrefetchKeyRef = useRef('');

  useEffect(() => {
    if (!chartSymbol || !chartTimeframe) {
      return undefined;
    }

    const normalizedTimeframe = normalizeTimeframe(chartTimeframe);
    const startupPrefetchKey = `${chartSymbol}:${normalizedTimeframe}`;
    if (startupChartPrefetchKeyRef.current === startupPrefetchKey) {
      return undefined;
    }
    startupChartPrefetchKeyRef.current = startupPrefetchKey;

    // Start history after the first app frame, alongside the hidden WebView
    // warm-up. This is a one-shot REST prefetch into the candle cache; live
    // candle and quote subscriptions remain gated by chartRuntimeActive.
    return scheduleAfterFirstFrame(() => {
      void prefetchChartTimeframeHistory(chartSymbol, normalizedTimeframe).catch((error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
          console.warn('[CHART-BRIDGE] startup_history_prefetch_failed', {
            symbol: chartSymbol,
            timeframe: normalizedTimeframe,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    });
  }, [chartSymbol, chartTimeframe, prefetchChartTimeframeHistory]);

  const warmChartContextAndCommit = useCallback(
    (nextSymbol: string, nextTimeframe: string) => {
      // Refresh an existing target stream before committing the UI context.
      // Brand-new streams are still loaded by useLiveCandles.subscribe(), which
      // avoids duplicate /candles requests during symbol/timeframe switches.
      refreshSelectedChartHistory(nextSymbol, nextTimeframe);
      if (nextSymbol !== chartSymbol) {
        setChartSymbol(nextSymbol);
        void prefetchInstrument(nextSymbol);
      }
      if (nextTimeframe !== chartTimeframe) {
        setChartTimeframe(nextTimeframe);
      }
    },
    [chartSymbol, chartTimeframe, refreshSelectedChartHistory, setChartSymbol, setChartTimeframe],
  );

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    runImmediateAction(`chart.timeframe.${nextTimeframe}`, () => {
      setTimeframePickerVisible(false);
      if (nextTimeframe === chartTimeframe) {
        closeChartTapMenu();
        hideActionSheet();
        return;
      }

      closeChartTapMenu();
      hideActionSheet();
      setActiveDateRange('auto');
      setCustomDateValue(null);
      warmChartContextAndCommit(chartSymbol, nextTimeframe);
    });
  }, [chartSymbol, chartTimeframe, closeChartTapMenu, hideActionSheet, warmChartContextAndCommit]);

  const handleSymbolSelect = useCallback((nextSymbol: string) => {
    runImmediateAction(`chart.symbol.${nextSymbol}`, () => {
      if (nextSymbol === chartSymbol) {
        hideActionSheet();
        closeChartTapMenu();
        return;
      }

      hideActionSheet();
      closeChartTapMenu();
      setActiveDateRange('auto');
      setCustomDateValue(null);
      warmChartContextAndCommit(nextSymbol, chartTimeframe);
    });
  }, [chartSymbol, chartTimeframe, closeChartTapMenu, hideActionSheet, warmChartContextAndCommit]);

  const symbolPickerActions = useMemo(
    () => availableSymbols.map((sym) => ({
      label: sym,
      subtitle: resolveChartSymbolFullName(sym),
      onPress: () => handleSymbolSelect(sym),
    })),
    [availableSymbols, handleSymbolSelect],
  );

  const handleOpenSymbolPicker = useCallback(() => {
    runImmediateAction('chart.symbolPicker.open', () => {
      showChartActionSheet({
        title: t('Select Symbol'),
        searchable: true,
        compactText: true,
        detent: 'large',
        instantOpen: true,
        // Keep the sheet fixed when the search keyboard opens (no rise/jump);
        // the keyboard just overlays the lower part of the list.
        keepFullHeightOnKeyboard: true,
        actions: symbolPickerActions,
      });
      scheduleChartActionSheetContextReset();
      prefetchSymbolPickerHistory();
    });
  }, [prefetchSymbolPickerHistory, scheduleChartActionSheetContextReset, showChartActionSheet, t, symbolPickerActions]);

  const handleOpenTimeframePicker = useCallback(() => {
    runImmediateAction('chart.timeframePicker.open', () => {
      timeframes.forEach((tf) => {
        if (tf !== chartTimeframe) {
          void prefetchChartTimeframeHistory(chartSymbol, tf);
        }
      });
      hideActionSheet();
      closeChartTapMenu();
      setTimeframePickerVisible(true);
      scheduleChartActionSheetContextReset();
    });
  }, [
    chartSymbol,
    chartTimeframe,
    closeChartTapMenu,
    hideActionSheet,
    prefetchChartTimeframeHistory,
    scheduleChartActionSheetContextReset,
  ]);

  const handleCloseTimeframePicker = useCallback(() => {
    setTimeframePickerVisible(false);
  }, []);

  const handleSelectChartType = useCallback((nextType: 'candles' | 'hollow' | 'line') => {
    runImmediateAction(`chart.chartType.select.${nextType}`, () => {
      closeChartTapMenu();
      setChartVisualType(nextType);
      hideActionSheet();
    });
  }, [closeChartTapMenu, hideActionSheet, setChartVisualType]);

  const chartTypePickerActions = useMemo(
    () => [
      { key: 'candles' as const, label: 'Candlestick', icon: 'stats-chart' as const },
      { key: 'hollow' as const, label: 'Hollow Candles', icon: 'stats-chart-outline' as const },
      { key: 'line' as const, label: 'Line', icon: 'trending-up-outline' as const },
    ].map((option) => {
      const active = chartType === option.key;

      return {
        label: option.label,
        subtitle: active ? t('Current') : undefined,
        icon: <Ionicons name={option.icon} size={20} color={active ? BLUE : TEXT_MUTED} />,
        onPress: () => handleSelectChartType(option.key),
      };
    }),
    [BLUE, TEXT_MUTED, chartType, handleSelectChartType, t],
  );

  const handleOpenChartTypePicker = useCallback(() => {
    runImmediateAction('chart.chartType.open', () => {
      showChartActionSheet({
        title: t('Chart Type'),
        detent: 'auto',
        instantOpen: true,
        presentation: 'mt5Plain',
        showActionIcons: true,
        actions: chartTypePickerActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [chartTypePickerActions, scheduleChartActionSheetContextReset, showChartActionSheet, t]);

  const handleOpenObjectsScreen = useCallback(() => {
    runImmediateAction('chart.objects.open', () => {
      closeChartTapMenu();
      if (requestChartDrawingSyncForObjects()) {
        return;
      }

      router.push('/chart/objects');
    });
  }, [closeChartTapMenu, requestChartDrawingSyncForObjects]);

  const handleOpenSignalDetails = useCallback(() => {
    runImmediateAction('chart.signalDetails.open', () => {
      closeChartTapMenu();
      setShowSignalDetails(true);
    });
  }, [closeChartTapMenu]);

  const drawingToolsActions = useMemo(
    () => createDrawingToolsActionSheetActions({
      chartHideAll,
      chartLockAll,
      dangerIconColor: T.trading.sell.primary,
      drawingMagnetMode,
      iconColor: TEXT_MUTED,
      onClearDrawings: handleClearDrawings,
      onRedoDrawing: handleRedoDrawing,
      onSelectTool: handleSetTool,
      onToggleHide: handleToggleHide,
      onToggleLock: handleToggleLock,
      onToggleMagnetMode: handleToggleMagnetMode,
      onToggleStickyMode: handleToggleStickyMode,
      onUndoDrawing: handleUndoDrawing,
      onZoomTool: handleZoomTool,
      stickyDrawingMode,
    }),
    [
      TEXT_MUTED,
      T.trading.sell.primary,
      chartHideAll,
      chartLockAll,
      drawingMagnetMode,
      handleClearDrawings,
      handleRedoDrawing,
      handleSetTool,
      handleToggleHide,
      handleToggleLock,
      handleToggleMagnetMode,
      handleToggleStickyMode,
      handleUndoDrawing,
      handleZoomTool,
      stickyDrawingMode,
    ],
  );

  const handleOpenDrawingTools = useCallback(() => {
    runImmediateAction('chart.drawingTools.open', () => {
      closeChartTapMenu();
      showChartActionSheet({
        presentation: 'mt5Plain',
        showActionIcons: true,
        minimumTopInset: drawingToolsSheetTopInset,
        detent: 'adaptive',
        instantOpen: true,
        actions: drawingToolsActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [closeChartTapMenu, drawingToolsActions, drawingToolsSheetTopInset, scheduleChartActionSheetContextReset, showChartActionSheet]);

  const handleOpenSettingsScreen = useCallback(() => {
    runImmediateAction('chart.settings.open', () => {
      closeChartTapMenu();
      router.push('/chart/settings');
    });
  }, [closeChartTapMenu]);

  const handleToggleChartExpanded = useCallback(() => {
    runImmediateAction('chart.expand.toggle', () => {
      const nextExpanded = !isChartExpanded;
      closeChartTapMenu();
      setIsChartExpanded(nextExpanded);
    });
  }, [closeChartTapMenu, isChartExpanded, setIsChartExpanded]);

  /**
   * Action handler for removing the current symbol from the user's favorites list.
   * This is triggered from the chart's more (3-dot) menu.
   */
  const handleChartMoreRemoveFromFavorites = useCallback(() => {
    hideActionSheet();
  }, [hideActionSheet]);

  /**
   * Action handler for opening the Trading Calculator screen for the current symbol.
   */
  const handleOpenChartTradingCalculator = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/calculator', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  /**
   * Action handler for opening the Analytics screen for the current symbol.
   */
  const handleOpenChartAnalytics = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/analytics', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  /**
   * Action handler for opening the Contract Specification screen for the current symbol.
   */
  const handleOpenChartSpecification = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/specification', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const chartTypeIconName =
    chartType === 'candles' || chartType === 'hollow'
      ? 'stats-chart'
      : chartType === 'bars'
        ? 'bar-chart-outline'
        : 'trending-up-outline';

  /**
   * Defines the list of actions available in the Chart's More (3-dot) menu.
   * This includes options to toggle UI elements like the Volume Bar, change Chart Type,
   * and navigate to related screens (Analytics, Specification, etc.).
   */
  const chartMoreActions = useMemo(
    () => [
      // Toggles the visibility of the volume histogram pane at the bottom of the chart
      {
        label: t(showChartVolumePane ? 'Hide Volume Bar' : 'Show Volume Bar'),
        icon: <Ionicons name={showChartVolumePane ? 'eye-off-outline' : 'bar-chart-outline'} size={20} color={TEXT_MUTED} />,
        onPress: () => setChartViewportShowVolumePane(!showChartVolumePane),
      },
      // Conditional action: Toggles the drawing tools sidebar when the chart is in fullscreen mode
      ...(isChartExpanded
        ? [{
          label: t(chartViewportShowDrawingToolbar ? 'Hide Drawing Tools' : 'Show Drawing Tools'),
          icon: <Ionicons name={chartViewportShowDrawingToolbar ? 'eye-off-outline' : 'pencil-outline'} size={20} color={TEXT_MUTED} />,
          onPress: () => setChartViewportShowDrawingToolbar(!chartViewportShowDrawingToolbar),
        }]
        : []),
      // Opens a picker to change the visual chart type (Candlesticks, Bars, Line, Hollow)
      {
        label: t('Chart Type'),
        icon: <Ionicons name={chartTypeIconName} size={20} color={TEXT_MUTED} />,
        onPress: () => {
          requestAnimationFrame(handleOpenChartTypePicker);
        },
      },
      // Opens the screen to manage active drawn objects and indicators
      {
        label: t('Objects'),
        icon: <TvLayers color={TEXT_MUTED} size={20} />,
        onPress: () => {
          hideActionSheet();
          handleOpenObjectsScreen();
        },
      },
      // Resets the chart's zoom, scale, and scroll state back to the default view
      {
        label: t('Reset'),
        icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleResetChartViewport,
      },
      // Removes the currently active symbol from the user's favorites
      {
        label: t('Remove from favorites'),
        icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
        onPress: handleChartMoreRemoveFromFavorites,
      },
      // Navigates to the Trading Calculator screen
      {
        label: t('Trading calculator'),
        icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleOpenChartTradingCalculator,
      },
      // Navigates to the Analytics screen
      {
        label: t('Analytics'),
        icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleOpenChartAnalytics,
      },
      // Navigates to the Contract Specification screen
      {
        label: t('Specification'),
        icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleOpenChartSpecification,
      },
    ],
    [
      TEXT_MUTED,
      chartTypeIconName,
      chartViewportShowDrawingToolbar,
      handleChartMoreRemoveFromFavorites,
      handleOpenChartAnalytics,
      handleOpenChartSpecification,
      handleOpenChartTradingCalculator,
      handleOpenChartTypePicker,
      handleOpenObjectsScreen,
      handleResetChartViewport,
      hideActionSheet,
      isChartExpanded,
      setChartViewportShowDrawingToolbar,
      setChartViewportShowVolumePane,
      showChartVolumePane,
      t,
    ],
  );

  const chartScaleActions = useMemo(
    () => [
      {
        label: t('Scroll to last bar'),
        icon: <Ionicons name="arrow-forward-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleScrollToLastBar,
      },
      {
        label: t('Reset vertical scale'),
        icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleResetVerticalScale,
      },
      {
        label: t('Auto-scale'),
        icon: (
          <Ionicons
            name={isChartAutoScaleEnabled ? 'contract-outline' : 'resize-outline'}
            size={20}
            color={TEXT_MUTED}
          />
        ),
        muted: isChartAutoScaleEnabled,
        onPress: handleToggleChartAutoScale,
      },
      {
        label: t('Vertical movement'),
        icon: (
          <Ionicons
            name={isVerticalScrollingLocked ? 'lock-closed-outline' : 'lock-open-outline'}
            size={20}
            color={TEXT_MUTED}
          />
        ),
        muted: !isVerticalScrollingLocked,
        onPress: handleToggleVerticalScrollingLock,
      },
      {
        label: t('One Click panel at the bottom'),
        icon: <Ionicons name="trail-sign-outline" size={20} color={TEXT_MUTED} />,
        muted: chartOneClickPanelAtBottom,
        onPress: handleToggleOneClickPanelAtBottom,
      },
      ...CHART_SCALE_DISPLAY_ITEMS.map((item) => {
        const enabled = getChartDisplayActionEnabled(item.key);
        return {
          label: t(item.label),
          icon: <Ionicons name={item.icon} size={20} color={TEXT_MUTED} />,
          muted: enabled,
          onPress: () => handleToggleChartDisplayAction(item.key),
        };
      }),
    ],
    [
      TEXT_MUTED,
      chartOneClickPanelAtBottom,
      getChartDisplayActionEnabled,
      handleResetVerticalScale,
      handleScrollToLastBar,
      handleToggleChartAutoScale,
      handleToggleChartDisplayAction,
      handleToggleOneClickPanelAtBottom,
      handleToggleVerticalScrollingLock,
      isChartAutoScaleEnabled,
      isVerticalScrollingLocked,
      t,
    ],
  );

  const handleOpenChartScaleMenu = useCallback(() => {
    runImmediateAction('chart.radial.scaleMenu.open', () => {
      closeChartTapMenu();
      showChartActionSheet({
        title: t('Chart settings'),
        titleAlign: 'center',
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'auto',
        instantOpen: true,
        actions: chartScaleActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [
    chartScaleActions,
    closeChartTapMenu,
    scheduleChartActionSheetContextReset,
    showChartActionSheet,
    t,
  ]);

  const handleOpenMoreMenu = useCallback(() => {
    runImmediateAction('chart.moreMenu.open', () => {
      showChartActionSheet({
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'adaptive',
        instantOpen: true,
        actions: chartMoreActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [chartMoreActions, scheduleChartActionSheetContextReset, showChartActionSheet]);

  const marketCloseSeparatorPayload = useMemo(() => {
    if (chartMarketStatus?.status !== 'closed' || isCryptoChartSymbol) {
      return [];
    }

    const separator = getMarketCloseSeparator(
      sanitizedCandles,
      chartTimeframe,
      chartMarketStatus.session_close,
    );
    return separator ? [separator] : [];
  }, [chartMarketStatus?.session_close, chartMarketStatus?.status, chartTimeframe, isCryptoChartSymbol, sanitizedCandles]);

  const periodSeparatorOptions = useMemo(() => ({
    enabled: chartDisplay.periodSeparators || marketCloseSeparatorPayload.length > 0,
    color: isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(100, 116, 139, 0.45)',
    width: 1,
    dashPattern: '1 5',
  }), [chartDisplay.periodSeparators, isDark, marketCloseSeparatorPayload.length]);

  const periodSeparatorPayload = useMemo(
    () => {
      const baseSeparators = getPeriodSeparators(sanitizedCandles, chartTimeframe, {
        periodSeparators: chartDisplay.periodSeparators,
      });
      if (marketCloseSeparatorPayload.length === 0) {
        return baseSeparators;
      }

      const seen = new Set(baseSeparators.map((separator) => `${separator.time}:${separator.type}`));
      const merged = [...baseSeparators];
      for (const separator of marketCloseSeparatorPayload) {
        const key = `${separator.time}:${separator.type}`;
        if (!seen.has(key)) {
          merged.push(separator);
          seen.add(key);
        }
      }
      return merged.sort((left, right) => left.index - right.index || left.time - right.time);
    },
    [chartDisplay.periodSeparators, chartTimeframe, marketCloseSeparatorPayload, sanitizedCandles],
  );

  const periodSeparatorPayloadSignature = useMemo(
    () => JSON.stringify({ options: periodSeparatorOptions, separators: periodSeparatorPayload }),
    [periodSeparatorOptions, periodSeparatorPayload],
  );

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: resolvedChartColors.background },
      textColor: resolvedChartColors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: {
        color: 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
      horzLines: {
        color: 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
    },
    crosshair: {
      mode: 2,
      vertLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
      horzLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
    },
    timeScale: {
      borderVisible: false,
      borderColor: 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
      barSpacing: CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
      minBarSpacing: CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: CHART_TIME_SCALE_FIX_LEFT_EDGE,
      fixRightEdge: CHART_TIME_SCALE_FIX_RIGHT_EDGE,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
    },
    rightPriceScale: {
      visible: true,
      borderVisible: false,
      borderColor: 'transparent',
      autoScale: true,
      entireTextOnly: false,
      minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
      scaleMargins: {
        top: 0,
        bottom: showChartVolumePane && chartType !== 'line' ? 0.32 : 0,
      },
    },
    customColors: {
      candlesUptrend: resolvedChartColors.candlesUptrend,
      candlesDowntrend: resolvedChartColors.candlesDowntrend,
      hollowBody: resolvedChartColors.hollowBody,
      barsUptrend: resolvedChartColors.barsUptrend,
      barsDowntrend: resolvedChartColors.barsDowntrend,
      lineBody: resolvedChartColors.lineBody,
      grid: chartDisplay.showGrid ? chartGridColor : 'transparent',
      axisDivider: chartAxisBorderColor,
    },
    customCrosshair: {
      symbol: chartSymbol,
      timeframe: chartTimeframe,
      lineColor: isDark ? 'rgba(148, 163, 184, 0.64)' : 'rgba(71, 85, 105, 0.58)',
      labelBackground: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.94)',
      labelText: '#FFFFFF',
      tooltipBackground: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.97)',
      tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.30)' : 'rgba(15, 23, 42, 0.14)',
      tooltipText: isDark ? '#E5E7EB' : '#0F172A',
      tooltipMuted: isDark ? '#94A3B8' : '#64748B',
      upColor: resolvedChartColors.candlesUptrend,
      downColor: resolvedChartColors.candlesDowntrend,
      snap: {
        enabled: drawingMagnetMode,
        type: drawingMagnetMode ? 'ohlc-nearest' : 'none',
        thresholdPx: CHART_DRAWING_MAGNET_THRESHOLD_PX,
      },
    },
    periodSeparators: periodSeparatorOptions,
  }), [chartAxisBorderColor, chartDisplay.showGrid, chartGridColor, chartSymbol, chartTimeframe, chartType, drawingMagnetMode, isDark, periodSeparatorOptions, resolvedChartColors, showChartVolumePane]);

  const [overlaySyncRevision, setOverlaySyncRevision] = useState(0);
  // Monotonic counter — incremented every time the WebView confirms
  // CHART_READY.  Used as a dependency in the overlay effect so it
  // always re-fires after a chart (re-)initialization, even when the
  // overlay payload itself hasn't changed.
  const [chartReadyEpoch, setChartReadyEpoch] = useState(0);
  // Keep the latest overlay payload in a ref so the onMessage handler
  // can push it immediately on CHART_READY without waiting for the
  // React effect cycle — this eliminates the "flash of missing lines"
  // race condition.
  const overlayPayloadRef = useRef<any>({ priceLines: [], markers: [] });
  const drawingSignatureRef = useRef(chartDrawingSignature);
  const drawingRecordsRef = useRef(chartDrawingRecords);
  const lastWebViewDrawingSignatureRef = useRef('');
  const lastInjectedDrawingSyncRef = useRef({ signature: '', epoch: -1 });
  const allowNextEmptyDrawingSyncRef = useRef(false);
  const hasAcceptedNonEmptyWebViewDrawingsRef = useRef(chartDrawingRecords.length > 0);
  drawingSignatureRef.current = chartDrawingSignature;
  drawingRecordsRef.current = chartDrawingRecords;
  useEffect(() => {
    allowNextEmptyDrawingSyncRef.current = false;
    hasAcceptedNonEmptyWebViewDrawingsRef.current = chartDrawingRecords.length > 0;
  }, [chartDrawingBucketKey, chartDrawingRecords.length]);
  // Loading overlay: delay before showing so fast cached switches (< 500 ms)
  // never flash a spinner. Falls back to hiding at 3 s to prevent an
  // indefinite blocking overlay when the chart fails to respond.
  const [loadingDelayPassed, setLoadingDelayPassed] = useState(false);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const candlesAvailable = sanitizedCandles.length > 0;
  useEffect(() => {
    setLoadingDelayPassed(false);
    setLoadingFallback(false);
    // Hidden hot tabs should not age into "No market data" before the user
    // opens Chart.  Start this timeout only for the active chart screen.
    if (!chartRuntimeActive) {
      return undefined;
    }
    const delayTmr = setTimeout(() => setLoadingDelayPassed(true), 500);
    // Bumped 3 s → 10 s. The previous 3 s fallback was firing on slow first
    // REST loads (cold network, demo broker handshake) and showing the
    // "No market data available" screen even though the candle stream was
    // still in flight. The timer is now long enough to cover a worst-case
    // first fetch but still short enough to recover from a hard failure
    // (otherwise the spinner would hang forever).
    const fallbackTmr = setTimeout(() => setLoadingFallback(true), 10000);
    return () => {
      clearTimeout(delayTmr);
      clearTimeout(fallbackTmr);
    };
  }, [chartRuntimeActive, chartSymbol, chartTimeframe, chartType]);
  // The moment candles arrive, drop the "no market data" fallback regardless
  // of how long the REST/WS handshake took. This prevents a brief flash of
  // the empty-state overlay when the timer happens to fire just before the
  // first candle batch lands.
  useEffect(() => {
    if (candlesAvailable && loadingFallback) {
      setLoadingFallback(false);
    }
  }, [candlesAvailable, loadingFallback]);
  const requestOverlaySync = useCallback(() => {
    setOverlaySyncRevision((revision) => revision + 1);
  }, []);
  const refreshShowOnChartSources = useCallback(() => {
    if (!chartRuntimeActive) {
      return;
    }
    requestOverlaySync();
    if (accountLogin) {
      refreshPositions(String(accountLogin));
    }
    void refetchOrders();
    void refetchClosedPositions();
    void refetchAlerts();
    void refetchAccountSummary();
  }, [
    accountLogin,
    refreshPositions,
    refetchOrders,
    refetchClosedPositions,
    refetchAlerts,
    refetchAccountSummary,
    requestOverlaySync,
    chartRuntimeActive,
  ]);
  useFocusEffect(
    useCallback(() => {
      if (!chartRuntimeActive) {
        return cancelChartViewportRecovery;
      }

      const cancelFocusWork = scheduleIdleWork(
        () => {
          refreshShowOnChartSources();
          requestChartViewportRecovery(3);
        },
        { delayMs: CHART_FOCUS_WORK_DELAY_MS, timeoutMs: 1500 },
      );

      return () => {
        cancelFocusWork();
        cancelChartViewportRecovery();
      };
    }, [cancelChartViewportRecovery, chartRuntimeActive, refreshShowOnChartSources, requestChartViewportRecovery]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isScreenFocused) {
        refreshShowOnChartSources();
        requestChartViewportRecovery(3);
      }
    });

    return () => subscription.remove();
  }, [isScreenFocused, refreshShowOnChartSources, requestChartViewportRecovery]);
  const hasChartDataError = Boolean(chartDataError && !candlesAvailable);
  const shouldShowImmediateHistoryLoading = !candlesAvailable && !hasChartDataError;
  const isLoading =
    !hasChartDataError &&
    (!chartCanvasReady || !candlesAvailable || chartDataLoading) &&
    (shouldShowImmediateHistoryLoading || loadingDelayPassed) &&
    !loadingFallback;
  // Keep the loader until this exact symbol and timeframe has drawn candles.
  // Returning to an already-painted chart stays instant.
  const hasPaintedCurrentChartContext =
    hasPaintedChartOnce && lastPaintedChartDataContextSig === chartDataContextSig;
  const shouldShowChartLoadingOverlay =
    !hasPaintedCurrentChartContext &&
    !hasChartDataError &&
    (!chartSurfaceReady || isLoading || candlesAvailable);
  const isError = hasChartDataError;
  const isNoMarketData = sanitizedCandles.length === 0 && !isLoading && !isError && loadingFallback;

  useEffect(() => {
    if (!webViewReady || !chartCanvasReady) return;
    const bridgedTool = chartLockAll ? CHART_NO_DRAWING_TOOL : activeTool;
    const shouldStartDrawing = !chartLockAll && chartDrawingInputActive && isChartDrawingInputTool(bridgedTool);
    injectChartScript(`
      setDrawingsLocked(${chartLockAll});
      setDrawingsHidden(${chartHideAll});
      setStayInDrawingMode(${stickyDrawingMode});
      setDrawingMagnetMode(${drawingMagnetMode});
      setVerticalScrollingLocked(${isVerticalScrollingLocked});
      setChartAutoScaleEnabled(${isChartAutoScaleEnabled});
      setDrawingTool(${JSON.stringify(bridgedTool)}, { startDrawing: ${shouldStartDrawing} });
    `);
  }, [activeTool, chartDrawingInputActive, webViewReady, chartCanvasReady, chartLockAll, chartHideAll, stickyDrawingMode, drawingMagnetMode, isVerticalScrollingLocked, isChartAutoScaleEnabled, chartSymbol, chartTimeframe, chartType]);

  useEffect(() => {
    if (!hasCandles || !webViewReady || !chartCanvasReady) {
      return;
    }
    if (activeDateRange === 'auto') {
      return;
    }
    applyNativeTimeRange(activeDateRange, customDateValue);
  }, [activeDateRange, applyNativeTimeRange, chartCanvasReady, chartReadyEpoch, chartTimeframe, customDateValue, hasCandles, webViewReady]);

  useEffect(() => {
    if (!pendingChartDrawingTool || !chartCanvasReady || !webViewReady) {
      return;
    }

    const nextDrawingInputActive = isChartDrawingInputTool(pendingChartDrawingTool);
    setActiveTool(pendingChartDrawingTool);
    setChartDrawingInputActive(nextDrawingInputActive);
    injectChartScript(`setDrawingTool(${JSON.stringify(pendingChartDrawingTool)}, { startDrawing: ${nextDrawingInputActive} });`);
    clearPendingChartDrawingTool();
  }, [pendingChartDrawingTool, chartCanvasReady, webViewReady, clearPendingChartDrawingTool]);

  useEffect(() => {
    if (!pendingChartCommand || !chartCanvasReady || !webViewReady) {
      return;
    }

    if (pendingChartCommand === 'scrollToLastBar') {
      executeScrollToLastBar();
    } else if (pendingChartCommand === 'resetVerticalScale') {
      executeResetVerticalScale();
    }

    clearPendingChartCommand();
  }, [
    pendingChartCommand,
    chartCanvasReady,
    webViewReady,
    executeScrollToLastBar,
    executeResetVerticalScale,
    clearPendingChartCommand,
  ]);

  // ─────────────────────────────────────────────────────────────────
  //   Self-healing chart bridge
  //
  //   Professional-grade: the chart ALWAYS renders. Period.
  //
  //   • sendInit() is the single function that pushes chart data to
  //     the WebView. It is idempotent, with throttled in-flight retries.
  //   • A watchdog timer re-sends initChart if CHART_READY hasn't
  //     arrived. It checks every 3s and avoids flooding slow WebViews.
  //   • On data arrival: requests initChart with the latest retained candles.
  //   • On WebView reload: READY resets state, next data push re-inits.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(sanitizedCandles);
  const chartInitializedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitSigRef = useRef('');
  const lastInitAttemptSigRef = useRef('');
  const lastInitDispatchRef = useRef({ signature: '', configSig: '', at: 0 });
  const pendingInitSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  const renderedDataContextSigRef = useRef('');
  const lastInjectedLiveQuoteSignatureRef = useRef('');
  const pendingMarketPriceLinesRef = useRef<{
    price: number | null;
    signature: string;
  } | null>(null);
  const marketPriceLineFlushFrameRef = useRef<number | null>(null);
  const marketPriceLineFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarketPriceLineFlushAtRef = useRef(0);
  const chartCandleFrontendPaintRef = useRef<{
    availableAt: number;
    length: number;
    signature: string;
  } | null>(null);

  const clearPendingMarketPriceLineSync = useCallback(() => {
    if (marketPriceLineFlushFrameRef.current !== null) {
      cancelAnimationFrame(marketPriceLineFlushFrameRef.current);
      marketPriceLineFlushFrameRef.current = null;
    }
    if (marketPriceLineFlushTimerRef.current) {
      clearTimeout(marketPriceLineFlushTimerRef.current);
      marketPriceLineFlushTimerRef.current = null;
    }
    pendingMarketPriceLinesRef.current = null;
  }, []);

  const clearRenderedMarketPriceLines = useCallback(() => {
    clearPendingMarketPriceLineSync();
    lastInjectedLiveQuoteSignatureRef.current = '';
    pendingMarketPriceLinesRef.current = null;
    try {
      webViewRef.current?.injectJavaScript(`
        try {
          if (typeof setLivePriceLine === 'function') {
            setLivePriceLine(null);
          }
        } catch (_) {}
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [clearPendingMarketPriceLineSync]);

  const flushPendingMarketPriceLines = useCallback(() => {
    marketPriceLineFlushFrameRef.current = null;
    if (marketPriceLineFlushTimerRef.current) {
      clearTimeout(marketPriceLineFlushTimerRef.current);
      marketPriceLineFlushTimerRef.current = null;
    }

    const pending = pendingMarketPriceLinesRef.current;
    if (!pending) {
      return;
    }
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }
    if (lastInjectedLiveQuoteSignatureRef.current === pending.signature) {
      pendingMarketPriceLinesRef.current = null;
      return;
    }

    // Quote updates are limited to the live Bid guide line here; candle OHLC is
    // synchronized through the canonical candle stream.
    try {
      if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
        console.log('[CHART-BRIDGE] inject_setLivePriceLine', {
          symbol: chartSymbol,
          timeframe: chartTimeframe,
          livePrice: pending.price,
        });
      }
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof setLivePriceLine === 'function') {
            setLivePriceLine(${pending.price ?? 'null'});
          }
        } catch (_) {}
        true;
      `);
      lastInjectedLiveQuoteSignatureRef.current = pending.signature;
      lastMarketPriceLineFlushAtRef.current = Date.now();
      pendingMarketPriceLinesRef.current = null;
    } catch (_e) {
      pendingMarketPriceLinesRef.current = null;
      /* WebView may have been disposed */
    }
  }, [chartCanvasReady, chartSymbol, chartTimeframe]);

  const requestMarketPriceLineFlush = useCallback(() => {
    if (marketPriceLineFlushFrameRef.current !== null || marketPriceLineFlushTimerRef.current) {
      return;
    }

    const scheduleFrame = () => {
      if (typeof requestAnimationFrame === 'function') {
        marketPriceLineFlushFrameRef.current = requestAnimationFrame(flushPendingMarketPriceLines);
      } else {
        marketPriceLineFlushTimerRef.current = setTimeout(flushPendingMarketPriceLines, 0);
      }
    };

    const elapsedMs = Date.now() - lastMarketPriceLineFlushAtRef.current;
    const waitMs = Math.max(0, CHART_MARKET_PRICE_LINE_SYNC_INTERVAL_MS - elapsedMs);
    if (waitMs > 0) {
      marketPriceLineFlushTimerRef.current = setTimeout(() => {
        marketPriceLineFlushTimerRef.current = null;
        scheduleFrame();
      }, waitMs);
      return;
    }

    scheduleFrame();
  }, [flushPendingMarketPriceLines]);

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    lastInitAttemptSigRef.current = '';
    lastInitDispatchRef.current = { signature: '', configSig: '', at: 0 };
    pendingInitSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    renderedDataContextSigRef.current = '';
    lastInjectedLiveQuoteSignatureRef.current = '';
    clearPendingMarketPriceLineSync();
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
    setChartViewportTouchActive(false);
    setChartCanvasReady(false);
    setChartPlotArea(null);
  };

  useEffect(() => () => {
    clearPendingMarketPriceLineSync();
  }, [clearPendingMarketPriceLineSync]);

  useEffect(() => {
    candlesRef.current = sanitizedCandles;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
      const last = sanitizedCandles[sanitizedCandles.length - 1];
      console.log('[CHART-CANDLES]', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: sanitizedCandles.length,
        lastTime: last?.time ?? null,
      });
      console.log('[CHART-BRIDGE] useLiveCandles_update', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: sanitizedCandles.length,
      });
    }
  }, [chartSymbol, chartTimeframe, sanitizedCandles]);

  // Render backend candle timestamps directly. The shared candle engine owns
  // sorting, dedupe, and OHLC validation; the WebView receives the same
  // timestamped history+live series for wicks, overlays, gaps, and tooltips.
  const buildMappedData = useCallback((sourceCandles: typeof sanitizedCandles) => {
    const cleaned = sourceCandles;
    if (cleaned.length === 0) {
      return [];
    }

    const result: any[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (chartType === 'line') {
        result.push({ time: c.time, value: c.close });
      } else {
        result.push({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        });
      }

      // Intentional: no whitespace injection and no synthetic gap-fill bars.
      // Lightweight-charts index-spaces real bars adjacently, so minutes the
      // backend has no candle for (illiquid symbols, no-trade gaps) simply
      // collapse — matching MT5/TradingView. Fabricating flat bars here would
      // render zero-height dashes that read as broken whitespace.
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG && result.length > 0) {
      const lastFew = result.slice(-3);
      console.log('CHART DATA DEBUG: Last 3 candles mapped:', JSON.stringify(lastFew));
    }
    return result;
  }, [chartType]);

  // Track the chart shell signature. Symbol/timeframe switches are data
  // context changes and repaint through updateChartData; only visual shell
  // changes rebuild the WebView chart.
  const currentSig = useMemo(
    () =>
      `${chartType}-${showChartVolumePane ? 'vol' : 'novol'
      }-${chartDisplay.showGrid ? 'grid' : 'nogrid'}-${chartGridColor}-${chartAxisBorderColor}-${chartColorsSignature}`,
    [chartType, chartColorsSignature, showChartVolumePane, chartDisplay.showGrid, chartGridColor, chartAxisBorderColor],
  );
  useEffect(() => {
    const lastCandle = sanitizedCandles[sanitizedCandles.length - 1];
    if (!lastCandle) {
      chartCandleFrontendPaintRef.current = null;
      return;
    }

    const signature = `${chartDataContextSig}:${currentSig}:${sanitizedCandles.length}:${lastCandle.time}:${lastCandle.open}:${lastCandle.high}:${lastCandle.low}:${lastCandle.close}`;
    if (chartCandleFrontendPaintRef.current?.signature === signature) {
      return;
    }

    chartCandleFrontendPaintRef.current = {
      availableAt: Date.now(),
      length: sanitizedCandles.length,
      signature,
    };
  }, [chartDataContextSig, currentSig, sanitizedCandles]);

  useEffect(() => {
    // Config changed — previous CHART_READY is stale.
    if (lastInitSigRef.current !== currentSig) {
      chartInitializedRef.current = false;
      lastInitAttemptSigRef.current = '';
      lastInitDispatchRef.current = { signature: '', configSig: '', at: 0 };
      pendingInitSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      renderedDataContextSigRef.current = '';
      lastInjectedLiveQuoteSignatureRef.current = '';
      clearRenderedMarketPriceLines();
      setChartCanvasReady(false);
      setChartPlotArea(null);
    }
  }, [clearRenderedMarketPriceLines, currentSig]);

  useEffect(() => {
    renderedDataContextSigRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    lastWebViewDrawingSignatureRef.current = '';
    clearRenderedMarketPriceLines();
  }, [chartDataContextSig, clearRenderedMarketPriceLines]);

  // Core init function — safe to call repeatedly.
  // The WebView's initChart tears down any existing chart and rebuilds.
  const sendInit = useCallback((force: boolean = false) => {
    if (!webViewRef.current || !webViewReady) return;

    // Once the current chart config is already live, incremental candle sync
    // handles backend candle updates. Avoid re-mapping the full merged series on
    // every tick just to discover init is already current.
    if (currentSig === lastInitSigRef.current && chartInitializedRef.current) return;

    const data = candlesRef.current;
    const initSnapshot = buildChartSeriesSnapshot(data);
    const initAttemptSig = `${currentSig}:${getChartSnapshotSignature(initSnapshot)}`;
    const now = Date.now();
    const recentInitInFlight =
      !chartInitializedRef.current &&
      lastInitDispatchRef.current.configSig === currentSig &&
      now - lastInitDispatchRef.current.at < CHART_INIT_RETRY_MIN_MS;
    if (recentInitInFlight) return;
    if (!force && initAttemptSig === lastInitAttemptSigRef.current) return;

    const mapped = data.length > 0 ? buildMappedData(data) : [];

    const js = `
      initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}, ${showChartVolumePane}, ${JSON.stringify(initAttemptSig)}, ${JSON.stringify(currentSig)});
      if (typeof setPeriodSeparators === 'function') {
        setPeriodSeparators(${JSON.stringify(periodSeparatorPayload)}, ${JSON.stringify(periodSeparatorOptions)});
      }
      true;
    `;
    try {
      webViewRef.current.injectJavaScript(js);
      lastInitAttemptSigRef.current = initAttemptSig;
      lastInitDispatchRef.current = { signature: initAttemptSig, configSig: currentSig, at: now };
      pendingInitSnapshotRef.current = initSnapshot;
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, currentSig, chartOptions, chartType, displayDecimals, buildMappedData, showChartVolumePane, periodSeparatorOptions, periodSeparatorPayload]);

  // Effect 1 — request initChart whenever data or config changes.
  useEffect(() => {
    sendInit();
  }, [sanitizedCandles, sendInit]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof setDisplayDecimals === 'function') {
          setDisplayDecimals(${displayDecimals});
        }
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [chartCanvasReady, chartReadyEpoch, displayDecimals]);

  // Effect 2 — keep the WebView aligned with the canonical candle stream.

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const renderableCandles = sanitizedCandles;
    const contextChanged = renderedDataContextSigRef.current !== chartDataContextSig;
    if (renderableCandles.length === 0) {
      if (contextChanged) {
        try {
          // Clear the old symbol while new history loads, so stale candles
          // cannot flash under the loader.
          webViewRef.current.injectJavaScript(`
            updateChartData([]);
            true;
          `);
          renderedDataContextSigRef.current = chartDataContextSig;
        } catch (_e) {
          /* WebView may have been disposed */
        }
      }
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      return;
    }

    const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
    const updateMode = contextChanged
      ? 'full_reload'
      : getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
      console.log('[CHART-BRIDGE] candle_sync_mode', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        contextChanged,
        updateMode,
        count: renderableCandles.length,
      });
    }

    if (updateMode === 'noop') {
      return;
    }

    let didInject = false;

    try {
      if (updateMode === 'full_reload') {
        const mapped = buildMappedData(renderableCandles);
        if (mapped.length > 0) {
          if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
            console.log('[CHART-BRIDGE] inject_updateChartData', {
              symbol: chartSymbol,
              timeframe: chartTimeframe,
              count: mapped.length,
            });
          }
          webViewRef.current.injectJavaScript(`
            updateChartData(${JSON.stringify(mapped)}, { resetVisibleRange: ${contextChanged} });
            true;
          `);
          didInject = true;
        }
      } else {
        const lastCandle = renderableCandles[renderableCandles.length - 1];
        if (lastCandle) {
          if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
            console.log('[CHART-BRIDGE] inject_updateTick', {
              symbol: chartSymbol,
              timeframe: chartTimeframe,
              time: lastCandle.time,
            });
          }
          webViewRef.current.injectJavaScript(`
            updateTick(${JSON.stringify(buildChartTickPayload(lastCandle, chartType))});
            true;
          `);
          didInject = true;
        }
      }
    } catch (_e) { /* WebView may have been disposed */ }

    if (didInject) {
      renderedSeriesSnapshotRef.current = nextSnapshot;
      renderedDataContextSigRef.current = chartDataContextSig;
      // Physical cold-start checks showed the WebView can be READY while REST
      // candle history is still loading.  Treat first paint as the first real
      // candle batch, not the empty chart shell.
      setHasPaintedChartOnce(true);
      setLastPaintedChartDataContextSig(chartDataContextSig);
    }
  }, [sanitizedCandles, chartCanvasReady, chartReadyEpoch, chartType, buildMappedData, chartDataContextSig, chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (!webViewRef.current || !webViewReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof setPeriodSeparators === 'function') {
          setPeriodSeparators(${JSON.stringify(periodSeparatorPayload)}, ${JSON.stringify(periodSeparatorOptions)});
        }
        true;
      `);
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, chartReadyEpoch, periodSeparatorOptions, periodSeparatorPayload, periodSeparatorPayloadSignature]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const visibleLivePrice = chartDisplay.showLivePriceLine && chartLivePriceLine !== null ? chartLivePriceLine : null;
    const nextSignature =
      visibleLivePrice !== null ? visibleLivePrice.toFixed(displayDecimals) : chartDisplay.showLivePriceLine ? 'na' : 'off';

    if (
      lastInjectedLiveQuoteSignatureRef.current === nextSignature ||
      pendingMarketPriceLinesRef.current?.signature === nextSignature
    ) {
      return;
    }

    // Quote ticks move only the live price line. Candle bodies stay tied to
    // backend OHLC history/live candle messages.
    // The scheduled bridge flush calls setLivePriceLine after coalescing.
    pendingMarketPriceLinesRef.current = {
      price: visibleLivePrice,
      signature: nextSignature,
    };
    requestMarketPriceLineFlush();
  }, [
    chartCanvasReady,
    chartDisplay.showLivePriceLine,
    chartLivePriceLine,
    chartReadyEpoch,
    chartSymbol,
    chartTimeframe,
    displayDecimals,
    requestMarketPriceLineFlush,
  ]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof setLastPriceLineVisible === 'function') {
            setLastPriceLineVisible(${chartDisplay.showLastPriceLine});
          }
        } catch (_) {}
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [chartCanvasReady, chartDisplay.showLastPriceLine, chartReadyEpoch]);

  // Watchdog — if CHART_READY hasn't arrived, keep retrying every 3s.
  // Also acts as a self-heal: if the WebView silently loses the chart
  // (process killed, JS error, etc.), this brings it back.
  useEffect(() => {
    if (!chartRuntimeActive) {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      return;
    }

    if (watchdogRef.current) clearInterval(watchdogRef.current);

    watchdogRef.current = setInterval(() => {
      if (!chartInitializedRef.current && webViewReady) {
        if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
          console.log('[CHART WATCHDOG] chart not confirmed, re-sending initChart');
        }
        sendInit(true);
      }
    }, CHART_WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [chartRuntimeActive, webViewReady, sendInit]);

  const overlayPayload = useMemo(
    () => {
      if (!preferencesHydrated) {
        return { priceLines: chartTradePreviewLines, markers: [] };
      }

      const basePayload = buildChartOverlayPayload({
        chartSymbol,
        candles: overlayCandles,
        positions,
        orders,
        closedPositions,
        alerts,
        colors: resolvedChartColors,
        sellColor: T.trading.sell.primary,
        liveBid: overlayLiveBid,
        liveAsk: overlayLiveAsk,
        liveAccount: overlayAccountMetrics,
        showOnChart: chartShowOnChart,
        activeTool,
      });

      if (chartTradePreviewLines.length === 0) {
        return basePayload;
      }

      return {
        ...basePayload,
        priceLines: [...basePayload.priceLines, ...chartTradePreviewLines].sort((left, right) => left.price - right.price),
      };
    },
    [
      preferencesHydrated,
      chartSymbol,
      overlayCandles,
      positions,
      orders,
      closedPositions,
      alerts,
      resolvedChartColors,
      T.trading.sell.primary,
      overlayLiveBid,
      overlayLiveAsk,
      overlayAccountMetrics,
      chartShowOnChart,
      activeTool,
      chartTradePreviewLines,
    ],
  );
  const overlayPayloadSignature = useMemo(() => JSON.stringify(overlayPayload), [overlayPayload]);

  // ── DEBUG: Log overlay payload every time it changes ──
  // Keep the ref in sync so the onMessage CHART_READY handler can
  // immediately push the latest overlay without waiting for the effect.
  useEffect(() => {
    overlayPayloadRef.current = overlayPayload;
  }, [overlayPayloadSignature]);
  useEffect(() => {
    if (!isScreenFocused || !preferencesHydrated || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const alreadySyncedForCurrentChart =
      lastInjectedDrawingSyncRef.current.signature === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (alreadySyncedForCurrentChart) {
      return;
    }

    const signatureCameFromWebView =
      lastWebViewDrawingSignatureRef.current === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (signatureCameFromWebView) {
      lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
      return;
    }

    webViewRef.current.injectJavaScript(`
      if (typeof setSerializedDrawings === 'function') {
        setSerializedDrawings(${JSON.stringify(chartDrawingRecords)});
      }
      true;
    `);
    lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
  }, [chartCanvasReady, chartDrawingRecords, chartDrawingSignature, chartReadyEpoch, isScreenFocused, preferencesHydrated, webViewReady]);

  // ── Chart Overlays Bridge ───────────────────────────────────────
  // Single effect that pushes ALL 7 "Show on Chart" features to the WebView:
  //   1. Open positions (BUY/SELL entry lines)
  //   2. TP / SL / Stop / Limit levels
  //   3. Closed position markers
  //   4. Trading signals
  //   5. HMR periods
  //   6. Price alerts
  //   7. Potential Stop Out line
  //
  // MUST wait for chartCanvasReady — the WebView's applyOverlayPayload
  // requires `series` to exist. Without this gate the effect fires when
  // the HTML loads (webViewReady=true) but before the chart is initialized
  // (series=null), so applyOverlayPayload silently returns and no lines
  // appear. This was the root cause of "sometimes shows, sometimes doesn't".
  // Push overlay to WebView whenever payload changes or chart (re-)initializes.
  useEffect(() => {
    if (!chartRuntimeActive || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const js = `
      if (typeof setChartOverlays === 'function') {
        setChartOverlays(${JSON.stringify(overlayPayload)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(js);

    const hasOverlayContent =
      overlayPayload.priceLines.length > 0 || overlayPayload.markers.length > 0;
    if (!hasOverlayContent) {
      return;
    }

    // Periodic resync: re-push the overlay every 5 seconds so that even
    // if a single injectJavaScript call races with initChart's
    // requestAnimationFrame (series=null at call time), the overlay
    // self-heals within one cycle.
    const resyncInterval = setInterval(() => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(js);
      }
    }, 5000);

    return () => clearInterval(resyncInterval);
  }, [
    chartRuntimeActive,
    overlayPayloadSignature,
    webViewReady,
    chartCanvasReady,
    chartReadyEpoch,
    overlaySyncRevision,
  ]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolName = resolveChartSymbolFullName(chartSymbol);
  const symbolCategory = resolveChartSymbolCategory(chartSymbol);
  const isDrawingToolActive = activeTool !== CHART_NO_DRAWING_TOOL || Boolean(pendingChartDrawingTool);
  const compactHeaderDrawingIconColor = isDrawingToolActive ? BLUE : TEXT_MUTED;
  const compactHeaderFullscreenIconColor = isChartExpanded ? BLUE : TEXT_MUTED;
  const renderCompactHeaderToolbar = () => (
    <>
      <View style={[styles.compactHeaderToolbarSlot, { width: 'auto' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Select Timeframe')}
          style={styles.toolbarTimeframeButton}
          onPress={handleOpenTimeframePicker}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Text style={styles.compactHeaderTimeframeText} numberOfLines={1} allowFontScaling={false}>
            {chartTimeframe}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.compactHeaderToolbarSlot, styles.compactHeaderToolbarTradeSlot]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SL/TP"
          style={styles.toolbarTradeButton}
          onPressIn={handleOpenChartTradeSheet}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Text style={styles.toolbarTradeText} numberOfLines={1} allowFontScaling={false}>
            SL/TP
          </Text>
        </Pressable>
      </View>

      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Drawing tools"
          style={styles.toolbarIconButton}
          onPress={handleOpenDrawingTools}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="pencil-outline" size={18} color={compactHeaderDrawingIconColor} />
        </Pressable>
      </View>
      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chart settings"
          style={styles.toolbarIconButton}
          onPress={handleOpenSettingsScreen}
          activateOnPressIn
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="options-outline" size={18} color={TEXT_MUTED} />
        </Pressable>
      </View>
      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle Fullscreen"
          style={styles.toolbarIconButton}
          onPressIn={handleToggleChartExpanded}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={compactHeaderFullscreenIconColor} />
        </Pressable>
      </View>
      <View style={[styles.compactHeaderToolbarSlot, styles.compactHeaderToolbarLastSlot]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More chart actions"
          style={styles.toolbarIconButton}
          onPress={handleOpenMoreMenu}
          activateOnPressIn
          activateOnTouchStart
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={TEXT_MUTED} />
        </Pressable>
      </View>
    </>
  );
  const renderChartTradeSheetTopHeader = () => (
    <View
      style={[
        styles.chartTradeSheetHeader,
        useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
      ]}
    >
      <Pressable
        style={styles.chartTradeSheetSymbolBlock}
        onPress={handleOpenSymbolPicker}
        activateOnPressIn
        activateOnTouchStart
        unstable_pressDelay={0}
      >
        <View style={styles.chartTradeSheetSymbolRow}>
          <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
            {displaySymbol}
          </Text>
          <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
        </View>
        <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
          {symbolName}
        </Text>
      </Pressable>
      <LiveQuotePairHeader
        bid={chartBid}
        ask={chartAsk}
        changePct={chartLiveQuote?.changePct}
        styles={styles}
        displayDecimals={displayDecimals}
      />
    </View>
  );
  const renderChartTradeSheetDragHeader = () => (
    <View
      collapsable={false}
      style={[
        styles.chartTradeSheetDragRegion,
        useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
      ]}
    >
      <GestureDetector gesture={chartTradeSheetDragGesture}>
        <Pressable
          style={styles.chartTradeSheetHandleWrap}
          onPress={handleToggleChartTradeSheetMode}
          unstable_pressDelay={0}
        >
          <View style={styles.chartTradeSheetHandle} />
        </Pressable>
      </GestureDetector>
      <View style={[styles.chartTradeQuickBar, styles.chartTradeQuickBarActionsOnly]}>
        <View style={styles.chartTradeQuickActions}>
          <Pressable
            style={[
              styles.chartTradeQuickChip,
              styles.chartTradeQuickChipSl,
              chartTradeSlEnabled && styles.chartTradeQuickChipSlActive,
            ]}
            onPress={() => handleToggleChartTradeStopLevel('sl')}
            unstable_pressDelay={0}
          >
            <Text
              style={[
                styles.chartTradeQuickChipText,
                chartTradeSlEnabled && styles.chartTradeQuickChipTextActive,
              ]}
            >
              SL
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.chartTradeQuickChip,
              styles.chartTradeQuickChipTp,
              chartTradeTpEnabled && styles.chartTradeQuickChipTpActive,
            ]}
            onPress={() => handleToggleChartTradeStopLevel('tp')}
            unstable_pressDelay={0}
          >
            <Text
              style={[
                styles.chartTradeQuickChipText,
                chartTradeTpEnabled && styles.chartTradeQuickChipTextActive,
              ]}
            >
              TP
            </Text>
          </Pressable>
          <Pressable
            style={styles.chartTradeQuickExpandButton}
            onPress={handleToggleChartTradeSheetMode}
            unstable_pressDelay={0}
          >
            <Ionicons
              name={chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
              size={20}
              color={BLUE}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const chartTradeOverlayLayer = (
    <ChartTradeOverlayLayer
      components={{
        LiveQuotePairHeader,
        LiveTradeButtons: ChartTradeButtons,
        PendingOrderPreviewChart,
        ChartTradeVolumeSlider,
        ChartFooterLotPicker,
      }}
      styles={styles}
      isDark={isDark}
      colors={{
        blue: BLUE,
        textMuted: TEXT_MUTED,
        sellPrimary: T.trading.sell.primary,
      }}
      symbolHeader={{
        displaySymbol,
        symbolName,
        chartBid,
        chartAsk,
        changePct: chartLiveQuote?.changePct,
        displayDecimals,
      }}
      sheet={{
        showChartTradeSheet,
        showHiddenInlineTradeSheet: !isChartExpanded && showChartTradeSheet,
        showInlineFooterWhileSheetOpen: showInlineFooterWhileChartTradeSheetOpen && !isChartExpanded && showChartTradeSheet,
        showInlineFooterDockWhileSheetOpen: false,
        chartTradeSheetFrozenLayerHeight,
        chartTradeSheetCollapsedHeight,
        chartTradeSheetMaxHeight,
        chartTradeSheetAnimatedStyle,
        chartTradeSheetContentBottomPadding,
        chartTradeSheetBottomInset,
        showChartTradeSheetHeader,
        chartTradeCommentFocused,
        chartTradeSheetDragGesture,
        useMtPendingTradeSheetLayout,
        chartTradeSheetMode,
        chartTradeSheetScrollRef,
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsInlineScrollRef,
        chartTradeOrderType,
        passiveLotDisplay,
        tradeVolume,
        tradeVolumeBounds,
        chartTradeVolumeDisplayMode,
        chartTradeVolumeInputFocused,
        chartTradeVolumeDraft,
        chartTradeVolumePrimaryDisplay,
        chartTradeVolumeModeLabel,
        chartTradeMarginEstimate: fmt.price(chartTradeMarginEstimate),
        chartTradeMaxVolumeDisplay,
        accountFreeMargin: fmt.price(accountFreeMargin),
        accountBalance: fmt.price(accountBalance),
        accountCurrency,
        chartTradePrice,
        chartTradeStopLimitPrice,
        isStopLimitChartOrder,
        chartTradeSlEnabled,
        chartTradeSlPrice,
        chartTradeTpEnabled,
        chartTradeTpPrice,
        chartTradeStopUnitOptions,
        chartTradeStopUnit,
        chartTradeSlLocked,
        chartTradeTpLocked,
        showChartTradeExpiration,
        chartTradeExpiration,
        showChartTradeComment,
        showFloatingChartTradeCommentEditor,
        chartTradeComment,
        chartTradeCommentInputRef,
        chartTradeEntryPrice,
        chartPointSize,
        disablePendingTradePlaceButton,
        chartTradeCtaColor,
        candles: sanitizedCandles,
        chartSymbol,
        chartBid,
        chartAsk,
        chartTradeTickTimestamp,
        onTradeResult: handleChartTradeResult,
      }}
      footer={{
        showFloatingFooterTradeRow: shouldMountFloatingFooterTradeRow,
        floatingFooterTradeRowVisible: isFloatingFooterTradeRowVisible,
        footerTradeRowKeyboardOffset,
        keyboardVisibleHeight,
        keyboardResizesHost: androidFooterHostResizedForKeyboard,
        footerKeyboardAvoidanceOffset,
        showFooterLotPicker,
        footerLotPickerMode,
        footerLotEditorFocused,
        lotInput,
        footerLotEditorInputRef,
        floatingChartTradeCommentOffset,
      }}
      handlers={{
        onOpenSymbolPicker: handleOpenSymbolPicker,
        onToggleSheetMode: handleToggleChartTradeSheetMode,
        onToggleStopLevel: handleToggleChartTradeStopLevel,
        onTradeSheetScroll: handleChartTradeSheetScroll,
        onOverlayTabsViewportLayout: handleOverlayTradeTypeTabsViewportLayout,
        onInlineTabsViewportLayout: handleInlineTradeTypeTabsViewportLayout,
        onOverlayTabLayout: handleOverlayTradeTypeTabLayout,
        onInlineTabLayout: handleInlineTradeTypeTabLayout,
        onSelectOrderType: handleChartTradeOrderTypeSelect,
        onOpenVolumeStepper: handleOpenChartTradeVolumeStepper,
        onFocusTradeVolumeInput: handleFocusChartTradeVolumeInput,
        onChangeTradeVolumeDraft: handleChartTradeVolumeDraftChange,
        onBlurTradeVolumeDraft: handleBlurChartTradeVolumeDraft,
        onEndTradeVolumeDraft: handleEndChartTradeVolumeDraft,
        onSubmitTradeVolumeDraft: handleSubmitChartTradeVolumeDraft,
        onToggleTradeVolumeDisplayMode: handleToggleChartTradeVolumeDisplayMode,
        onChangeTradeVolume: updateTradeVolume,
        onOpenPriceStepper: handleOpenChartTradePriceStepper,
        onOpenStopLimitPriceStepper: handleOpenChartTradeStopLimitPriceStepper,
        onEnableStops: handleEnableChartTradeStops,
        onSelectStopUnit: handleSelectChartTradeStopUnit,
        onOpenSlStepper: handleOpenChartTradeSlStepper,
        onToggleSlLock: handleToggleChartTradeSlLock,
        onOpenTpStepper: handleOpenChartTradeTpStepper,
        onToggleTpLock: handleToggleChartTradeTpLock,
        onOpenExpirationMenu: handleOpenChartExpirationMenu,
        onChangeComment: handleChangeChartTradeComment,
        onBlurComment: handleBlurChartTradeComment,
        onSubmitComment: handleSubmitChartTradeComment,
        onPrepareCommentSubmit: handlePrepareChartTradeCommentSubmit,
        onFocusComment: handleFocusChartTradeComment,
        onSubmitPendingTrade: handleSubmitPendingTradeFromSheet,
        onEditLot: handleFocusFooterLotEditor,
        onOpenLotEditor: handleOpenFooterLotPicker,
        onLotDraftChange: handleFooterLotDraftChange,
        onLotDraftBlur: handleBlurFooterLotEditor,
        onLotDraftEndEditing: handleEndFooterLotEditor,
        onLotDraftSubmit: handleSubmitFooterLotEditor,
        onDecreaseLot: () => handleStepFooterLotEditor(-1),
        onIncreaseLot: () => handleStepFooterLotEditor(1),
        onCloseFooterLotPicker: handleCloseFooterLotPicker,
        onSelectFooterLot: handleSelectFooterLot,
      }}
    />
  );

  return (
    <Screen style={styles.screen} noBottomInset>
      <View style={styles.headerWrapper}>
        <View
          style={[styles.compactHeader, { paddingTop: chartHeaderTopPadding }]}
          onLayout={(event) => {
            const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
            if (nextHeight > 0) {
              setChartTradeCompactHeaderHeight((current) => (current === nextHeight ? current : nextHeight));
            }
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open menu')}
            style={styles.chartHeaderMenuButton}
            onPress={handleOpenSidebar}
            activateOnTouchStart
            latencyLabel="chartHeader.menu"
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 6 }}
            unstable_pressDelay={0}
          >
            <Ionicons name="menu" size={24} color={T.text} />
          </Pressable>

          {renderCompactHeaderToolbar()}
        </View>
      </View>

      <View
        ref={chartTradeHostRef}
        style={styles.flex1}
        onLayout={(event) => {
          const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
          const shouldRecordKeyboardFreeHostHeight =
            Platform.OS !== 'android' ||
            (
              keyboardVisibleHeight <= 0 &&
              !footerLotEditorFocused &&
              !footerLotEditorOpening &&
              !chartTradeCommentFocused
            );

          if (nextHeight > 0 && shouldRecordKeyboardFreeHostHeight) {
            setChartTradeKeyboardFreeHostHeight((current) => (
              current === nextHeight ? current : nextHeight
            ));
          }

          setChartTradeSheetHostHeight((current) => {
            return resolveChartTradeSheetHostHeight({
              currentHostHeight: current,
              nextHostHeight: nextHeight,
              freezeHostHeight: shouldFreezeChartTradeSheetHostHeight,
            });
          });
          requestAnimationFrame(() => {
            measureKeyboardDockAnchors(() => {
              recomputeKeyboardDockOffset();
            });
          });
        }}
      >
        <ScrollView
          canCancelContentTouches={Platform.OS === 'ios'}
          ref={chartScrollRef}
          style={styles.card}
          contentContainerStyle={[
            styles.chartScrollContent,
            isChartExpanded && { minHeight: fullscreenChartMinHeight },
          ]}
          nestedScrollEnabled
          scrollEnabled={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive && !footerLotEditorFocused}
          bounces={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive && !footerLotEditorFocused}
          alwaysBounceVertical={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive && !footerLotEditorFocused}
          keyboardShouldPersistTaps="always"
          scrollEventThrottle={16}
          onScroll={() => syncChartViewportFrame()}
        >
          {!isChartExpanded && chartDisplay.showQuickTradingButtons && !chartOneClickPanelAtBottom && (
            <ChartTradeInlineFooter
              LiveTradeButtons={ChartTradeButtons}
              styles={styles}
              animatedStyle={floatingFooterTradeReserveAnimatedStyle}
              containerRef={footerTradeRowAnchorRef}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              hideInlineTradeRow={Platform.OS === 'android' && isFloatingFooterTradeRowVisible}
              showFloatingFooterTradeRow={shouldMountFloatingFooterTradeRow}
              chartSymbol={chartSymbol}
              displayDecimals={displayDecimals}
              tradeVolume={tradeVolume}
              tradeVolumeBounds={tradeVolumeBounds}
              onTradeResult={handleChartTradeResult}
              onEditLot={handleFocusFooterLotEditor}
              onOpenLotEditor={handleOpenFooterLotPicker}
              isLotEditing={footerLotEditorFocused}
              lotDraft={lotInput}
              lotInputRef={footerLotEditorInputRef}
              onLotDraftChange={handleFooterLotDraftChange}
              onLotDraftBlur={handleBlurFooterLotEditor}
              onLotDraftEndEditing={handleEndFooterLotEditor}
              onLotDraftSubmit={handleSubmitFooterLotEditor}
              onDecreaseLot={() => handleStepFooterLotEditor(-1)}
              onIncreaseLot={() => handleStepFooterLotEditor(1)}
              lotInvalid={footerLotInvalid}
              invalidLotDisplay={footerLotInvalidDisplay}
              active={chartRuntimeActive}
              fallbackBid={chartBid}
              fallbackAsk={chartAsk}
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
          )}
          <View
            style={[
              styles.chartContainer,
              isChartExpanded && { minHeight: fullscreenChartMinHeight },
              focusedLotChartViewportHeight > 0 && {
                flex: 0,
                height: focusedLotChartViewportHeight,
              },
            ]}
          >
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <ChartDrawingToolsSidebar
                activeTool={activeTool}
                chartHideAll={chartHideAll}
                chartLockAll={chartLockAll}
                colors={{ blue: BLUE, textMuted: TEXT_MUTED }}
                drawingMagnetMode={drawingMagnetMode}
                isChartExpanded={isChartExpanded}
                isDark={isDark}
                onClearDrawings={handleClearDrawings}
                onOpenDrawingTools={handleOpenDrawingTools}
                onRedoDrawing={handleRedoDrawing}
                onSelectTool={handleSetTool}
                onToggleHide={handleToggleHide}
                onToggleLock={handleToggleLock}
                onToggleMagnetMode={handleToggleMagnetMode}
                onToggleStickyMode={handleToggleStickyMode}
                onUndoDrawing={handleUndoDrawing}
                onZoomTool={handleZoomTool}
                showDrawingToolbar={showChartDrawingToolbar}
                stickyDrawingMode={stickyDrawingMode}
              />
              <View
                ref={chartViewportRef}
                style={[styles.chartViewport, frozenFooterLotChartViewportStyle]}
                onTouchStart={handleChartViewportTouchStart}
                onTouchEnd={handleChartViewportTouchEnd}
                onTouchCancel={handleChartViewportTouchEnd}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  if (width <= 0 || height <= 0) {
                    return;
                  }
                  if (!isScreenFocused) {
                    return;
                  }
                  const freezeViewportResize =
                    (shouldFreezeChartViewportResize || footerLotEditorActiveRef.current) &&
                    lastChartViewportSizeRef.current.height > 0 &&
                    height < lastChartViewportSizeRef.current.height;
                  if (freezeViewportResize) {
                    return;
                  }
                  setChartTapMenuBounds({ width, height });
                  scheduleChartViewportResize(width, height, true);
                  syncChartViewportFrame();
                }}
              >
                {shouldShowChartLoadingOverlay && (
                  <View pointerEvents="none" style={styles.chartOverlay}>
                    <ActivityIndicator size="large" color={BLUE} />
                    <Text style={styles.overlayText}>{t('Loading chart data...')}</Text>
                  </View>
                )}

                {chartSurfaceReady && isError && !isLoading && (
                  <View pointerEvents="none" style={styles.chartOverlay}>
                    <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                    <Text style={styles.overlayText}>{t('Unable to load chart')}</Text>
                    <Text style={styles.overlaySubText}>{chartDataError ?? t('Waiting for market data connection...')}</Text>
                  </View>
                )}

                {chartSurfaceReady && isNoMarketData && !isError && (
                  <View pointerEvents="none" style={styles.chartOverlay}>
                    <Ionicons name="analytics-outline" size={36} color={TEXT_MUTED} />
                    <Text style={styles.overlayText}>{t('No market data available')}</Text>
                    <Text style={styles.overlaySubText}>{t('Waiting for backend candle data...')}</Text>
                  </View>
                )}

                {chartSurfaceReady ? (
                  <WebView
                    key={CHART_DEV_SOURCE_KEY}
                    ref={webViewRef}
                    source={CHART_SOURCE}
                    style={{ flex: 1, backgroundColor: resolvedChartColors.background }}
                    androidLayerType="hardware"
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    originWhitelist={['*']}
                    javaScriptEnabled={true}
                    cacheEnabled={!__DEV__}
                    forceDarkOn={false}
                    onContentProcessDidTerminate={() => {
                      console.warn('[CHART WEBVIEW] iOS background process terminated. Reloading chart strictly.');
                      resetChartBridgeState();
                      setWebViewReady(false);
                      webViewRef.current?.reload();
                    }}
                    onRenderProcessGone={() => {
                      console.warn('[CHART WEBVIEW] Android render process gone. Reloading chart strictly.');
                      resetChartBridgeState();
                      setWebViewReady(false);
                      webViewRef.current?.reload();
                    }}
                    onMessage={(event) => {
                      try {
                        const msg = JSON.parse(event.nativeEvent.data);
                        if (msg.type === 'READY') {
                          if (typeof __DEV__ !== 'undefined' && __DEV__) {
                            console.log('[CHART] webview READY (surface boot complete)');
                          }
                          // WebView loaded — reset state and mark ready.
                          // The watchdog + Effect 1 will push initChart as soon as data exists.
                          resetChartBridgeState();
                          lastWebViewDrawingSignatureRef.current = '';
                          lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
                          allowNextEmptyDrawingSyncRef.current = false;
                          hasAcceptedNonEmptyWebViewDrawingsRef.current = drawingRecordsRef.current.length > 0;
                          setTextLevelEditRequest(null);
                          setWebViewReady(true);
                          if (isScreenFocused) {
                            requestChartViewportRecovery(2);
                          }
                        } else if (msg.type === 'CHART_READY') {
                          const readyInitSignature = typeof msg.initSignature === 'string' ? msg.initSignature : '';
                          const readyConfigSig = typeof msg.configSig === 'string' ? msg.configSig : '';
                          const latestInitDispatch = lastInitDispatchRef.current;
                          if (
                            readyInitSignature !== latestInitDispatch.signature ||
                            readyConfigSig !== latestInitDispatch.configSig ||
                            readyConfigSig !== currentSig
                          ) {
                            if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
                              console.log('[CHART-BRIDGE] ignore_stale_chart_ready', {
                                readyInitSignature,
                                readyConfigSig,
                                latestInitSignature: latestInitDispatch.signature,
                                latestConfigSig: latestInitDispatch.configSig,
                                currentSig,
                              });
                            }
                            return;
                          }
                          // WebView shell is ready.  Keep the startup loader
                          // until a non-empty candle series is actually
                          // painted, otherwise slow REST history briefly shows
                          // a false "No market data" screen.
                          chartInitializedRef.current = true;
                          lastInitSigRef.current = currentSig;
                          setChartCanvasReady(true);
                          lastInjectedLiveQuoteSignatureRef.current = '';
                          try {
                            const drawingsToReplay = chartDrawingRecords;
                            if (webViewRef.current) {
                              const drawingReplaySignature = chartDrawingSignature;
                              webViewRef.current.injectJavaScript(`
                                if (typeof setSerializedDrawings === 'function') {
                                  setSerializedDrawings(${JSON.stringify(drawingsToReplay)});
                                }
                                true;
                              `);
                              lastInjectedDrawingSyncRef.current = {
                                signature: drawingReplaySignature,
                                epoch: chartReadyEpoch,
                              };
                            }
                          } catch (_) { }
                          // Fast path: if initChart already seeded this exact
                          // sanitized series, skip the duplicate full reload.
                          // Otherwise paint retained candles for the READY race.
                          try {
                            const readyCandles = candlesRef.current;
                            const readySnapshot = buildChartSeriesSnapshot(readyCandles);
                            if (readyCandles.length > 0 && webViewRef.current) {
                              if (getChartSnapshotSignature(pendingInitSnapshotRef.current) === getChartSnapshotSignature(readySnapshot)) {
                                renderedSeriesSnapshotRef.current = readySnapshot;
                                setHasPaintedChartOnce(true);
                                setLastPaintedChartDataContextSig(chartDataContextSig);
                              } else {
                                const mapped = buildMappedData(readyCandles);
                                webViewRef.current.injectJavaScript(`
                              updateChartData(${JSON.stringify(mapped)});
                              true;
                            `);
                                renderedSeriesSnapshotRef.current = readySnapshot;
                                setHasPaintedChartOnce(true);
                                setLastPaintedChartDataContextSig(chartDataContextSig);
                              }
                            }
                          } catch (_) { }
                          const frontendPaint = chartCandleFrontendPaintRef.current;
                          if (frontendPaint) {
                            const frontendMs = Date.now() - frontendPaint.availableAt;
                            recordUiFeedGap(
                              'chart.candles.frontend.paint',
                              frontendMs,
                              `${chartSymbol} ${chartTimeframe} ${frontendPaint.length} candle(s)`,
                            );
                            if (typeof __DEV__ !== 'undefined' && __DEV__ && frontendMs > 3000) {
                              console.warn(
                                `[CHART] Frontend candle paint exceeded 3s after data was available: ${frontendMs}ms for ${chartSymbol} ${chartTimeframe}`,
                              );
                            }
                            chartCandleFrontendPaintRef.current = null;
                          }
                          // Bump epoch so the overlay effect always re-fires
                          // after every (re-)initialization, even when the
                          // payload itself hasn't changed.
                          setChartReadyEpoch((c) => c + 1);
                          requestChartViewportRecovery(4);
                          // Immediately push the latest overlay so lines appear
                          // without waiting for the next React effect cycle.
                          try {
                            const latestOverlay = overlayPayloadRef.current ?? { priceLines: [], markers: [] };
                            const visibleLivePrice = chartDisplay.showLivePriceLine && chartLivePriceLine !== null ? chartLivePriceLine : null;
                            const nextMarketLineSignature =
                              visibleLivePrice !== null ? visibleLivePrice.toFixed(displayDecimals) : chartDisplay.showLivePriceLine ? 'na' : 'off';
                            if (webViewRef.current) {
                              webViewRef.current.injectJavaScript(`
                            if (typeof setChartOverlays === 'function') {
                              setChartOverlays(${JSON.stringify(latestOverlay)});
                            }
                            if (typeof setLivePriceLine === 'function') {
                              setLivePriceLine(${visibleLivePrice ?? 'null'});
                            }
                            true;
                          `);
                              lastInjectedLiveQuoteSignatureRef.current = nextMarketLineSignature;
                              lastMarketPriceLineFlushAtRef.current = Date.now();
                              pendingMarketPriceLinesRef.current = null;
                            }
                          } catch (_) { }
                        } else if (msg.type === 'DRAWING_TEXT_EDIT_REQUEST') {
                          const recordId = typeof msg.recordId === 'string' ? msg.recordId : '';
                          if (!recordId) {
                            return;
                          }
                          setTextLevelEditRequest({
                            recordId,
                            text: typeof msg.text === 'string' ? msg.text : 'Level',
                          });
                        } else if (msg.type === 'DRAWINGS_CHANGED') {
                          if (
                            !chartInitializedRef.current ||
                            !chartCanvasReady ||
                            lastInitSigRef.current !== currentSig
                          ) {
                            return;
                          }

                          const nextDrawings = filterChartDrawingRecordsForCurrentChart(
                            sanitizePersistedChartDrawings(msg.drawings),
                            chartSymbol,
                            chartTimeframe,
                            sanitizedBackendCandles,
                          );
                          const nextSignature = JSON.stringify(nextDrawings);
                          const nativeDrawingRecords = drawingRecordsRef.current;
                          const nativeDrawingSignature = drawingSignatureRef.current;
                          const hasNativeOrAcceptedDrawings =
                            nativeDrawingRecords.length > 0 ||
                            hasAcceptedNonEmptyWebViewDrawingsRef.current;
                          const unexpectedEmptyWebViewPayload =
                            nextDrawings.length === 0 &&
                            hasNativeOrAcceptedDrawings &&
                            !allowNextEmptyDrawingSyncRef.current;

                          if (unexpectedEmptyWebViewPayload) {
                            return;
                          }

                          lastWebViewDrawingSignatureRef.current = nextSignature;
                          if (nextDrawings.length > 0) {
                            allowNextEmptyDrawingSyncRef.current = false;
                            hasAcceptedNonEmptyWebViewDrawingsRef.current = true;
                          } else {
                            allowNextEmptyDrawingSyncRef.current = false;
                            hasAcceptedNonEmptyWebViewDrawingsRef.current = false;
                          }

                          if (nextSignature !== nativeDrawingSignature) {
                            setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
                          }
                        } else if (msg.type === 'DRAWINGS_SYNCED_FOR_OBJECTS') {
                          if (pendingObjectsDrawingSyncRef.current) {
                            pendingObjectsDrawingSyncRef.current = false;
                            router.push('/chart/objects');
                          }
                        } else if (msg.type === 'CHART_TOUCH_STATE') {
                          if (msg.active) {
                            handleChartViewportTouchStart();
                          } else {
                            handleChartViewportTouchEnd();
                          }
                        } else if (msg.type === 'TOOL_ACTIVE_CHANGED') {
                          setActiveTool(typeof msg.tool === 'string' ? msg.tool : CHART_NO_DRAWING_TOOL);
                          setChartDrawingInputActive(msg.drawingActive === true);
                        } else if (msg.type === 'CHART_TRADE_LINE_DRAG') {
                          if (!handleChartPositionStopDragMessage(msg)) {
                            handleChartTradePreviewDragMessage(msg);
                          }
                        } else if (msg.type === 'ON_PAGINATE_HISTORY') {
                          paginate();
                        } else if (msg.type === 'CHART_TAP') {
                          if (shouldSuppressChartTapMenu({
                            activeTool,
                            footerLotEditorFocused,
                            footerLotEditorOpening,
                            footerLotPickerOpen: footerLotPickerMode !== null,
                            suppressUntil: chartTapMenuSuppressUntilRef.current,
                          })) {
                            setChartTapMenuAnchor(null);
                            return;
                          }
                          const x = typeof msg.x === 'number' ? msg.x : NaN;
                          const y = typeof msg.y === 'number' ? msg.y : NaN;
                          if (!Number.isFinite(x) || !Number.isFinite(y)) {
                            return;
                          }
                          const nextAnchor = {
                            x,
                            y,
                            price: typeof msg.price === 'number' && Number.isFinite(msg.price) ? msg.price : null,
                          };
                          syncChartViewportFrame(() => {
                            setChartTapMenuAnchor((currentAnchor) => (
                              currentAnchor ? null : nextAnchor
                            ));
                          });
                        } else if (msg.type === 'CHART_GEOMETRY') {
                          const nextPlotArea =
                            msg.plotArea
                              && typeof msg.plotArea.left === 'number'
                              && Number.isFinite(msg.plotArea.left)
                              && typeof msg.plotArea.top === 'number'
                              && Number.isFinite(msg.plotArea.top)
                              && typeof msg.plotArea.width === 'number'
                              && Number.isFinite(msg.plotArea.width)
                              && msg.plotArea.width > 0
                              && typeof msg.plotArea.height === 'number'
                              && Number.isFinite(msg.plotArea.height)
                              && msg.plotArea.height > 0
                              ? {
                                left: msg.plotArea.left,
                                top: msg.plotArea.top,
                                width: msg.plotArea.width,
                                height: msg.plotArea.height,
                              }
                              : null;

                          setChartPlotArea((current) => {
                            if (
                              current
                              && nextPlotArea
                              && current.left === nextPlotArea.left
                              && current.top === nextPlotArea.top
                              && current.width === nextPlotArea.width
                              && current.height === nextPlotArea.height
                            ) {
                              return current;
                            }
                            return nextPlotArea;
                          });
                        } else if (msg.type === 'ERROR') {
                          // Log but don't alert — the watchdog will auto-retry.
                          console.warn('[CHART WEBVIEW ERROR]', msg.message);
                          const bridgeErrorMessage = typeof msg.message === 'string' ? msg.message : '';
                          if (/initChart|updateChartData|flushPendingTick|series not initialized|recoverChartSurface/.test(bridgeErrorMessage)) {
                            chartInitializedRef.current = false;
                            lastInitSigRef.current = '';
                            renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
                            setChartCanvasReady(false);
                            requestChartViewportRecovery(2);
                            sendInit(true);
                          }
                        }
                      } catch (_e) { }
                    }}
                  />
                ) : null}
                {(chartDisplay.showTicker || showChartMetaRow) && (
                  <View style={styles.chartOverlaySymbolSection}>
                    <View style={[styles.symbolSection, { minHeight: 'auto' }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('Select Symbol')}
                        style={styles.symbolSectionTapTarget}
                        onPress={handleOpenSymbolPicker}
                        activateOnPressIn
                        activateOnTouchStart
                        hitSlop={8}
                        unstable_pressDelay={0}
                      >
                        <View style={styles.symbolSectionContent}>
                          {chartDisplay.showTicker ? (
                            <>
                              <View style={styles.symbolNameRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                  <Text style={[styles.symbolText, { opacity: 0.9, textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{displaySymbol}</Text>
                                  <Ionicons name="chevron-down" size={10} color={T.text} />
                                  {symbolCategory ? (
                                    <View style={[styles.fxBadge, { marginLeft: 4 }]}>
                                      <Text style={styles.fxBadgeText} numberOfLines={1}>{symbolCategory}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>

                              <View style={styles.symbolMetaRow}>
                                <Text style={[styles.symbolSubText, { textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{symbolName}</Text>
                              </View>
                            </>
                          ) : null}
                          {showChartMetaRow && (
                            <View style={styles.symbolOhlcRow}>
                              {chartMetaItems.map((item) => (
                                <View key={item.label} style={styles.symbolOhlcPair}>
                                  <Text style={[styles.symbolOhlcLabel, { textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>
                                    {item.label}:
                                  </Text>
                                  <Text style={[styles.symbolOhlcValue, { color: item.color, textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>
                                    {item.value}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </Pressable>
                    </View>
                  </View>
                )}
                {chartTapMenuAnchor ? (
                  <ChartTapRadialMenu
                    anchor={chartTapMenuAnchor}
                    bounds={chartTapMenuBounds}
                    activeTimeframe={chartTimeframe}
                    accentColor={BLUE}
                    mutedColor="#FFFFFF"
                    isDark={isDark}
                    onDismiss={closeChartTapMenu}
                    onSelectTimeframe={handleTimeframeSelect}
                    onOpenObjects={() => {
                      closeChartTapMenu();
                      router.push('/chart/objects');
                    }}
                    onOpenDrawingTools={() => {
                      closeChartTapMenu();
                      handleOpenDrawingTools();
                    }}
                    onOpenIndicators={() => {
                      closeChartTapMenu();
                      router.push('/chart/indicators');
                    }}

                    onOpenSymbolPicker={() => {
                      closeChartTapMenu();
                      handleOpenSymbolPicker();
                    }}
                    onOpenScaleControls={handleOpenChartScaleMenu}
                  />
                ) : null}
                <ChartTimeframePickerOverlay
                  visible={timeframePickerVisible}
                  activeTimeframe={chartTimeframe}
                  supportedTimeframes={timeframes}
                  accentColor={BLUE}
                  isDark={isDark}
                  textColor={T.text}
                  mutedColor={TEXT_MUTED}
                  onClose={handleCloseTimeframePicker}
                  onSelect={handleTimeframeSelect}
                />
              </View>
            </View>
          </View>

          {!isChartExpanded && showChartTradeSheet && (
            <View
              style={[
                styles.bottomArea,
                { display: 'none', paddingBottom: 0 },
              ]}
            >
              <Animated.View
                style={[
                  { display: 'none' },
                  styles.chartTradeSheetFrame,
                  { height: chartTradeSheetMaxHeight },
                  chartTradeSheetAnimatedStyle,
                ]}
              >
                <View
                  style={[
                    styles.chartTradeSheet,
                    styles.chartTradeSheetInline,
                    styles.chartTradeSheetInlineFloating,
                    useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
                  ]}
                >
                  {renderChartTradeSheetDragHeader()}
                  {renderChartTradeSheetTopHeader()}
                  <ScrollView
                    ref={chartTradeTypeTabsInlineScrollRef}
                    horizontal
                    nestedScrollEnabled
                    directionalLockEnabled
                    keyboardShouldPersistTaps="always"
                    showsHorizontalScrollIndicator={false}
                    style={[
                      styles.chartTradeTypeTabsScroll,
                      useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
                    ]}
                    onLayout={(event) => {
                      chartTradeTypeTabsInlineViewportWidthRef.current = event.nativeEvent.layout.width;
                      scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
                    }}
                    contentContainerStyle={[
                      styles.chartTradeTypeTabs,
                      useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
                    ]}
                  >
                    {CHART_ORDER_TYPES.map((option) => {
                      const active = option === chartTradeOrderType;
                      return (
                        <Pressable
                          key={option}
                          onLayout={(event) => {
                            chartTradeTypeTabsInlineLayoutsRef.current[option] = {
                              x: event.nativeEvent.layout.x,
                              width: event.nativeEvent.layout.width,
                            };
                          }}
                          style={[
                            styles.chartTradeTypeTab,
                            useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                            active && styles.chartTradeTypeTabActive,
                            useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
                          ]}
                          onPress={() => handleChartTradeOrderTypeSelect(option)}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[
                              styles.chartTradeTypeTabText,
                              useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                              active && styles.chartTradeTypeTabTextActive,
                              useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                            ]}
                            numberOfLines={1}
                          >
                            {option}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <ScrollView
                    canCancelContentTouches={Platform.OS === 'ios'}
                    ref={undefined}
                    style={styles.chartTradeSheetContentScroll}
                    contentContainerStyle={[
                      styles.chartTradeSheetContent,
                      { paddingBottom: chartTradeSheetContentBottomPadding },
                    ]}
                    nestedScrollEnabled
                    bounces={false}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode={chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                      chartTradeSheetScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                    }}
                  >
                    <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
                      <View
                        style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
                      >
                        <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Volume')}</Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <TextInput
                              style={[
                                styles.chartTradeVolumeInput,
                                useMtPendingTradeSheetLayout && styles.chartTradeVolumeInputPending,
                              ]}
                              value={chartTradeVolumeInputFocused ? chartTradeVolumeDraft : chartTradeVolumePrimaryDisplay}
                              onFocus={handleFocusChartTradeVolumeInput}
                              onChangeText={handleChartTradeVolumeDraftChange}
                              onBlur={handleBlurChartTradeVolumeDraft}
                              onEndEditing={handleEndChartTradeVolumeDraft}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              selectTextOnFocus
                              showSoftInputOnFocus
                              onSubmitEditing={handleSubmitChartTradeVolumeDraft}
                              placeholder={passiveLotDisplay}
                              placeholderTextColor="#94A3B8"
                            />
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                runImmediateAction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                              activateOnPressIn
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.chartTradeVolumeDivider} />
                        <Pressable
                          style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            handleToggleChartTradeVolumeDisplayMode();
                          }}
                          hitSlop={8}
                          unstable_pressDelay={0}
                        >
                          <Text
                            style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {t(chartTradeVolumeModeLabel)}
                          </Text>
                          <View
                            style={[
                              styles.chartTradeStepperLaunchButton,
                              useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                            ]}
                          >
                            <View style={styles.chartTradeStepperLaunchIconStack}>
                              <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                              <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                            </View>
                          </View>
                        </Pressable>
                      </View>

                      <ChartTradeVolumeSlider
                        styles={styles}
                        value={tradeVolume}
                        bounds={tradeVolumeBounds}
                        onChange={updateTradeVolume}
                      />

                      <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
                        {isChartTradeMarginMode ? (
                          <Text
                            style={[styles.chartTradeMetaText, styles.chartTradeMetaSummary, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}
                            numberOfLines={1}
                          >
                            {t('Lots')}: <Text style={styles.chartTradeMetaSummaryValue}>{passiveLotDisplay}</Text>{'  '}
                            {t('Max')}: <Text style={styles.chartTradeMetaSummaryValue}>{chartTradeMaxVolumeDisplay}</Text>
                          </Text>
                        ) : (
                          <Text style={[styles.chartTradeMetaLink, useMtPendingTradeSheetLayout && styles.chartTradeMetaLinkPending]}>
                            {t('Margin')} <Text style={styles.chartTradeMetaText}>≈ {fmt.price(chartTradeMarginEstimate)} {accountCurrency}</Text>
                          </Text>
                        )}
                        <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
                          {t('Balance')}: {fmt.price(accountBalance)} {accountCurrency}
                        </Text>
                        <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
                          {t('Free')}: {fmt.price(accountFreeMargin)} {accountCurrency}
                        </Text>
                      </View>

                      {isPendingChartOrderType(chartTradeOrderType) && (
                        <Pressable
                          style={[
                            styles.chartTradePriceCard,
                            styles.chartTradePriceCardPending,
                            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                          ]}
                          onPress={() => runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }))}
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <Text
                              style={[
                                styles.chartTradePriceInput,
                                styles.chartTradePriceInputPending,
                                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                              ]}
                            >
                              {chartTradePrice > 0 ? chartTradePrice.toFixed(displayDecimals) : (chartBid > 0 ? chartBid.toFixed(displayDecimals) : '--')}
                            </Text>
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </Pressable>
                      )}

                      {isStopLimitChartOrder && (
                        <Pressable
                          style={[
                            styles.chartTradePriceCard,
                            styles.chartTradePriceCardPending,
                            useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                          ]}
                          onPress={() =>
                            runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                              setChartStepperEditor({ kind: 'stopLimitPrice' }))
                          }
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
                            {t('Stop Limit Price')}
                          </Text>
                          <View style={styles.chartTradeVolumeValueGroup}>
                            <Text
                              style={[
                                styles.chartTradePriceInput,
                                styles.chartTradePriceInputPending,
                                useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                              ]}
                            >
                              {chartTradeStopLimitPrice > 0 ? chartTradeStopLimitPrice.toFixed(displayDecimals) : '--'}
                            </Text>
                            <Pressable
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                                  setChartStepperEditor({ kind: 'stopLimitPrice' }));
                              }}
                              hitSlop={8}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </Pressable>
                          </View>
                        </Pressable>
                      )}

                      <Pressable
                        style={[styles.chartTradeStopButton, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending]}
                        onPress={handleEnableChartTradeStops}
                        unstable_pressDelay={0}
                        accessibilityRole="button"
                        accessibilityLabel={chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                      >
                        <View style={styles.chartTradeStopButtonContent}>
                          <View style={styles.chartTradeStopButtonIcon}>
                            <Ionicons name="shield-checkmark-outline" size={17} color={BLUE} />
                          </View>
                          <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
                            {chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={BLUE} />
                        </View>
                      </Pressable>

                      {(chartTradeSlEnabled || chartTradeTpEnabled) && (
                        <View style={styles.chartTradeStopsBlock}>
                          <View style={styles.chartTradeStopUnitRow}>
                            {chartTradeStopUnitOptions.map((unit) => {
                              const active = chartTradeStopUnit === unit.key;
                              return (
                                <Pressable
                                  key={unit.key}
                                  style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                                  onPress={() => runImmediateAction(`chart.tradeSheet.stopUnit.${unit.key}`, () => setChartTradeStopUnit(unit.key))}
                                  unstable_pressDelay={0}
                                >
                                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <View style={styles.chartTradeStopPairRow}>
                            <Pressable
                              style={[
                                styles.chartTradeStopPairCard,
                                styles.chartTradeStopPairCardSl,
                                !chartTradeSlEnabled && styles.chartTradeStopPairCardInactive,
                              ]}
                              onPress={() => runImmediateAction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }))}
                              unstable_pressDelay={0}
                              accessibilityRole="button"
                              accessibilityLabel={t('Stop Loss')}
                            >
                              <View style={styles.chartTradeStopPairHeader}>
                                <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeSl]}>
                                  <Ionicons name="trending-down-outline" size={16} color="#EF4444" />
                                </View>
                                {chartTradeStopUnit === 'Pips' && (
                                  <Pressable
                                    hitSlop={8}
                                    onPress={(e) => {
                                      e.stopPropagation?.();
                                      runImmediateAction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((v) => !v));
                                    }}
                                    style={[styles.chartTradeStopPairLock, chartTradeSlLocked && styles.chartTradeStopPairLockActive]}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('Stop Loss')}
                                  >
                                    <Ionicons
                                      name={chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                                      size={15}
                                      color={chartTradeSlLocked ? BLUE : TEXT_MUTED}
                                    />
                                  </Pressable>
                                )}
                              </View>
                              <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Stop Loss')}</Text>
                              <Text
                                style={[
                                  styles.chartTradeStopPairValue,
                                  !chartTradeSlEnabled && styles.chartTradeStopPairValueMuted,
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                              >
                                {chartTradeSlEnabled ? chartTradeSlPrice.toFixed(displayDecimals) : '--'}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.chartTradeStopPairCard,
                                styles.chartTradeStopPairCardTp,
                                !chartTradeTpEnabled && styles.chartTradeStopPairCardInactive,
                              ]}
                              onPress={() => runImmediateAction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }))}
                              unstable_pressDelay={0}
                              accessibilityRole="button"
                              accessibilityLabel={t('Take Profit')}
                            >
                              <View style={styles.chartTradeStopPairHeader}>
                                <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeTp]}>
                                  <Ionicons name="trending-up-outline" size={16} color="#16A34A" />
                                </View>
                                {chartTradeStopUnit === 'Pips' && (
                                  <Pressable
                                    hitSlop={8}
                                    onPress={(e) => {
                                      e.stopPropagation?.();
                                      runImmediateAction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((v) => !v));
                                    }}
                                    style={[styles.chartTradeStopPairLock, chartTradeTpLocked && styles.chartTradeStopPairLockActive]}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('Take Profit')}
                                  >
                                    <Ionicons
                                      name={chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                                      size={15}
                                      color={chartTradeTpLocked ? BLUE : TEXT_MUTED}
                                    />
                                  </Pressable>
                                )}
                              </View>
                              <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Take Profit')}</Text>
                              <Text
                                style={[
                                  styles.chartTradeStopPairValue,
                                  !chartTradeTpEnabled && styles.chartTradeStopPairValueMuted,
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                              >
                                {chartTradeTpEnabled ? chartTradeTpPrice.toFixed(displayDecimals) : '--'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      )}

                      {showChartTradeExpiration ? (
                        <Pressable
                          style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
                          onPress={handleOpenChartExpirationMenu}
                          activateOnPressIn
                          unstable_pressDelay={0}
                        >
                          <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
                          <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(chartTradeExpiration)}</Text>
                          <Ionicons name="swap-vertical" size={12} color={BLUE} />
                        </Pressable>
                      ) : null}
                      {showChartTradeComment ? (
                        <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
                          {chartTradeCommentFocused && !showFloatingChartTradeCommentEditor ? (
                            <View style={styles.chartTradeCommentEditorInlineRow}>
                              <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                                <TextInput
                                  ref={chartTradeCommentInputRef}
                                  autoFocus
                                  showSoftInputOnFocus
                                  style={styles.chartTradeCommentEditorInlineInput}
                                  value={chartTradeComment}
                                  onChangeText={(text) => setChartTradeComment(text.slice(0, 50))}
                                  onBlur={handleBlurChartTradeComment}
                                  placeholder={t('Comment')}
                                  placeholderTextColor='#94A3B8'
                                  maxLength={31}
                                  multiline={false}
                                  returnKeyType='done'
                                  onSubmitEditing={handleSubmitChartTradeComment}
                                />
                              </View>
                              <Pressable
                                onPressIn={() => {
                                  chartTradeCommentSubmitIntentRef.current = true;
                                }}
                                style={[
                                  styles.chartTradeCommentEditorInlineSubmit,
                                  !chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                                ]}
                                disabled={!chartTradeComment.trim()}
                                onPress={handleSubmitChartTradeComment}
                              >
                                <Ionicons
                                  name='checkmark'
                                  size={16}
                                  color={chartTradeComment.trim() ? BLUE : '#94A3B8'}
                                />
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={[
                                styles.chartTradeInfoRow,
                                useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                                chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
                              ]}
                              onPress={handleFocusChartTradeComment}
                            >
                              <Text
                                style={[
                                  styles.chartTradeInfoLabel,
                                  useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                                  styles.chartTradeCommentInlineLabel,
                                ]}
                              >
                                {t('Comment')}:
                              </Text>
                              <Text
                                style={[
                                  styles.chartTradeCommentInlineValue,
                                  !chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                                  useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                                  chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                                ]}
                                numberOfLines={1}
                              >
                                {chartTradeComment.trim() || t('Add comment')}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ) : null}

                      {chartTradeOrderType === 'Market Execution' ? (
                        <ChartTradeButtons
                          symbol={chartSymbol}
                          displayDecimals={displayDecimals}
                          lotSize={tradeVolume}
                          volumeBounds={tradeVolumeBounds}
                          comment={chartTradeComment}
                          variant='mt5-market'
                          active={chartRuntimeActive}
                          fallbackBid={chartBid}
                          fallbackAsk={chartAsk}
                          onTradeResult={handleChartTradeResult}
                          isDark={isDark}
                          buyColor={BLUE}
                          sellColor={T.trading.sell.primary}
                        />
                      ) : (
                        <>
                          <Pressable
                            style={[
                              styles.chartTradePlaceButton,
                              disablePendingTradePlaceButton
                                ? styles.chartTradePlaceButtonDisabled
                                : { backgroundColor: chartTradeCtaColor },
                            ]}
                            onPress={disablePendingTradePlaceButton ? undefined : handleSubmitPendingTradeFromSheet}
                            disabled={disablePendingTradePlaceButton}
                          >
                            <Text
                              style={[
                                styles.chartTradePlaceButtonText,
                                disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
                              ]}
                              numberOfLines={1}
                            >
                              {`${t('Place')} ${t(chartTradeOrderType)}`}
                            </Text>
                          </Pressable>
                        </>
                      )}
                      <LiveOrderTickExecutionGraph
                        symbol={chartSymbol}
                        bid={chartBid}
                        ask={chartAsk}
                        timestamp={chartTradeTickTimestamp}
                        enabled={showChartTradeSheet}
                        priceDecimals={displayDecimals}
                        bidColor="#2563EB"
                        askColor="#EF4444"
                        height={286}
                        isDark={isDark}
                      />
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            </View>
          )}
          {!isChartExpanded && chartDisplay.showQuickTradingButtons && chartOneClickPanelAtBottom && (
            <ChartTradeInlineFooter
              LiveTradeButtons={ChartTradeButtons}
              styles={styles}
              animatedStyle={floatingFooterTradeReserveAnimatedStyle}
              containerRef={footerTradeRowAnchorRef}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              hideInlineTradeRow={Platform.OS === 'android' && isFloatingFooterTradeRowVisible}
              showFloatingFooterTradeRow={shouldMountFloatingFooterTradeRow}
              chartSymbol={chartSymbol}
              displayDecimals={displayDecimals}
              tradeVolume={tradeVolume}
              tradeVolumeBounds={tradeVolumeBounds}
              onTradeResult={handleChartTradeResult}
              onEditLot={handleFocusFooterLotEditor}
              onOpenLotEditor={handleOpenFooterLotPicker}
              isLotEditing={footerLotEditorFocused}
              lotDraft={lotInput}
              lotInputRef={footerLotEditorInputRef}
              onLotDraftChange={handleFooterLotDraftChange}
              onLotDraftBlur={handleBlurFooterLotEditor}
              onLotDraftEndEditing={handleEndFooterLotEditor}
              onLotDraftSubmit={handleSubmitFooterLotEditor}
              onDecreaseLot={() => handleStepFooterLotEditor(-1)}
              onIncreaseLot={() => handleStepFooterLotEditor(1)}
              lotInvalid={footerLotInvalid}
              invalidLotDisplay={footerLotInvalidDisplay}
              active={chartRuntimeActive}
              fallbackBid={chartBid}
              fallbackAsk={chartAsk}
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
          )}
          {!isChartExpanded && chartDisplay.showQuickTradingButtons && chartOneClickPanelAtBottom && showChartTradeSheet && showInlineFooterWhileChartTradeSheetOpen ? (
            <ChartTradeInlineFooter
              LiveTradeButtons={ChartTradeButtons}
              styles={styles}
              animatedStyle={undefined}
              containerRef={footerTradeRowAnchorRef}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              showFloatingFooterTradeRow={false}
              chartSymbol={chartSymbol}
              displayDecimals={displayDecimals}
              tradeVolume={tradeVolume}
              tradeVolumeBounds={tradeVolumeBounds}
              onTradeResult={handleChartTradeResult}
              onEditLot={handleFocusFooterLotEditor}
              onOpenLotEditor={handleOpenFooterLotPicker}
              isLotEditing={footerLotEditorFocused}
              lotDraft={lotInput}
              lotInputRef={footerLotEditorInputRef}
              onLotDraftChange={handleFooterLotDraftChange}
              onLotDraftBlur={handleBlurFooterLotEditor}
              onLotDraftEndEditing={handleEndFooterLotEditor}
              onLotDraftSubmit={handleSubmitFooterLotEditor}
              onDecreaseLot={() => handleStepFooterLotEditor(-1)}
              onIncreaseLot={() => handleStepFooterLotEditor(1)}
              lotInvalid={footerLotInvalid}
              invalidLotDisplay={footerLotInvalidDisplay}
              active={chartRuntimeActive}
              fallbackBid={chartBid}
              fallbackAsk={chartAsk}
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
          ) : null}
        </ScrollView>
        {chartTradeOverlayLayer}
      </View>





      <ChartStepperModal
        visible={chartStepperEditor !== null}
        title={
          chartStepperEditor?.kind === 'price'
            ? t('Price')
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? t('Stop Limit Price')
              : chartStepperEditor?.kind === 'tp'
                ? t('Take Profit')
                : chartStepperEditor?.kind === 'sl'
                  ? t('Stop Loss')
                  : chartStepperEditor?.kind === 'volume'
                    ? t('Volume')
                    : ''
        }
        initial={
          chartStepperEditor?.kind === 'price'
            ? chartTradePrice || chartBid
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? chartTradeStopLimitPrice
              : chartStepperEditor?.kind === 'tp'
                ? chartTradeTpPrice
                : chartStepperEditor?.kind === 'sl'
                  ? chartTradeSlPrice
                  : chartStepperEditor?.kind === 'volume'
                    ? tradeVolume
                    : 0
        }
        step={
          chartStepperEditor?.kind === 'volume'
            ? (resolveTradeVolumeBounds(tradeVolumeBounds).stepVolume ?? 0.01)
            : chartPointSize * 10
        }
        decimals={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).decimals
            : Math.max(displayDecimals, 0)
        }
        min={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).minVolume
            : undefined
        }
        max={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).maxVolume
            : undefined
        }
        editable={chartStepperEditor?.kind === 'volume'}
        styles={styles}
        onClose={() => setChartStepperEditor(null)}
        onCommit={(next) => {
          if (chartStepperEditor?.kind === 'price') setChartTradePrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'stopLimitPrice') setChartTradeStopLimitPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'tp') setChartTradeTpPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'sl') setChartTradeSlPrice(roundTradePrice(next));
          else if (chartStepperEditor?.kind === 'volume') updateTradeVolume(next);
        }}
      />









      {showDatePicker && (
        <Pressable
          style={styles.calendarOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.calendarContainer}>
            <Calendar
              onDayPress={(day: any) => {
                handleCustomDateRange(new Date(day.timestamp));
              }}
              maxDate={new Date().toISOString().split('T')[0]}
              theme={{
                backgroundColor: isDark ? T.glass2 : T.glass2,
                calendarBackground: isDark ? T.glass2 : T.glass2,
                textSectionTitleColor: T.textSub,
                selectedDayBackgroundColor: BLUE,
                selectedDayTextColor: '#ffffff',
                todayTextColor: BLUE,
                dayTextColor: T.text,
                textDisabledColor: T.textMuted,
                monthTextColor: T.text,
                arrowColor: BLUE,
              }}
            />
          </View>
        </Pressable>
      )}

      <TextLevelEditOverlay
        accentColor={BLUE}
        isDark={isDark}
        request={textLevelEditRequest}
        onCancel={handleCancelTextLevelEdit}
        onCommit={handleCommitTextLevelEdit}
      />

      <TradeFeedbackModal
        state={tradeFeedback}
        onClose={handleTradeFeedbackClose}
        isDark={isDark}
      />
    </Screen>
  );
});

// Thin wrapper: derive the chart-active boolean from the path here so the heavy
// memoized component above does not reconcile on every bottom-tab switch. Only a
// change in isChartRouteActive (entering/leaving the chart) re-renders it.
/**
 * The main entry point and container for the Chart view. Orchestrates the webview-based chart, one-click trading panel, order placement buttons, lot sizing, price scale interactions, and all drawing tools.
 */
export function ChartScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <ChartScreenInner isChartRouteActive={deferredScreenFocused} />;
}
