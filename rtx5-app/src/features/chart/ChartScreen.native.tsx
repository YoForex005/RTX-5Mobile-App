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
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, Image, AppState } from 'react-native';
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
import { usePlaceOrderMutation } from '../../query/orders';
import { usePositionsState } from '../../state/positionsState';
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

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals }: any) => {
  const latestTick = useLiveTick(symbol);
  const liveQuotes = useMarketData([symbol]);
  const q = liveQuotes[symbol] || {};

  if (!latestTick || typeof latestTick.close !== 'number') return <View style={styles.priceSection}><Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text></View>;

  const currentPrice = latestTick.close;
  const changePct = q.changePct ?? 0;
  // If the backend doesn't explicitly send "change", we can compute it using daily open or close
  // Assuming q.open or q.close is available. We prefer q.open for daily open if available.
  const openPrice = q.open ?? q.close ?? currentPrice;
  const change = q.change !== undefined ? q.change : (currentPrice - openPrice);

  const isUp = change >= 0;

  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2, opacity: 0.9 }]}>PRICE</Text>
      <Text style={styles.livePriceText} numberOfLines={1} adjustsFontSizeToFit>{(currentPrice || 0).toFixed(displayDecimals)}</Text>
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
          comment: 'One-Click RTX5 Order',
          trailing_stop: 0,
          trailing_step: 0,
          magic: 0
        },
        {
          onSuccess: (data: any) => {
            const positionTicket = data?.position_ticket || data?.order_ticket || Math.floor(Math.random() * 10000000);
            const state = usePositionsState.getState();
            const newPos = {
              id: String(positionTicket),
              symbol: symbol,
              side: side,
              volume: Number(lotSize),
              openPrice: data?.price || (side === 'buy' ? latestAsk : latestBid),
              currentPrice: side === 'buy' ? latestBid : latestAsk,
              pnl: 0,
              swap: 0,
              openTime: new Date().toISOString(),
              sl: 0,
              tp: 0,
              clientCreatedAt: Date.now(),
            };
            state.setPositions([newPos as any, ...state.positions]);
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
    <script src="https://unpkg.com/lightweight-charts@5.1.0/dist/lightweight-charts.standalone.production.js"></script>
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
      var chart = null;
      var series = null;
      var volumeSeries = null;
      var bidPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';

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

      function initChart(opts, chartType, data, displayDecimals) {
        try {
          if (chart) {
            try { chart.remove(); } catch (_e) {}
            chart = null;
            series = null;
            volumeSeries = null;
            bidPriceLine = null;
          }
          lastBarTime = 0;
          seriesType = chartType || 'candles';

          var safeOpts = applyChartLayout(opts);
          var customCols = safeOpts.customColors;
          if (safeOpts.customColors) { delete safeOpts.customColors; }

          chart = LightweightCharts.createChart(document.getElementById('chart'), safeOpts);

          var priceFormat = makePriceFormat(displayDecimals);
          var colors = pickSeriesColors({ customColors: customCols }, seriesType);

          if (seriesType === 'line') {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: (customCols && customCols.lineBody) || colors.up,
              lineWidth: 2,
              priceFormat: priceFormat,
              lastValueVisible: true,
              // Dashed horizontal line that tracks the last close across the
              // chart, plus the colored axis label on the right scale — the
              // standard "current price marker" you see in MT5 / TradingView.
              priceLineVisible: true,
              priceLineWidth: 1,
              priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
              priceLineColor: '',
              priceLineSource: LightweightCharts.PriceLineSource ? LightweightCharts.PriceLineSource.LastBar : 0,
            });
          } else if (seriesType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: (customCols && customCols.barsUptrend) || colors.up,
              downColor: (customCols && customCols.barsDowntrend) || colors.down,
              priceFormat: priceFormat,
              lastValueVisible: true,
              // Dashed horizontal line that tracks the last close across the
              // chart, plus the colored axis label on the right scale — the
              // standard "current price marker" you see in MT5 / TradingView.
              priceLineVisible: true,
              priceLineWidth: 1,
              priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
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
              // Dashed horizontal line that tracks the last close across the
              // chart, plus the colored axis label on the right scale — the
              // standard "current price marker" you see in MT5 / TradingView.
              priceLineVisible: true,
              priceLineWidth: 1,
              priceLineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
              priceLineColor: '',
              priceLineSource: LightweightCharts.PriceLineSource ? LightweightCharts.PriceLineSource.LastBar : 0,
            });
          }

          if (data && data.length > 0) {
            var mapped = mapForSeries(data);
            series.setData(mapped);
            lastBarTime = mapped[mapped.length - 1].time;
            try {
              chart.timeScale().fitContent();
              if (typeof chart.timeScale().scrollToRealTime === 'function') {
                chart.timeScale().scrollToRealTime();
              }
            } catch (_e) {}
          }

          postChartReady();
        } catch (e) {
          postError('initChart', e);
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

      function updateChartData(data) {
        try {
          if (!series) {
            postError('updateChartData', new Error('series not initialized'));
            return;
          }
          var mapped = mapForSeries(data);
          series.setData(mapped);
          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
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
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
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
      function setVolumeSeriesData() {}
      function setDrawingTool() {}
      function clearDrawings() {}
      function setDrawingsLocked() {}
      function setDrawingsHidden() {}
      function setStayInDrawingMode() {}
      function setMagnetMode() {}
      function zoomChart() {}
      function updatePositionLines() {}

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
      window.updatePositionLines = updatePositionLines;

      postReady();
    </script>
</body>
</html>
`;

const getSentimentForSymbol = (symbol: string) => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  const seed = Math.abs(hash + new Date().getDate());
  const buyPct = 15 + (seed % 71);
  return { buyPct, sellPct: 100 - buyPct };
};

const CHART_SOURCE = { html: CH_HTML };

export function ChartScreen() {
  const T = useTheme();
  const { t } = useTranslation();
  const token = useUserPreferences(s => s.accountDetails?.credentials?.accessToken);

  // Hydrate positions on page refresh
  const refreshPositions = usePositionsState((s) => s.refreshPositions);
  useEffect(() => {
    const login = resolveTradingLoginUtil();
    if (login) refreshPositions(String(login));
  }, [refreshPositions]);

  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    chartColors,
    chartColorScheme,
    chartDisplay,
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
  const { positions } = usePositionsState();
  const showOpenPositions = useUserPreferences((s) => s.showOpenPositions);
  const showTpSlStopLimit = useUserPreferences((s) => s.showTpSlStopLimit);
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const showTradeLevels = chartDisplay.showTradeLevels;

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const [showDrawingQuickActions, setShowDrawingQuickActions] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [overlayRevision, setOverlayRevision] = useState(0);

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

  const { candles } = useLiveCandles(chartSymbol, chartTimeframe);
  useEffect(() => {
    console.log('[CHART] candles length=', candles.length, 'symbol=', chartSymbol, 'tf=', chartTimeframe);
  }, [candles.length, chartSymbol, chartTimeframe]);
  const [forceHideLoading, setForceHideLoading] = useState(false);
  const [chartRetryRevision, setChartRetryRevision] = useState(0);
  const chartInitializedRef = useRef(false);
  const chartBootstrapRetryCountRef = useRef(0);

  useEffect(() => {
    setForceHideLoading(false);
    const tmr = setTimeout(() => setForceHideLoading(true), 2000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe]);

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
      mode: 0, // Normal
      vertLine: {
        color: resolvedChartColors.foreground,
        width: 1,
        labelBackgroundColor: resolvedChartColors.foreground,
      },
      horzLine: {
        color: resolvedChartColors.foreground,
        width: 1,
        labelBackgroundColor: resolvedChartColors.foreground,
      },
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
      scaleMargins: {
        top: 0.08,
        bottom: 0.25,
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
  }), [resolvedChartColors]);

  const [webViewReady, setWebViewReady] = useState(false);
  const [chartCanvasReady, setChartCanvasReady] = useState(false);
  // Loading overlay rules:
  //   • Stay visible while we have no candles (history hasn't arrived).
  //   • Hide once the WebView has confirmed CHART_READY (canvas mounted),
  //     so the user can see whatever the chart drew.
  const isLoading = (!chartCanvasReady || candles.length === 0) && !forceHideLoading;
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
  //   Fresh chart bridge
  //
  //   Single source of truth: `candles` from useLiveCandles (history
  //   seeded by REST + live ticks merged via candlesSocket).
  //
  //   Two effects:
  //     1. Whenever (symbol, timeframe, type) changes OR the merged
  //        candles array changes after webViewReady, we send a full
  //        initChart. The WebView's initChart tears down any prior
  //        chart and rebuilds. Cheap and predictable.
  //     2. Live WS stream events (append / replace_last) call
  //        updateTick directly so individual ticks animate without
  //        rebuilding the whole chart.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(candles);
  const sigRef = useRef('');
  const initSentForSigRef = useRef(false);

  const resetChartBridgeState = () => {
    chartInitializedRef.current = false;
    chartBootstrapRetryCountRef.current = 0;
    sigRef.current = '';
    initSentForSigRef.current = false;
  };

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const buildMappedData = useCallback((sourceCandles: typeof candles) => {
    const sanitized = sourceCandles.filter((c) => isStructurallyValidCandle(c));
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
    }));
  }, [chartType]);

  // Effect 1 — initial mount + full re-init on (symbol, tf, type) change.
  useEffect(() => {
    if (!webViewRef.current || !webViewReady) return;
    if (candles.length === 0) return;

    const sig = `${chartSymbol}-${normalizeTimeframe(chartTimeframe)}-${chartType}-${chartColorsSignature}`;
    // Only re-init when the signature actually changes. We do NOT also gate
    // on chartInitializedRef.current — that ref only flips when CHART_READY
    // round-trips back from the WebView, so checking it here would re-fire
    // initChart on every candle update during the bridge latency window
    // and thrash the chart.
    if (sig === sigRef.current && initSentForSigRef.current) {
      return; // already sent init for this signature
    }

    const mapped = buildMappedData(candles);
    if (mapped.length === 0) return;

    const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}); true;`;
    try {
      console.log('[CHART] sending initChart', chartSymbol, chartTimeframe, chartType, 'bars=', mapped.length);
      webViewRef.current.injectJavaScript(js);
      sigRef.current = sig;
      initSentForSigRef.current = true;
    } catch (e) {
      console.warn('[CHART] initChart inject failed', e);
    }
  }, [
    candles,
    chartType,
    webViewReady,
    chartSymbol,
    chartTimeframe,
    displayDecimals,
    chartColorsSignature,
    chartOptions,
    chartRetryRevision,
    buildMappedData,
  ]);

  // Effect 2 — live tick stream. Bypasses React state for low latency.
  useEffect(() => {
    if (!webViewReady) return;
    let rAF: number | null = null;
    const pending: CandleStreamEvent[] = [];

    const flush = () => {
      rAF = null;
      if (!webViewRef.current || pending.length === 0) return;
      // Hold ticks back until the WebView has confirmed initChart actually
      // built the series (CHART_READY round-trip). Sending updateTick
      // before that races the bridge and the WebView script throws
      // "series not initialized". Effect 1 will catch us up via the merged
      // candle array as soon as init completes, so dropping these is safe.
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
        if (!c || !isStructurallyValidCandle(c)) continue;
        const tick =
          chartType === 'line'
            ? { time: c.time, value: c.close }
            : { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
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

    let unsubscribed = false;
    let unsubscribeFn: (() => void) | null = null;
    import('../../api/ws/candlesSocket').then(({ candlesWsService }) => {
      if (unsubscribed) return;
      candlesWsService.addStreamListener(handleStreamEvent);
      unsubscribeFn = () => candlesWsService.removeStreamListener(handleStreamEvent);
    });

    return () => {
      unsubscribed = true;
      if (rAF !== null) cancelAnimationFrame(rAF);
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [chartSymbol, chartTimeframe, chartType, webViewReady, buildMappedData]);

  // Positions & Price Lines Bridge
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      let lines: any[] = [];
      const symbolPositions = positions.filter((p) => p.symbol === chartSymbol);

      if (showTradeLevels && symbolPositions.length > 0) {
        lines = lines.concat(symbolPositions.flatMap((pos) => {
          const payload = [];
          if (showOpenPositions) {
            payload.push({
              price: pos.openPrice,
              color: pos.side === 'buy' ? (resolvedChartColors.tradeOpen || '#2962FF') : '#EF5350',
              lineWidth: 1,
              lineStyle: 1, // Dashed
              axisLabelVisible: true,
              title: `${pos.side.toUpperCase()} ${pos.volume}`,
            });
          }
          if (showTpSlStopLimit) {
            if (pos.tp && pos.tp > 0) {
              payload.push({
                price: pos.tp,
                color: resolvedChartColors.tradeTpSl || '#089981',
                lineWidth: 1,
                lineStyle: 1,
                axisLabelVisible: true,
                title: 'TP',
              });
            }
            if (pos.sl && pos.sl > 0) {
              payload.push({
                price: pos.sl,
                color: resolvedChartColors.tradeTpSl || '#F23645',
                lineWidth: 1,
                lineStyle: 1,
                axisLabelVisible: true,
                title: 'SL',
              });
            }
          }
          return payload;
        }));
      }

      const js = `if (typeof setPriceLines === 'function') setPriceLines(${JSON.stringify(lines)}); true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [positions, chartSymbol, webViewReady, overlayRevision, showOpenPositions, showTpSlStopLimit, resolvedChartColors, showTradeLevels]);

  // Patterns / Markers Bridge
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      let markers: any[] = [];

      if (activeTool === 'patterns' && candles.length > 0) {
        const uniqueData = Array.from(new Map(candles.map(item => [item.time, item])).values());

        uniqueData.forEach((candle) => {
          const isGreen = candle.close > candle.open;
          const isRed = candle.open > candle.close;
          const body = Math.abs(candle.close - candle.open);
          const upperShadow = candle.high - Math.max(candle.open, candle.close);
          const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

          if (isGreen && lowerShadow > body * 1.5 && upperShadow < body * 0.5) {
            markers.push({ time: candle.time, position: 'belowBar', color: '#089981', shape: 'arrowUp', text: 'L.Lower', size: 1 });
          } else if (isRed && upperShadow > body * 1.5 && lowerShadow < body * 0.5) {
            markers.push({ time: candle.time, position: 'aboveBar', color: '#F23645', shape: 'arrowDown', text: 'L.Upper', size: 1 });
          }
        });
      }

      markers.sort((a, b) => {
        const tA = typeof a.time === 'number' ? a.time : 0;
        const tB = typeof b.time === 'number' ? b.time : 0;
        return tA - tB;
      });

      webViewRef.current.injectJavaScript(`
        if (typeof setChartMarkers === 'function') {
          setChartMarkers(${JSON.stringify(markers)});
        }
        true;
      `);
    }
  }, [activeTool, candles, webViewReady, overlayRevision]);



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
          <AppHeader title={t('Chart')} noBorder extraTopPad={4} />
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

      <View style={styles.card}>
        <View style={styles.chartContainer}>
          <View style={styles.chartTopToolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={[styles.inlineActionGroup, { flex: undefined, paddingRight: 16, gap: 8 }]}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setSymbolPickerOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#D1D4DC' : '#131722' }}>{displaySymbol}</Text>
                </Pressable>
                <Pressable style={{ paddingHorizontal: 4 }} onPress={() => setSymbolPickerOpen(true)}>
                  <Ionicons name="add-outline" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setTfOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>{chartTimeframe}</Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setShowChartTypeMenu(true)} hitSlop={8}>
                  <Ionicons name={chartType === 'candles' || chartType === 'hollow' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'} size={18} color={TEXT_MUTED} />
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name="analytics-outline" size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
            </ScrollView>

            {/* Right section fixed on screen */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {showTradingSignals && (
                <Pressable onPress={() => setShowSignalDetails(true)} hitSlop={8}>
                  <View style={styles.redBoxIcon}>
                    <Ionicons name="arrow-down" size={14} color="#FFF" />
                  </View>
                </Pressable>
              )}
              <Pressable onPress={() => router.push('/chart/objects')} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => router.push('/chart/settings')} hitSlop={8}>
                <Ionicons name="settings-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => setIsChartExpanded(!isChartExpanded)} hitSlop={8}>
                <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => setShowMoreMenu(true)} hitSlop={8}>
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
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                cacheEnabled={false}
                bounces={false}
                androidLayerType="hardware"
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
                      resetChartBridgeState();
                      setWebViewReady(true);
                      setChartCanvasReady(false);
                      console.log('[CHART] WebView READY');
                      // Force overlays to re-draw after chart is (re-)initialized
                      setOverlayRevision((prev) => prev + 1);
                    } else if (msg.type === 'CHART_READY') {
                      chartInitializedRef.current = true;
                      chartBootstrapRetryCountRef.current = 0;
                      setWebViewReady(true);
                      setChartCanvasReady(true);
                      console.log('[CHART] CHART_READY');
                      // Force overlays to re-draw after chart is (re-)initialized
                      setOverlayRevision((prev) => prev + 1);
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
                      console.log('[CHART WEBVIEW ERROR]', msg.message, msg.tick);
                      if (typeof msg.message === 'string' && msg.message.startsWith('updateChartAppearance failed:')) {
                        return;
                      }
                      if (!chartInitializedRef.current && chartBootstrapRetryCountRef.current < 2) {
                        chartBootstrapRetryCountRef.current += 1;
                        sigRef.current = '';
                        initSentForSigRef.current = false;
                        setChartRetryRevision((prev) => prev + 1);
                        return;
                      }
                      Alert.alert('Chart Error Pipeline', msg.message);
                    }
                  } catch (e) { }
                }}
              />



            </View>
          </View>
        </View>

        {!isChartExpanded && (
          <View style={styles.bottomArea}>
            <View style={styles.tvBottomToolbar}>
              <View style={styles.tvRangesLeft}>
                <Text style={styles.tvRangeText} numberOfLines={1} adjustsFontSizeToFit>Time Range</Text>
                <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginLeft: 4 }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.tvRangeText} numberOfLines={1} adjustsFontSizeToFit>Date Range</Text>
                <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginLeft: 4 }} />
              </View>
              <View style={styles.tvRangesRight}>
                <Text style={[styles.tvRangeAutoText, { transform: [{ translateX: -20 }] }]} numberOfLines={1} adjustsFontSizeToFit>
                  16:08:55 (UTC+5:30)
                </Text>
                <Text style={{ color: BLUE, fontSize: 11, fontWeight: '500' }}>auto</Text>
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
      </View>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={`${chartSymbol}: active chart`}
        actions={[
          { label: 'Indicators' },
          { label: 'Objects', onPress: () => router.push('/chart/objects') },
          { label: 'Settings' },
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
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = isDark ? '#0E1014' : T.bg;
  const CHART_CANVAS_BG = isDark ? '#000000' : '#FFFFFF';
  const BOTTOM_AREA_BG = isDark ? '#0A0C0F' : '#F8FAFC';
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const TEXT_MUTED = T.textMuted;

  return StyleSheet.create({
    screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },
    headerWrapper: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
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
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
    },
    symbolSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minHeight: 36,
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
      backgroundColor: isDark ? '#000000' : '#F8FAFC',
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
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 16,
      backgroundColor: isDark ? '#000000' : '#F8FAFC',
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
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 0,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
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

