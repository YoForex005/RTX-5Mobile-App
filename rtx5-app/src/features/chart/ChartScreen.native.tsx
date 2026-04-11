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
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Image, AppState, Platform } from 'react-native';
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
import { candlesWsService } from '../../api/ws/candlesSocket';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePlaceOrderMutation } from '../../query/orders';
import { usePositionsState } from '../../state/positionsState';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAlertsQuery } from '../../query/alerts';
import { resolveTradingLogin as resolveTradingLoginUtil } from '../../state/tradingLogin';
import { TradingSignalDetailsModal } from './TradingSignalDetailsModal';
import { useMarketSymbols } from '../../query/market';
import { WebView } from 'react-native-webview';
import { useMarketData } from '../../query/websocket';
import { DRAWING_TOOLS_JS } from './plugins/drawingToolsBundleString';
import { ENHANCED_DRAWING_TOOLS_JS } from './plugins/enhancedDrawingToolsString';
import { CandleStreamEvent, isStructurallyValidCandle, normalizeTimeframe } from '../../domain/candles';
import {
  mapCandlesToRTX5CustomCandlestickData,
} from './rendering/customCandlestickSeries';
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from './rendering/customCandlestickSeriesWebView';
import { LIGHTWEIGHT_CHARTS_JS } from './rendering/lightweightChartsBundle';
import { buildChartOverlayPayload } from './chartOverlays';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

