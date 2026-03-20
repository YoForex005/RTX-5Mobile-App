import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import {
  TvCrosshair, TvTrendLine, TvFib, TvBrush, TvText, TvMeasure, TvZoom, TvMagnet, TvPencil, TvLock, TvHide, TvTrash, TvLayers
} from './components/ChartToolbarIcons';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles } from '../../hooks/useLiveCandles';
import { WebView } from 'react-native-webview';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

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
    <script>
      var chart = null;
      var series = null;
      var signalLines = [];
      var UP_COLOR = '#26A69A';
      var DOWN_COLOR = '#EF5350';

      function setTradingSignals(show, symbol, latestClose, lastTime) {
        try {
          if (!series) return;
          signalLines.forEach(l => series.removePriceLine(l));
          signalLines = [];
          
          if (show && latestClose > 0) {
            var isXau = symbol.includes('XAU');
            var r1 = isXau ? 4895 : latestClose * 1.002;
            var r2 = isXau ? 4940 : latestClose * 1.006;
            var r3 = isXau ? 4975 : latestClose * 1.01;
            var s1 = isXau ? 4805 : latestClose * 0.998;
            var s2 = isXau ? 4775 : latestClose * 0.994;
            var s3 = isXau ? 4740 : latestClose * 0.99;

            signalLines.push(series.createPriceLine({ price: r1, color: '#3B82F6', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Pivot' }));
            signalLines.push(series.createPriceLine({ price: r2, color: '#22C55E', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Resistance' }));
            signalLines.push(series.createPriceLine({ price: r3, color: '#22C55E', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Resistance' }));
            
            signalLines.push(series.createPriceLine({ price: s1, color: '#EF4444', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Support' }));
            signalLines.push(series.createPriceLine({ price: s2, color: '#EF4444', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Support' }));
            signalLines.push(series.createPriceLine({ price: s3, color: '#EF4444', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title: 'Support' }));

            if (lastTime) {
              series.setMarkers([{
                time: lastTime,
                position: 'aboveBar',
                color: '#EF4444',
                shape: 'arrowDown',
                text: 'Signal',
                size: 2,
              }]);
            }
          } else {
            series.setMarkers([]);
          }
        } catch(e) {}
      }

      function initChart(opts, chartType, data, displayDecimals) {
        try {
          if (chart) { chart.remove(); chart = null; series = null; }

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

          if (data && data.length > 0) {
            series.setData(data);
            chart.timeScale().fitContent();
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'CHART_READY'}));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR',message:e.message}));
        }
      }

      function updateTick(tick) {
        try {
          if (series) {
            series.update(tick);
          }
        } catch(e) {}
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({type:'READY'}));
    </script>
</body>
</html>
`;


export function ChartScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const APP_BG = isDark ? T.bg : '#FFFFFF';
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;

  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, showTradingSignals } = useUserPreferences();
  const liveAccount = { balance: 100000, currency: 'USD' };

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

  const webViewRef = useRef<WebView>(null);

  const [chartType, setChartType] = useState<'candles' | 'bars' | 'line' | 'hollow'>('candles');
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { candles, latestTick } = useLiveCandles(chartSymbol, chartTimeframe);
  const isLoading = candles.length === 0;
  const isError = false;

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: isDark ? '#131722' : '#FFFFFF' },
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
      rightOffset: 5,
    },
    rightPriceScale: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      autoScale: true,
    },
  }), [isDark, TEXT_MUTED]);

  const [webViewReady, setWebViewReady] = useState(false);

  const dataSignatureRef = useRef('');

  // Sync Data â€” uses injectJavaScript instead of postMessage
  useEffect(() => {
    if (webViewRef.current && webViewReady && candles.length > 0) {
      const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}`;
      if (dataSignatureRef.current !== sig) {
        // Deduplicate
        const uniqueData = Array.from(new Map(candles.map(item => [item.time, item])).values());
        uniqueData.sort((a, b) => a.time - b.time);

        let mappedData: any = uniqueData;
        if (chartType === 'line') {
          mappedData = uniqueData.map(item => ({ time: item.time, value: item.close }));
        }

        const js = `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedData)}, ${displayDecimals}); true;`;
        webViewRef.current.injectJavaScript(js);
        dataSignatureRef.current = sig;
      }
    }
  }, [candles, isDark, chartType, webViewReady, chartSymbol, chartTimeframe, chartOptions]);

  // Live Tick Sync
  // Live Tick Sync
  useEffect(() => {
    if (webViewRef.current && webViewReady && latestTick) {
      let tickToInject: any = latestTick;
      if (chartType === 'line') {
        tickToInject = { time: latestTick.time, value: latestTick.close };
      }
      const js = `updateTick(${JSON.stringify(tickToInject)}); true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [latestTick, isDark, webViewReady, chartType]);

  // Trading Signals Bridge
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      const lastClose = latestTick?.close ?? (candles.length > 0 ? candles[candles.length - 1].close : 0);
      const lastTime = candles.length > 0 ? candles[candles.length - 1].time : null;
      webViewRef.current.injectJavaScript(`
        window.setTradingSignals(${showTradingSignals}, '${chartSymbol}', ${lastClose}, ${lastTime});
        true;
      `);
    }
  }, [showTradingSignals, webViewReady, chartSymbol, latestTick, candles]);

  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.30 : chartSymbol.includes('BTC') ? 25 : 0.00015);

  const displaySymbol = baseSymbol.length >= 6 ? `${baseSymbol.slice(0, 3)}/${baseSymbol.slice(3, 6)}` : chartSymbol;
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = SYMBOL_NAMES[baseSymbol] ?? chartSymbol;
  const symbolCategory = SYMBOL_CATEGORY[baseSymbol] ?? 'FX';
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;

  return (
    <Screen style={styles.screen}>
      {!isChartExpanded && (
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

          {/* Center: Live Price */}
          <View style={styles.priceSection}>
            <Text style={styles.livePriceText}>{latestClose > 0 ? latestClose.toFixed(displayDecimals) : '---'}</Text>
            {candles.length >= 2 && latestClose > 0 && (() => {
              const prevClose = candles[candles.length - 2]?.close ?? latestClose;
              const change = latestClose - prevClose;
              const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;
              const isUp = change >= 0;
              return (
                <Text style={[styles.priceChangeText, { color: isUp ? '#089981' : '#F23645' }]}>
                  {isUp ? '+' : ''}{change.toFixed(displayDecimals)}  ({isUp ? '+' : ''}{pct.toFixed(2)}%)
                </Text>
              );
            })()}
          </View>

          {/* Right: Balance + Account */}
          <View style={styles.rightSection}>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>PRICE</Text>
              <Text style={[styles.balanceText, { fontWeight: '700', opacity: 0.9 }]}>
                {liveAccount ? fmt.int(liveAccount.balance) : '---'}
                <Text style={styles.currencyText}> {liveAccount ? liveAccount.currency : 'USD'}</Text>
              </Text>
            </View>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText}>Chart</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.chartContainer}>
          <View style={styles.chartTopToolbar}>
            <View style={styles.inlineActionGroup}>
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
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
                <Ionicons name="analytics-outline" size={18} color={TEXT_MUTED} />
              </Pressable>

              <View style={styles.toolbarFlexSpacer} />

              {showTradingSignals && (
                <Pressable onPress={() => setShowSignalDetails(true)} hitSlop={8}>
                  <View style={styles.redBoxIcon}>
                    <Ionicons name="arrow-down" size={14} color="#FFF" />
                  </View>
                </Pressable>
              )}
              <Pressable onPress={() => router.push('/chart/objects')} hitSlop={8} style={{ marginLeft: 8 }}>
                <Ionicons name="pencil-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => router.push('/chart/settings')} hitSlop={8} style={{ marginHorizontal: 8 }}>
                <Ionicons name="settings-outline" size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => setIsChartExpanded(!isChartExpanded)} hitSlop={8}>
                <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={18} color={TEXT_MUTED} />
              </Pressable>
              <Pressable onPress={() => setShowMoreMenu(true)} style={{ marginLeft: 8, marginRight: 8 }} hitSlop={8}>
                <Ionicons name="ellipsis-vertical" size={18} color={TEXT_MUTED} />
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
                <Pressable style={[styles.toolIcon, activeTool === 'crosshair' && styles.toolIconActive]} onPress={() => setActiveTool('crosshair')}><TvCrosshair color={activeTool === 'crosshair' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'trendline' && styles.toolIconActive]} onPress={() => setActiveTool('trendline')}><TvTrendLine color={activeTool === 'trendline' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'fib' && styles.toolIconActive]} onPress={() => setActiveTool('fib')}><TvFib color={activeTool === 'fib' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'brush' && styles.toolIconActive]} onPress={() => setActiveTool('brush')}><TvBrush color={activeTool === 'brush' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'text' && styles.toolIconActive]} onPress={() => setActiveTool('text')}><TvText color={activeTool === 'text' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive]} onPress={() => setActiveTool('measure')}><TvMeasure color={activeTool === 'measure' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'zoom' && styles.toolIconActive]} onPress={() => setActiveTool('zoom')}><TvZoom color={activeTool === 'zoom' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'magnet' && styles.toolIconActive]} onPress={() => setActiveTool('magnet')}><TvMagnet color={activeTool === 'magnet' ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, activeTool === 'pencil' && styles.toolIconActive]} onPress={() => setActiveTool('pencil')}><TvPencil color={activeTool === 'pencil' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'lock' && styles.toolIconActive]} onPress={() => setActiveTool('lock')}><TvLock color={activeTool === 'lock' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'hide' && styles.toolIconActive]} onPress={() => setActiveTool('hide')}><TvHide color={activeTool === 'hide' ? BLUE : TEXT_MUTED} /></Pressable>
                <Pressable style={[styles.toolIcon, activeTool === 'trash' && styles.toolIconActive]} onPress={() => setActiveTool('trash')}><TvTrash color={activeTool === 'trash' ? BLUE : TEXT_MUTED} /></Pressable>
                <View style={styles.toolSeparator} />
                <Pressable style={[styles.toolIcon, activeTool === 'layers' && styles.toolIconActive]} onPress={() => setActiveTool('layers')}><TvLayers color={activeTool === 'layers' ? BLUE : TEXT_MUTED} /></Pressable>
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
                source={{ html: CH_HTML }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                onMessage={(event) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg.type === 'READY' || msg.type === 'CHART_READY') {
                      setWebViewReady(true);
                    }
                  } catch (e) { }
                }}
              />
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
              <Text style={styles.sentimentLabelSell}>32% SELL</Text>
              <Text style={styles.sentimentLabelBuy}>68% BUY</Text>
            </View>
            <View style={styles.sentimentBarRow}>
              <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: 0.32 }]} />
              <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: 0.68 }]} />
            </View>

            <View style={styles.tradeControlsRow}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSell]}
                onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol: chartSymbol, side: 'sell' } })}
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
                onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol: chartSymbol, side: 'buy' } })}
              >
                <View style={styles.actionBtnHeader}>
                  <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelBuy]}>BUY</Text>
                  <Ionicons name="chevron-up" size={16} color="#FFF" />
                </View>
                <Text style={styles.actionBtnPriceText}>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
              </Pressable>
            </View>

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
      paddingVertical: 10,
      backgroundColor: isDark ? '#0B101E' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
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
      fontSize: 16,
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
      fontSize: 22,
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
      marginTop: 4,
      marginRight: 10,
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
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      flexShrink: 0,
      flexGrow: 0,
      backgroundColor: isDark ? '#080C16' : '#F8FAFC',
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
    },
    leftToolbarContent: {
      alignItems: 'center',
      paddingVertical: 12,
      gap: 16,
    },
    toolIcon: {
      width: 32,
      height: 32,
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
      backgroundColor: isDark ? '#080C16' : '#F8FAFC',
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

    /* â”€â”€ Bottom Area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      marginBottom: 12,
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
      marginBottom: 10,
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
  });
}

