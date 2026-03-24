import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import {
  TvCrosshair, TvTrendLine, TvFib, TvBrush, TvText, TvMeasure, TvZoom, TvMagnet, TvPencil, TvLock, TvHide, TvTrash, TvLayers,
  TvCandles, TvFx, TvGrid4, TvUndo, TvRedo, TvSaveSquare, TvPatterns, TvPrediction, TvPitchfork, TvSmiley, TvStayInDrawingMode
} from './components/ChartToolbarIcons';
import { DrawingToolsManager } from './plugins/drawing-tools-manager';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles, useLiveTick } from '../../hooks/useLiveCandles';
import { useLiveAccountState } from '../../state/liveAccountState';
import { createChart, IChartApi, ISeriesApi, CandlestickData, ColorType, CrosshairMode, CandlestickSeries, BarSeries, LineSeries, LineStyle, HistogramSeries } from 'lightweight-charts';
import { TradingSignalDetailsModal } from './TradingSignalDetailsModal';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals, candles }: any) => {
  const latestTick = useLiveTick(symbol);
  if (!latestTick) return <View style={styles.priceSection}><Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text></View>;
  return (
    <View style={styles.priceSection}>
      <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>PRICE</Text>
      <Text style={styles.livePriceText}>{latestTick.close.toFixed(displayDecimals)}</Text>
      {candles.length >= 2 && (() => {
        const prevClose = candles[candles.length - 2]?.close ?? latestTick.close;
        const change = latestTick.close - prevClose;
        const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;
        const isUp = change >= 0;
        return (
          <Text style={[styles.priceChangePct, { color: isUp ? '#089981' : '#F23645' }]}>
            {isUp ? '+' : ''}{change.toFixed(displayDecimals)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)
          </Text>
        );
      })()}
    </View>
  );
});



// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LiveTradeButtons = React.memo(({ symbol, styles, displayDecimals, seriesRef }: any) => {
  const latestTick = useLiveTick(symbol);
  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (symbol.includes('XAU') ? 0.30 : symbol.includes('BTC') ? 25 : 0.00015);

  return (
    <View style={styles.tradeControlsRow}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnSell]}
        onPress={() => {
          try {
            if (seriesRef?.current && latestAsk) {
              seriesRef.current.createPriceLine({
                price: latestAsk, color: '#F23645', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'SELL'
              });
            }
          } catch(e) {}
          router.push({ pathname: '/trade/order-ticket', params: { symbol, side: 'sell' } });
        }}
      >
        <View style={styles.actionBtnHeader}>
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelSell]}>SELL</Text>
          <Ionicons name="chevron-down" size={16} color="#FFF" />
        </View>
        <Text style={styles.actionBtnPriceText}>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
      </Pressable>

      <View style={styles.actionSpacer} />

      <Pressable
        style={[styles.actionBtn, styles.actionBtnBuy]}
        onPress={() => {
          try {
            if (seriesRef?.current && latestBid) {
              seriesRef.current.createPriceLine({
                price: latestBid, color: '#089981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'BUY'
              });
            }
          } catch(e) {}
          router.push({ pathname: '/trade/order-ticket', params: { symbol, side: 'buy' } });
        }}
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

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LiveTvLegend = React.memo(({ symbol, styles, displayDecimals, candles }: any) => {
  const latestTick = useLiveTick(symbol);
  if (!latestTick || candles.length < 2) return null;
  
  const latestBid = latestTick.close;
  const isUp = latestBid >= candles[candles.length - 2]?.close;

  return (
    <View style={styles.tvLegendContainer} pointerEvents="box-none">
      <View>
        <View style={styles.tvLegendRow}>
          <Text style={[styles.tvLegendPriceChange, { fontWeight: '500', color: isUp ? '#089981' : '#F23645' }]}>
            {latestBid.toFixed(displayDecimals)} {isUp ? '+' : '-'}192.90 (-0.98%)
          </Text>
        </View>
      </View>
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

const mapTf = (tf: string) => {
  if (tf.startsWith('M') && tf !== 'MN') return tf.replace('M', '') + ' m';
  if (tf.startsWith('H')) return tf.replace('H', '') + ' h';
  if (tf === 'D1') return '1 d';
  if (tf === 'W1') return '1 w';
  if (tf === 'MN') return '1 M';
  return tf;
};

/** Format a Unix timestamp into a short time label for the x-axis */
const formatXLabel = (time: number, tf: string): string => {
  const d = new Date(time * 1000);
  if (['D1', 'W1', 'MN'].includes(tf)) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};



export function ChartScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const APP_BG = isDark ? T.bg : '#FFFFFF';
  const CARD_BG = isDark ? '#0B0F19' : T.glass2;
  const CHART_HEADER_BG = isDark ? '#0B101E' : '#FFFFFF';
  const CHART_HEADER_BORDER = isDark ? '#1E293B' : '#E2E8F0';
  const CHART_CANVAS_BG = isDark ? '#0B101E' : '#FFFFFF';
  const BOTTOM_AREA_BG = isDark ? '#0B0F19' : '#FFFFFF';
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const GRID = T.borderSubtle;
  const TEXT = T.text;
  const TEXT_MUTED = T.textMuted;
  const BTN_BG = T.glass2;
  const PILL_BG = T.glass1;
  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, accountDetails, showTradingSignals } = useUserPreferences();


  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);
  const displayDecimals = baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;

  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const chartContainerRef = useRef<any>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [chartType, setChartType] = useState<'candles' | 'bars' | 'line' | 'hollow'>('candles');
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const drawingToolsRef = useRef<DrawingToolsManager | null>(null);


  const { candles } = useLiveCandles(chartSymbol, chartTimeframe);
  const [forceHideLoading, setForceHideLoading] = useState(false);

  useEffect(() => {
    setForceHideLoading(false);
    const tmr = setTimeout(() => setForceHideLoading(true), 2000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe]);

  const isLoading = candles.length === 0 && !forceHideLoading;
  const isError = false;

  // Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const CH_BG = isDark ? '#0B0E14' : '#FFFFFF';
    const TEXT_MUTED = T.textMuted;
    const GRID = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#131722' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#64748B',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)', style: LineStyle.Solid },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#475569' : '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#334155',
        },
        horzLine: {
          color: isDark ? '#475569' : '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#334155',
        },
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const d = new Date(timestamp * 1000);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
      },
      timeScale: {
        borderColor: isDark ? '#2A2E39' : '#E0E3EB',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
        rightOffset: 5,
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        borderColor: isDark ? '#2A2E39' : '#E0E3EB',
        autoScale: true,
        scaleMargins: {
          bottom: 0.25,
        },
      },
    });

    // Instead of initializing series here, we decouple it
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { drawingToolsRef.current?.remove(); } catch (e) { }
      drawingToolsRef.current = null;
      if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current); } catch (e) { }
        seriesRef.current = null;
      }
      try { chart.remove(); } catch (e) { }
      chartRef.current = null;
    };
  }, [isDark, T.bgSecondary, T.textMuted, T.borderSubtle, BLUE, RED, displayDecimals]);

  // Series Initialization & Swap
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const UP_COLOR = '#089981';
    const DOWN_COLOR = '#F23645';

    const priceFormatInfo = {
      type: 'price' as const,
      precision: displayDecimals,
      minMove: 1 / Math.pow(10, displayDecimals),
    };

    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch (e) { }
      seriesRef.current = null;
    }
    
    if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch (e) { }
      volumeSeriesRef.current = null;
    }

    let series: ISeriesApi<any>;

    if (chartType === 'candles' || chartType === 'hollow') {
      series = chart.addSeries(CandlestickSeries, {
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
      series = chart.addSeries(BarSeries, {
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        lastValueVisible: true,
        priceLineVisible: true,
        priceFormat: priceFormatInfo,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: BLUE,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: true,
        priceFormat: priceFormatInfo,
      });
    }

    seriesRef.current = series;

    try { drawingToolsRef.current?.remove(); } catch (e) { }
    try {
      drawingToolsRef.current = new DrawingToolsManager(chart, series as any);
    } catch (e) { }

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (legendRef.current) {
        legendRef.current.innerHTML = '';
      }
    });

    // Force data sync to reload
    dataSignatureRef.current = '';

  }, [chartType, isDark, BLUE, RED, displayDecimals]);

  const dataSignatureRef = useRef('');

  // Sync Data
  useEffect(() => {
    if (seriesRef.current && candles.length > 0) {
      const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;
      if (dataSignatureRef.current !== sig) {
        try {
          // Deduplicate by time strictly for lightweight-charts
          const uniqueData = Array.from(new Map(candles.map(item => [item.time, item])).values());
          // Sort strictly by timestamp
          uniqueData.sort((a, b) => a.time - b.time);

          let mappedData;
          if (chartType === 'line') {
            mappedData = uniqueData.map(item => ({ time: item.time, value: item.close }));
          } else {
            mappedData = uniqueData;
          }

          seriesRef.current.setData(mappedData as any);
          
          if (volumeSeriesRef.current) {
            const volData = uniqueData.map(item => ({
              time: item.time,
              value: item.volume || 0,
              color: item.close >= item.open ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)'
            }));
            volumeSeriesRef.current.setData(volData as any);
          }

          dataSignatureRef.current = sig;
        } catch (e) {
          // Chart might be disposed
        }
      }
    }
  }, [candles, isDark, chartSymbol, chartTimeframe, chartType]);



  // Patterns / Markers Local
  useEffect(() => {
    if (!seriesRef.current) return;
    try {
      // @ts-ignore: bypass type checker for v4 legacy method
      if (typeof seriesRef.current.setMarkers !== 'function') return;

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

      if (showTradingSignals && candles.length > 0 && activeTool !== 'patterns') {
        const lastTime = candles[candles.length - 1].time;
        if (lastTime) {
          markers.push({ time: lastTime, position: 'aboveBar', color: '#EF4444', shape: 'arrowDown', text: 'Signal', size: 2 });
        }
      }

      // @ts-ignore
      seriesRef.current.setMarkers(markers);
    } catch (e) {}
  }, [activeTool, showTradingSignals, candles]);

  // Live Tick Sync (Zero Latency Direct WebSocket Injection & rAF 60Hz Throttle)
  useEffect(() => {
    let rAF: number | null = null;
    let pendingTick: any = null;
    let lastInjectedTickTime = 0;

    const doInject = () => {
      rAF = null;
      if (!pendingTick || !seriesRef.current) return;
      const tick = pendingTick;
      pendingTick = null; // Clear queue for next frame

      if (!tick.time) return;
      if (lastInjectedTickTime && tick.time < lastInjectedTickTime) return; // Drop historically delayed out-of-sequence network packets
      
      let tickToInject: any = tick;
      if (chartType === 'line') {
        tickToInject = { time: tick.time, value: tick.close };
      }

      try {
        seriesRef.current.update(tickToInject);
        lastInjectedTickTime = tick.time;
        
        if (volumeSeriesRef.current && tick) {
          const isGreen = tick.close >= tick.open;
          volumeSeriesRef.current.update({
            time: tick.time,
            value: tick.volume || 0,
            color: isGreen ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)'
          });
        }
      } catch (e) {
        // Safely swallow series mismatch exceptions
      }
    };

    const handleRawTick = (sym: string, tf: string, incomingCandles: any[]) => {
      if (sym.toUpperCase() !== chartSymbol.toUpperCase()) return;
      const tick = incomingCandles[incomingCandles.length - 1];
      if (!tick) return;

      pendingTick = tick;
      if (rAF === null) {
         // Harware-layer 60 FPS alignment preventing JS stringify macro-task queue overloads
         rAF = requestAnimationFrame(doInject);
      }
    };

    import('../../api/ws/candlesSocket').then(({ candlesWsService }) => {
      candlesWsService.addListener(handleRawTick);
    });

    return () => {
      if (rAF !== null) cancelAnimationFrame(rAF);
      import('../../api/ws/candlesSocket').then(({ candlesWsService }) => {
        candlesWsService.removeListener(handleRawTick);
      });
    };
  }, [chartSymbol, chartType]);

  const CHART_HEIGHT = chartLayout.height;

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      });
    }
  };



  const displaySymbol = baseSymbol.length >= 6 ? `${baseSymbol.slice(0, 3)}/${baseSymbol.slice(3, 6)}` : chartSymbol;
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;

  // Dynamic X-axis labels from actual candle timestamps
  const xAxisLabels = useMemo(() => {
    if (candles.length === 0) return [];
    const labelCount = 3;
    const labels: { text: string; position: `${number}%` }[] = [];
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((candles.length / (labelCount + 1)) * (i + 1));
      const candle = candles[Math.min(idx, candles.length - 1)];
      if (candle && candle.time) {
        labels.push({
          text: formatXLabel(candle.time, chartTimeframe),
          position: `${Math.round(((idx + 0.5) / candles.length) * 100)}%`,
        });
      }
    }
    return labels;
  }, [candles, chartTimeframe]);

  return (
    <Screen style={styles.screen}>
      {!isChartExpanded && (
        <View style={styles.headerWrapper}>
          {/* Row 1: Account Badge (hamburger is global from _layout.tsx) */}
          <View style={styles.topBar}>
            <View style={{ width: 40 }} />
            <View style={{ flex: 1 }} />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText}>Chart</Text>
            </View>
            <View style={{ flex: 1 }} />
          </View>

          {/* Row 2: Symbol | Price | Balance */}
          <View style={styles.compactHeader}>
            {/* Left: Symbol Info */}
            <Pressable style={styles.symbolSection} onPress={() => setSymbolPickerOpen(true)}>
              <View>
                <View style={styles.symbolNameRow}>
                  <Text style={[styles.symbolText, { fontWeight: '700', opacity: 0.9 }]}>{displaySymbol}</Text>
                  <View style={styles.fxBadge}>
                    <Text style={styles.fxBadgeText}>{symbolCategory}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText}>{symbolName}</Text>
              </View>
            </Pressable>

            {/* Right: Balance + Price + P/L */}
            <View style={styles.rightSection}>
              <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} candles={candles} />
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>

        <View style={styles.chartContainer}>
          {/* Top Integrated Toolbar (TradingView Exact Style) */}
          <View style={styles.chartTopToolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={[styles.inlineActionGroup, { flex: undefined, paddingRight: 16 }]}>
                <Pressable style={{ paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center' }} onPress={() => setSymbolPickerOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#D1D4DC' : '#131722' }}>{displaySymbol}</Text>
                </Pressable>
                <Pressable style={{ paddingHorizontal: 4 }} onPress={() => setSymbolPickerOpen(true)}>
                  <Ionicons name="add-outline" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ paddingHorizontal: 4 }} onPress={() => setTfOpen(true)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#D1D4DC' : '#131722' }}>{chartTimeframe.toUpperCase()}</Text>
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ paddingHorizontal: 4 }} onPress={() => setShowChartTypeMenu(true)}>
                  <TvCandles color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ paddingHorizontal: 4 }} onPress={() => setMenuOpen(true)}>
                  <TvFx color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <Pressable style={{ paddingHorizontal: 4 }}>
                  <TvGrid4 color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />
                <Pressable style={{ paddingHorizontal: 4 }}>
                  <TvUndo color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <Pressable style={{ paddingHorizontal: 4 }}>
                  <TvRedo color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.toolbarSeparator} />
              <Pressable onPress={() => router.push('/chart/settings')} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Ionicons name="settings-outline" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
              </Pressable>
              <Pressable onPress={() => setIsChartExpanded(!isChartExpanded)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={isDark ? '#D1D4DC' : '#131722'} />
              </Pressable>
              <Pressable onPress={() => setShowMoreMenu(true)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Ionicons name="ellipsis-vertical" size={18} color={isDark ? '#D1D4DC' : '#131722'} />
              </Pressable>
            </View>
          </View>

          <View style={{ flex: 1, flexDirection: 'row' }}>
            {isChartExpanded && (
              <ScrollView
                style={styles.leftToolbar}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.leftToolbarContent}
              >
                <div title="Crosshair" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'crosshair' && styles.toolIconActive]} onPress={() => { setActiveTool('crosshair'); drawingToolsRef.current?.setActiveTool('crosshair'); }}><TvCrosshair color={activeTool === 'crosshair' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Trend Line" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'trendline' && styles.toolIconActive]} onPress={() => { setActiveTool('trendline'); drawingToolsRef.current?.setActiveTool('trendline'); }}><TvTrendLine color={activeTool === 'trendline' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Fib Retracement" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'fib' && styles.toolIconActive]} onPress={() => { setActiveTool('fib'); drawingToolsRef.current?.setActiveTool('fib'); }}><TvFib color={activeTool === 'fib' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Brush" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'brush' && styles.toolIconActive]} onPress={() => { setActiveTool('brush'); drawingToolsRef.current?.setActiveTool('brush'); }}><TvBrush color={activeTool === 'brush' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Text" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'text' && styles.toolIconActive]} onPress={() => { setActiveTool('text'); drawingToolsRef.current?.setActiveTool('text'); }}><TvText color={activeTool === 'text' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Patterns" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'patterns' && styles.toolIconActive]} onPress={() => { setActiveTool('patterns'); drawingToolsRef.current?.setActiveTool('patterns'); }}><TvPatterns color={activeTool === 'patterns' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Long Position" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'prediction' && styles.toolIconActive]} onPress={() => { setActiveTool('prediction'); drawingToolsRef.current?.setActiveTool('prediction'); }}><TvPrediction color={activeTool === 'prediction' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Pitchfork" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'pitchfork' && styles.toolIconActive]} onPress={() => { setActiveTool('pitchfork'); drawingToolsRef.current?.setActiveTool('pitchfork'); }}><TvPitchfork color={activeTool === 'pitchfork' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Stickers" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'smiley' && styles.toolIconActive]} onPress={() => { setActiveTool('smiley'); drawingToolsRef.current?.setActiveTool('smiley'); }}><TvSmiley color={activeTool === 'smiley' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Measure" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive]} onPress={() => { setActiveTool('measure'); drawingToolsRef.current?.setActiveTool('measure'); }}><TvMeasure color={activeTool === 'measure' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Zoom In" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'zoom' && styles.toolIconActive]} onPress={() => { setActiveTool('zoom'); drawingToolsRef.current?.setActiveTool('zoom'); }}><TvZoom color={activeTool === 'zoom' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Magnet Mode" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'magnet' && styles.toolIconActive]} onPress={() => { setActiveTool('magnet'); drawingToolsRef.current?.setActiveTool('magnet'); }}><TvMagnet color={activeTool === 'magnet' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Stay in Drawing Mode" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'stay_in_drawing_mode' && styles.toolIconActive]} onPress={() => { setActiveTool('stay_in_drawing_mode'); drawingToolsRef.current?.setActiveTool('stay_in_drawing_mode'); }}><TvStayInDrawingMode color={activeTool === 'stay_in_drawing_mode' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Lock All Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'lock' && styles.toolIconActive]} onPress={() => { setActiveTool('lock'); drawingToolsRef.current?.setActiveTool('lock'); }}><TvLock color={activeTool === 'lock' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Hide All Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'hide' && styles.toolIconActive]} onPress={() => { setActiveTool('hide'); drawingToolsRef.current?.setActiveTool('hide'); }}><TvHide color={activeTool === 'hide' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Remove Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon]} onPress={() => { drawingToolsRef.current?.removeAllDrawings(); setActiveTool('crosshair'); }}><TvTrash color={TEXT_MUTED} /></Pressable>
                </div>
                <div title="Object Tree" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'layers' && styles.toolIconActive]} onPress={() => { setActiveTool('layers'); drawingToolsRef.current?.setActiveTool('layers'); }}><TvLayers color={activeTool === 'layers' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
              </ScrollView>
            )}
            <View style={{ flex: 1, position: 'relative' }} onLayout={handleLayout}>
              <style>{`#tv-attr-logo { display: none !important; }`}</style>
              {/* Floating OHLC Legend */}
              <div
                ref={legendRef}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 12,
                  zIndex: 20,
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              />

              {/* Loading Spinner */}
              {isLoading && (
                <View style={styles.chartOverlay}>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.overlayText}>Loading chart data...</Text>
                </View>
              )}

              {/* Error / Retry */}
              {isError && !isLoading && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>Unable to load chart</Text>
                  <Text style={styles.overlaySubText}>Waiting for market data connection...</Text>
                </View>
              )}

              <div
                ref={chartContainerRef}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              />

              <LiveTvLegend symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} candles={candles} />

            </View>
          </View>

          <View style={styles.tvBottomToolbar}>
            <View style={styles.tvRangesLeft}>
              {['1d', '5d', '1m', '6m', '1y'].map((range, idx) => (
                <View key={range} style={[styles.tvRangePill, idx === 0 ? styles.tvRangePillActive : null]}>
                  <Text style={[styles.tvRangeText, idx === 0 ? styles.tvRangeTextActive : null]}>{range}</Text>
                </View>
              ))}
            </View>
            <View style={styles.tvRangesRight}>
              <Text style={styles.tvRangeDropdownText}>Date Range</Text>
              <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginRight: 8 }} />
              <Text style={styles.tvRangeTimeText}>{new Date().toLocaleTimeString('en-US', { hour12: false })} (UTC+5:30)</Text>
              <Text style={styles.tvRangeAutoText}>auto</Text>
            </View>
          </View>
        </View>

        {!isChartExpanded && (
          <View style={styles.bottomArea}>
            <View style={styles.segmentedControl}>
              {['POSITIONS', 'ORDERS', 'HISTORY'].map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.segmentBtn, tab === 'POSITIONS' ? styles.segmentBtnActive : null]}
                  onPress={() => {
                    if (tab === 'HISTORY') router.push('/history');
                    else router.push('/trade');
                  }}
                >
                  <Text style={[styles.segmentText, tab === 'POSITIONS' ? styles.segmentTextActive : null]}>{tab}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sentimentLabelsRow}>
              <Text style={styles.sentimentLabelSell}>32% SELL</Text>
              <Text style={styles.sentimentLabelBuy}>68% BUY</Text>
            </View>
            <View style={styles.sentimentBarRow}>
              <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: 0.32 }]} />
              <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: 0.68 }]} />
            </View>

            <LiveTradeButtons symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} seriesRef={seriesRef} />

            <View style={styles.lotSelectorBar}>
              <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => Math.max(0.01, Number(((prev || 0) - 0.01).toFixed(2))))}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </Pressable>
              <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>{(lotSize || 0).toFixed(2)}</Text></Text>
              <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => Number(((prev || 0) + 0.01).toFixed(2)))}>
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
        actions={CHART_SYMBOLS.map((sym) => ({
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

      <TradingSignalDetailsModal
        visible={showSignalDetails}
        onClose={() => setShowSignalDetails(false)}
        symbol={chartSymbol}
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

    /* ── Header Wrapper (2-row) ──────────────────────────────────── */
    headerWrapper: {
      backgroundColor: isDark ? '#0B101E' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
      zIndex: 10,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      height: 40,
      marginTop: 16,
    },
    hamburgerBtn: {
      padding: 4,
      marginLeft: -4,
    },

    /* ── Compact Header (Row 2) ──────────────────────────────────── */
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 10,
    },
    symbolSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
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
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
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
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '500',
      marginTop: 1,
    },

    /* ── Center: Live Price ──────────────────────────────────────── */
    priceSection: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    livePriceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 32,
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

    /* ── Right: Price Change ─────────────────────────────────────── */
    rightSection: {
      alignItems: 'flex-end',
      flex: 1,
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 16,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    balanceLabel: {
      color: isDark ? '#FFFFFF' : '#64748B',
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 1,
    },
    currencyText: {
      fontSize: 10,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '700',
    },
    priceChangePct: {
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
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
      marginTop: 2,
    },
    headerTitleText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
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
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    textDemo: {
      color: '#00E676',
    },
    textLive: {
      color: isDark ? '#FACC15' : '#D97706',
    },

    /* ── Card (main body) ────────────────────────────────────────── */
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
      width: 50,
      minWidth: 50,
      maxWidth: 50,
      flexShrink: 0,
      flexGrow: 0,
      backgroundColor: isDark ? '#080C16' : '#F8FAFC',
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    },
    leftToolbarContent: {
      alignItems: 'center',
      paddingVertical: 8,
      gap: 2,
    },
    toolIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 5,
    },
    toolIconActive: {
      backgroundColor: isDark ? 'rgba(41, 98, 255, 0.18)' : 'rgba(41, 98, 255, 0.10)',
      borderRadius: 5,
    },
    toolSeparator: {
      width: 24,
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      marginVertical: 2,
    },
    chartTopToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? '#080C16' : '#F8FAFC',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
      zIndex: 10,
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
    gestureWrap: {
      flex: 1,
    },
    canvas: {
      flex: 1,
    },
    xAxis: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 24,
      flexDirection: 'row',
    },
    xTick: {
      position: 'absolute',
      color: TEXT_MUTED,
      fontSize: 13,
      top: 4,
    },
    axisLabelY: {
      position: 'absolute',
      right: 8,
      color: TEXT_MUTED,
      fontSize: 13,
    },
    priceTagWrap: {
      position: 'absolute',
      right: 0,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    priceTagText: {
      color: isDark ? '#fff' : '#0F172A',
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    crosshairText: {
      color: isDark ? '#E2E8F0' : '#475569',
      fontSize: 12,
    },
    bottomArea: {
      backgroundColor: isDark ? '#060A14' : '#FFFFFF',
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9',
      borderRadius: 8,
      padding: 3,
      marginBottom: 8,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 6,
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
      marginBottom: 5,
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
      height: 3,
      marginBottom: 14,
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
      marginBottom: 12,
      gap: 10,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 10,
      padding: 12,
      paddingVertical: 12,
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
    gridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : T.borderSubtle,
    },
    chartOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(5, 8, 16, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    },
    overlayText: {
      color: isDark ? TEXT_MUTED : '#475569',
      fontSize: 14,
      fontWeight: '600',
      marginTop: 12,
    },
    overlaySubText: {
      color: isDark ? 'rgba(142, 154, 175, 0.6)' : '#94A3B8',
      fontSize: 12,
      marginTop: 4,
    },
    tvLegendContainer: {
      position: 'absolute',
      top: 10,
      left: 14,
      zIndex: 10,
      flexDirection: 'column',
    },
    tvLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    tvLegendSymbolTitle: {
      color: isDark ? '#D1D4DC' : '#131722',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0,
    },
    tvLegendStatusPill: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: isDark ? '#2A2E39' : '#E0E3EB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tvLegendStatusDot: {
      width: 6,
      height: 2,
      backgroundColor: isDark ? '#D1D4DC' : '#131722',
    },
    tvLegendPriceValue: {
      fontSize: 13,
      fontWeight: '600',
    },
    tvLegendPriceChange: {
      fontSize: 13,
      fontWeight: '500',
    },
    tvLegendDropdownBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E222D' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#2A2E39' : '#E2E8F0',
      borderRadius: 4,
      paddingHorizontal: 6,
      height: 22,
      gap: 4,
    },
    tvLegendDropdownText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#D1D4DC' : '#131722',
    },
    tvBottomToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: isDark ? '#0F1219' : '#F8FAFC',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#2A2E39' : '#E5E7EB',
    },
    tvRangesLeft: {
      flexDirection: 'row',
      gap: 4,
    },
    tvRangePill: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 4,
    },
    tvRangePillActive: {
      backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
    },
    tvRangeText: {
      color: isDark ? '#758696' : '#787B86',
      fontSize: 12,
      fontWeight: '600',
    },
    tvRangeTextActive: {
      color: isDark ? '#F8FAFC' : '#0F172A',
    },
    tvRangesRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    tvRangeDropdownText: {
      color: isDark ? '#787B86' : '#787B86',
      fontSize: 12,
      fontWeight: '500',
      marginRight: 2,
    },
    tvRangeTimeText: {
      color: isDark ? '#787B86' : '#787B86',
      fontSize: 12,
      fontWeight: '500',
      marginLeft: 4,
    },
    tvRangeAutoText: {
      color: '#2962FF',
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 8,
    },
  });
}
