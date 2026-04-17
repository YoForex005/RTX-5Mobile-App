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
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View, Image, AppState, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import {
  TvCrosshair, TvTrendLine, TvFib, TvBrush, TvText, TvMeasure, TvZoom, TvMagnet, TvPencil, TvLock, TvHide, TvTrash, TvLayers,
  TvPatterns, TvPrediction, TvPitchfork, TvSmiley, TvStayInDrawingMode
} from './components/ChartToolbarIcons';
import { Screen } from '../../components/Screen';
import { AppHeader } from '../../components/AppHeader';
import { useTranslation } from '../../i18n/useTranslation';
import { resolveChartColorsForTheme, useUserPreferences } from '../../state/userPreferences';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles, useLiveTick } from '../../hooks/useLiveCandles';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useOrdersByLoginQuery, usePlaceOrderMutation } from '../../query/orders';
import { classifyTradingError } from '../../api/tradingErrors';
import { TradeFeedbackModal, TradeFeedbackState, TRADE_MODAL_INITIAL } from '../../ui/components/TradeFeedbackModal';

import { usePositionsState } from '../../state/positionsState';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAlertsQuery } from '../../query/alerts';
import { resolveTradingLogin as resolveTradingLoginUtil } from '../../state/tradingLogin';
import { TradingSignalDetailsModal } from './TradingSignalDetailsModal';
import { useMarketSymbols } from '../../query/market';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { WebView } from 'react-native-webview';
import { useMarketData } from '../../query/websocket';
import { ENHANCED_DRAWING_TOOLS_JS } from './plugins/enhancedDrawingToolsString';
import { isStructurallyValidCandle, normalizeTimeframe } from '../../domain/candles';
import { normalizeSymbol } from '../../domain/symbols';
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from './rendering/customCandlestickSeriesWebView';
import { LIGHTWEIGHT_CHARTS_JS } from './rendering/lightweightChartsBundle';
import { buildChartOverlayPayload } from './chartOverlays';
import {
  getChartDrawingBucketKey,
  sanitizePersistedChartDrawings,
} from './drawingPersistence';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
} from './liveChartSync';
import { useShallow } from 'zustand/shallow';
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import {
  filterCandlesForChartTimeRange,
  getChartTimeRangeLabel,
  resolveChartVisibleRange,
  type ChartTimeRange,
} from './timeRangePresets';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

// Micro-component: isolated 4fps render cycle, 0 DOM depth
// Uses quotes WS (bid/ask) as primary price source — always accurate.
// Falls back to candle WS close only when quotes haven't arrived yet.
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals, priceSource }: any) => {
  const latestTick = useLiveTick(symbol);
  const liveQuotes = useMarketData([symbol]);
  const q = liveQuotes[symbol] || {};

  // Primary: quotes WS selected price source (most reliable, real-time)
  // Fallback: candle WS close price (only if the selected quote hasn't arrived yet)
  const selectedQuote =
    priceSource === 'ask'
      ? (typeof q.ask === 'number' && q.ask > 0 ? q.ask : null)
      : (typeof q.bid === 'number' && q.bid > 0 ? q.bid : null);
  const candleClose = latestTick && typeof latestTick.close === 'number' && latestTick.close > 0 ? latestTick.close : null;
  const currentPrice = selectedQuote ?? candleClose;

  if (currentPrice === null) return <View style={styles.priceSection}><Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text></View>;

  // The quote feed's `open`/`close` fields are seeded once at boot and never
  // refreshed by live ticks, so `currentPrice - open` grows unbounded as the
  // live price drifts (producing absurd "+9098.20 (+13.92%)" on BTCUSD when
  // the real daily move is < 1%). `changePct` is the only field that stays
  // bounded and updates realistically, so treat it as the source of truth
  // and derive the absolute change from it — guarantees sign agreement and
  // sane magnitudes regardless of how stale `open` is.
  const changePct = typeof q.changePct === 'number' ? q.changePct : 0;
  const change = currentPrice * (changePct / 100);

  const isUp = changePct >= 0;

  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: -1, opacity: 0.9 }]}>PRICE</Text>
      <Text style={styles.livePriceText} numberOfLines={1} adjustsFontSizeToFit>{currentPrice.toFixed(displayDecimals)}</Text>
      <Text style={[styles.priceChangeText, { color: isUp ? '#089981' : '#F23645' }]} numberOfLines={1} adjustsFontSizeToFit>
        {change > 0 ? '+' : ''}{(change || 0).toFixed(displayDecimals)}  ({changePct > 0 ? '+' : ''}{(changePct || 0).toFixed(2)}%)
      </Text>
    </View>
  );
});

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LiveTradeButtons = React.memo(({ symbol, styles, displayDecimals, lotSize, onTradeResult }: any) => {
  const latestTick = useLiveTick(symbol);
  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (symbol.includes('XAU') ? 0.30 : symbol.includes('BTC') ? 25 : 0.00015);

  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = React.useState<'buy' | 'sell' | null>(null);

  const handleTrade = (side: 'buy' | 'sell') => {
    setActiveSide(side);
    setTimeout(() => setActiveSide(null), 800);
    const volume = Number(lotSize);
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    console.log('[Trade] tap', {
      side,
      symbol,
      oneClickAccepted,
      volume,
      isPending,
      hasAuthToken: !!authToken,
      tradingLogin,
    });

    // ── Gate 1: user must be signed in ────────────────────────────────────
    // Every branch (one-click AND navigate) requires a JWT. Without it the
    // REST call would return 401 with no helpful context, or the ticket
    // screen would load into a broken state. Surface a clear modal instead.
    if (!authToken) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Sign In Required',
        message: 'Please sign in to your trading account before placing orders.',
        side,
      });
      return;
    }

    // ── Gate 2: an active trading account must be resolved ────────────────
    // Gets set by the live account WS on connect, or falls back to the
    // persisted account. If neither is available the user has no account
    // selected yet — the order would be rejected by the server anyway.
    if (!tradingLogin) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side,
      });
      return;
    }

    // ── Gate 3: volume must be > 0 ────────────────────────────────────────
    // Backend rejects volume: 0 with no useful error message, so we intercept.
    if (!Number.isFinite(volume) || volume <= 0) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side,
      });
      return;
    }

    if (oneClickAccepted) {
      console.log('[Trade] one-click path, login=', tradingLogin);

      // NOTE: do NOT send price_sl / price_tp with value 0 — the server
      // validates them against the current market price and rejects 0 with
      // 400 "Invalid SL/TP". Omit them entirely for a "no SL / no TP" market
      // order. `ordersApi.placeMarketOrder` also strips zero / empty fields.
      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume,
        },
        {
          onSuccess: (data: any) => {
            console.log('[Trade] success', data);
            const ticket = data?.position_ticket || data?.order_ticket || data?.ticket || 'Confirmed';
            const execPrice = side === 'buy' ? latestAsk : latestBid;
            onTradeResult?.({
              visible: true,
              type: 'success',
              side,
              symbol,
              ticket: String(ticket),
              price: execPrice,
              volume,
              executedAt: new Date().toLocaleTimeString(),
            });
          },
          onError: (err: any) => {
            // Route through classifyTradingError so that a backend-down
            // situation (fetch network failure, 5xx, gateway timeout) shows
            // as "Trading Server Unavailable" — NOT a generic "Trade Failed"
            // that makes the user think the frontend is broken. For a real
            // broker rejection we still surface the server's message.
            const feedback = classifyTradingError(err, { action: 'place-order' });
            console.warn('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
            onTradeResult?.({
              visible: true,
              type: 'error',
              title: feedback.title,
              message: feedback.message,
              side,
            });
          }
        }
      );
    } else {
      console.log('[Trade] navigate path → /trade/order-ticket');
      try {
        router.push({ pathname: '/trade/order-ticket', params: { symbol, side } });
      } catch (navErr: any) {
        console.warn('[Trade] navigation failed', navErr);
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Navigation Error',
          message: navErr?.message || 'Could not open the order ticket screen.',
          side,
        });
      }
    }
  };

  return (
    <View style={styles.tradeControlsRow}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnSell, (activeSide === 'sell' || (isPending && !activeSide)) && { opacity: 0.5 }]}
        disabled={isPending}
        onPress={() => handleTrade('sell')}
      >
        <View style={styles.actionBtnHeader}>
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelSell]}>SELL</Text>
          <Ionicons name="chevron-down" size={16} color="#FFF" />
        </View>
        <Text style={styles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
      </Pressable>

      <View style={styles.actionSpacer} />

      <Pressable
        style={[styles.actionBtn, styles.actionBtnBuy, (activeSide === 'buy' || (isPending && !activeSide)) && { opacity: 0.5 }]}
        disabled={isPending}
        onPress={() => handleTrade('buy')}
      >
        <View style={styles.actionBtnHeader}>
          <Ionicons name="chevron-up" size={16} color="#FFF" />
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelBuy]}>BUY</Text>
        </View>
        <Text style={styles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
      </Pressable>
    </View>
  );
});

