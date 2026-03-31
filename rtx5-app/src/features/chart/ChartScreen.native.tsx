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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, Image, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import {
  TvCrosshair, TvTrendLine, TvFib, TvBrush, TvText, TvMeasure, TvZoom, TvMagnet, TvPencil, TvLock, TvHide, TvTrash, TvLayers,
  TvPatterns, TvPrediction, TvPitchfork, TvSmiley, TvStayInDrawingMode
} from './components/ChartToolbarIcons';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
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
import { useMarketSymbols } from '../../query/market';
import { WebView } from 'react-native-webview';
import { useMarketData } from '../../query/websocket';
import { DRAWING_TOOLS_JS } from './plugins/drawingToolsBundleString';

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
      <Text style={styles.livePriceText}>{(currentPrice || 0).toFixed(displayDecimals)}</Text>
      <Text style={[styles.priceChangeText, { color: isUp ? '#089981' : '#F23645' }]}>
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
        <Text style={styles.actionBtnPriceText}>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
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
        <Text style={styles.actionBtnPriceText}>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
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
    <script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>\${DRAWING_TOOLS_JS}</script>
    <script>
      var chart = null;
      var series = null;
      var volumeSeries = null;
      var signalLines = [];
      var drawingTools = null;
      var UP_COLOR = '#26A69A';
      var DOWN_COLOR = '#EF5350';



      function setChartMarkers(markers) {
        try {
          if (series) {
            series.setMarkers(markers || []);
          }
        } catch(e) {}
      }

      function setPriceLines(lines) {
        try {
          if (!series) return;
          if (window._priceLines) {
             window._priceLines.forEach(function(l) { try{series.removePriceLine(l);}catch(ex){} });
          }
          window._priceLines = [];
          (lines || []).forEach(function(opt) {
             try {
               var pl = series.createPriceLine(opt);
               window._priceLines.push(pl);
             } catch(ex){}
          });
        } catch(e) {}
      }

      function initChart(opts, chartType, data, displayDecimals, isExpanded) {
        try {
          if (chart) { chart.remove(); chart = null; series = null; volumeSeries = null; }

          opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          opts.grid.vertLines.style = LightweightCharts.LineStyle.Solid;
          opts.grid.horzLines.style = LightweightCharts.LineStyle.Solid;
          opts.crosshair.vertLine.style = LightweightCharts.LineStyle.Dashed;
          opts.crosshair.horzLine.style = LightweightCharts.LineStyle.Dashed;

          var priceFormatInfo = {
             type: 'price',
             precision: displayDecimals,
             minMove: 1 / Math.pow(10, displayDecimals)
          };

          chart = LightweightCharts.createChart(document.getElementById('chart'), opts);

          if (chartType === 'candles' || chartType === 'hollow') {
            series = chart.addSeries(LightweightCharts.CandlestickSeries, {
              upColor: chartType === 'hollow' ? 'transparent' : UP_COLOR,
              downColor: DOWN_COLOR,
              borderVisible: true,
              wickUpColor: UP_COLOR,
              wickDownColor: DOWN_COLOR,
              borderUpColor: UP_COLOR,
              borderDownColor: DOWN_COLOR,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: UP_COLOR,
              downColor: DOWN_COLOR,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          } else {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: UP_COLOR,
              lineWidth: 2,
              crosshairMarkerVisible: true,
              lastValueVisible: true,
              priceLineVisible: true,
              priceFormat: priceFormatInfo,
            });
          }

          volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            priceLineVisible: false,
            lastValueVisible: false,
          });
          chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.9, bottom: 0 },
            visible: false,
          });

          if (data && data.length > 0) {
            series.setData(data);
            if (volumeSeries) {
              var volData = data.map(function(d) {
                var isGreen = d.close >= d.open;
                return {
                  time: d.time,
                  value: d.volume || 0,
                  color: isGreen ? 'rgba(8, 153, 129, 0.12)' : 'rgba(242, 54, 69, 0.12)'
                };
              });
              volumeSeries.setData(volData);
            }
          }

          if (window.DrawingToolsManager) {
            drawingTools = new window.DrawingToolsManager(chart, series);
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({type:'CHART_READY'}));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message:e.message}));
        }
      }

      function updateChartData(data) {
        try {
          if (!series) return;
          series.setData(data);
          if (volumeSeries) {
            var volData = data.map(function(d) {
              var isGreen = d.close >= d.open;
              return { time: d.time, value: d.volume || 0, color: isGreen ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)' };
            });
            volumeSeries.setData(volData);
          }
          // chart.timeScale().fitContent(); // Removed to prevent few candles from stretching to massive widths
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message:'updateChartData: '+e.message}));
        }
      }

      function updateTick(tick) {
        try {
          if (series) {
            series.update(tick);
          }
          if (volumeSeries && tick) {
            var isGreen = tick.close >= tick.open;
            volumeSeries.update({
               time: tick.time,
               value: tick.volume || 0,
               color: isGreen ? 'rgba(8, 153, 129, 0.12)' : 'rgba(242, 54, 69, 0.12)'
            });
          }
        } catch(e) {
           window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message: 'updateTick: ' + e.message, tick: tick}));
        }
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({type:'READY'}));
      function setDrawingTool(toolName) {
        if (drawingTools) { drawingTools.setActiveTool(toolName); }
      }
      function clearDrawings() {
        if (drawingTools) { drawingTools.removeAllDrawings(); }
      }
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
  const token = useUserPreferences(s => s.accountDetails?.credentials?.accessToken);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const APP_BG = isDark ? T.bg : '#FFFFFF';
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;

  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, accountDetails, showTradingSignals } = useUserPreferences();
  const { positions } = usePositionsState();
  const showOpenPositions = useUserPreferences((s) => s.showOpenPositions);
  const showTpSlStopLimit = useUserPreferences((s) => s.showTpSlStopLimit);

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

  const webViewRef = useRef<WebView>(null);

  const handleSetTool = (tool: string) => {
    setActiveTool(tool);
    if (tool === 'trash') {
       webViewRef.current?.injectJavaScript("clearDrawings(); true;");
    } else {
       webViewRef.current?.injectJavaScript(`setDrawingTool('${tool}'); true;`);
    }
    setShowDrawingToolbar(false);
  };

  const [chartType, setChartType] = useState<'candles' | 'bars' | 'line' | 'hollow'>('candles');
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { candles } = useLiveCandles(chartSymbol, chartTimeframe);
  const [forceHideLoading, setForceHideLoading] = useState(false);

  useEffect(() => {
    setForceHideLoading(false);
    const tmr = setTimeout(() => setForceHideLoading(true), 2000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe]);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: isDark ? '#000000' : '#FFFFFF' },
      textColor: isDark ? '#94A3B8' : '#64748B',
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' },
      horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' },
    },
    crosshair: {
      mode: 0, // Normal
      vertLine: {
        color: isDark ? '#475569' : '#94A3B8',
        width: 1,
        labelBackgroundColor: isDark ? '#1E293B' : '#334155',
      },
      horzLine: {
        color: isDark ? '#475569' : '#94A3B8',
        width: 1,
        labelBackgroundColor: isDark ? '#1E293B' : '#334155',
      },
    },
    timeScale: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
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
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      autoScale: true,
      scaleMargins: {
        bottom: 0.25,
      },
    },
  }), [isDark, TEXT_MUTED]);

  const [webViewReady, setWebViewReady] = useState(false);
  const isLoading = candles.length === 0 && !forceHideLoading && !webViewReady;
  const isError = false;

  const dataSignatureRef = useRef('');
  const lastCandleLengthRef = useRef(0);

  // Sync Data â€” uses injectJavaScript instead of postMessage
  useEffect(() => {
    if (webViewRef.current && webViewReady && candles.length > 0) {
      const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;
      // Sanitization + Deduplication to prevent LightweightCharts fatal crash
      const sanitized = candles.filter(c => c && typeof c.time === 'number' && !isNaN(c.time) && !isNaN(c.close));
      const uniqueData = Array.from(new Map(sanitized.map(item => [item.time, item])).values());
      uniqueData.sort((a, b) => a.time - b.time);

      let mappedData: any = uniqueData;
      if (chartType === 'line') {
        mappedData = uniqueData.map(item => ({ time: item.time, value: item.close }));
      }
      const chunkJumped = Math.abs(candles.length - lastCandleLengthRef.current) > 10;

      if (dataSignatureRef.current !== sig) {
        // Full mount / init
        const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}, true); true;`;
        webViewRef.current.injectJavaScript(js);
        dataSignatureRef.current = sig;
        lastCandleLengthRef.current = candles.length;
      } else if (chunkJumped) {
        // Delayed REST history arrived post-tick, update without destroying UI!
        const js = `updateChartData(${JSON.stringify(mappedData)}); true;`;
        webViewRef.current.injectJavaScript(js);
        lastCandleLengthRef.current = candles.length;
      }
    }
  }, [candles, isDark, chartType, webViewReady, chartSymbol, chartTimeframe, chartOptions, displayDecimals]);

  // Live Tick Sync (Zero Latency Direct WebSocket Injection & rAF 60Hz Throttle)
  useEffect(() => {
    let rAF: number | null = null;
    let throttleTimer: NodeJS.Timeout | null = null;
    const pendingTicks: any[] = [];
    let lastInjectedTickTime = 0;

    const handleRawTick = (sym: string, tf: string, incomingCandles: any[]) => {
      if (sym.toUpperCase() !== chartSymbol.toUpperCase()) return;
      if (!incomingCandles || incomingCandles.length === 0 || !webViewReady) return;

      incomingCandles.forEach(incomingTick => {
        const existingIdx = pendingTicks.findIndex(t => t.time === incomingTick.time);
        if (existingIdx !== -1) {
          pendingTicks[existingIdx] = incomingTick;
        } else {
          pendingTicks.push(incomingTick);
        }
      });

      const now = Date.now();
      if (rAF !== null && now - lastInjectedTickTime > 1000) {
        console.warn('[ChartScreen] rAF locked for >1s. Force clearing buffer lock.');
        cancelAnimationFrame(rAF);
        rAF = null;
      }

      if (rAF === null) {
        // Pure native 60fps UI injection, completely unthrottled
        rAF = requestAnimationFrame(() => {
          rAF = null;
          if (!webViewRef.current || !webViewReady || pendingTicks.length === 0) return;

          const ticks = [...pendingTicks];
          pendingTicks.length = 0;

          let js = '';
          for (const tick of ticks) {
            if (!tick.time) continue;
            if (lastInjectedTickTime && tick.time < lastInjectedTickTime) continue;

            let tickToInject: any = tick;
            if (chartType === 'line') {
              tickToInject = { time: tick.time, value: tick.close };
            }
            js += `updateTick(${JSON.stringify(tickToInject)});`;
            lastInjectedTickTime = tick.time;
          }

          if (js.length > 0) {
            try {
              webViewRef.current.injectJavaScript(js + ' true;');
            } catch (e) { }
          }
        });
      }
    };

    import('../../api/ws/candlesSocket').then(({ candlesWsService }) => {
      candlesWsService.addTickListener(handleRawTick);
    });

    return () => {
      if (rAF !== null) cancelAnimationFrame(rAF);
      import('../../api/ws/candlesSocket').then(({ candlesWsService }) => {
        candlesWsService.removeTickListener(handleRawTick);
      });
    };
  }, [chartSymbol, chartType, webViewReady]);

  // Positions Bridge (Draws Open Trades)
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      if (!showOpenPositions) {
        webViewRef.current.injectJavaScript(`if (typeof setPriceLines === 'function') setPriceLines([]); true;`);
        return;
      }

      const symbolPositions = positions.filter((p) => p.symbol === chartSymbol);
      const filteredPositions = symbolPositions.length > 0 ? [symbolPositions[0]] : [];

      const lines = filteredPositions.flatMap((pos) => {
        const payload = [{
          price: pos.openPrice,
          color: pos.side === 'buy' ? BLUE : '#EF5350',
          lineWidth: 1,
          lineStyle: 1, // Dashed
          axisLabelVisible: true,
          title: `${pos.side.toUpperCase()} ${pos.volume}`,
        }];
        if (showTpSlStopLimit) {
          if (pos.tp && pos.tp > 0) {
             payload.push({
               price: pos.tp,
               color: '#089981',
               lineWidth: 1,
               lineStyle: 1,
               axisLabelVisible: true,
               title: 'TP'
             });
          }
          if (pos.sl && pos.sl > 0) {
             payload.push({
               price: pos.sl,
               color: '#F23645',
               lineWidth: 1,
               lineStyle: 1,
               axisLabelVisible: true,
               title: 'SL'
             });
          }
        }
        return payload;
      });

      const js = `if (typeof setPriceLines === 'function') setPriceLines(${JSON.stringify(lines)}); true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [positions, chartSymbol, webViewReady, BLUE, showOpenPositions, showTpSlStopLimit]);

  // Patterns / Markers Bridge
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      let markers: any[] = [];

      if (activeTool === 'patterns' && candles.length > 0) {
        // Deduplicate
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

      if (showTradingSignals && candles.length > 0 && activeTool !== 'patterns') {
        const lastTime = candles[candles.length - 1].time;
        if (lastTime) {
          markers.push({ time: lastTime, position: 'aboveBar', color: '#EF4444', shape: 'arrowDown', text: 'Signal', size: 2 });
        }
      }

      webViewRef.current.injectJavaScript(`
        if (typeof setChartMarkers === 'function') {
          setChartMarkers(${JSON.stringify(markers)});
        }
        true;
      `);
    }
  }, [activeTool, showTradingSignals, candles, webViewReady]);



  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;

  const sentiment = useMemo(() => getSentimentForSymbol(chartSymbol), [chartSymbol]);

  return (
    <Screen style={styles.screen}>
      {!isChartExpanded && (
        <View style={styles.compactHeader}>
          {/* Left: Symbol Info */}
          <Pressable style={styles.symbolSection} onPress={() => setSymbolPickerOpen(true)}>
            <View>
              <View style={styles.symbolNameRow}>
                <Text style={[styles.symbolText, { opacity: 0.9 }]}>{displaySymbol}</Text>
                <View style={styles.fxBadge}>
                  <Text style={styles.fxBadgeText}>{symbolCategory}</Text>
                </View>
                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
              </View>
              <Text style={styles.symbolSubText}>{symbolName}</Text>
            </View>
          </Pressable>

          {/* Center: Live Price */}
          <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} candles={candles} />

          {/* Right: Balance + Account */}
          <View style={styles.rightSection}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText}>Chart</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.chartContainer}>
          <View style={styles.chartTopToolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={[styles.inlineActionGroup, { flex: undefined, paddingRight: 16, gap: 4 }]}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                <Pressable style={[styles.toolIcon, activeTool === 'zoom' && styles.toolIconActive]} onPress={() => handleSetTool('zoom')}><TvZoom color={activeTool === 'zoom' ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, activeTool === 'magnet' && styles.toolIconActive]} onPress={() => handleSetTool('magnet')}><TvMagnet color={activeTool === 'magnet' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'stay_in_drawing_mode' && styles.toolIconActive]} onPress={() => handleSetTool('stay_in_drawing_mode')}><TvStayInDrawingMode color={activeTool === 'stay_in_drawing_mode' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'lock' && styles.toolIconActive]} onPress={() => handleSetTool('lock')}><TvLock color={activeTool === 'lock' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'hide' && styles.toolIconActive]} onPress={() => handleSetTool('hide')}><TvHide color={activeTool === 'hide' ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, activeTool === 'trash' && styles.toolIconActive]} onPress={() => handleSetTool('trash')}><TvTrash color={activeTool === 'trash' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'layers' && styles.toolIconActive]} onPress={() => handleSetTool('layers')}><TvLayers color={activeTool === 'layers' ? BLUE : TEXT_MUTED} /></Pressable>
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

              declare const CHART_SOURCE: any; // defined below

              <WebView
                ref={webViewRef}
                source={CHART_SOURCE}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                onContentProcessDidTerminate={() => {
                  console.warn('[CHART WEBVIEW] iOS background process terminated. Reloading chart strictly.');
                  setWebViewReady(false);
                  webViewRef.current?.reload();
                }}
                onRenderProcessGone={() => {
                  console.warn('[CHART WEBVIEW] Android render process gone. Reloading chart strictly.');
                  setWebViewReady(false);
                  webViewRef.current?.reload();
                }}
                onMessage={(event) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg.type === 'READY' || msg.type === 'CHART_READY') {
                      setWebViewReady(true);
                    } else if (msg.type === 'ERROR') {
                      console.log('[CHART WEBVIEW ERROR]', msg.message, msg.tick);
                    }
                  } catch (e) { }
                }}
              />
              <Pressable
                style={styles.floatingAutoBtn}
                onPress={() => {
                  webViewRef.current?.injectJavaScript("try { if(chart && typeof chart.priceScale === 'function') chart.priceScale('right').applyOptions({ autoScale: true }); if (chart && typeof chart.timeScale === 'function') chart.timeScale().scrollToRealTime(); } catch(e){} true;");
                }}
              >
                <Text style={[styles.floatingAutoText, { color: BLUE }]}>A</Text>
              </Pressable>


            </View>
          </View>
        </View>

        {!isChartExpanded && (
          <View style={styles.bottomArea}>
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
                  <Text style={[styles.segmentText, tab === 'POSITIONS' && styles.segmentTextActive]}>{tab}</Text>
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
          { label: 'Candlestick', onPress: () => setChartType('candles') },
          { label: 'Hollow Candles', onPress: () => setChartType('hollow') },
          { label: 'OHLC Bars', onPress: () => setChartType('bars') },
          { label: 'Line', onPress: () => setChartType('line') },
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
  const APP_BG = isDark ? '#090E17' : T.bg;
  const CHART_CANVAS_BG = isDark ? '#090E17' : T.bgSecondary;
  const BOTTOM_AREA_BG = isDark ? '#060A14' : '#F8FAFC';
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const TEXT_MUTED = T.textMuted;

  return StyleSheet.create({
    screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },

    /* â”€â”€ Compact Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 2,
      paddingBottom: 6,
      marginTop: -4,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
    },
    symbolSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginTop: -8,
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
      flex: 1,
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
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
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
      backgroundColor: isDark ? '#000000' : '#F8FAFC',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
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
      marginHorizontal: 10,
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
      paddingHorizontal: 14,
      paddingTop: 4,
      paddingBottom: 0,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    },
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
      shadowOpacity: isDark ? 0.3 : 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    actionBtnBuy: {
      backgroundColor: BLUE,
      borderWidth: 0,
      shadowColor: BLUE,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.2,
      shadowRadius: 8,
      elevation: 4,
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