// Micro-component: isolated 4fps render cycle, 0 DOM depth
// Uses quotes WS (bid/ask) as primary price source — always accurate.
// Falls back to candle WS close only when quotes haven't arrived yet.
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals }: any) => {
  const latestTick = useLiveTick(symbol);
  const liveQuotes = useMarketData([symbol]);
  const q = liveQuotes[symbol] || {};

  // Primary: quotes WS bid price (most reliable, real-time)
  // Fallback: candle WS close price (only if quotes WS hasn't sent data yet)
  const quoteBid = typeof q.bid === 'number' && q.bid > 0 ? q.bid : null;
  const candleClose = latestTick && typeof latestTick.close === 'number' && latestTick.close > 0 ? latestTick.close : null;
  const currentPrice = quoteBid ?? candleClose;

  if (currentPrice === null) return <View style={styles.priceSection}><Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text></View>;

  const changePct = q.changePct ?? 0;
  const openPrice = q.open ?? q.close ?? currentPrice;
  const change = q.change !== undefined ? q.change : (currentPrice - openPrice);

  const isUp = change >= 0;

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
const LiveTradeButtons = React.memo(({ symbol, styles, displayDecimals, lotSize }: any) => {
  const latestTick = useLiveTick(symbol);
  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (symbol.includes('XAU') ? 0.30 : symbol.includes('BTC') ? 25 : 0.00015);

  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();

  const handleTrade = (side: 'buy' | 'sell') => {
    if (oneClickAccepted) {
      const tradingLogin = resolveTradingLogin();
      if (!tradingLogin) {
        Alert.alert('Error', 'No active trading account resolved.');
        return;
      }

      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume: Number(lotSize),
          price_sl: 0,
          price_tp: 0,
          comment: '',
          trailing_stop: 0,
          trailing_step: 0,
          magic: 0
        },
        {
          onSuccess: (data: any) => {
            // usePlaceOrderMutation.onSuccess already adds the optimistic position
            // to positionsState — do NOT add it again here or the same ticket ID
            // appears twice in the list causing "Encountered two children with the
            // same key" warnings and visual glitches.
            const positionTicket = data?.position_ticket || data?.order_ticket;
            Alert.alert('Trade Executed', `Successfully placed ${side.toUpperCase()} on ${symbol}.\nTicket #${positionTicket}`);
          },
          onError: (err: any) => {
            const msg = err?.response?.data?.message || err?.message || 'Execution error';
            Alert.alert('Trade Failed', msg);
          }
        }
      );
    } else {
      router.push({ pathname: '/trade/order-ticket', params: { symbol, side } });
    }
  };

  return (
    <View style={styles.tradeControlsRow}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnSell, isPending && { opacity: 0.5 }]}
        disabled={isPending}
        onPress={() => handleTrade('sell')}
      >
        <View style={styles.actionBtnHeader}>
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelSell]}>SELL</Text>
          <Ionicons name="chevron-down" size={16} color="#FFF" />
        </View>
        <Text style={styles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
      </Pressable>

      <View style={styles.actionSpacer} />

      <Pressable
        style={[styles.actionBtn, styles.actionBtnBuy, isPending && { opacity: 0.5 }]}
        disabled={isPending}
        onPress={() => handleTrade('buy')}
      >
        <View style={styles.actionBtnHeader}>
          <Ionicons name="chevron-up" size={16} color="#FFF" />
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelBuy]}>BUY</Text>
        </View>
        <Text style={styles.actionBtnPriceText} numberOfLines={1} adjustsFontSizeToFit>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
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
      //     • host calls updateChartData(candles) when the merged history+WS
      //         array reshuffles (e.g. resync, history backfill)
      //     • host calls updateTick(candle) for every live WS candle event
      //         (append OR replace_last; the merge is decided by time match)
      //     • host calls setBidPriceLine(price) for the live BID line
      //
      //   We rely on the standard lightweight-charts CandlestickSeries
      //   (no custom renderer, no bundled JS) to keep the pipeline simple
      //   and reliable. Wicks and body draw via library defaults — no gap
      //   artifacts. Pre-existing gaps in the data stay visible.
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
      var volumeSeries = null;
      var bidPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';
      var volUpColor = 'rgba(38,166,154,0.5)';
      var volDownColor = 'rgba(239,83,80,0.5)';

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
          volumeSeries = null;
          bidPriceLine = null;
          _positionLinesArr = [];
        }
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
        volUpColor = hexToRgba(colors.up, 0.5);
        volDownColor = hexToRgba(colors.down, 0.5);

        if (seriesType === 'line') {
          series = chart.addSeries(LightweightCharts.LineSeries, {
            color: (customCols && customCols.lineBody) || colors.up,
            lineWidth: 2,
            priceFormat: priceFormat,
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineWidth: 1,
            priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            priceLineColor: '',
            priceLineSource: LightweightCharts.PriceLineSource ? LightweightCharts.PriceLineSource.LastBar : 0,
          });
        } else if (seriesType === 'bars') {
          series = chart.addSeries(LightweightCharts.BarSeries, {
            upColor: (customCols && customCols.barsUptrend) || colors.up,
            downColor: (customCols && customCols.barsDowntrend) || colors.down,
            priceFormat: priceFormat,
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineWidth: 1,
            priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            priceLineColor: '',
            priceLineSource: LightweightCharts.PriceLineSource ? LightweightCharts.PriceLineSource.LastBar : 0,
          });
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
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineWidth: 1,
            priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            priceLineColor: seriesType === 'hollow' ? colors.up : '',
            priceLineSource: LightweightCharts.PriceLineSource ? LightweightCharts.PriceLineSource.LastBar : 0,
          });
        }

        // Volume histogram series — occupies the bottom 20% of the pane,
        // bars coloured green/red to match the candle direction.
        try {
          volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
            lastValueVisible: false,
            priceLineVisible: false,
            color: volUpColor,
          });
          chart.priceScale('vol').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        } catch (_ve) { volumeSeries = null; }

        if (data && data.length > 0) {
          var mapped = mapForSeries(data);
          series.setData(mapped);
          lastBarTime = mapped[mapped.length - 1].time;
          if (volumeSeries) {
            try { volumeSeries.setData(mapVolumeData(data)); } catch (_ve) {}
          }
          try {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          } catch (_e) {}
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

      function mapVolumeData(data) {
        if (!data || data.length === 0) return [];
        var out = [];
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var vol = typeof d.volume === 'number' ? d.volume : 0;
          if (vol <= 0) continue;
          var isUp = (d.close || 0) >= (d.open || 0);
          out.push({ time: d.time, value: vol, color: isUp ? volUpColor : volDownColor });
        }
        return out;
      }

      function updateChartData(data) {
        try {
          if (!series) {
            postError('updateChartData', new Error('series not initialized'));
            return;
          }
          var mapped = mapForSeries(data);
          series.setData(mapped);
          
          // CRITICAL BUGFIX: setData natively obliterates all PriceLines previously bound to the series!
          // We must explicitly reconstruct the dynamic trade overlays immediately after setting chart data.
          _positionLinesArr = [];
          _overlayMarkers = null;
          if (_overlayPayload) {
            applyOverlayPayload(_overlayPayload);
          }

          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
          }
          if (volumeSeries) {
            try { volumeSeries.setData(mapVolumeData(data)); } catch (_ve) {}
          }
        } catch (e) {
          postError('updateChartData', e);
        }
      }

      function updateTick(tick) {
        try {
          if (!series || !tick || typeof tick.time !== 'number') return;
          // Stale tick guard: never update with a bar older than the last
          // one already on screen — that triggers lightweight-charts'
          // "Cannot update oldest data" exception.
          if (tick.time < lastBarTime) return;
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
          series.update(bar);
          if (tick.time >= lastBarTime) {
            lastBarTime = tick.time;
          }
          if (volumeSeries && typeof tick.volume === 'number' && tick.volume > 0) {
            try {
              var isUp = (tick.close || 0) >= (tick.open || 0);
              volumeSeries.update({
                time: tick.time,
                value: tick.volume,
                color: isUp ? volUpColor : volDownColor,
              });
            } catch (_ve) {}
          }
        } catch (e) {
          if (typeof e.message === 'string' && e.message.indexOf('Cannot update oldest data') >= 0) {
            return; // benign race
          }
          postError('updateTick', e);
        }
      }

      function setBidPriceLine(price) {
        try {
          if (!series || typeof price !== 'number' || !isFinite(price)) return;
          if (bidPriceLine) {
            series.removePriceLine(bidPriceLine);
            bidPriceLine = null;
          }
          bidPriceLine = series.createPriceLine({
            price: price,
            color: '#2962FF',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: true,
            title: 'BID',
          });
        } catch (e) {
          postError('setBidPriceLine', e);
        }
      }

      // Backwards-compat no-ops so any stale call sites from earlier
      // builds (drawing tools / overlays) silently do nothing instead of
      // throwing and aborting the script.
      function setLiveCandleLine() {}
      function updateChartAppearance() {}
      function setVolumeSeriesData(data) {
        if (!volumeSeries || !data) return;
        try { volumeSeries.setData(mapVolumeData(data)); } catch (_e) {}
      }
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
      window.setBidPriceLine = setBidPriceLine;
      window.setLiveCandleLine = setLiveCandleLine;
      window.updateChartAppearance = updateChartAppearance;
      window.setVolumeSeriesData = setVolumeSeriesData;
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
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
    chartColors,
    chartColorScheme,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    isDemoAccount,
    accountDetails,
    showTradingSignals,
    chartLockAll,
    chartHideAll,
    setChartLockAll,
    setChartHideAll,
    setChartDrawings,
  } = useUserPreferences();
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;
  const positions = usePositionsState((s) => s.positions);
  const showOpenPositions = useUserPreferences((s) => s.showOpenPositions);
  const showTpSlStopLimit = useUserPreferences((s) => s.showTpSlStopLimit);
  const showClosedPositions = useUserPreferences((s) => s.showClosedPositions);
  const showHmrPeriods = useUserPreferences((s) => s.showHmrPeriods);
  const showPriceAlerts = useUserPreferences((s) => s.showPriceAlerts);
  const showPotentialStopOut = useUserPreferences((s) => s.showPotentialStopOut);
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);

  const { data: apiSymbols = [] } = useMarketSymbols();
  const availableSymbols = apiSymbols.length > 0 ? apiSymbols : CHART_SYMBOLS;

  useEffect(() => {
    if (apiSymbols.length > 0 && !apiSymbols.includes(chartSymbol)) {
      setChartSymbol(apiSymbols[0]);
    }
  }, [apiSymbols, chartSymbol, setChartSymbol]);

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);
  const displayDecimals = baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;
  const { data: closedPositions = [] } = usePositionHistoryQuery(accountLogin);
  const { data: alerts = [] } = useAlertsQuery();
  const liveAccountEquity = useLiveAccountState((s) => s.equity);
  const liveAccountMargin = useLiveAccountState((s) => s.margin);
  const liveAccountMarginLevel = useLiveAccountState((s) => s.margin_level);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const safeInsets = useSafeAreaInsets();
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const [showDrawingQuickActions, setShowDrawingQuickActions] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const webViewRef = useRef<WebView>(null);

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
    setChartDrawings([]);
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
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);

  const { candles, refresh: refreshCandles } = useLiveCandles(chartSymbol, chartTimeframe);

  const handleRefreshChart = useCallback(async () => {
    setIsRefreshing(true);
    try {
      refreshCandles();
      if (accountLogin) {
        await refreshPositions(String(accountLogin));
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [refreshCandles, accountLogin, refreshPositions]);

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
      scaleMargins: { top: 0.08, bottom: 0.25 },
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

  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);
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
  // Loading overlay: show until chart is confirmed rendered OR 3s fallback.
  // This prevents the user from seeing a blank WebView between data arrival
  // and chart render completion.
  const [loadingFallback, setLoadingFallback] = useState(false);
  useEffect(() => {
    setLoadingFallback(false);
    const tmr = setTimeout(() => setLoadingFallback(true), 3000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe, chartType]);
  const isLoading = !chartCanvasReady && !loadingFallback;
  const isError = false;

  useEffect(() => {
    if (!webViewReady) return;
    const bridgedTool = chartLockAll ? 'crosshair' : activeTool;
    injectChartScript(`
      setDrawingsLocked(${chartLockAll});
      setDrawingsHidden(${chartHideAll});
      setStayInDrawingMode(${stickyDrawingMode});
      setMagnetMode(${magnetEnabled});
      setDrawingTool(${JSON.stringify(bridgedTool)});
    `);
  }, [webViewReady, chartLockAll, chartHideAll, stickyDrawingMode, magnetEnabled, chartSymbol, chartTimeframe, chartType]);

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

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    setChartCanvasReady(false);
  };

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const buildMappedData = useCallback((sourceCandles: typeof candles) => {
    // The type guard narrows to Pick<Candle, 'time'|'open'|'high'|'low'|'close'>
    // which strips `volume`. Cast back since filter only validates, it doesn't
    // actually remove the volume property from the runtime objects.
    const sanitized = sourceCandles.filter((c) => isStructurallyValidCandle(c)) as typeof sourceCandles;
    const uniqueByTime = Array.from(new Map(sanitized.map((item) => [item.time, item])).values());
    uniqueByTime.sort((a, b) => a.time - b.time);
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
  }, [chartType]);

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
  }, [sendInit, candles]);

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

  // Effect 2 — live tick stream. Bypasses React state for low latency.
  useEffect(() => {
    if (!webViewReady) return;
    let rAF: number | null = null;
    const pending: CandleStreamEvent[] = [];

    const flush = () => {
      rAF = null;
      if (!webViewRef.current || pending.length === 0) return;
      // If chart not yet initialized, drop ticks — the watchdog will
      // re-send the full candle array via initChart when ready.
      if (!chartInitializedRef.current) {
        pending.length = 0;
        return;
      }
      const events = pending.splice(0, pending.length);

      let js = '';
      let needsResync = false;

      for (const event of events) {
        if (event.type === 'resync_required') {
          needsResync = true;
          continue;
        }
        if (event.type === 'full_sync') {
          js += `updateChartData(${JSON.stringify(buildMappedData(event.candles))});`;
          continue;
        }
        // append / replace_last
        const c = (event as any).candle;
        // Extract volume before the type guard narrows away non-Pick fields
        const vol: number = typeof c?.volume === 'number' ? c.volume : 0;
        if (!c || !isStructurallyValidCandle(c)) continue;
        const tick =
          chartType === 'line'
            ? { time: c.time, value: c.close }
            : { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: vol };
        js += `updateTick(${JSON.stringify(tick)});`;
      }

      if (needsResync) {
        const mapped = buildMappedData(candlesRef.current);
        if (mapped.length > 0) {
          js += `updateChartData(${JSON.stringify(mapped)});`;
        }
      }

      if (js.length > 0) {
        try {
          webViewRef.current.injectJavaScript(js + ' true;');
        } catch (_e) { /* ignore — WebView may have been disposed */ }
      }
    };

    const handleStreamEvent = (event: CandleStreamEvent) => {
      if (event.symbol.toUpperCase() !== chartSymbol.toUpperCase()) return;
      if (normalizeTimeframe(event.tf) !== normalizeTimeframe(chartTimeframe)) return;
      pending.push(event);
      if (rAF === null) {
        rAF = requestAnimationFrame(flush);
      }
    };

    // Synchronous subscribe/unsubscribe — no dynamic import race condition.
    // The old async import() could leak listeners when the user rapidly
    // switched symbols because unsubscribeFn was still null at cleanup time.
    candlesWsService.addStreamListener(handleStreamEvent);

    return () => {
      if (rAF !== null) cancelAnimationFrame(rAF);
      candlesWsService.removeStreamListener(handleStreamEvent);
    };
  }, [chartSymbol, chartTimeframe, chartType, webViewReady, buildMappedData]);

  const overlayPayload = useMemo(
    () =>
      buildChartOverlayPayload({
        chartSymbol,
        candles,
        positions,
        closedPositions,
        alerts,
        colors: resolvedChartColors,
        sellColor: T.trading.sell.primary,
        liveAccount: {
          equity: liveAccountEquity,
          margin: liveAccountMargin,
          marginLevel: liveAccountMarginLevel,
        },
        showOpenPositions,
        showTpSlStopLimit,
        showClosedPositions,
        showTradingSignals,
        showHmrPeriods,
        showPriceAlerts,
        showPotentialStopOut,
        activeTool,
      }),
    [
      chartSymbol,
      candles,
      positions,
      closedPositions,
      alerts,
      resolvedChartColors,
      T.trading.sell.primary,
      liveAccountEquity,
      liveAccountMargin,
      liveAccountMarginLevel,
      showOpenPositions,
      showTpSlStopLimit,
      showClosedPositions,
      showTradingSignals,
      showHmrPeriods,
      showPriceAlerts,
      showPotentialStopOut,
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
      `showOpen=${showOpenPositions} showTpSl=${showTpSlStopLimit} | ` +
      `webViewReady=${webViewReady} chartCanvasReady=${chartCanvasReady}`,
    );
    if (overlayPayload.priceLines.length > 0) {
      overlayPayload.priceLines.forEach((l) =>
        console.log(`  [OVERLAY LINE] id=${l.id} price=${l.price} title="${l.title}" color=${l.color}`),
      );
    }
  }, [overlayPayloadSignature, positions.length, webViewReady, chartCanvasReady]);

  // Keep the ref in sync so the onMessage CHART_READY handler can
  // immediately push the latest overlay without waiting for the effect.
  useEffect(() => {
    overlayPayloadRef.current = overlayPayload;
  }, [overlayPayloadSignature]);

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
  }, [overlayPayloadSignature, webViewReady, chartCanvasReady, chartReadyEpoch]);

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
              <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} candles={candles} />
            </View>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.card}
        contentContainerStyle={{ flex: 1 }}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshChart}
            tintColor={isDark ? '#D1D4DC' : '#131722'}
            colors={[isDark ? '#D1D4DC' : '#131722']}
            progressBackgroundColor={isDark ? '#0E141F' : '#FFFFFF'}
          />
        }
      >
        <View style={styles.chartContainer}>
          <View style={[styles.chartTopToolbar, isChartExpanded && { paddingTop: safeInsets.top + 8, marginTop: 0 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={[styles.inlineActionGroup, { flex: undefined, paddingRight: 4 }]}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 }} onPress={() => setSymbolPickerOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#D1D4DC' : '#131722' }}>{displaySymbol}</Text>
                </Pressable>
                <Pressable style={{ paddingHorizontal: 5 }} onPress={() => setSymbolPickerOpen(true)}>
                  <Ionicons name="add-outline" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 }} onPress={() => setTfOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>{chartTimeframe}</Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 }} onPress={() => setShowChartTypeMenu(true)} hitSlop={8}>
                  <Ionicons name={chartType === 'candles' || chartType === 'hollow' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'} size={18} color={TEXT_MUTED} />
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ paddingHorizontal: 5 }} onPress={() => setMenuOpen(true)} hitSlop={8}>
                  <Ionicons name="analytics-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
            </ScrollView>

            {/* Right section — each icon has equal paddingHorizontal so spacing is uniform */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {showTradingSignals && (
                <Pressable style={{ paddingHorizontal: 5 }} onPress={() => setShowSignalDetails(true)} hitSlop={8}>
                  <View style={styles.redBoxIcon}>
                    <Ionicons name="arrow-down" size={14} color="#FFF" />
                  </View>
                </Pressable>
              )}
              <Pressable style={{ paddingLeft: 0, paddingRight: 10 }} onPress={() => router.push('/chart/objects')} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={{ paddingHorizontal: 8 }} onPress={() => router.push('/chart/settings')} hitSlop={8}>
                <Ionicons name="options-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={{ paddingLeft: 10, paddingRight: 4 }} onPress={() => setIsChartExpanded(!isChartExpanded)} hitSlop={8}>
                <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={{ paddingLeft: 12, paddingRight: 8 }} onPress={() => setShowMoreMenu(true)} hitSlop={8}>
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
                      const nextLabels = Array.isArray(msg.drawings)
                        ? msg.drawings
                          .map((item: any) => (typeof item?.label === 'string' ? item.label : ''))
                          .filter(Boolean)
                        : [];
                      setChartDrawings(nextLabels);
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
                <Text style={styles.tvRangeText} numberOfLines={1} adjustsFontSizeToFit>Time Range</Text>
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
                  onPress={() => {
                    injectChartScript(`
                      if (chart) {
                        try { chart.timeScale().fitContent(); } catch(_){}
                        try { chart.timeScale().scrollToRealTime(); } catch(_){}
                      }
                    `);
                  }}
                >
                  <Text style={{ color: BLUE, fontSize: 11, fontWeight: '500' }}>auto</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.segmentedControl}>
              {['POSITIONS', 'ORDERS', 'HISTORY'].map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.segmentBtn, tab === 'POSITIONS' && styles.segmentBtnActive]}
                  onPress={() => {
                    if (tab === 'HISTORY') router.push('/history');
                    else router.push('/trade');
                  }}
                >
                  <Text style={[styles.segmentText, tab === 'POSITIONS' && styles.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit>{tab}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sentimentLabelsRow}>
              <Text style={styles.sentimentLabelSell}>{sentiment.sellPct}% SELL</Text>
              <Text style={styles.sentimentLabelBuy}>{sentiment.buyPct}% BUY</Text>
            </View>
            <View style={styles.sentimentBarRow}>
              <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: sentiment.sellPct }]} />
              <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: sentiment.buyPct }]} />
            </View>

            <LiveTradeButtons symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} lotSize={lotSize} />

            <View style={styles.lotSelectorBar}>
              <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => Math.max(0.01, +((prev || 0) - 0.01).toFixed(2)))}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </Pressable>
              <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>{(lotSize || 0).toFixed(2)}</Text></Text>
              <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => +((prev || 0) + 0.01).toFixed(2))}>
                <Ionicons name="add" size={18} color={T.textSub} />
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={`${chartSymbol}: active chart`}
        actions={[
          { label: 'Indicators' },
          { label: 'Objects', onPress: () => router.push('/chart/objects') },
          { label: 'Chart Preferences' },
        ]}
      />

      <ActionSheet
        visible={tfOpen}
        onClose={() => setTfOpen(false)}
        title='Timeframes'
        actions={timeframes.map((tf) => ({ label: tf, onPress: () => setChartTimeframe(tf) }))}
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
          { label: '1 Day', onPress: () => { } },
          { label: '5 Days', onPress: () => { } },
          { label: '1 Month', onPress: () => { } },
          { label: '3 Months', onPress: () => { } },
          { label: '6 Months', onPress: () => { } },
          { label: 'Year To Date', onPress: () => { } },
          { label: '1 Year', onPress: () => { } },
          { label: '5 Years', onPress: () => { } },
          { label: 'All Data', onPress: () => { } },
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
                setCustomDateValue(new Date(day.timestamp));
                setShowDatePicker(false);
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
    inlineActionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    toolbarSeparator: {
      width: 1,
      height: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      marginHorizontal: 4,
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
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9',
      borderRadius: 8,
      padding: 1,
      marginBottom: 4,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 4,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentText: {
      color: isDark ? '#64748B' : '#64748B',
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    segmentTextActive: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontWeight: '700',
    },
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
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#64748B' : TEXT_MUTED,
    },
    lotValueText: {
      color: isDark ? '#E2E8F0' : '#0F172A',
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
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