// Micro-component: isolated 1fps render cycle for the clock
const LiveClock = React.memo(({ styles }: any) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      const offsetMinutes = now.getTimezoneOffset();
      const offsetHoursAbs = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMinsAbs = Math.abs(offsetMinutes) % 60;
      const sign = offsetMinutes > 0 ? '-' : '+';
      // Edge case: exactly UTC is just UTC
      const offsetStr = offsetMinutes === 0 ? 'UTC' : `UTC${sign}${offsetHoursAbs}:${String(offsetMinsAbs).padStart(2, '0')}`;

      setTimeStr(`${hh}:${mm}:${ss} (${offsetStr})`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text style={[styles.tvRangeAutoText, { transform: [{ translateX: -20 }] }]} numberOfLines={1} adjustsFontSizeToFit>
      {timeStr}
    </Text>
  );
});

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

const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta name="color-scheme" content="light dark">
    <script>${LIGHTWEIGHT_CHARTS_JS}</script>
    <script>${RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS}</script>
    <script>${ENHANCED_DRAWING_TOOLS_JS}</script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>
      // ─────────────────────────────────────────────────────────────────
      //   Minimal, fresh candle pipeline
      //
      //   Contract with the React Native host:
      //     • host calls initChart(opts, chartType, candles, displayDecimals)
      //         once per (symbol, timeframe, type) change
      //     • host calls updateChartData(candles) whenever the canonical
      //         history+live candle array changes
      //     • host may still call updateTick(candle) for narrow live patches,
      //         but the chart no longer depends on a second websocket delta
      //         bridge to stay in sync
      //     • host calls setBidPriceLine(price) for the live BID line
      //
      //   Native candlesticks use the RTX5 custom series so wick/body
      //   geometry stays centered and stable on mobile WebView pixel grids.
      //   Line and OHLC bars still use the standard lightweight-charts
      //   series implementations. Pre-existing gaps in the data stay visible.
      // ─────────────────────────────────────────────────────────────────
      // Diagnostic: verify library loaded
      if (typeof LightweightCharts === 'undefined') {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'FATAL: LightweightCharts library did not load. typeof=' + typeof LightweightCharts
          }));
        } catch(_) {}
      }

      var chart = null;
      var series = null;
      var bidPriceLine = null;
      // Dedicated horizontal line at the live close. We own this instance
      // so we can retint it blue (up candle) / red (down candle) and shift
      // its price on every tick WITHOUT calling applyOptions on the main
      // candle series (which internally forces a full data redraw and was
      // causing history to blank on bucket updates).
      var directionPriceLine = null;
      // Same idea on the move-bars pane — horizontal line at the live bar's
      // move magnitude, tinted blue / red in lockstep with the candle.
      var moveDirectionPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';
      var pendingTick = null;
      var tickFlushHandle = 0;
      var currentSeriesLength = 0;
      // Price-movement histogram shown below the candles. Bar height equals
      // |close − open| for that bar (the magnitude of the candle's move),
      // coloured green when the candle closed up, red when it closed down.
      // It IS NOT traded volume — it's a direct visual echo of the candle's
      // own size, so the bar grows and shrinks in sync with the candle.
      var moveBarsSeries = null;
      var moveUpColor = 'rgba(38,166,154,0.85)';
      var moveDownColor = 'rgba(239,83,80,0.85)';
      // Captured from the active candle series so the bid line + last-price
      // line can tint themselves to match the live candle's direction.
      var barUpColor = '#2962FF';
      var barDownColor = '#ef5350';
      var lastPriceLineDirection = null; // 'up' | 'down' — last colour applied

      function postReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        } catch (_e) {}
      }

      function postChartReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHART_READY' }));
        } catch (_e) {}
      }

      function postError(where, err) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: where + ': ' + (err && err.message ? err.message : String(err))
          }));
        } catch (_e) {}
      }

      function getRecentVisibleBars(length) {
        if (typeof length !== 'number' || !isFinite(length) || length <= 0) return 0;
        // Aim for fat, easy-to-read candles on phone screens: cap at ~32 bars
        // visible at once instead of compressing 56+ into the same width. The
        // floor stays at 18 so very short series still show context.
        return Math.min(Math.max(Math.round(length), 18), 32);
      }

      function applyRecentViewport(lengthOverride) {
        try {
          if (!chart || !chart.timeScale) return;
          var dataLength =
            (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
              ? Math.round(lengthOverride)
              : currentSeriesLength;
          if (!(dataLength > 0)) return;
          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            var visibleBars = getRecentVisibleBars(dataLength);
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-0.5, dataLength - visibleBars - 1),
              to: dataLength + 2,
            });
          } else {
            chart.timeScale().fitContent();
          }
          if (typeof chart.timeScale().scrollToRealTime === 'function') {
            chart.timeScale().scrollToRealTime();
          }
        } catch (_e) {}
      }

      window.__rtx5ApplyRecentViewport = applyRecentViewport;

      function makePriceFormat(displayDecimals) {
        var decimals = (typeof displayDecimals === 'number' && displayDecimals >= 0) ? displayDecimals : 2;
        return {
          type: 'price',
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals)
        };
      }

      function applyChartLayout(opts) {
        // Flatten host-supplied opts (background may be { color }) into the
        // shape lightweight-charts expects.
        try {
          if (opts && opts.layout && opts.layout.background && typeof opts.layout.background.color === 'string') {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          }
        } catch (_e) {}
        return opts || {};
      }

      function pickSeriesColors(opts, chartType) {
        var c = (opts && opts.customColors) || {};
        var up = c.candlesUptrend || '#26a69a';
        var down = c.candlesDowntrend || '#ef5350';
        var hollowBody = c.hollowBody || 'rgba(0,0,0,0)';
        if (chartType === 'hollow') {
          return { up: up, down: down, bodyUp: hollowBody, bodyDown: hollowBody };
        }
        return { up: up, down: down, bodyUp: up, bodyDown: down };
      }

      // Pending init args — stored so the ResizeObserver or rAF retry
      // can re-run chart creation if the container had zero dimensions
      // on the first attempt (common on Android light theme first load).
      var _pendingInit = null;

      function _doInitChart(opts, chartType, data, displayDecimals) {
        var el = document.getElementById('chart');
        var w = el.clientWidth;
        var h = el.clientHeight;

        // If the container has zero dimensions, the browser hasn't laid out
        // the WebView yet. Defer to the next animation frame — the
        // ResizeObserver will also catch it as a fallback.
        if (w === 0 || h === 0) {
          _pendingInit = { opts: opts, chartType: chartType, data: data, displayDecimals: displayDecimals };
          requestAnimationFrame(function() {
            if (_pendingInit) {
              _doInitChart(_pendingInit.opts, _pendingInit.chartType, _pendingInit.data, _pendingInit.displayDecimals);
            }
          });
          return;
        }
        _pendingInit = null;

        if (window._drawingManager) {
          try { window._drawingManager.remove(); } catch (_e) {}
          window._drawingManager = null;
        }
        if (chart) {
          try { chart.remove(); } catch (_e) {}
          chart = null;
          series = null;
          moveBarsSeries = null;
          bidPriceLine = null;
          directionPriceLine = null;
          moveDirectionPriceLine = null;
          _positionLinesArr = [];
        }
        if (tickFlushHandle) {
          try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
          tickFlushHandle = 0;
        }
        pendingTick = null;
        lastBarTime = 0;
        seriesType = chartType || 'candles';

        var safeOpts = applyChartLayout(opts);
        var customCols = safeOpts.customColors;
        if (safeOpts.customColors) { delete safeOpts.customColors; }

        // Force explicit pixel dimensions so the chart never renders at 0x0
        safeOpts.width = w;
        safeOpts.height = h;

        chart = LightweightCharts.createChart(el, safeOpts);

        var priceFormat = makePriceFormat(displayDecimals);
        var colors = pickSeriesColors({ customColors: customCols }, seriesType);
        barUpColor = colors.up;
        barDownColor = colors.down;
        lastPriceLineDirection = null;

        // We render our own direction-coloured price line via
        // directionPriceLine (created post-data-load), so the series'
        // built-in last-price line is suppressed (priceLineVisible: false).
        // lastValueVisible: false removes its right-axis label too —
        // otherwise the axis showed two labels stacked at the same price.
        if (seriesType === 'line') {
          series = chart.addSeries(LightweightCharts.LineSeries, {
            color: (customCols && customCols.lineBody) || colors.up,
            lineWidth: 2,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else if (seriesType === 'bars') {
          series = chart.addSeries(LightweightCharts.BarSeries, {
            upColor: (customCols && customCols.barsUptrend) || colors.up,
            downColor: (customCols && customCols.barsDowntrend) || colors.down,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          });
        } else {
          var customCandleOptions = {
            color: colors.up,
            bodyUpColor: colors.bodyUp,
            bodyDownColor: colors.bodyDown,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            borderVisible: true,
            wickVisible: true,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
          };
          if (
            typeof window.addRTX5CustomCandlestickSeries === 'function' &&
            typeof chart.addCustomSeries === 'function'
          ) {
            series = window.addRTX5CustomCandlestickSeries(chart, customCandleOptions);
          } else {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: colors.bodyUp,
              downColor: colors.bodyDown,
              borderUpColor: colors.up,
              borderDownColor: colors.down,
              wickUpColor: colors.up,
              wickDownColor: colors.down,
              borderVisible: true,
              wickVisible: true,
              priceFormat: priceFormat,
              lastValueVisible: false,
              priceLineVisible: false,
            });
          }
        }

        // Price-movement bars — a histogram placed in the bottom ~25 % of
        // the pane. Same shape as a volume panel, but its values come from
        // the candle's own |close − open|, so each bar's height is a direct
        // echo of how far the candle moved. Colour matches candle direction.
        try {
          moveBarsSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: { type: 'price', precision: displayDecimals || 2, minMove: 1 / Math.pow(10, displayDecimals || 2) },
            priceScaleId: 'move',
            // Our own moveDirectionPriceLine owns the right-axis label on
            // this pane (blue / red), so the histogram's built-in label is
            // suppressed to avoid a duplicate stacked at the same value.
            lastValueVisible: false,
            priceLineVisible: false,
            color: moveUpColor,
          });
          moveUpColor = hexToRgba(colors.up, 0.85);
          moveDownColor = hexToRgba(colors.down, 0.85);
          chart.priceScale('move').applyOptions({
            scaleMargins: { top: 0.82, bottom: 0.02 },
          });
        } catch (_mb) { moveBarsSeries = null; }

        if (data && data.length > 0) {
          var mapped = mapForSeries(data);
          series.setData(mapped);
          currentSeriesLength = mapped.length;
          lastBarTime = mapped[mapped.length - 1].time;
          if (seriesType !== 'line') {
            var lastSeed = data[data.length - 1];
            _liveBar = {
              time: lastSeed.time,
              open: lastSeed.open,
              high: lastSeed.high,
              low: lastSeed.low,
              close: lastSeed.close,
            };
          }
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(data)); } catch (_mb) {}
          }
          applyRecentViewport(currentSeriesLength);
          ensureDirectionPriceLine();
          ensureMoveDirectionPriceLine();
        }

        // Initialize the drawing tools manager — this wires up all
        // toolbar tools (trendline, fib, brush, text, pitchfork, etc.)
        // to real canvas-level drawing primitives via the enhanced bundle.
        try {
          if (typeof window.DrawingToolsManager === 'function') {
            window._drawingManager = new window.DrawingToolsManager(chart, series);
          }
        } catch (_dtErr) {}

        applyOverlayPayload(_overlayPayload);
        postChartReady();
      }

      function initChart(opts, chartType, data, displayDecimals) {
        try {
          // Set body/container background to match chart — prevents
          // white-on-white invisibility in light theme.
          try {
            var bg = (opts && opts.layout && opts.layout.background && opts.layout.background.color) || '#000';
            document.body.style.background = bg;
            document.getElementById('chart').style.background = bg;
          } catch(_) {}

          // Defer to requestAnimationFrame so the browser completes layout
          // before we measure the container. This is the core fix for the
          // "light theme first load" bug — on Android, the WebView container
          // has 0x0 dimensions until the first paint cycle completes.
          requestAnimationFrame(function() {
            try {
              _doInitChart(opts, chartType, data, displayDecimals);
            } catch(e) {
              postError('initChart', e);
            }
          });
        } catch (e) {
          postError('initChart', e);
        }
      }

      // ResizeObserver — auto-resize the chart when the WebView container
      // dimensions change (orientation, tab switch, delayed layout).
      // Also catches the zero-dimension → real-dimension transition.
      try {
        var _resizeObserver = new ResizeObserver(function(entries) {
          var entry = entries[0];
          if (!entry) return;
          var w = entry.contentRect.width;
          var h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            if (_pendingInit) {
              // Container just got real dimensions — run the deferred init.
              _doInitChart(_pendingInit.opts, _pendingInit.chartType, _pendingInit.data, _pendingInit.displayDecimals);
            } else if (chart) {
              // Chart exists — just resize it to match.
              try { chart.resize(w, h); } catch(_) {}
            }
          }
        });
        _resizeObserver.observe(document.getElementById('chart'));
      } catch(_) {
        // ResizeObserver not available on very old WebViews — the rAF
        // fallback in _doInitChart handles it.
      }

      function hexToRgba(hex, alpha) {
        try {
          var h = hex.replace('#', '');
          if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
          var r = parseInt(h.substring(0, 2), 16);
          var g = parseInt(h.substring(2, 4), 16);
          var b = parseInt(h.substring(4, 6), 16);
          if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error('bad hex');
          return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        } catch (_e) {
          return alpha >= 0.9 ? hex : 'rgba(128,128,128,' + alpha + ')';
        }
      }

      function mapForSeries(data) {
        if (!data || data.length === 0) return [];
        if (seriesType === 'line') {
          var out = new Array(data.length);
          for (var i = 0; i < data.length; i++) {
            var c = data[i];
            out[i] = { time: c.time, value: typeof c.value === 'number' ? c.value : c.close };
          }
          return out;
        }
        // candles / hollow / bars all share the same OHLC shape
        var arr = new Array(data.length);
        for (var j = 0; j < data.length; j++) {
          var d = data[j];
          arr[j] = {
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          };
        }
        return arr;
      }

      // One histogram point per bar: |close − open|, coloured by direction.
      function mapMoveBarsData(data) {
        if (!data || data.length === 0) return [];
        var out = new Array(data.length);
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var open = typeof d.open === 'number' ? d.open : d.close;
          var close = typeof d.close === 'number' ? d.close : (typeof d.value === 'number' ? d.value : open);
          var up = close >= open;
          out[i] = {
            time: d.time,
            value: Math.abs(close - open),
            color: up ? moveUpColor : moveDownColor,
          };
        }
        return out;
      }

      // One histogram point derived from the current live bar state.
      function makeMoveBarPoint(bar) {
        var up = bar.close >= bar.open;
        return {
          time: bar.time,
          value: Math.abs(bar.close - bar.open),
          color: up ? moveUpColor : moveDownColor,
        };
      }

      function updateChartData(data) {
        try {
          if (!series) {
            postError('updateChartData', new Error('series not initialized'));
            return;
          }
          if (tickFlushHandle) {
            try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
            tickFlushHandle = 0;
          }
          pendingTick = null;
          var mapped = mapForSeries(data);
          currentSeriesLength = mapped.length;
          series.setData(mapped);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(data)); } catch (_mb) {}
          }

          // CRITICAL BUGFIX: setData natively obliterates all PriceLines previously bound to the series!
          // We must explicitly reconstruct the dynamic trade overlays immediately after setting chart data.
          _positionLinesArr = [];
          _overlayMarkers = null;
          if (_overlayPayload) {
            applyOverlayPayload(_overlayPayload);
          }

          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
            if (seriesType !== 'line') {
              var lastSeed = data[data.length - 1];
              _liveBar = {
                time: lastSeed.time,
                open: lastSeed.open,
                high: lastSeed.high,
                low: lastSeed.low,
                close: lastSeed.close,
              };
            }
            // Symbol / timeframe switch: reposition both direction lines to
            // the new dataset's last close + move magnitude so they don't
            // linger at the previous symbol's price.
            refreshDirectionPriceLine();
            refreshMoveDirectionPriceLine();
          }
        } catch (e) {
          postError('updateChartData', e);
        }
      }

      // ── Live OHLC accumulator (runs inside WebView) ──
      var _liveBar = null; // { time, open, high, low, close }

      function applyTickUpdate(tick) {
        if (!series || !tick || typeof tick.time !== 'number') return;
        if (tick.time < lastBarTime) return;
        var appendedNewBar = currentSeriesLength === 0 || tick.time > lastBarTime;
        var bar;
        if (seriesType === 'line') {
          bar = { time: tick.time, value: typeof tick.value === 'number' ? tick.value : tick.close };
        } else {
          bar = {
            time: tick.time,
            open: tick.open,
            high: tick.high,
            low: tick.low,
            close: tick.close,
          };
        }
        // Sync internal accumulator with full OHLC from host
        _liveBar = { time: tick.time, open: tick.open, high: tick.high, low: tick.low, close: tick.close };
        series.update(bar);
        currentSeriesLength = appendedNewBar ? Math.max(currentSeriesLength + 1, 1) : Math.max(currentSeriesLength, 1);
        if (tick.time >= lastBarTime) {
          lastBarTime = tick.time;
        }
        if (moveBarsSeries && seriesType !== 'line') {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
      }

      // Fast-path: host sends just a price + bucket time.
      // The WebView accumulates OHLC locally — no React state cycle needed.
      function pushPrice(bucketTime, price) {
        if (!series || typeof bucketTime !== 'number' || typeof price !== 'number') return;
        if (bucketTime < lastBarTime) return;
        var appendedNewBar = currentSeriesLength === 0 || bucketTime > lastBarTime;

        var bar;
        if (_liveBar && _liveBar.time === bucketTime) {
          // Same bucket — accumulate
          _liveBar.high = Math.max(_liveBar.high, price);
          _liveBar.low = Math.min(_liveBar.low, price);
          _liveBar.close = price;
        } else {
          // New bucket: open from the previous close so the first tick
          // inherits the correct gap/body behavior instead of starting
          // as a flat candle at the incoming trade price.
          var nextOpen = _liveBar && typeof _liveBar.close === 'number' ? _liveBar.close : price;
          _liveBar = {
            time: bucketTime,
            open: nextOpen,
            high: Math.max(nextOpen, price),
            low: Math.min(nextOpen, price),
            close: price,
          };
        }

        if (seriesType === 'line') {
          bar = { time: bucketTime, value: price };
        } else {
          bar = { time: _liveBar.time, open: _liveBar.open, high: _liveBar.high, low: _liveBar.low, close: _liveBar.close };
        }
        series.update(bar);
        currentSeriesLength = appendedNewBar ? Math.max(currentSeriesLength + 1, 1) : Math.max(currentSeriesLength, 1);
        if (bucketTime >= lastBarTime) {
          lastBarTime = bucketTime;
        }
        if (moveBarsSeries && seriesType !== 'line' && _liveBar) {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
      }

      function flushPendingTick() {
        try {
          tickFlushHandle = 0;
          var tick = pendingTick;
          pendingTick = null;
          if (!tick) return;
          applyTickUpdate(tick);
        } catch (e) {
          if (typeof e.message === 'string' && e.message.indexOf('Cannot update oldest data') >= 0) {
            return; // benign race
          }
          postError('flushPendingTick', e);
        }
      }

      function updateTick(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        pendingTick = tick;
        if (tickFlushHandle) return;
        tickFlushHandle = requestAnimationFrame(flushPendingTick);
      }

      // Pick the candle-direction colour for the live bid / last-price line.
      // Up candle (close ≥ open) → barUpColor. Down candle → barDownColor.
      function pickLivePriceColor() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return barUpColor;
        }
        return _liveBar.close >= _liveBar.open ? barUpColor : barDownColor;
      }

      // Create the dedicated direction-coloured price line at the live close
      // if it doesn't exist yet. Safe to call repeatedly — no-ops once the
      // instance is bound.
      function ensureDirectionPriceLine() {
        try {
          if (directionPriceLine || !series) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          directionPriceLine = series.createPriceLine({
            price: _liveBar.close,
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
          });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Re-price and re-tint the direction line on every tick. Only calls
      // applyOptions on the price-line instance we own — never on the main
      // series — so it can't trigger a history redraw. If applyOptions
      // fails (e.g. the series was torn down underneath) we null the ref
      // so the next tick recreates a fresh instance on the live series.
      function refreshDirectionPriceLine() {
        if (!_liveBar || typeof _liveBar.close !== 'number') return;
        if (!directionPriceLine) {
          ensureDirectionPriceLine();
          return;
        }
        var color = pickLivePriceColor();
        try {
          directionPriceLine.applyOptions({ price: _liveBar.close, color: color });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Current move magnitude for the active bar (|close − open|). This is
      // the y-value the move-bars pane plots, and where its direction line
      // should sit.
      function pickLiveMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return Math.abs(_liveBar.close - _liveBar.open);
      }

      // Create the move-bars pane's direction line the first time we have a
      // live bar. Scoped to the move-bars series so it renders on the move
      // price scale ('move'), not the main candle scale.
      function ensureMoveDirectionPriceLine() {
        try {
          if (moveDirectionPriceLine || !moveBarsSeries) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          moveDirectionPriceLine = moveBarsSeries.createPriceLine({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      // Re-price + re-tint the move-bars direction line every tick. Again,
      // only touches the price-line instance — move-bars series itself stays
      // untouched. Same teardown-recovery trick: null the ref on failure so
      // the next call recreates rather than re-throwing forever.
      function refreshMoveDirectionPriceLine() {
        if (!moveBarsSeries || !_liveBar) return;
        if (!moveDirectionPriceLine) {
          ensureMoveDirectionPriceLine();
          return;
        }
        try {
          moveDirectionPriceLine.applyOptions({
            price: pickLiveMoveValue(),
            color: pickLivePriceColor(),
          });
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      function setBidPriceLine(price) {
        try {
          if (!series || typeof price !== 'number' || !isFinite(price)) return;
          if (bidPriceLine) {
            series.removePriceLine(bidPriceLine);
            bidPriceLine = null;
          }
          var color = pickLivePriceColor();
          lastPriceLineDirection = color === barUpColor ? 'up' : 'down';
          bidPriceLine = series.createPriceLine({
            price: price,
            color: color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
            title: 'BID',
          });
        } catch (e) {
          postError('setBidPriceLine', e);
        }
      }

      // Re-tint the custom BID price line in place when the active candle
      // flips direction mid-bucket (blue when bullish, red when bearish).
      // We intentionally don't touch the candle series' or move-bars' own
      // options — applyOptions on the main series can cause a full redraw
      // of the data, which was blanking history on some rebuilds.
      function refreshBidPriceLineColor() {
        if (!bidPriceLine) return;
        var color = pickLivePriceColor();
        var direction = color === barUpColor ? 'up' : 'down';
        if (direction === lastPriceLineDirection) return;
        lastPriceLineDirection = direction;
        try { bidPriceLine.applyOptions({ color: color }); } catch (_e) {}
      }

      // Backwards-compat no-ops so any stale call sites from earlier
      // builds (drawing tools / overlays) silently do nothing instead of
      // throwing and aborting the script.
      function setLiveCandleLine() {}
      function updateChartAppearance() {}
      // Legacy no-op kept so stale call-sites from earlier builds don't throw.
      function setVolumeSeriesData(_data) {}
      function setDrawingTool(tool) {
        if (window._drawingManager && typeof window._drawingManager.setActiveTool === 'function') {
          window._drawingManager.setActiveTool(tool);
        }
      }
      function clearDrawings() {
        if (window._drawingManager && typeof window._drawingManager.removeAllDrawings === 'function') {
          window._drawingManager.removeAllDrawings();
        }
      }
      function setSerializedDrawings(drawings) {
        if (window._drawingManager && typeof window._drawingManager.setSerializedDrawings === 'function') {
          window._drawingManager.setSerializedDrawings(drawings);
        }
      }
      function setDrawingsLocked(locked) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsLocked === 'function') {
          window._drawingManager.setDrawingsLocked(locked);
        }
      }
      function setDrawingsHidden(hidden) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsHidden === 'function') {
          window._drawingManager.setDrawingsHidden(hidden);
        }
      }
      function setStayInDrawingMode(sticky) {
        if (window._drawingManager && typeof window._drawingManager.setStayInDrawingMode === 'function') {
          window._drawingManager.setStayInDrawingMode(sticky);
        }
      }
      function setMagnetMode(enabled) {
        if (window._drawingManager && typeof window._drawingManager.setMagnetMode === 'function') {
          window._drawingManager.setMagnetMode(enabled);
        }
      }
      function zoomChart() {
        if (window._drawingManager && typeof window._drawingManager.zoomToFit === 'function') {
          window._drawingManager.zoomToFit();
        }
      }
      // ── Position / Trade Level Lines ──────────────────────────────
      // Manages entry price, TP, and SL horizontal lines on the chart.
      // Called from React Native whenever positions change or the user
      // toggles the "Show Trade Levels" setting.
      var _positionLinesArr = [];
      var _overlayMarkers = null;
      var _overlayPayload = { priceLines: [], markers: [] };
      var _overlayResyncTimer = null;

      function clearOverlayPriceLines() {
        if (!series) return;
        for (var i = 0; i < _positionLinesArr.length; i++) {
          try { series.removePriceLine(_positionLinesArr[i]); } catch (_e) {}
        }
        _positionLinesArr = [];
      }

      function clearOverlayMarkers() {
        if (_overlayMarkers && typeof _overlayMarkers.detach === 'function') {
          try { _overlayMarkers.detach(); } catch (_e) {}
        }
        _overlayMarkers = null;
      }

      // ── Robust "nuke and recreate" overlay renderer ──────────────
      // Matches the proven web version approach: always remove every
      // existing price line, then create fresh ones from the payload.
      // The previous incremental approach (track by ID, update-or-create)
      // silently lost lines when createPriceLine threw inside a
      // try/catch, and stale _positionLinesMap entries after chart
      // re-init caused ghost references that blocked new line creation.
      function applyOverlayPayload(payload) {
        try {
          if (!payload || typeof payload !== 'object') {
            payload = { priceLines: [], markers: [] };
          }
          if (!series) return;

          // Step 1: Remove ALL existing price lines (clean slate)
          clearOverlayPriceLines();

          // Step 2: Create ALL price lines from scratch
          var lines = Array.isArray(payload.priceLines) ? payload.priceLines : [];
          var created = 0;
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0 || !ln.id) continue;
            try {
              var priceLine = series.createPriceLine({
                price: ln.price,
                color: ln.color || '#2962FF',
                lineWidth: ln.lineWidth || 1,
                lineStyle: typeof ln.lineStyle === 'number' ? ln.lineStyle : (LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0),
                axisLabelVisible: ln.axisLabelVisible !== false,
                title: ln.title || '',
              });
              _positionLinesArr.push(priceLine);
              created++;
            } catch (lineErr) {
              postError('createPriceLine[' + ln.id + ']', lineErr);
            }
          }

          // Step 3: Handle markers (also nuke and recreate)
          clearOverlayMarkers();
          var markers = Array.isArray(payload.markers) ? payload.markers : [];
          if (
            markers.length > 0 &&
            typeof LightweightCharts !== 'undefined' &&
            typeof LightweightCharts.createSeriesMarkers === 'function'
          ) {
            try {
              _overlayMarkers = LightweightCharts.createSeriesMarkers(series, markers);
            } catch (markerErr) {
              _overlayMarkers = null;
              postError('createSeriesMarkers', markerErr);
            }
          }
        } catch (e) {
          postError('applyOverlayPayload', e);
        }
      }

      function setChartOverlays(payload) {
        _overlayPayload = payload && typeof payload === 'object'
          ? payload
          : { priceLines: [], markers: [] };
        applyOverlayPayload(_overlayPayload);
      }

      function setPriceLines(lines) {
        try {
          setChartOverlays({
            priceLines: Array.isArray(lines) ? lines : [],
            markers: Array.isArray(_overlayPayload.markers) ? _overlayPayload.markers : [],
          });
        } catch (e) { postError('setPriceLines', e); }
      }

      function updatePositionLines() {
        applyOverlayPayload(_overlayPayload);
      }

      // ── Self-healing overlay resync ──────────────────────────────
      // Every 4 seconds, re-apply the cached overlay payload. This
      // guarantees that even if a setChartOverlays call races with
      // initChart's requestAnimationFrame (series=null at call time),
      // the lines self-heal within a few seconds.
      function startOverlayResync() {
        if (_overlayResyncTimer) clearInterval(_overlayResyncTimer);
        _overlayResyncTimer = setInterval(function() {
          if (series && _overlayPayload && _overlayPayload.priceLines && _overlayPayload.priceLines.length > 0) {
            // Only resync if the line count on canvas doesn't match the payload
            if (_positionLinesArr.length !== _overlayPayload.priceLines.length) {
              applyOverlayPayload(_overlayPayload);
            }
          }
        }, 4000);
      }
      startOverlayResync();

      window.initChart = initChart;
      window.updateChartData = updateChartData;
      window.updateTick = updateTick;
      window.pushPrice = pushPrice;
      window.setBidPriceLine = setBidPriceLine;
      window.setLiveCandleLine = setLiveCandleLine;
      window.updateChartAppearance = updateChartAppearance;
      window.setVolumeSeriesData = setVolumeSeriesData;
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
      window.setSerializedDrawings = setSerializedDrawings;
      window.setDrawingsLocked = setDrawingsLocked;
      window.setDrawingsHidden = setDrawingsHidden;
      window.setStayInDrawingMode = setStayInDrawingMode;
      window.setMagnetMode = setMagnetMode;
      window.zoomChart = zoomChart;
      window.setChartOverlays = setChartOverlays;
      window.setPriceLines = setPriceLines;
      window.updatePositionLines = updatePositionLines;

      postReady();
    </script>
</body>
</html>
`;

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
  const token = useUserPreferences(s => s.accountDetails?.credentials?.accessToken);
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
    if (!accountLogin) return;
    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);
    return () => clearInterval(interval);
  }, [accountLogin, refreshPositions]);

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
    chartDrawingRecordsBySymbol,
    tradeVolume,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    setTradeVolume,
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
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      tradeVolume: state.tradeVolume,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartSymbol: state.setChartSymbol,
      setTradeVolume: state.setTradeVolume,
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
  const { data: closedPositions = [], refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin);
  const { data: orders = [], refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin);
  const { data: alerts = [], refetch: refetchAlerts } = useAlertsQuery();
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(accountLogin ? String(accountLogin) : undefined);
  const liveAccountEquity = useLiveAccountState((s) => s.equity);
  const liveAccountMargin = useLiveAccountState((s) => s.margin);
  const liveAccountMarginLevel = useLiveAccountState((s) => s.margin_level);
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    setLotInput(formatTradeVolume(normalized, tradeVolumeBounds));
  }, [setTradeVolume, tradeVolume, tradeVolumeBounds]);

  const updateTradeVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, tradeVolumeBounds);
      setTradeVolume(normalized);
      setLotInput(formatTradeVolume(normalized, tradeVolumeBounds));
    },
    [setTradeVolume, tradeVolumeBounds],
  );

  const commitLotDraft = useCallback(() => {
    if (!lotInput.trim()) {
      setLotInput(formatTradeVolume(tradeVolume, tradeVolumeBounds));
      return;
    }
    updateTradeVolume(lotInput);
  }, [lotInput, tradeVolume, tradeVolumeBounds, updateTradeVolume]);

  const [tradeFeedback, setTradeFeedback] = useState<TradeFeedbackState>(TRADE_MODAL_INITIAL);
  const handleTradeFeedbackClose = useCallback(() => setTradeFeedback(TRADE_MODAL_INITIAL), []);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const safeInsets = useSafeAreaInsets();
  const chartScrollRef = useRef<ScrollView>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const [showDrawingQuickActions, setShowDrawingQuickActions] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const pendingChartDrawingTool = useUIState((s) => s.pendingChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((s) => s.clearPendingChartDrawingTool);
  const shouldCaptureChartGestures =
    isChartExpanded || activeTool !== 'crosshair' || Boolean(pendingChartDrawingTool);

  const webViewRef = useRef<WebView>(null);
  const scrollLotEditorIntoView = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chartScrollRef.current?.scrollToEnd({ animated });
      });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - safeInsets.bottom + 12));
      scrollLotEditorIntoView(false);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [safeInsets.bottom, scrollLotEditorIntoView]);

  const injectChartScript = (script: string) => {
    webViewRef.current?.injectJavaScript(`${script} true;`);
  };

  const handleSetTool = (tool: string) => {
    setActiveTool(tool);
    injectChartScript(`setDrawingTool(${JSON.stringify(tool)});`);
    setShowDrawingToolbar(false);
  };

  const handleClearDrawings = () => {
    setActiveTool('crosshair');
    setChartDrawingRecordsForSymbol(chartSymbol, []);
    lastWebViewDrawingSignatureRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    injectChartScript('clearDrawings();');
  };

  const handleToggleMagnet = () => {
    const next = !magnetEnabled;
    setMagnetEnabled(next);
    injectChartScript(`setMagnetMode(${next});`);
  };

  const handleToggleStickyMode = () => {
    const next = !stickyDrawingMode;
    setStickyDrawingMode(next);
    injectChartScript(`setStayInDrawingMode(${next});`);
  };

  const handleToggleLock = () => {
    const next = !chartLockAll;
    setChartLockAll(next);
    if (next) {
      setActiveTool('crosshair');
    }
    injectChartScript(`setDrawingsLocked(${next});`);
  };

  const handleToggleHide = () => {
    const next = !chartHideAll;
    setChartHideAll(next);
    injectChartScript(`setDrawingsHidden(${next});`);
  };

  const handleZoomTool = () => {
    injectChartScript('zoomChart();');
  };

  const chartType = chartVisualType;
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTimeRangeMenu, setShowTimeRangeMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);

  const { candles, refresh: refreshCandles } = useLiveCandles(chartSymbol, chartTimeframe);
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
  const chartMetaLastCandle = chartCandles.length > 0 ? chartCandles[chartCandles.length - 1] : null;
  const chartMetaIsUp = chartMetaLastCandle ? chartMetaLastCandle.close >= chartMetaLastCandle.open : true;
  const chartMetaItems = useMemo(
    () =>
      chartMetaLastCandle
        ? [
            { label: 'O', value: formatChartValue(chartMetaLastCandle.open) },
            { label: 'H', value: formatChartValue(chartMetaLastCandle.high) },
            { label: 'L', value: formatChartValue(chartMetaLastCandle.low) },
            { label: 'C', value: formatChartValue(chartMetaLastCandle.close) },
          ]
        : [],
    [chartMetaLastCandle, formatChartValue],
  );
  const showChartMetaRow = chartDisplay.showOHLC && chartMetaItems.length > 0;
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
          }
        } catch (_) {}
      `);
      return;
    }

    if (range === 'all') {
      injectChartScript(`
        try {
          if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
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
        if (chart && chart.timeScale && typeof chart.timeScale().setVisibleRange === 'function') {
          chart.timeScale().setVisibleRange({
            from: ${visibleRange.from},
            to: ${visibleRange.to},
          });
        }
      } catch (_) {}
    `);
  }, [chartCanvasReady, customDateValue, webViewReady]);

  const handleRangePress = useCallback((range: ChartTimeRange) => {
    setShowTimeRangeMenu(false);
    setActiveDateRange(range);
    setCustomDateValue(null);

    applyNativeTimeRange(range, null);
  }, [applyNativeTimeRange]);

  const handleCustomDateRange = useCallback((selectedDate: Date) => {
    setCustomDateValue(selectedDate);
    setActiveDateRange('custom');
    setShowDatePicker(false);
    applyNativeTimeRange('custom', selectedDate);
  }, [applyNativeTimeRange]);

  const handleResetTimeRange = useCallback(() => {
    setActiveDateRange('auto');
    setCustomDateValue(null);
    applyNativeTimeRange('auto', null);
  }, [applyNativeTimeRange]);

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    setActiveDateRange('auto');
    setCustomDateValue(null);
    setChartTimeframe(nextTimeframe);
  }, [setChartTimeframe]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: resolvedChartColors.background },
      textColor: resolvedChartColors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: resolvedChartColors.grid },
      horzLines: { color: resolvedChartColors.grid },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
      horzLine: { color: resolvedChartColors.foreground, width: 1, labelBackgroundColor: resolvedChartColors.foreground },
    },
    timeScale: {
      borderColor: resolvedChartColors.grid,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 16,
      barSpacing: 13,
      minBarSpacing: 3,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    rightPriceScale: {
      borderColor: resolvedChartColors.grid,
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.32 },
    },
    customColors: {
      candlesUptrend: resolvedChartColors.candlesUptrend,
      candlesDowntrend: resolvedChartColors.candlesDowntrend,
      hollowBody: resolvedChartColors.hollowBody,
      barsUptrend: resolvedChartColors.barsUptrend,
      barsDowntrend: resolvedChartColors.barsDowntrend,
      lineBody: resolvedChartColors.lineBody,
    }
  }), [resolvedChartColors]);

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
  // Loading overlay: show until chart is confirmed rendered OR 3s fallback.
  // This prevents the user from seeing a blank WebView between data arrival
  // and chart render completion.
  const [loadingFallback, setLoadingFallback] = useState(false);
  useEffect(() => {
    setLoadingFallback(false);
    const tmr = setTimeout(() => setLoadingFallback(true), 3000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe, chartType]);
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
    }, [refreshShowOnChartSources]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshShowOnChartSources();
      }
    });

    return () => subscription.remove();
  }, [refreshShowOnChartSources]);
  const isLoading = !chartCanvasReady && !loadingFallback;
  const isError = false;

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
  //   • Mock fallback: if no candles after 4s, generate mock data
  //     so the chart area is never blank.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(candles);
  const chartInitializedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitSigRef = useRef('');
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    setChartCanvasReady(false);
  };

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const getRenderableCandles = useCallback((sourceCandles: typeof candles) => {
    // The type guard narrows to Pick<Candle, 'time'|'open'|'high'|'low'|'close'>
    // which strips `volume`. Cast back since filter only validates, it doesn't
    // actually remove the volume property from the runtime objects.
    const sanitized = sourceCandles.filter((c) => isStructurallyValidCandle(c)) as typeof sourceCandles;
    const uniqueByTime = Array.from(new Map(sanitized.map((item) => [item.time, item])).values());
    uniqueByTime.sort((a, b) => a.time - b.time);
    return uniqueByTime;
  }, []);

  const buildMappedData = useCallback((sourceCandles: typeof candles) => {
    const uniqueByTime = getRenderableCandles(sourceCandles);
    if (chartType === 'line') {
      return uniqueByTime.map((c) => ({ time: c.time, value: c.close }));
    }
    return uniqueByTime.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));
  }, [chartType, getRenderableCandles]);

  // Track current config signature. When it changes, mark chart as
  // not-initialized so the watchdog knows to retry for the new config.
  const currentSig = useMemo(
    () => `${chartSymbol}-${normalizeTimeframe(chartTimeframe)}-${chartType}-${chartColorsSignature}`,
    [chartSymbol, chartTimeframe, chartType, chartColorsSignature],
  );
  useEffect(() => {
    // Config changed — previous CHART_READY is stale.
    if (lastInitSigRef.current !== currentSig) {
      chartInitializedRef.current = false;
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    }
  }, [currentSig]);

  // Core init function — safe to call repeatedly.
  // The WebView's initChart tears down any existing chart and rebuilds.
  const sendInit = useCallback(() => {
    if (!webViewRef.current || !webViewReady) return;

    const data = candlesRef.current;
    if (data.length === 0) return;

    const mapped = buildMappedData(data);
    if (mapped.length === 0) return;

    // Skip if this exact config was already confirmed rendered
    if (currentSig === lastInitSigRef.current && chartInitializedRef.current) return;

    const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}); true;`;
    try {
      webViewRef.current.injectJavaScript(js);
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, currentSig, chartOptions, chartType, displayDecimals, buildMappedData]);

  // Effect 1 — send initChart whenever data or config changes.
  useEffect(() => {
    sendInit();
  }, [candles, sendInit]);

  // Effect 2 — keep the WebView aligned with the canonical candle stream.

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    const renderableCandles = getRenderableCandles(candles);
    if (renderableCandles.length === 0) {
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      return;
    }

    const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
    const updateMode = getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (updateMode === 'noop') {
      return;
    }

    let didInject = false;

    try {
      if (updateMode === 'full_reload') {
        const mapped = buildMappedData(renderableCandles);
        if (mapped.length > 0) {
          webViewRef.current.injectJavaScript(
            `updateChartData(${JSON.stringify(mapped)}); true;`,
          );
          didInject = true;
        }
      } else {
        const lastCandle = renderableCandles[renderableCandles.length - 1];
        if (lastCandle) {
          webViewRef.current.injectJavaScript(
            `updateTick(${JSON.stringify(buildChartTickPayload(lastCandle, chartType))}); true;`,
          );
          didInject = true;
        }
      }
    } catch (_e) { /* WebView may have been disposed */ }

    if (didInject) {
      renderedSeriesSnapshotRef.current = nextSnapshot;
    }
  }, [candles, chartCanvasReady, chartReadyEpoch, chartType, buildMappedData, getRenderableCandles]);

  // Watchdog — if CHART_READY hasn't arrived, keep retrying every 3s.
  // Also acts as a self-heal: if the WebView silently loses the chart
  // (process killed, JS error, etc.), this brings it back.
  useEffect(() => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);

    watchdogRef.current = setInterval(() => {
      if (!chartInitializedRef.current && webViewReady && candlesRef.current.length > 0) {
        console.log('[CHART WATCHDOG] chart not confirmed, re-sending initChart');
        sendInit();
      }
    }, 3000);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [webViewReady, sendInit]);

  // Mock data fallback — if no candles after 4 seconds, generate mock
  // data so the chart is never blank. Real data will replace it when it arrives.
  useEffect(() => {
    if (candles.length > 0) return;
    const tmr = setTimeout(() => {
      if (candlesRef.current.length === 0) {
        console.log('[CHART] No candles after 4s, forcing refresh');
        refreshCandles();
      }
    }, 4000);
    return () => clearTimeout(tmr);
  }, [candles.length, refreshCandles]);

  const overlayPayload = useMemo(
    () => {
      if (!preferencesHydrated) {
        return { priceLines: [], markers: [] };
      }

      return buildChartOverlayPayload({
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
    ],
  );
  const overlayPayloadSignature = useMemo(() => JSON.stringify(overlayPayload), [overlayPayload]);

  // ── DEBUG: Log overlay payload every time it changes ──
  useEffect(() => {
    console.log(
      `[CHART OVERLAY DEBUG] positions=${positions.length} | ` +
      `chartSymbol=${chartSymbol} | ` +
      `priceLines=${overlayPayload.priceLines.length} | ` +
      `markers=${overlayPayload.markers.length} | ` +
      `showOpen=${chartShowOnChart.openPositions} showTpSl=${chartShowOnChart.tpSlStopLimit} | ` +
      `webViewReady=${webViewReady} chartCanvasReady=${chartCanvasReady}`,
    );
    if (overlayPayload.priceLines.length > 0) {
      overlayPayload.priceLines.forEach((l) =>
        console.log(`  [OVERLAY LINE] id=${l.id} price=${l.price} title="${l.title}" color=${l.color}`),
      );
    }
  }, [overlayPayloadSignature, positions.length, webViewReady, chartCanvasReady, chartShowOnChart]);

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
    if (!webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const js = `
      if (typeof setChartOverlays === 'function') {
        setChartOverlays(${JSON.stringify(overlayPayload)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(js);

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
  }, [overlayPayloadSignature, webViewReady, chartCanvasReady, chartReadyEpoch, overlaySyncRevision]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;

  const sentiment = useMemo(() => getSentimentForSymbol(chartSymbol), [chartSymbol]);

  return (
    <Screen style={styles.screen} noBottomInset>
      {!isChartExpanded && (
        <View style={styles.headerWrapper}>
          <AppHeader title={t('Chart')} noBorder />
          <View style={styles.compactHeader}>
            {/* Left: Symbol Info */}
            <Pressable style={styles.symbolSection} onPress={() => setSymbolPickerOpen(true)}>
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

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={chartScrollRef}
          style={styles.card}
          contentContainerStyle={[
            styles.chartScrollContent,
            keyboardInset > 0 && { paddingBottom: keyboardInset },
          ]}
          nestedScrollEnabled
          scrollEnabled={!shouldCaptureChartGestures}
          bounces={!shouldCaptureChartGestures}
          alwaysBounceVertical={!shouldCaptureChartGestures}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.chartContainer}>
          <View style={[styles.chartTopToolbar, isChartExpanded && { paddingTop: safeInsets.top + 8, marginTop: 0 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={[styles.inlineActionGroup, { flex: undefined, paddingRight: 4 }]}>
                <Pressable style={styles.toolbarSymbolButton} onPress={() => setSymbolPickerOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#D1D4DC' : '#131722' }}>{displaySymbol}</Text>
                </Pressable>
                <Pressable style={styles.toolbarIconButton} onPress={() => setSymbolPickerOpen(true)}>
                  <Ionicons name="add-outline" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={styles.toolbarTimeframeButton} onPress={() => setTfOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>{chartTimeframe}</Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={styles.toolbarComboButton} onPress={() => setShowChartTypeMenu(true)} hitSlop={8}>
                  <Ionicons name={chartType === 'candles' || chartType === 'hollow' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'} size={18} color={TEXT_MUTED} />
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={styles.toolbarIconButton} onPress={() => setMenuOpen(true)} hitSlop={8}>
                  <Ionicons name="analytics-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
            </ScrollView>

            {/* Right section — each icon has equal paddingHorizontal so spacing is uniform */}
            <View style={styles.toolbarTrailingGroup}>
              {showTradingSignals && (
                <Pressable style={styles.toolbarIconButton} onPress={() => setShowSignalDetails(true)} hitSlop={8}>
                  <View style={styles.redBoxIcon}>
                    <Ionicons name="arrow-down" size={14} color="#FFF" />
                  </View>
                </Pressable>
              )}
              <Pressable style={styles.toolbarIconButton} onPress={() => router.push('/chart/objects')} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarIconButton} onPress={() => router.push('/chart/settings')} hitSlop={8}>
                <Ionicons name="options-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarIconButton} onPress={() => setIsChartExpanded(!isChartExpanded)} hitSlop={8}>
                <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarIconButton} onPress={() => setShowMoreMenu(true)} hitSlop={8}>
                <Ionicons name="ellipsis-vertical" size={18} color={TEXT_MUTED} />
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {(isChartExpanded || showDrawingToolbar) && (
              <ScrollView
                style={[styles.leftToolbar, !isChartExpanded && styles.leftToolbarOverlay]}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.leftToolbarContent}
              >
                <Pressable style={[styles.toolIcon, styles.toolIconPrimary]} onPress={() => setShowDrawingQuickActions(true)}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'crosshair' && styles.toolIconActive]} onPress={() => handleSetTool('crosshair')}><TvCrosshair color={activeTool === 'crosshair' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'trendline' && styles.toolIconActive]} onPress={() => handleSetTool('trendline')}><TvTrendLine color={activeTool === 'trendline' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'fib' && styles.toolIconActive]} onPress={() => handleSetTool('fib')}><TvFib color={activeTool === 'fib' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'brush' && styles.toolIconActive]} onPress={() => handleSetTool('brush')}><TvBrush color={activeTool === 'brush' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'text' && styles.toolIconActive]} onPress={() => handleSetTool('text')}><TvText color={activeTool === 'text' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'patterns' && styles.toolIconActive]} onPress={() => handleSetTool('patterns')}><TvPatterns color={activeTool === 'patterns' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'prediction' && styles.toolIconActive]} onPress={() => handleSetTool('prediction')}><TvPrediction color={activeTool === 'prediction' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'pitchfork' && styles.toolIconActive]} onPress={() => handleSetTool('pitchfork')}><TvPitchfork color={activeTool === 'pitchfork' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'smiley' && styles.toolIconActive]} onPress={() => handleSetTool('smiley')}><TvSmiley color={activeTool === 'smiley' ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive]} onPress={() => handleSetTool('measure')}><TvMeasure color={activeTool === 'measure' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={styles.toolIcon} onPress={handleZoomTool}><TvZoom color={TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, magnetEnabled && styles.toolIconActive]} onPress={handleToggleMagnet}><TvMagnet color={magnetEnabled ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, stickyDrawingMode && styles.toolIconActive]} onPress={handleToggleStickyMode}><TvStayInDrawingMode color={stickyDrawingMode ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, chartLockAll && styles.toolIconActive]} onPress={handleToggleLock}><TvLock color={chartLockAll ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, chartHideAll && styles.toolIconActive]} onPress={handleToggleHide}><TvHide color={chartHideAll ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={styles.toolIcon} onPress={handleClearDrawings}><TvTrash color={TEXT_MUTED} /></Pressable>
                <Pressable style={styles.toolIcon} onPress={() => { setShowDrawingToolbar(false); router.push('/chart/objects'); }}><TvLayers color={TEXT_MUTED} /></Pressable>
              </ScrollView>
            )}
            <View style={{ flex: 1, position: 'relative' }}>
              {showChartMetaRow && (
                <View pointerEvents="none" style={styles.chartMetaOverlay}>
                  <View style={styles.chartMetaOhlc}>
                    {chartMetaItems.map((item) => (
                      <View key={item.label} style={styles.chartMetaPair}>
                        <Text style={styles.chartMetaLabel}>{item.label}</Text>
                        <Text
                          style={[
                            styles.chartMetaValue,
                            { color: chartMetaIsUp ? resolvedChartColors.candlesUptrend : resolvedChartColors.candlesDowntrend },
                          ]}
                        >
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {isLoading && (
                <View style={styles.chartOverlay}>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.overlayText}>Loading chart data...</Text>
                </View>
              )}

              {isError && !isLoading && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>Unable to load chart</Text>
                  <Text style={styles.overlaySubText}>Waiting for market data connection...</Text>
                </View>
              )}

              <WebView
                ref={webViewRef}
                source={CHART_SOURCE}
                style={{ flex: 1, backgroundColor: resolvedChartColors.background }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                javaScriptEnabled={true}
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
                      // Bump epoch so the overlay effect always re-fires
                      // after every (re-)initialization, even when the
                      // payload itself hasn't changed.
                      setChartReadyEpoch((c) => c + 1);
                      // Immediately push the latest overlay so lines appear
                      // without waiting for the next React effect cycle.
                      try {
                        const latestOverlay = overlayPayloadRef.current;
                        if (latestOverlay && webViewRef.current) {
                          webViewRef.current.injectJavaScript(`
                            if (typeof setChartOverlays === 'function') {
                              setChartOverlays(${JSON.stringify(latestOverlay)});
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
                    } else if (msg.type === 'TOOL_ACTIVE_CHANGED') {
                      setActiveTool(typeof msg.tool === 'string' ? msg.tool : 'crosshair');
                    } else if (msg.type === 'ERROR') {
                      // Log but don't alert — the watchdog will auto-retry.
                      console.warn('[CHART WEBVIEW ERROR]', msg.message);
                    }
                  } catch (_e) { }
                }}
              />



            </View>
          </View>
        </View>

        {!isChartExpanded && (
          <View style={styles.bottomArea}>
            <View style={styles.tvBottomToolbar}>
              <Pressable style={styles.tvRangesLeft} onPress={() => setShowTimeRangeMenu(true)}>
                <Text style={styles.tvRangeText} numberOfLines={1} adjustsFontSizeToFit>{getChartTimeRangeLabel(activeDateRange)}</Text>
                <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginLeft: 4 }} />
              </Pressable>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.tvRangeText} numberOfLines={1} adjustsFontSizeToFit>
                  {customDateValue ? customDateValue.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Date Range'}
                </Text>
                <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginLeft: 4 }} />
              </Pressable>
              <View style={styles.tvRangesRight}>
                <LiveClock styles={styles} />
                <Pressable
                  hitSlop={10}
                  onPress={handleResetTimeRange}
                >
                  <Text style={{ color: BLUE, fontSize: 11, fontWeight: '500' }}>Reset</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.sentimentLabelsRow}>
              <Text style={styles.sentimentLabelSell}>{sentiment.sellPct}% SELL</Text>
              <Text style={styles.sentimentLabelBuy}>{sentiment.buyPct}% BUY</Text>
            </View>
            <View style={styles.sentimentBarRow}>
              <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: sentiment.sellPct }]} />
              <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: sentiment.buyPct }]} />
            </View>

            <LiveTradeButtons symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} lotSize={tradeVolume} onTradeResult={setTradeFeedback} />

            <View style={styles.lotSelectorBar}>
              <Pressable style={styles.lotStepperBtn} onPress={() => updateTradeVolume(incrementTradeVolume(tradeVolume, -1, tradeVolumeBounds))}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </Pressable>
              <Text style={styles.lotLabelText}>Lot:</Text>
              <TextInput
                style={styles.lotInput}
                value={lotInput}
                onChangeText={(text) => setLotInput(sanitizeTradeVolumeDraft(text))}
                onFocus={() => scrollLotEditorIntoView(false)}
                onBlur={commitLotDraft}
                onSubmitEditing={commitLotDraft}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={formatTradeVolume(tradeVolume, tradeVolumeBounds)}
                placeholderTextColor={T.textMuted}
              />
              <Pressable style={styles.lotStepperBtn} onPress={() => updateTradeVolume(incrementTradeVolume(tradeVolume, 1, tradeVolumeBounds))}>
                <Ionicons name="add" size={18} color={T.textSub} />
              </Pressable>
            </View>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={`${chartSymbol}: active chart`}
        actions={[
          { label: 'Indicators' },
          { label: 'Objects', onPress: () => router.push('/chart/objects') },
          { label: 'Chart Preferences', onPress: () => router.push('/chart/settings') },
        ]}
      />

      <ActionSheet
        visible={tfOpen}
        onClose={() => setTfOpen(false)}
        title='Timeframes'
        actions={timeframes.map((tf) => ({ label: tf, onPress: () => handleTimeframeSelect(tf) }))}
      />

      <ActionSheet
        visible={symbolPickerOpen}
        onClose={() => setSymbolPickerOpen(false)}
        title='Select Symbol'
        searchable={true}
        actions={availableSymbols.map((sym) => ({
          label: sym,
          onPress: () => setChartSymbol(sym),
        }))}
      />

      <ActionSheet
        visible={showChartTypeMenu}
        onClose={() => setShowChartTypeMenu(false)}
        title='Chart Type'
        actions={[
          { label: 'Candlestick', onPress: () => setChartVisualType('candles') },
          { label: 'Hollow Candles', onPress: () => setChartVisualType('hollow') },
          { label: 'OHLC Bars', onPress: () => setChartVisualType('bars') },
          { label: 'Line', onPress: () => setChartVisualType('line') },
        ]}
      />

      <ActionSheet
        visible={showDrawingQuickActions}
        onClose={() => setShowDrawingQuickActions(false)}
        title='Add To Chart'
        actions={[
          { label: 'Trend Line', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('trendline'); } },
          { label: 'Fib Zone', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('fib'); } },
          { label: 'Highlight Box', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('brush'); } },
          { label: 'Text Label', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('text'); } },
          { label: 'Pattern Path', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('patterns'); } },
          { label: 'Long Position', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('prediction'); } },
          { label: 'Pitchfork', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('pitchfork'); } },
          { label: 'Measure Range', onPress: () => { setShowDrawingQuickActions(false); handleSetTool('measure'); } },
          { label: 'Clear Drawings', danger: true, onPress: () => { setShowDrawingQuickActions(false); handleClearDrawings(); } },
        ]}
      />

      <ActionSheet
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        title='Options'
        actions={[
          {
            label: 'Remove from favorites',
            icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); }
          },
          {
            label: 'Trading calculator',
            icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/calculator', params: { symbol: chartSymbol } }); }
          },
          {
            label: 'Analytics',
            icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/analytics', params: { symbol: chartSymbol } }); }
          },
          {
            label: 'Specification',
            icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/specification', params: { symbol: chartSymbol } }); }
          },
        ]}
      />

      <ActionSheet
        visible={showTimeRangeMenu}
        onClose={() => setShowTimeRangeMenu(false)}
        title="Quick Time Range"
        actions={[
          { label: '1 Day', onPress: () => handleRangePress('1d') },
          { label: '5 Days', onPress: () => handleRangePress('5d') },
          { label: '1 Month', onPress: () => handleRangePress('1m') },
          { label: '3 Months', onPress: () => handleRangePress('3m') },
          { label: '6 Months', onPress: () => handleRangePress('6m') },
          { label: 'Year To Date', onPress: () => handleRangePress('ytd') },
          { label: '1 Year', onPress: () => handleRangePress('1y') },
          { label: 'All Data', onPress: () => handleRangePress('all') },
        ]}
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

function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = isDark ? '#030508' : T.bg;
  const CHART_CANVAS_BG = isDark ? '#080B11' : '#FFFFFF';
  const BOTTOM_AREA_BG = isDark ? '#0A0C0F' : '#F8FAFC';
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const TEXT_MUTED = T.textMuted;

  return StyleSheet.create({
    flex1: {
      flex: 1,
    },
    chartScrollContent: {
      flexGrow: 1,
    },
    calendarOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    },
    calendarContainer: {
      width: '90%',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: isDark ? '#0E141F' : T.glass2,
      borderWidth: 1,
      borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 24,
      elevation: 8,
      padding: 4,
    },
    screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },
    headerWrapper: {
      backgroundColor: isDark ? '#080B11' : T.glass2,
      zIndex: 10,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 56,
      paddingRight: 16,
      height: 40,
    },
    topBarSide: {
      width: 32,
    },

    /* â”€â”€ Compact Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 0,
      paddingBottom: 18,
      minHeight: 48,
      marginTop: -6,
      backgroundColor: isDark ? '#080B11' : T.glass2,
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
    },
    symbolSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minHeight: 36,
      marginTop: 4,
    },
    flagStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    flagCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: isDark ? '#0B101E' : '#FFFFFF',
    },
    flagOverlap: {
      marginLeft: -10,
    },
    symbolNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    symbolText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    fxBadge: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 3,
    },
    fxBadgeText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    symbolSubText: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 10,
      fontWeight: '500',
      marginTop: 1,
    },

    /* â”€â”€ Center: Live Price â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    priceSection: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    livePriceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 17,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    priceChangeText: {
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },

    /* â”€â”€ Right: Balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    rightSection: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      flex: 1,
      transform: [{ translateY: 10 }],
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceLabel: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 1,
    },
    balanceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    currencyText: {
      fontSize: 10,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '700',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 18,
      fontWeight: '600',
    },
    accountDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dotDemo: {
      backgroundColor: '#00E676',
    },
    dotLive: {
      backgroundColor: isDark ? '#FACC15' : '#D97706',
    },
    accountTypeText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    textDemo: {
      color: '#00E676',
    },
    textLive: {
      color: isDark ? '#FACC15' : '#D97706',
    },

    /* â”€â”€ Card (main body) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    card: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    chartContainer: {
      flex: 1,
      backgroundColor: CHART_CANVAS_BG,
      position: 'relative',
    },
    leftToolbar: {
      width: 54,
      minWidth: 54,
      maxWidth: 54,
      flexShrink: 0,
      flexGrow: 0,
      backgroundColor: isDark ? '#080B11' : '#F8FAFC',
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
    },
    leftToolbarContent: {
      alignItems: 'center',
      paddingVertical: 12,
      gap: 4,
    },
    toolIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    toolIconPrimary: {
      backgroundColor: BLUE,
      marginBottom: 2,
      shadowColor: BLUE,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 0,
    },
    toolIconActive: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
    },
    toolSeparator: {
      width: 20,
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
      marginVertical: -4,
    },
    chartTopToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 6,
      marginTop: 16,
      backgroundColor: isDark ? '#080B11' : '#F8FAFC',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
    },
    chartMetaOverlay: {
      position: 'absolute' as any,
      top: 10,
      left: 12,
      zIndex: 30,
    },
    chartMetaOhlc: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(8,11,17,0.78)' : 'rgba(248,250,252,0.82)',
      borderRadius: 6,
    },
    chartMetaPair: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    chartMetaLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    chartMetaValue: {
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    inlineActionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    toolbarSymbolButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingHorizontal: 6,
    },
    toolbarTimeframeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingHorizontal: 6,
    },
    toolbarComboButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingHorizontal: 6,
    },
    toolbarIconButton: {
      width: 32,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarTrailingGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    toolbarSeparator: {
      width: 1,
      height: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      marginHorizontal: 6,
    },
    toolbarFlexSpacer: {
      flex: 1,
    },
    redBoxIcon: {
      backgroundColor: RED,
      width: 24,
      height: 24,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(5,8,16,0.85)' : 'rgba(255,255,255,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 50,
    },
    overlayText: {
      color: isDark ? TEXT_MUTED : '#475569',
      marginTop: 12,
      fontSize: 14,
      fontWeight: '600',
    },
    overlaySubText: {
      color: isDark ? 'rgba(142,154,175,0.6)' : '#94A3B8',
      marginTop: 4,
      fontSize: 12,
    },
    floatingAutoBtn: {
      position: 'absolute',
      right: 56,
      bottom: 24,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      zIndex: 100,
    },
    floatingAutoText: {
      fontSize: 12,
      fontWeight: '800',
    },

    /* â”€â”€ Bottom Area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    bottomArea: {
      backgroundColor: isDark ? '#080B11' : T.glass2,
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 0,
      borderTopWidth: 1,
      borderTopColor: T.border,
    },
    tvBottomToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 8,
    },
    tvRangesLeft: { flexDirection: 'row', alignItems: 'center' },
    tvRangesRight: { flexDirection: 'row', alignItems: 'center' },
    tvRangeText: { fontSize: 11, fontWeight: '500', color: '#787B86' },
    tvRangeAutoText: { fontSize: 11, fontWeight: '500', color: '#787B86' },
    sentimentLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 0,
    },
    sentimentLabelSell: {
      color: RED,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    sentimentLabelBuy: {
      color: BLUE,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    sentimentBarRow: {
      flexDirection: 'row',
      height: 2,
      marginBottom: 4,
      borderRadius: 3,
      overflow: 'hidden',
      gap: 2,
    },
    sentimentHalf: {
      height: '100%',
      borderRadius: 3,
    },
    sentimentSell: {
      backgroundColor: RED,
    },
    sentimentBuy: {
      backgroundColor: BLUE,
    },
    tradeControlsRow: {
      flexDirection: 'row',
      marginBottom: 4,
      gap: 6,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 10,
      padding: 6,
      paddingVertical: 6,
      borderWidth: 1,
    },
    actionBtnSell: {
      backgroundColor: RED,
      borderWidth: 0,
      shadowColor: RED,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 8,
      elevation: 0,
    },
    actionBtnBuy: {
      backgroundColor: BLUE,
      borderWidth: 0,
      shadowColor: BLUE,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 8,
      elevation: 0,
    },
    actionSpacer: {
      width: 0,
    },
    actionBtnHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    actionBtnLabelTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 1,
    },
    actionBtnLabelSell: {
      color: '#FFFFFF',
    },
    actionBtnLabelBuy: {
      color: '#FFFFFF',
    },
    actionBtnPriceText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    lotSelectorBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      borderRadius: 10,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    },
    lotStepperBtn: {
      width: 40,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    lotLabelText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#64748B' : TEXT_MUTED,
    },
    lotInput: {
      flex: 1,
      color: isDark ? '#E2E8F0' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      paddingVertical: 0,
    },
    leftToolbarOverlay: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 50,
      height: '100%',
      backgroundColor: isDark ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.95)',
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    },
    floatingDrawBtn: {
      position: 'absolute',
      left: 12,
      bottom: 30,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      zIndex: 40,
    },
  });
}
