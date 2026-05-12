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
import { ActivityIndicator, AppState, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import {
  ChartTapRadialMenu,
  type ChartTapMenuAnchor,
  type ChartTapMenuBounds,
} from './components/ChartTapRadialMenu';
import {
  ChartDrawingToolbarButton,
  ChartDrawingToolsSidebar,
} from './components/ChartDrawingToolsFeature';
import { createDrawingToolsActionSheetActions } from './drawingTools';
import {
  ChartFixedHorizontalGridOverlay,
  type FixedHorizontalGridPlotArea,
} from './components/ChartFixedHorizontalGridOverlay';
import {
  ChartToolbarMoreButton,
  ChartToolbarObjectsButton,
} from './components/ChartToolbarMenuFeature';
import {
  ChartTradeInlineFooter,
  ChartTradeOverlayLayer,
} from './components/ChartTradeFeature';
import { ChartTradeButtons } from './components/ChartTradeButtonsFeature';
import { LiveOrderTickExecutionGraph } from '../trade/OrderTickExecutionGraph';
import { Screen } from '../../ui/components/Screen';
import { AppHeader } from '../../ui/components/AppHeader';
import { useTranslation } from '../../i18n/useTranslation';
import {
  type ChartTradeVolumeDisplayMode,
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { useTheme } from '../../ui/theme/useTheme';
import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { liveCandlesEngine } from '../../api/ws/liveCandlesEngine';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useOrdersByLoginQuery } from '../../query/orders';
import { TradeFeedbackModal, TradeFeedbackState, TRADE_MODAL_INITIAL } from '../../ui/components/TradeFeedbackModal';

import { usePositionsState } from '../../state/positionsState';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAlertsQuery } from '../../query/alerts';
import { useMarketSymbols } from '../../query/market';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { WebView } from 'react-native-webview';
import { hasLiveQuoteFeedData, useMarketData } from '../../query/websocket';
import { normalizeTimeframe } from '../../domain/candles/core/candles';
import { sanitizeCandlesForChart } from '../../domain/candles/normalization/chartAdapter';
import {
  getBucketGapCount,
  getExpectedNextCandleTime,
} from '../../domain/candles/core/timeframeUtils';
import { buildChartOverlayPayload, CHART_LINE_STYLE, type ChartOverlayPriceLine } from './chartOverlays';
import {
  getChartDrawingBucketKey,
  sanitizePersistedChartDrawings,
} from './drawingPersistence';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
  resolveLatestCandleGap,
} from './liveChartSync';
import { useShallow } from 'zustand/shallow';
import { recordUiFeedGap, traceUiInteraction } from '../../dev/uiInteractionDiagnostics';
import { getDevRefreshKey, hashDevRefreshSource } from '../../dev/devRefreshKey';
import {
  formatTradeVolume,
  incrementTradeVolume,
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
  type ChartOrderType,
} from './chartTradeOrderUtils';
import {
  type FooterLotPickerMode,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetMaxHeight,
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
import { LivePriceHeader, LiveQuotePairHeader } from "./components/ChartLiveHeaders";
import { ChartStepperModal, ChartFooterLotPicker, ChartTradeVolumeSlider } from "./components/ChartTradeControls";
import { DraggableChartMetaOverlay } from "./components/DraggableChartMetaOverlay";
import { ChartTapMenuViewport, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING, CHART_GRID_LINE_STYLE, CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS, CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT, CHART_TRADE_SHEET_TOP_GAP, formatLooseTradeVolumeLabel, resolveMaxTradeVolumeForMargin, getChartTradeContractSize, resolveTradeStopPreviewPrice, timeframes, ChartTradeTypeTabLayout, ChartTradePreviewDragKey, TextInputCommitEvent } from "./ChartScreen.constants";

// Micro-component: isolated 4fps render cycle, 0 DOM depth
// Uses quotes WS (bid/ask) as primary price source and falls back to candle close.
// Micro-component: isolated 1fps render cycle for the clock
const CHART_SYMBOLS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'NZDUSD', 'USDCAD', 'EURGBP', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'XAUUSD', 'BTCUSD'];

const SYMBOL_FLAGS: Record<string, [string, string]> = {
  EURUSD: ['eu', 'us'], GBPUSD: ['gb', 'us'], AUDUSD: ['au', 'us'],
  USDJPY: ['us', 'jp'], NZDUSD: ['nz', 'us'], USDCAD: ['us', 'ca'],
  EURGBP: ['eu', 'gb'], AUDCAD: ['au', 'ca'], AUDCHF: ['au', 'ch'],
  AUDJPY: ['au', 'jp'],
};

const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSD: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  XAUUSD: 'https://assets.coingecko.com/coins/images/10481/small/tether-gold.png',
};

const SYMBOL_NAMES: Record<string, string> = {
  EURUSD: 'Euro / US Dollar', GBPUSD: 'British Pound / USD',
  AUDUSD: 'Australian Dollar / USD', USDJPY: 'US Dollar / Japanese Yen',
  NZDUSD: 'New Zealand Dollar / USD', USDCAD: 'US Dollar / Canadian Dollar',
  EURGBP: 'Euro / British Pound', AUDCAD: 'Australian / Canadian Dollar',
  AUDCHF: 'Australian / Swiss Franc', AUDJPY: 'Australian / Japanese Yen',
  XAUUSD: 'Gold / US Dollar', BTCUSD: 'Bitcoin / US Dollar',
};

const SYMBOL_CATEGORY: Record<string, string> = {
  XAUUSD: 'METAL', BTCUSD: 'CRYPTO',
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

export function ChartScreen() {
  const T = useTheme();
  const { t } = useTranslation();
  const isScreenFocused = useIsFocused();
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
    if (!isScreenFocused || !accountLogin) return;
    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);
    return () => clearInterval(interval);
  }, [accountLogin, isScreenFocused, refreshPositions]);

  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    priceSource,
    chartColors,
    chartColorScheme,
    chartDisplay,
    chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar,
    chartDrawingRecordsBySymbol,
    tradeVolume,
    chartTradeVolumeDisplayMode,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    setChartViewportShowVolumePane,
    setChartViewportShowDrawingToolbar,
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
      priceSource: state.priceSource,
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      chartViewportShowVolumePane: state.chartViewportShowVolumePane,
      chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      tradeVolume: state.tradeVolume,
      chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartSymbol: state.setChartSymbol,
      setChartViewportShowVolumePane: state.setChartViewportShowVolumePane,
      setChartViewportShowDrawingToolbar: state.setChartViewportShowDrawingToolbar,
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
  const showTradingSignals = chartShowOnChart.tradingSignals;
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const chartDrawingBucketKey = useMemo(() => getChartDrawingBucketKey(chartSymbol), [chartSymbol]);
  const chartDrawingRecords = useMemo(
    () => chartDrawingRecordsBySymbol[chartDrawingBucketKey] ?? [],
    [chartDrawingBucketKey, chartDrawingRecordsBySymbol],
  );
  const chartDrawingSignature = useMemo(() => JSON.stringify(chartDrawingRecords), [chartDrawingRecords]);

  const { data: apiSymbols = [] } = useMarketSymbols();
  const availableSymbols = apiSymbols.length > 0 ? apiSymbols : CHART_SYMBOLS;
  const { data: chartInstrumentMeta } = useInstrumentMeta(chartSymbol);
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

  useEffect(() => {
    if (apiSymbols.length > 0 && !apiSymbols.includes(chartSymbol)) {
      setChartSymbol(apiSymbols[0]);
    }
  }, [apiSymbols, chartSymbol, setChartSymbol]);

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);
  const chartLiveQuotes = useMarketData(chartSymbol ? [chartSymbol] : []);
  const chartLiveQuote = chartLiveQuotes[chartSymbol];
  const displayDecimals = useMemo(() => {
    const liveDigits =
      typeof chartLiveQuote?.digits === 'number' && Number.isFinite(chartLiveQuote.digits)
        ? Math.floor(chartLiveQuote.digits)
        : null;
    if (liveDigits !== null) {
      return Math.min(Math.max(liveDigits, 0), 8);
    }
    return baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;
  }, [baseSymbol, chartLiveQuote?.digits]);
  const { data: closedPositions = [], refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: orders = [], refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: alerts = [], refetch: refetchAlerts } = useAlertsQuery({
    enabled: isScreenFocused,
  });
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(
    accountLogin ? String(accountLogin) : undefined,
    { enabled: isScreenFocused },
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


  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    if (!footerLotEditorFocused) {
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
    }
    if (!chartTradeVolumeInputFocused) {
      setChartTradeVolumeDraftValue(formatTradeVolume(normalized, tradeVolumeBounds));
    }
  }, [
    chartTradeVolumeInputFocused,
    footerLotEditorFocused,
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
    setFooterLotPickerMode(null);
    setFooterLotDraft(formatTradeVolume(tradeVolume, tradeVolumeBounds));
    setFooterLotEditorOpening(Platform.OS === 'android');
    setFooterLotEditorFocused(true);
  }, [setFooterLotDraft, tradeVolume, tradeVolumeBounds]);
  const finishFooterLotEditor = useCallback((draftOverride?: string) => {
    // Always prefer the ref (latest typed value) when no explicit override given
    commitLotDraft(draftOverride ?? footerLotDraftRef.current);
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
  const [chartTradeStopUnit, setChartTradeStopUnit] = useState<'Price' | 'Pips' | 'Currency'>('Price');
  const [chartTradeSlLocked, setChartTradeSlLocked] = useState(false);
  const [chartTradeTpLocked, setChartTradeTpLocked] = useState(false);
  const [chartTradeSheetMode, setChartTradeSheetMode] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [keyboardVisibleHeight, setKeyboardVisibleHeight] = useState(0);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);
  const [chartTradeSheetHostHeight, setChartTradeSheetHostHeight] = useState(0);
  const [chartTradeKeyboardFreeHostHeight, setChartTradeKeyboardFreeHostHeight] = useState(0);
  const [chartTradeInlineFooterHeight, setChartTradeInlineFooterHeight] = useState(0);
  const [chartTradeTopToolbarBottomOffset, setChartTradeTopToolbarBottomOffset] = useState(0);
  const [chartTradeCompactHeaderHeight, setChartTradeCompactHeaderHeight] = useState(0);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const setChartInlineInputActive = useUIState((s) => s.setChartInlineInputActive);
  const showActionSheet = useUIState((s) => s.showActionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const safeInsets = useSafeAreaInsets();
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
  const chartTradeSheetFallbackTopInset = isChartExpanded ? fullscreenToolbarTopPadding + 36 : 48;
  const chartTradeSheetToolbarBottomInset =
    chartTradeTopToolbarBottomOffset > 0
      ? Math.max(chartTradeTopToolbarBottomOffset, chartTradeSheetFallbackTopInset)
      : chartTradeSheetFallbackTopInset;
  const chartTradeSheetTopInset = chartTradeSheetToolbarBottomInset + CHART_TRADE_SHEET_TOP_GAP;
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
  const fullscreenChartTypeMenuTop = safeInsets.top + 52 + (fullscreenToolbarTouchBuffer - 8);
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
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [chartTapMenuAnchor, setChartTapMenuAnchor] = useState<ChartTapMenuAnchor | null>(null);
  const [chartTapMenuBounds, setChartTapMenuBounds] = useState<ChartTapMenuBounds>({ width: 0, height: 0 });
  const [chartTapMenuViewport, setChartTapMenuViewport] = useState<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const [chartPlotArea, setChartPlotArea] = useState<FixedHorizontalGridPlotArea | null>(null);
  const [showDrawingQuickActions, setShowDrawingQuickActions] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [chartViewportTouchActive, setChartViewportTouchActive] = useState(false);
  const pendingChartDrawingTool = useUIState((s) => s.pendingChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((s) => s.clearPendingChartDrawingTool);
  const shouldCaptureChartGestures =
    isChartExpanded || activeTool !== 'crosshair' || Boolean(pendingChartDrawingTool);

  const webViewRef = useRef<WebView>(null);
  const chartViewportRef = useRef<View>(null);
  const chartTapMenuBoundsRef = useRef<ChartTapMenuBounds>({ width: 0, height: 0 });
  const chartTapMenuViewportRef = useRef<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const chartTapMenuSuppressUntilRef = useRef(0);
  const chartSwitchCommitSeqRef = useRef(0);
  const lastChartViewportSizeRef = useRef({ width: 0, height: 0 });
  const pendingChartViewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const chartViewportResizeFrameRef = useRef<number | null>(null);
  const chartViewportResizeCommitFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryTokenRef = useRef(0);
  const chartViewportTouchReleaseFrameRef = useRef<number | null>(null);
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
    if (initialBounds.width <= 0 || initialBounds.height <= 0) {
      return;
    }

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

        const resizeWidth = viewport.width > 0 ? viewport.width : fallbackBounds.width;
        const resizeHeight = viewport.height > 0 ? viewport.height : fallbackBounds.height;
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
  const { candles, paginate } = useLiveCandles(chartSymbol, chartTimeframe);
  const latestChartClose = useMemo(() => candles[candles.length - 1]?.close ?? 0, [candles]);
  const hasLiveChartQuote = hasLiveQuoteFeedData(chartLiveQuote);
  const quoteFallbackSpread =
    baseSymbol.includes('BTC') ? 25 : baseSymbol.includes('XAU') || baseSymbol.includes('XAG') ? 0.3 : 0.00015;
  const chartBid = useMemo(() => {
    const liveBid =
      hasLiveChartQuote && typeof chartLiveQuote?.bid === 'number' && chartLiveQuote.bid > 0
        ? chartLiveQuote.bid
        : null;
    return liveBid ?? latestChartClose;
  }, [chartLiveQuote?.bid, hasLiveChartQuote, latestChartClose]);
  const chartAsk = useMemo(() => {
    const liveAsk =
      hasLiveChartQuote && typeof chartLiveQuote?.ask === 'number' && chartLiveQuote.ask > 0
        ? chartLiveQuote.ask
        : null;
    return liveAsk ?? (chartBid > 0 ? chartBid + quoteFallbackSpread : 0);
  }, [chartBid, chartLiveQuote?.ask, hasLiveChartQuote, quoteFallbackSpread]);
  const chartTradeTickTimestamp = useMemo(() => {
    const candidates = [
      chartLiveQuote?.lastReceivedAt,
      chartLiveQuote?.time,
      chartLiveQuote?.timestamp,
      chartLiveQuote?.t,
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
    chartLiveQuote?.t,
    chartLiveQuote?.time,
    chartLiveQuote?.timestamp,
  ]);
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
  const resolveDefaultPendingPrice = useCallback(
    (orderType: ChartOrderType) => {
      const bid = chartBid > 0 ? chartBid : latestChartClose;
      const ask = chartAsk > 0 ? chartAsk : bid + quoteFallbackSpread;
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
    [chartAsk, chartBid, chartPendingOffset, latestChartClose, quoteFallbackSpread, roundTradePrice],
  );

  const injectChartScript = (script: string) => {
    webViewRef.current?.injectJavaScript(`${script} true;`);
  };

  const closeChartTapMenu = useCallback(() => {
    setChartTapMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (activeTool !== 'crosshair') {
      closeChartTapMenu();
    }
  }, [activeTool, closeChartTapMenu]);

  useEffect(() => {
    closeChartTapMenu();
  }, [chartSymbol, chartTimeframe, chartVisualType, isChartExpanded, closeChartTapMenu]);

  const handleSetTool = (tool: string) => {
    closeChartTapMenu();
    setActiveTool(tool);
    injectChartScript(`setDrawingTool(${JSON.stringify(tool)});`);
  };

  const handleClearDrawings = () => {
    closeChartTapMenu();
    setActiveTool('crosshair');
    setChartDrawingRecordsForSymbol(chartSymbol, []);
    lastWebViewDrawingSignatureRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    injectChartScript('clearDrawings();');
  };

  const handleToggleMagnet = () => {
    closeChartTapMenu();
    const next = !magnetEnabled;
    setMagnetEnabled(next);
    injectChartScript(`setMagnetMode(${next});`);
  };

  const handleToggleStickyMode = () => {
    closeChartTapMenu();
    const next = !stickyDrawingMode;
    setStickyDrawingMode(next);
    injectChartScript(`setStayInDrawingMode(${next});`);
  };

  const handleToggleLock = () => {
    closeChartTapMenu();
    const next = !chartLockAll;
    setChartLockAll(next);
    if (next) {
      setActiveTool('crosshair');
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
    const side = getChartOrderSide(orderType);
    const entryPrice = resolveChartTradeEntryPrice(orderType);
    setChartTradePrice(entryPrice);
    setChartTradeStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, entryPrice, chartStopLimitOffset, roundTradePrice),
    );
    setChartTradeSlEnabled(false);
    setChartTradeTpEnabled(false);
    setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', entryPrice, side, chartStopOffset, roundTradePrice));
    setChartTradeComment('');
    setChartTradeCommentFocused(false);
  }, [chartStopLimitOffset, chartStopOffset, chartTradeOrderType, resolveChartTradeEntryPrice, roundTradePrice]);

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
    traceUiInteraction('chart.tradeSheet.open', openChartTradeSheet);
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
    traceUiInteraction(`chart.tradeSheet.orderType.${orderType}`, () => {
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

  const handleEnableChartTradeStops = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.enableStops', () => {
      const baseEntry = isPendingChartOrderType(chartTradeOrderType)
        ? chartTradePrice
        : resolveChartTradeEntryPrice(chartTradeOrderType);
      const side = getChartOrderSide(chartTradeOrderType);
      if (!chartTradeSlEnabled) {
        setChartTradeSlEnabled(true);
        setChartTradeSlPrice(resolveTradeStopPreviewPrice('sl', baseEntry, side, chartStopOffset, roundTradePrice));
      }
      if (!chartTradeTpEnabled) {
        setChartTradeTpEnabled(true);
        setChartTradeTpPrice(resolveTradeStopPreviewPrice('tp', baseEntry, side, chartStopOffset, roundTradePrice));
      }
      snapTradeSheet('expanded');
    });
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeTpEnabled,
    resolveChartTradeEntryPrice,
    roundTradePrice,
    snapTradeSheet,
  ]);

  const handleToggleChartTradeStopLevel = useCallback((kind: 'sl' | 'tp') => {
    const baseEntry = isPendingChartOrderType(chartTradeOrderType)
      ? chartTradePrice
      : resolveChartTradeEntryPrice(chartTradeOrderType);
    const side = getChartOrderSide(chartTradeOrderType);
    const nextPrice = resolveTradeStopPreviewPrice(kind, baseEntry, side, chartStopOffset, roundTradePrice);

    if (kind === 'sl') {
      if (chartTradeSlEnabled) {
        setChartTradeSlEnabled(false);
        return;
      }
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextPrice);
      return;
    }

    if (chartTradeTpEnabled) {
      setChartTradeTpEnabled(false);
      return;
    }
    setChartTradeTpEnabled(true);
    setChartTradeTpPrice(nextPrice);
  }, [
    chartStopOffset,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeTpEnabled,
    resolveChartTradeEntryPrice,
    roundTradePrice,
  ]);
  const handleSubmitPendingTradeFromSheet = useCallback(() => {
    // Pending CTA must NOT open a blocking preview-only alert. Per
    // chartOverlayBridgeStability.test.ts: collapse the sheet so the
    // chart's draggable price lines are exposed for chart-side editing.
    traceUiInteraction('chart.tradeSheet.pending.editOnChart', () => {
      snapTradeSheet('collapsed');
    });
  }, [snapTradeSheet]);
  const handleToggleChartTradeSheetMode = useCallback(() => {
    snapTradeSheet(chartTradeSheetMode === 'expanded' ? 'collapsed' : 'expanded');
  }, [chartTradeSheetMode, snapTradeSheet]);
  const handleOpenChartExpirationMenu = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.expiration.open', () => {
      setFooterLotPickerMode(null);
      setChartTradeCommentFocused(false);
      Keyboard.dismiss();
      showActionSheet({
        title: t('Expiration'),
        actions: [
          { label: t('GTC'), onPress: () => setChartTradeExpiration('GTC') },
          { label: t('Today'), onPress: () => setChartTradeExpiration('Today') },
          { label: t('Date and Time'), onPress: () => setChartTradeExpiration('Date and Time') },
          { label: t('Date'), onPress: () => setChartTradeExpiration('Date') },
        ],
      });
    });
  }, [showActionSheet, t]);
  const handleFocusChartTradeComment = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.comment.focus', () => {
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
    setChartTradeCommentFocused(false);
  }, []);
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
    traceUiInteraction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
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
    traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
  }, []);
  const handleOpenChartTradeStopLimitPriceStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () => setChartStepperEditor({ kind: 'stopLimitPrice' }));
  }, []);
  const handleSelectChartTradeStopUnit = useCallback((unit: 'Price' | 'Pips' | 'Currency') => {
    traceUiInteraction(`chart.tradeSheet.stopUnit.${unit}`, () => setChartTradeStopUnit(unit));
  }, []);
  const handleOpenChartTradeSlStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }));
  }, []);
  const handleOpenChartTradeTpStepper = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }));
  }, []);
  const handleToggleChartTradeSlLock = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((value) => !value));
  }, []);
  const handleToggleChartTradeTpLock = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((value) => !value));
  }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const scheduleKeyboardLayoutAnimation =
      (Keyboard as typeof Keyboard & { scheduleLayoutAnimation?: (event: unknown) => void }).scheduleLayoutAnimation;

    const showSub = Keyboard.addListener(showEvent, (event) => {
      scheduleKeyboardLayoutAnimation?.(event);
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
    const maxAttempts = Platform.OS === 'android' ? 8 : 2;

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
    ? !stablePendingTradePlaceButtonEnabled
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
  const frozenFooterLotChartViewportStyle = useMemo(
    () => (
      shouldFreezeFooterLotChartViewport && chartTapMenuBounds.height > 0
        ? { minHeight: chartTapMenuBounds.height }
        : null
    ),
    [chartTapMenuBounds.height, shouldFreezeFooterLotChartViewport],
  );
  const accountCurrency = accountSummary?.currency || 'USD';
  const isChartTradeMarginMode = chartTradeVolumeDisplayMode === 'margin';
  const chartTradeVolumePrimaryDisplay = isChartTradeMarginMode
    ? `${fmt.price(chartTradeMarginEstimate)} ${accountCurrency}`
    : passiveLotDisplay;
  const chartTradeVolumeModeLabel = isChartTradeMarginMode ? 'Margin' : 'Lots';
  const handleToggleChartTradeVolumeDisplayMode = useCallback(() => {
    traceUiInteraction('chart.tradeSheet.volumeDisplay.toggle', () => {
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
    floatingFooterTradeReserveHeight.value = withTiming(isFloatingFooterTradeRowVisible ? 58 : 0, {
      duration: 220,
    });
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

    if (isPendingChartOrderType(chartTradeOrderType)) {
      previewLines.push({
        id: 'chart-trade-entry-preview',
        price: entryPrice,
        color: pendingEntryColor,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
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
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `STOP LIMIT ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`
          : '',
        dragKey: 'stopLimit',
      });
    }

    if (chartTradeTpEnabled && Number.isFinite(chartTradeTpPrice) && chartTradeTpPrice > 0) {
      previewLines.push({
        id: 'chart-trade-tp-preview',
        price: chartTradeTpPrice,
        color: resolvedChartColors.tradeTpSl || '#089981',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `TP, + ${usdFor(chartTradeTpPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeTpPrice)} points`
          : '',
        dragKey: 'tp',
      });
    }

    if (chartTradeSlEnabled && Number.isFinite(chartTradeSlPrice) && chartTradeSlPrice > 0) {
      previewLines.push({
        id: 'chart-trade-sl-preview',
        price: chartTradeSlPrice,
        color: resolvedChartColors.tradeStopOut || '#F23645',
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: true,
        title: showChartTradeStopLabelsOnChart
          ? `SL, - ${usdFor(chartTradeSlPrice).toFixed(2)} ${accountCurrency}, ${pointsFor(chartTradeSlPrice)} points`
          : '',
        dragKey: 'sl',
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
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showChartViewportMenu, setShowChartViewportMenu] = useState(false);
  const [showTimeRangeMenu, setShowTimeRangeMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);

  const hasCandles = candles.length > 0;
  const timeRangeCandlesRef = useRef(candles);
  const chartCandles = useMemo(
    () => filterCandlesForChartTimeRange(activeDateRange, candles, customDateValue),
    [activeDateRange, candles, customDateValue],
  );
  useEffect(() => {
    timeRangeCandlesRef.current = candles;
  }, [candles]);
  const formatChartValue = useCallback(
    (value: number | null | undefined) => (Number.isFinite(value) ? Number(value).toFixed(displayDecimals) : '--'),
    [displayDecimals],
  );
  const chartMetaBackendLast = chartCandles.length > 0 ? chartCandles[chartCandles.length - 1] : null;
  const chartMetaLastCandle = chartMetaBackendLast;
  const chartMetaIsUp = chartMetaLastCandle ? chartMetaLastCandle.close >= chartMetaLastCandle.open : true;
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
            { label: 'O', value: formatChartValue(chartMetaLastCandle.open) },
            { label: 'H', value: formatChartValue(chartMetaLastCandle.high) },
            { label: 'L', value: formatChartValue(chartMetaLastCandle.low) },
            { label: 'C', value: formatChartValue(chartMetaLastCandle.close) },
          ]
        : [];

      return items;
    },
    [chartDisplay.showOHLC, chartLatestCandleGap, chartMetaLastCandle, formatChartValue],
  );
  const showChartMetaRow = chartMetaItems.length > 0;
  const showChartVolumePane = chartViewportShowVolumePane;
  const showChartDrawingToolbar = isChartExpanded && chartViewportShowDrawingToolbar;
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
    traceUiInteraction('chart.viewport.reset', () => {
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
    Keyboard.dismiss();
  }, [closeChartTapMenu]);
  const handleOpenChartViewportMenu = useCallback(() => {
    traceUiInteraction('chart.viewport.menu.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: t('Chart'),
        actions: [
          {
            label: t(showChartVolumePane ? 'Hide Volume Bar' : 'Show Volume Bar'),
            icon: <Ionicons name={showChartVolumePane ? 'eye-off-outline' : 'bar-chart-outline'} size={20} color={TEXT_MUTED} />,
            onPress: () => setChartViewportShowVolumePane(!showChartVolumePane),
          },
          ...(isChartExpanded
            ? [{
                label: t(chartViewportShowDrawingToolbar ? 'Hide Drawing Tools' : 'Show Drawing Tools'),
                icon: <Ionicons name={chartViewportShowDrawingToolbar ? 'eye-off-outline' : 'pencil-outline'} size={20} color={TEXT_MUTED} />,
                onPress: () => setChartViewportShowDrawingToolbar(!chartViewportShowDrawingToolbar),
              }]
            : []),
          {
            label: t('Reset'),
            icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleResetChartViewport,
          },
        ],
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, t, showChartVolumePane, isChartExpanded, chartViewportShowDrawingToolbar, setChartViewportShowVolumePane, setChartViewportShowDrawingToolbar, handleResetChartViewport]);


  const prefetchChartTimeframeHistory = useCallback((nextSymbol: string, nextTimeframe: string) => {
    return liveCandlesEngine.prefetchHistory(nextSymbol, nextTimeframe);
  }, []);

  const warmChartContextAndCommit = useCallback(
    (nextSymbol: string, nextTimeframe: string) => {
      const switchSeq = chartSwitchCommitSeqRef.current + 1;
      chartSwitchCommitSeqRef.current = switchSeq;
      void prefetchChartTimeframeHistory(nextSymbol, nextTimeframe).then((count) => {
        if (
          typeof __DEV__ !== 'undefined' &&
          __DEV__ &&
          chartSwitchCommitSeqRef.current === switchSeq
        ) {
          console.log('[CHART-BRIDGE] switch_prefetch_complete', {
            symbol: nextSymbol,
            timeframe: nextTimeframe,
            count,
          });
        }
      });
      if (nextSymbol !== chartSymbol) {
        setChartSymbol(nextSymbol);
        void prefetchInstrument(nextSymbol);
      }
      if (nextTimeframe !== chartTimeframe) {
        setChartTimeframe(nextTimeframe);
      }
    },
    [chartSymbol, chartTimeframe, prefetchChartTimeframeHistory, setChartSymbol, setChartTimeframe],
  );

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    traceUiInteraction(`chart.timeframe.${nextTimeframe}`, () => {
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
    traceUiInteraction(`chart.symbol.${nextSymbol}`, () => {
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

  const handleOpenSymbolPicker = useCallback(() => {
    traceUiInteraction('chart.symbolPicker.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: t('Select Symbol'),
        searchable: true,
        detent: 'large',
        runActionAfterClose: false,
        actions: availableSymbols.map((sym) => ({
          label: sym,
          onPress: () => handleSymbolSelect(sym),
        })),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, t, availableSymbols, handleSymbolSelect]);

  const handleOpenTimeframePicker = useCallback(() => {
    traceUiInteraction('chart.timeframePicker.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: t('Timeframes'),
        runActionAfterClose: false,
        actions: timeframes.map((tf) => {
          void prefetchChartTimeframeHistory(chartSymbol, tf);
          return { label: tf, onPress: () => handleTimeframeSelect(tf) };
        }),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, t, timeframes, handleTimeframeSelect, chartSymbol, prefetchChartTimeframeHistory]);

  const handleOpenChartTypePicker = useCallback(() => {
    traceUiInteraction('chart.chartType.open', () => {
      closeChartTapMenu();
      setShowChartTypeMenu(true);
    });
  }, [closeChartTapMenu]);
  const handleCloseChartTypePicker = useCallback(() => {
    setShowChartTypeMenu(false);
  }, []);
  const handleSelectChartType = useCallback((nextType: 'candles' | 'hollow' | 'bars' | 'line') => {
    traceUiInteraction(`chart.chartType.select.${nextType}`, () => {
      setChartVisualType(nextType);
      setShowChartTypeMenu(false);
    });
  }, [setChartVisualType]);

  const handleOpenObjectsScreen = useCallback(() => {
    traceUiInteraction('chart.objects.open', () => {
      closeChartTapMenu();
      requestAnimationFrame(() => {
        router.push('/chart/objects');
      });
    });
  }, [closeChartTapMenu]);

  const handleOpenSignalDetails = useCallback(() => {
    traceUiInteraction('chart.signalDetails.open', () => {
      closeChartTapMenu();
      setShowSignalDetails(true);
    });
  }, [closeChartTapMenu]);

  const handleOpenDrawingTools = useCallback(() => {
    traceUiInteraction('chart.drawingTools.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: t('Drawing Tools'),
        minimumTopInset: drawingToolsSheetTopInset,
        actions: createDrawingToolsActionSheetActions({
          chartHideAll,
          chartLockAll,
          magnetEnabled,
          onClearDrawings: handleClearDrawings,
          onSelectTool: handleSetTool,
          onToggleHide: handleToggleHide,
          onToggleLock: handleToggleLock,
          onToggleMagnet: handleToggleMagnet,
          onToggleStickyMode: handleToggleStickyMode,
          onZoomTool: handleZoomTool,
          stickyDrawingMode,
        }),
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, t, drawingToolsSheetTopInset, magnetEnabled, stickyDrawingMode, chartLockAll, chartHideAll, handleSetTool, handleZoomTool, handleToggleMagnet, handleToggleStickyMode, handleToggleLock, handleToggleHide, handleClearDrawings]);

  const handleOpenSettingsScreen = useCallback(() => {
    traceUiInteraction('chart.settings.open', () => {
      closeChartTapMenu();
      requestAnimationFrame(() => {
        router.push('/chart/settings');
      });
    });
  }, [closeChartTapMenu]);

  const handleToggleChartExpanded = useCallback(() => {
    traceUiInteraction('chart.expand.toggle', () => {
      closeChartTapMenu();
      setIsChartExpanded(!isChartExpanded);
    });
  }, [closeChartTapMenu, isChartExpanded, setIsChartExpanded]);

  const handleChartMoreRemoveFromFavorites = useCallback(() => {
    hideActionSheet();
  }, [hideActionSheet]);

  const handleOpenChartTradingCalculator = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/calculator', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenChartAnalytics = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/analytics', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenChartSpecification = useCallback(() => {
    hideActionSheet();
    router.push({ pathname: '/chart/specification', params: { symbol: chartSymbol } });
  }, [chartSymbol, hideActionSheet]);

  const handleOpenMoreMenu = useCallback(() => {
    traceUiInteraction('chart.moreMenu.open', () => {
      resetChartActionSheetContext();
      showActionSheet({
        title: t('Options'),
        actions: [
          {
            label: t('Remove from favorites'),
            icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
            onPress: handleChartMoreRemoveFromFavorites,
          },
          {
            label: t('Trading calculator'),
            icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartTradingCalculator,
          },
          {
            label: t('Analytics'),
            icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartAnalytics,
          },
          {
            label: t('Specification'),
            icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
            onPress: handleOpenChartSpecification,
          },
        ],
      });
    });
  }, [resetChartActionSheetContext, showActionSheet, t, handleChartMoreRemoveFromFavorites, handleOpenChartTradingCalculator, handleOpenChartAnalytics, handleOpenChartSpecification]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: resolvedChartColors.background },
      textColor: resolvedChartColors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: {
        color: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
      horzLines: {
        color: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
      horzLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
    },
    timeScale: {
      borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
      barSpacing: CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
      minBarSpacing: CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
    },
    rightPriceScale: {
      borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
      autoScale: false,
      entireTextOnly: false,
      scaleMargins: {
        top: 0.08,
        bottom: showChartVolumePane && chartType !== 'line' ? 0.32 : 0.08,
      },
    },
    customColors: {
      candlesUptrend: resolvedChartColors.candlesUptrend,
      candlesDowntrend: resolvedChartColors.candlesDowntrend,
      hollowBody: resolvedChartColors.hollowBody,
      barsUptrend: resolvedChartColors.barsUptrend,
      barsDowntrend: resolvedChartColors.barsDowntrend,
      lineBody: resolvedChartColors.lineBody,
    }
  }), [chartDisplay.showGrid, chartType, resolvedChartColors, showChartVolumePane]);

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
  const lastWebViewDrawingSignatureRef = useRef('');
  const lastInjectedDrawingSyncRef = useRef({ signature: '', epoch: -1 });
  // Loading overlay: delay before showing so fast cached switches (< 500 ms)
  // never flash a spinner. Falls back to hiding at 3 s to prevent an
  // indefinite blocking overlay when the chart fails to respond.
  const [loadingDelayPassed, setLoadingDelayPassed] = useState(false);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const candlesAvailable = candles.length > 0;
  useEffect(() => {
    setLoadingDelayPassed(false);
    setLoadingFallback(false);
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
  }, [chartSymbol, chartTimeframe, chartType]);
  // The moment candles arrive, drop the "no market data" fallback regardless
  // of how long the REST/WS handshake took. This prevents a brief flash of
  // the empty-state overlay when the timer happens to fire just before the
  // first candle batch lands.
  useEffect(() => {
    if (candlesAvailable && loadingFallback) {
      setLoadingFallback(false);
    }
  }, [candlesAvailable, loadingFallback]);
  useEffect(() => {
    drawingSignatureRef.current = chartDrawingSignature;
  }, [chartDrawingSignature]);
  const requestOverlaySync = useCallback(() => {
    setOverlaySyncRevision((revision) => revision + 1);
  }, []);
  const refreshShowOnChartSources = useCallback(() => {
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
  ]);
  useFocusEffect(
    useCallback(() => {
      refreshShowOnChartSources();
      requestChartViewportRecovery(3);
      return cancelChartViewportRecovery;
    }, [cancelChartViewportRecovery, refreshShowOnChartSources, requestChartViewportRecovery]),
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
  const isLoading = !chartCanvasReady && loadingDelayPassed && !loadingFallback;
  const isError = false;
  const isNoMarketData = candles.length === 0 && !isLoading && loadingFallback;

  useEffect(() => {
    if (!webViewReady || !chartCanvasReady) return;
    const bridgedTool = chartLockAll ? 'crosshair' : activeTool;
    injectChartScript(`
      setDrawingsLocked(${chartLockAll});
      setDrawingsHidden(${chartHideAll});
      setStayInDrawingMode(${stickyDrawingMode});
      setMagnetMode(${magnetEnabled});
      setDrawingTool(${JSON.stringify(bridgedTool)});
    `);
  }, [activeTool, webViewReady, chartCanvasReady, chartLockAll, chartHideAll, stickyDrawingMode, magnetEnabled, chartSymbol, chartTimeframe, chartType]);

  useEffect(() => {
    if (!hasCandles || !webViewReady || !chartCanvasReady) {
      return;
    }
    applyNativeTimeRange(activeDateRange, customDateValue);
  }, [activeDateRange, applyNativeTimeRange, chartCanvasReady, chartReadyEpoch, chartTimeframe, customDateValue, hasCandles, webViewReady]);

  useEffect(() => {
    if (!pendingChartDrawingTool || !chartCanvasReady || !webViewReady) {
      return;
    }

    setActiveTool(pendingChartDrawingTool);
    injectChartScript(`setDrawingTool(${JSON.stringify(pendingChartDrawingTool)});`);
    clearPendingChartDrawingTool();
  }, [pendingChartDrawingTool, chartCanvasReady, webViewReady, clearPendingChartDrawingTool]);

  // ─────────────────────────────────────────────────────────────────
  //   Self-healing chart bridge
  //
  //   Professional-grade: the chart ALWAYS renders. Period.
  //
  //   • sendInit() is the single function that pushes chart data to
  //     the WebView. It can be called any number of times safely.
  //   • A watchdog timer re-sends initChart if CHART_READY hasn't
  //     arrived within 2 seconds. Repeats every 3s until success.
  //   • On data arrival: always sends initChart (WebView is idempotent).
  //   • On WebView reload: READY resets state, next data push re-inits.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(candles);
  const chartInitializedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitSigRef = useRef('');
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  const lastInjectedLiveQuoteSignatureRef = useRef('');
  const chartCandleFrontendPaintRef = useRef<{
    availableAt: number;
    length: number;
    signature: string;
  } | null>(null);

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    lastInjectedLiveQuoteSignatureRef.current = '';
    setChartCanvasReady(false);
    setChartPlotArea(null);
  };

  useEffect(() => {
    candlesRef.current = candles;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const last = candles[candles.length - 1];
      console.log('[CHART-CANDLES]', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: candles.length,
        lastTime: last?.time ?? null,
      });
      console.log('[CHART-BRIDGE] useLiveCandles_update', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: candles.length,
      });
    }
  }, [candles, chartSymbol, chartTimeframe]);

  // Render backend candle timestamps directly. The shared candle engine owns
  // sorting, dedupe, and OHLC validation; the WebView receives the same
  // timestamped history+live series for wicks, overlays, gaps, and tooltips.
  const buildMappedData = useCallback((sourceCandles: typeof candles) => {
    // Sort + dedupe defensively because lightweight-charts requires strictly
    // monotonic time values. A duplicate or out-of-order timestamp would
    // throw "Cannot update oldest data" and abort the entire chart paint.
    const cleaned = sanitizeCandlesForChart(sourceCandles, { timeframe: chartTimeframe });
    if (cleaned.length === 0) {
      return [];
    }

    const MAX_WHITESPACE_INJECTION = 2880; // Up to 48 hours of gaps to prevent OOM
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

      if (i < cleaned.length - 1) {
        // We removed whitespace injection here because it causes the chart bridge
        // to render invalid gaps or spikes if the custom series plugin doesn't 
        // properly ignore WhitespaceData objects.
      }
    }

    if (result.length > 0) {
      const lastFew = result.slice(-3);
      console.log('CHART DATA DEBUG: Last 3 candles mapped:', JSON.stringify(lastFew));
    }
    return result;
  }, [chartType, chartTimeframe]);

  // Track current config signature. When it changes, mark chart as
  // not-initialized so the watchdog knows to retry for the new config.
  const currentSig = useMemo(
    () => `${chartSymbol}-${normalizeTimeframe(chartTimeframe)}-${chartType}-${showChartVolumePane ? 'vol' : 'novol'}-${chartColorsSignature}`,
    [chartSymbol, chartTimeframe, chartType, chartColorsSignature, showChartVolumePane],
  );
  useEffect(() => {
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) {
      chartCandleFrontendPaintRef.current = null;
      return;
    }

    const signature = `${currentSig}:${candles.length}:${lastCandle.time}:${lastCandle.open}:${lastCandle.high}:${lastCandle.low}:${lastCandle.close}`;
    if (chartCandleFrontendPaintRef.current?.signature === signature) {
      return;
    }

    chartCandleFrontendPaintRef.current = {
      availableAt: Date.now(),
      length: candles.length,
      signature,
    };
  }, [candles, currentSig]);

  useEffect(() => {
    // Config changed — previous CHART_READY is stale.
    if (lastInitSigRef.current !== currentSig) {
      chartInitializedRef.current = false;
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      lastInjectedLiveQuoteSignatureRef.current = '';
      setChartCanvasReady(false);
      setChartPlotArea(null);
    }
  }, [currentSig]);

  // Core init function — safe to call repeatedly.
  // The WebView's initChart tears down any existing chart and rebuilds.
  const sendInit = useCallback(() => {
    if (!webViewRef.current || !webViewReady) return;

    // Once the current chart config is already live, incremental candle sync
    // handles backend candle updates. Avoid re-mapping the full merged series on
    // every tick just to discover init is already current.
    if (currentSig === lastInitSigRef.current && chartInitializedRef.current) return;

    const data = candlesRef.current;
    const mapped = data.length > 0 ? buildMappedData(data) : [];

    const js = `
      initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}, ${showChartVolumePane});
      true;
    `;
    try {
      webViewRef.current.injectJavaScript(js);
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, currentSig, chartOptions, chartType, displayDecimals, buildMappedData, showChartVolumePane]);

  // Effect 1 — send initChart whenever data or config changes.
  useEffect(() => {
    sendInit();
  }, [candles, sendInit]);

  // Effect 2 — keep the WebView aligned with the canonical candle stream.

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const renderableCandles = sanitizeCandlesForChart(candles, { timeframe: chartTimeframe });
    if (renderableCandles.length === 0) {
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      return;
    }

    const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
    const updateMode = getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[CHART-BRIDGE] candle_sync_mode', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
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
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[CHART-BRIDGE] inject_updateChartData', {
              symbol: chartSymbol,
              timeframe: chartTimeframe,
              count: mapped.length,
            });
          }
          webViewRef.current.injectJavaScript(`
            updateChartData(${JSON.stringify(mapped)});
            true;
          `);
          didInject = true;
        }
      } else {
        const lastCandle = renderableCandles[renderableCandles.length - 1];
        if (lastCandle) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
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
    }
  }, [candles, chartCanvasReady, chartReadyEpoch, chartType, buildMappedData, chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const hasBid = Number.isFinite(chartBid) && chartBid > 0;
    const hasAsk = Number.isFinite(chartAsk) && chartAsk > 0;

    if (!hasBid && !hasAsk) {
      return;
    }

    const lastCandleForSig = candlesRef.current[candlesRef.current.length - 1];
    const lastCandleSig = lastCandleForSig
      ? `${lastCandleForSig.time}:${lastCandleForSig.open}:${lastCandleForSig.high}:${lastCandleForSig.low}:${lastCandleForSig.close}`
      : 'no';
    const nextSignature = [
      hasBid ? chartBid.toFixed(displayDecimals) : 'na',
      hasAsk ? chartAsk.toFixed(displayDecimals) : 'na',
      lastCandleSig,
    ].join('|');

    if (lastInjectedLiveQuoteSignatureRef.current === nextSignature) {
      return;
    }

    // Quotes move market price lines only; candle geometry comes from the
    // canonical REST history plus backend live-candle stream.
    try {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[CHART-BRIDGE] inject_setMarketPriceLines', {
          symbol: chartSymbol,
          timeframe: chartTimeframe,
          bid: hasBid ? chartBid : null,
          ask: hasAsk ? chartAsk : null,
        });
      }
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof setMarketPriceLines === 'function') {
            setMarketPriceLines(${hasBid ? chartBid : 'null'}, ${hasAsk ? chartAsk : 'null'});
          }
        } catch (_) {}
        true;
      `);
      lastInjectedLiveQuoteSignatureRef.current = nextSignature;
    } catch (_e) { /* WebView may have been disposed */ }
  }, [
    candles,
    chartAsk,
    chartBid,
    chartCanvasReady,
    chartReadyEpoch,
    chartSymbol,
    chartTimeframe,
    displayDecimals,
  ]);

  // Watchdog — if CHART_READY hasn't arrived, keep retrying every 3s.
  // Also acts as a self-heal: if the WebView silently loses the chart
  // (process killed, JS error, etc.), this brings it back.
  useEffect(() => {
    if (!isScreenFocused) {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      return;
    }

    if (watchdogRef.current) clearInterval(watchdogRef.current);

    watchdogRef.current = setInterval(() => {
      if (!chartInitializedRef.current && webViewReady) {
        console.log('[CHART WATCHDOG] chart not confirmed, re-sending initChart');
        sendInit();
      }
    }, 1000);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [isScreenFocused, webViewReady, sendInit]);

  const overlayPayload = useMemo(
    () => {
      if (!preferencesHydrated) {
        return { priceLines: chartTradePreviewLines, markers: [] };
      }

      const basePayload = buildChartOverlayPayload({
        chartSymbol,
        candles,
        positions,
        orders,
        closedPositions,
        alerts,
        colors: resolvedChartColors,
        sellColor: T.trading.sell.primary,
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
      candles,
      positions,
      orders,
      closedPositions,
      alerts,
      resolvedChartColors,
      T.trading.sell.primary,
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
    if (!webViewReady || !chartCanvasReady || !webViewRef.current) {
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
  }, [chartCanvasReady, chartDrawingRecords, chartDrawingSignature, chartReadyEpoch, webViewReady]);

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
    if (!isScreenFocused || !webViewReady || !chartCanvasReady || !webViewRef.current) {
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
    isScreenFocused,
    overlayPayloadSignature,
    webViewReady,
    chartCanvasReady,
    chartReadyEpoch,
    overlaySyncRevision,
  ]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
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
        disablePendingTradePlaceButton,
        chartTradeCtaColor,
        candles,
        chartSymbol,
        chartBid,
        chartAsk,
        chartTradeTickTimestamp,
        onTradeResult: setTradeFeedback,
      }}
      footer={{
        showFloatingFooterTradeRow: shouldMountFloatingFooterTradeRow,
        floatingFooterTradeRowVisible: isFloatingFooterTradeRowVisible,
        footerTradeRowKeyboardOffset,
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
      {!isChartExpanded && (
        <View style={styles.headerWrapper}>
          <AppHeader title={t('Chart')} noBorder />
          <View
            style={styles.compactHeader}
            onLayout={(event) => {
              const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
              if (nextHeight > 0) {
                setChartTradeCompactHeaderHeight((current) => (current === nextHeight ? current : nextHeight));
              }
            }}
          >
            {/* Left: Symbol Info */}
            <Pressable
              style={styles.symbolSection}
              onPress={handleOpenSymbolPicker}
              unstable_pressDelay={0}
            >
              <View>
                <View style={styles.symbolNameRow}>
                  <Text style={[styles.symbolText, { opacity: 0.9 }]} numberOfLines={1} adjustsFontSizeToFit>{displaySymbol}</Text>
                  <View style={styles.fxBadge}>
                    <Text style={styles.fxBadgeText}>{symbolCategory}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText} numberOfLines={1} adjustsFontSizeToFit>{symbolName}</Text>
              </View>
            </Pressable>

            {/* Right: Live Price */}
            <View style={styles.rightSection}>
              <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} priceSource={priceSource} candles={candles} />
            </View>
          </View>
        </View>
      )}

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
          ref={chartScrollRef}
          style={styles.card}
          contentContainerStyle={[
            styles.chartScrollContent,
            isChartExpanded && { minHeight: fullscreenChartMinHeight },
          ]}
          nestedScrollEnabled
          scrollEnabled={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          bounces={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          alwaysBounceVertical={!shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={() => syncChartViewportFrame()}
        >
        <View style={[styles.chartContainer, isChartExpanded && { minHeight: fullscreenChartMinHeight }]}>
          <View
            style={[styles.chartTopToolbar, isChartExpanded && { paddingTop: fullscreenToolbarTopPadding, marginTop: 0 }]}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              const nextOffset = Math.max(0, Math.round(y + height));
              setChartTradeTopToolbarBottomOffset((current) => (current === nextOffset ? current : nextOffset));
            }}
          >
            <View style={styles.toolbarButtonRow}>
              <View style={styles.toolbarSlotFirst}>
                <Pressable
                  style={styles.toolbarTimeframeButton}
                  onPress={handleOpenTimeframePicker}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>{chartTimeframe}</Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarTradeButton}
                  onPress={handleOpenChartTradeSheet}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Text style={styles.toolbarTradeText}>SL/TP</Text>
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarComboButton}
                  onPress={handleOpenChartTypePicker}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name={chartType === 'candles' || chartType === 'hollow' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'} size={18} color={TEXT_MUTED} />
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <ChartToolbarObjectsButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenObjectsScreen}
              />
              {showTradingSignals && (
                <View style={styles.toolbarSlot}>
                  <Pressable
                    style={styles.toolbarIconButton}
                    onPress={handleOpenSignalDetails}
                    hitSlop={8}
                    unstable_pressDelay={0}
                  >
                    <View style={styles.redBoxIcon}>
                      <Ionicons name="arrow-down" size={14} color="#FFF" />
                    </View>
                  </Pressable>
                </View>
              )}
              <ChartDrawingToolbarButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenDrawingTools}
              />
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarIconButton}
                  onPress={handleOpenSettingsScreen}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name="options-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <View style={styles.toolbarSlot}>
                <Pressable
                  style={styles.toolbarIconButton}
                  onPress={handleToggleChartExpanded}
                  hitSlop={8}
                  unstable_pressDelay={0}
                >
                  <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
              <ChartToolbarMoreButton
                isDark={isDark}
                textMutedColor={TEXT_MUTED}
                onPress={handleOpenMoreMenu}
              />
            </View>
          </View>
          {showChartTypeMenu ? (
            <View pointerEvents="box-none" style={styles.chartTypeMenuLayer}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={handleCloseChartTypePicker}
                unstable_pressDelay={0}
              />
              <View
                style={[
                  styles.chartTypeMenuCard,
                  { top: isChartExpanded ? fullscreenChartTypeMenuTop : 56 },
                ]}
              >
                {[
                  { key: 'candles' as const, label: 'Candlestick', icon: 'stats-chart' as const },
                  { key: 'hollow' as const, label: 'Hollow Candles', icon: 'stats-chart-outline' as const },
                  { key: 'bars' as const, label: 'OHLC Bars', icon: 'bar-chart-outline' as const },
                  { key: 'line' as const, label: 'Line', icon: 'trending-up-outline' as const },
                ].map((option, index, arr) => {
                  const active = chartType === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.chartTypeMenuOption,
                        index < arr.length - 1 && styles.chartTypeMenuOptionDivider,
                        active && styles.chartTypeMenuOptionActive,
                      ]}
                      onPress={() => handleSelectChartType(option.key)}
                      unstable_pressDelay={0}
                    >
                      <View style={styles.chartTypeMenuOptionLeft}>
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={active ? BLUE : TEXT_MUTED}
                        />
                        <Text
                          style={[
                            styles.chartTypeMenuOptionText,
                            active && styles.chartTypeMenuOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark" size={16} color={BLUE} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <ChartDrawingToolsSidebar
              activeTool={activeTool}
              chartHideAll={chartHideAll}
              chartLockAll={chartLockAll}
              colors={{ blue: BLUE, textMuted: TEXT_MUTED }}
              isChartExpanded={isChartExpanded}
              isDark={isDark}
              magnetEnabled={magnetEnabled}
              onClearDrawings={handleClearDrawings}
              onOpenDrawingTools={handleOpenDrawingTools}
              onSelectTool={handleSetTool}
              onToggleHide={handleToggleHide}
              onToggleLock={handleToggleLock}
              onToggleMagnet={handleToggleMagnet}
              onToggleStickyMode={handleToggleStickyMode}
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
                const freezeViewportResize =
                  shouldFreezeChartViewportResize &&
                  lastChartViewportSizeRef.current.height > 0 &&
                  height < lastChartViewportSizeRef.current.height;
                if (freezeViewportResize) {
                  return;
                }
                setChartTapMenuBounds({ width, height });
                scheduleChartViewportResize(width, height);
                syncChartViewportFrame();
              }}
            >
              {isLoading && (
                <View style={styles.chartOverlay}>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.overlayText}>{t('Loading chart data...')}</Text>
                </View>
              )}

              {isError && !isLoading && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>{t('Unable to load chart')}</Text>
                  <Text style={styles.overlaySubText}>{t('Waiting for market data connection...')}</Text>
                </View>
              )}

              {isNoMarketData && !isError && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="analytics-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>{t('No market data available')}</Text>
                  <Text style={styles.overlaySubText}>{t('Waiting for backend candle data...')}</Text>
                </View>
              )}

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
                      // WebView loaded — reset state and mark ready.
                      // The watchdog + Effect 1 will push initChart as soon as data exists.
                      resetChartBridgeState();
                      lastWebViewDrawingSignatureRef.current = '';
                      lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
                      setWebViewReady(true);
                    } else if (msg.type === 'CHART_READY') {
                      // Chart successfully rendered in WebView.
                      chartInitializedRef.current = true;
                      lastInitSigRef.current = currentSig;
                      setChartCanvasReady(true);
                      lastInjectedLiveQuoteSignatureRef.current = '';
                      // Force-paint any retained candles right now — without
                      // this, candles received before CHART_READY would only
                      // reach the chart via the next React effect cycle, and
                      // a fast switch could end up rendering an empty chart
                      // until the engine emits its next update.
                      try {
                        const readyCandles = sanitizeCandlesForChart(candlesRef.current, { timeframe: chartTimeframe });
                        if (readyCandles.length > 0 && webViewRef.current) {
                          const mapped = buildMappedData(readyCandles as typeof candles);
                          if (mapped.length > 0) {
                            webViewRef.current.injectJavaScript(`
                              updateChartData(${JSON.stringify(mapped)});
                              true;
                            `);
                            renderedSeriesSnapshotRef.current = buildChartSeriesSnapshot(readyCandles);
                          }
                        }
                      } catch (_) {}
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
                      // Immediately push the latest overlay so lines appear
                      // without waiting for the next React effect cycle.
                      try {
                        const latestOverlay = overlayPayloadRef.current ?? { priceLines: [], markers: [] };
                        const hasBid = Number.isFinite(chartBid) && chartBid > 0;
                        const hasAsk = Number.isFinite(chartAsk) && chartAsk > 0;
                        if (webViewRef.current) {
                          webViewRef.current.injectJavaScript(`
                            if (typeof setChartOverlays === 'function') {
                              setChartOverlays(${JSON.stringify(latestOverlay)});
                            }
                            if (typeof setMarketPriceLines === 'function') {
                              setMarketPriceLines(${hasBid ? chartBid : 'null'}, ${hasAsk ? chartAsk : 'null'});
                            }
                            true;
                          `);
                        }
                      } catch (_) { }
                    } else if (msg.type === 'DRAWINGS_CHANGED') {
                      const nextDrawings = sanitizePersistedChartDrawings(msg.drawings);
                      const nextSignature = JSON.stringify(nextDrawings);
                      lastWebViewDrawingSignatureRef.current = nextSignature;

                      if (nextSignature !== drawingSignatureRef.current) {
                        setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
                      }
                    } else if (msg.type === 'CHART_TOUCH_STATE') {
                      if (msg.active) {
                        handleChartViewportTouchStart();
                      } else {
                        handleChartViewportTouchEnd();
                      }
                    } else if (msg.type === 'TOOL_ACTIVE_CHANGED') {
                      setActiveTool(typeof msg.tool === 'string' ? msg.tool : 'crosshair');
                    } else if (msg.type === 'CHART_TRADE_LINE_DRAG') {
                      handleChartTradePreviewDragMessage(msg);
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
                        setChartTapMenuAnchor(nextAnchor);
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
                    }
                  } catch (_e) { }
                }}
              />
              {/* Grid lines are handled by lightweight-charts natively
                  (both vertLines and horzLines) so they move with scroll/zoom.
                  Custom SVG overlay is kept in the tree but disabled. */}
              <ChartFixedHorizontalGridOverlay
                visible={false}
                plotArea={chartPlotArea}
                color={resolvedChartColors.grid}
              />
              <DraggableChartMetaOverlay
                visible={showChartMetaRow}
                bounds={chartTapMenuBounds}
                viewport={chartTapMenuViewport}
                items={chartMetaItems}
                isUp={chartMetaIsUp}
                upColor={resolvedChartColors.candlesUptrend}
                downColor={resolvedChartColors.candlesDowntrend}
                styles={styles}
              />
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
                  handleOpenDrawingTools();
                }}
                onOpenIndicators={() => {
                  closeChartTapMenu();
                  router.push('/chart/indicators');
                }}

                onOpenSettings={() => {
                  closeChartTapMenu();
                  router.push('/chart/settings');
                }}
                onOpenSymbolPicker={() => {
                  closeChartTapMenu();
                  handleOpenSymbolPicker();
                }}
              />
              ) : null}
              {!showChartTradeSheet ? (
                <Pressable
                  style={styles.chartViewportMenuButton}
                  hitSlop={8}
                  onPress={handleOpenChartViewportMenu}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color={isDark ? '#E2E8F0' : '#111827'} />
                </Pressable>
              ) : null}

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
                    keyboardShouldPersistTaps="handled"
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
                    ref={undefined}
                    style={styles.chartTradeSheetContentScroll}
                    contentContainerStyle={[
                      styles.chartTradeSheetContent,
                      { paddingBottom: chartTradeSheetContentBottomPadding },
                    ]}
                    nestedScrollEnabled
                    bounces={false}
                    keyboardShouldPersistTaps={chartTradeCommentFocused ? 'always' : 'handled'}
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
                                traceUiInteraction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
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
                          onPress={() => traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }))}
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
                                traceUiInteraction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
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
                            traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () =>
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
                                traceUiInteraction('chart.tradeSheet.stepper.stopLimitPrice', () =>
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
                      >
                        <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
                          {chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                        </Text>
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
                                  onPress={() => traceUiInteraction(`chart.tradeSheet.stopUnit.${unit.key}`, () => setChartTradeStopUnit(unit.key))}
                                  unstable_pressDelay={0}
                                >
                                  <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <View style={styles.chartTradeStopPairRow}>
                            <Pressable
                              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardSl]}
                              onPress={() => traceUiInteraction('chart.tradeSheet.stepper.sl', () => setChartStepperEditor({ kind: 'sl' }))}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStopPairSwatchSl} />
                              <Text style={styles.chartTradeStopPairLabel}>S/L</Text>
                              {chartTradeSlEnabled && (
                                <Text style={styles.chartTradeStopPairValue}>{chartTradeSlPrice.toFixed(displayDecimals)}</Text>
                              )}
                              {chartTradeStopUnit === 'Pips' && (
                                <Pressable
                                  hitSlop={8}
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    traceUiInteraction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((v) => !v));
                                  }}
                                  style={styles.chartTradeStopPairLock}
                                >
                                  <Ionicons
                                    name={chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                                    size={16}
                                    color={chartTradeSlLocked ? BLUE : TEXT_MUTED}
                                  />
                                </Pressable>
                              )}
                            </Pressable>
                            <View style={styles.chartTradeStopPairDivider} />
                            <Pressable
                              style={[styles.chartTradeStopPairCard, styles.chartTradeStopPairCardTp]}
                              onPress={() => traceUiInteraction('chart.tradeSheet.stepper.tp', () => setChartStepperEditor({ kind: 'tp' }))}
                              unstable_pressDelay={0}
                            >
                              <View style={styles.chartTradeStopPairSwatchTp} />
                              <Text style={styles.chartTradeStopPairLabel}>T/P</Text>
                              {chartTradeTpEnabled && (
                                <Text style={styles.chartTradeStopPairValue}>{chartTradeTpPrice.toFixed(displayDecimals)}</Text>
                              )}
                              {chartTradeStopUnit === 'Pips' && (
                                <Pressable
                                  hitSlop={8}
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    traceUiInteraction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((v) => !v));
                                  }}
                                  style={styles.chartTradeStopPairLock}
                                >
                                  <Ionicons
                                    name={chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                                    size={16}
                                    color={chartTradeTpLocked ? BLUE : TEXT_MUTED}
                                  />
                                </Pressable>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      )}

                      {showChartTradeExpiration ? (
                        <Pressable
                          style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
                          onPress={handleOpenChartExpirationMenu}
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
                          onTradeResult={setTradeFeedback}
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
                      />
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            </View>
        )}
        {!isChartExpanded && (
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
              onTradeResult={setTradeFeedback}
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
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
        )}
        {!isChartExpanded && showChartTradeSheet && showInlineFooterWhileChartTradeSheetOpen ? (
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
            onTradeResult={setTradeFeedback}
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
                backgroundColor: isDark ? '#0E141F' : T.glass2,
                calendarBackground: isDark ? '#0E141F' : T.glass2,
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

      <TradeFeedbackModal
        state={tradeFeedback}
        onClose={handleTradeFeedbackClose}
        isDark={isDark}
      />
    </Screen>
  );
}
