import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles } from '../../hooks/useLiveCandles';
import { createChart, IChartApi, ISeriesApi, CandlestickData, ColorType, CrosshairMode, CandlestickSeries, LineStyle } from 'lightweight-charts';

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
  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, accountDetails } = useUserPreferences();
  const liveAccount = { balance: 100000, currency: 'USD' };
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const scrollRef = useRef<ScrollView>(null);
  const chartContainerRef = useRef<any>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });

  const { candles, latestTick } = useLiveCandles(chartSymbol, chartTimeframe);
  const isLoading = candles.length === 0;
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
        background: { type: ColorType.Solid, color: CH_BG },
        textColor: TEXT_MUTED,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID, style: LineStyle.Solid },
        horzLines: { color: GRID, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        },
        horzLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        },
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const d = new Date(timestamp * 1000);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
      },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
      },
      rightPriceScale: {
        borderColor: GRID,
        autoScale: true,
      },
    });

    const UP_COLOR = '#2962FF';
    const DOWN_COLOR = '#EF5350';

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: true,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    chart.subscribeCrosshairMove((param) => {
      if (legendRef.current) {
        if (param.time && param.seriesData.get(candlestickSeries)) {
          const data = param.seriesData.get(candlestickSeries) as any;
          const isUp = data.close >= data.open;
          const color = isUp ? UP_COLOR : DOWN_COLOR;
          legendRef.current.innerHTML = `
            <div style="font-size: 13px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
              <span style="color: ${TEXT_MUTED}; margin-right: 8px;">O</span><span style="color: ${color}; margin-right: 12px;">${data.open.toFixed(5)}</span>
              <span style="color: ${TEXT_MUTED}; margin-right: 8px;">H</span><span style="color: ${color}; margin-right: 12px;">${data.high.toFixed(5)}</span>
              <span style="color: ${TEXT_MUTED}; margin-right: 8px;">L</span><span style="color: ${color}; margin-right: 12px;">${data.low.toFixed(5)}</span>
              <span style="color: ${TEXT_MUTED}; margin-right: 8px;">C</span><span style="color: ${color}; margin-right: 12px;">${data.close.toFixed(5)}</span>
            </div>
          `;
        } else {
          legendRef.current.innerHTML = '';
        }
      }
    });

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [isDark, T.bgSecondary, T.textMuted, T.borderSubtle, BLUE, RED]);

  // Sync Data
  useEffect(() => {
    if (seriesRef.current && candles.length > 0) {
      // Deduplicate by time strictly for lightweight-charts
      const uniqueData = Array.from(new Map(candles.map(item => [item.time, item])).values());
      // Sort strictly by timestamp
      uniqueData.sort((a, b) => a.time - b.time);
      seriesRef.current.setData(uniqueData as any);
    }
  }, [candles, isDark]);

  // Live Tick Sync
  useEffect(() => {
    if (seriesRef.current && latestTick) {
      seriesRef.current.update(latestTick as any);
    }
  }, [latestTick, isDark]);

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

  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.30 : chartSymbol.includes('BTC') ? 25 : 0.00015);
  
  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);

  const displayDecimals = baseSymbol.includes('JPY') ? 3 : baseSymbol.includes('XAU') ? 2 : baseSymbol.includes('BTC') ? 2 : 5;
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
      <View style={styles.topHeaderRow}>
        <View style={styles.headerSpacer}>
          <View style={{ width: 40, height: 40 }} />
        </View>
        <View style={styles.accountBadgeGroup}>
          <View style={[styles.accountBadge, isDemoAccount ? styles.badgeDemo : styles.badgeLive]}>
            <View style={[styles.liveIndicatorGlow, isDemoAccount ? styles.glowDemo : styles.glowLive]}>
              <View style={[styles.liveIndicator, isDemoAccount ? styles.dotDemo : styles.dotLive]} />
            </View>
            <Text style={[styles.accountTypeText, isDemoAccount ? styles.textDemo : styles.textLive]}>
              {isDemoAccount ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
            </Text>
          </View>
        </View>
        <View style={[styles.headerSpacer, styles.headerSpacerRight]} />
      </View>

      <View style={styles.card}>
        <View style={styles.glassToolbar}>
          {/* Blue Radial Glow Background */}
          {isDark && (
            <LinearGradient
              colors={['rgba(37, 99, 235, 0.15)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
            />
          )}
          <View style={styles.toolbarRow}>
            <Pressable style={styles.symbolInfo} onPress={() => setSymbolPickerOpen(true)}>
              <View style={styles.flagStack}>
                {symbolFlags ? (
                  <>
                    <Image source={{ uri: `https://flagcdn.com/w160/${symbolFlags[0]}.png` }} style={[styles.flagCircle, { zIndex: 2 }]} />
                    <Image source={{ uri: `https://flagcdn.com/w160/${symbolFlags[1]}.png` }} style={[styles.flagCircle, styles.flagOverlap, { zIndex: 1 }]} />
                  </>
                ) : symbolLogo ? (
                  <View style={[styles.flagCircle, { backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }]}>
                    <Image source={{ uri: symbolLogo }} style={{ width: 18, height: 18, borderRadius: 9 }} />
                  </View>
                ) : (
                  <View style={[styles.flagCircle, { backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{displaySymbol.slice(0, 3).replace('/', '')}</Text>
                  </View>
                )}
              </View>
              <View style={styles.symbolTextCol}>
                <View style={styles.symbolNameRow}>
                  <Text style={styles.symbolText}>{displaySymbol}</Text>
                  <View style={styles.microBadge}>
                    <Text style={styles.microBadgeText}>{symbolCategory}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText}>{symbolName}</Text>
              </View>
            </Pressable>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceText}>
                {liveAccount ? fmt.int(liveAccount.balance) : '---'} <Text style={styles.currencyText}>{liveAccount ? liveAccount.currency : 'USD'}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.plRow}>
            <View style={styles.plInfoGroup}>
              <Ionicons name="time-outline" size={14} color={TEXT_MUTED} style={{ marginRight: 4 }} />
              <Text style={styles.plLabel}>Positions :</Text>
              <Text style={styles.plValue}>0</Text>
              <View style={styles.plDivider} />
              <Ionicons name="pie-chart-outline" size={14} color={TEXT_MUTED} style={{ marginRight: 4 }} />
              <Text style={styles.plLabel}>P&L :</Text>
              <Text style={styles.plValue}>0.00</Text>
            </View>
            <View style={styles.toolbarActions}>
              <Pressable style={styles.toolbarActionBtn} onPress={() => Alert.alert('Price Alert', `Set a price alert for ${chartSymbol}`)}>
                <Ionicons name="alarm-outline" size={20} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="expand-outline" size={20} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="layers-outline" size={20} color={TEXT_MUTED} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.chartContainer} onLayout={handleLayout}>
          {/* Top Integrated Toolbar (Timeframes, Legend) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4, zIndex: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {['M1', 'M5', 'M15', 'H1', 'H4', 'D1'].map((tf) => (
                <Pressable key={tf} onPress={() => setChartTimeframe(tf)}>
                  <Text style={{ fontSize: 13, fontWeight: chartTimeframe === tf ? '700' : '500', color: chartTimeframe === tf ? BLUE : TEXT_MUTED }}>{tf}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Floating OHLC Legend */}
          <div
            ref={legendRef}
            style={{
              position: 'absolute',
              top: 32,
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
            style={{ width: '100%', flex: 1, position: 'relative' }} 
          />
        </View>

        <View style={styles.bottomArea}>
          <View style={styles.segmentedControl}>
            {['POSITIONS', 'ORDERS', 'HISTORY'].map((tab) => (
              <Pressable key={tab} style={[styles.segmentBtn, tab === 'POSITIONS' && styles.segmentBtnActive]}>
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
              <View style={styles.actionBtnInnerLeft}>
                <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelSell]}>SELL</Text>
                <Text style={styles.actionBtnPriceText}>@ {(latestAsk || 0).toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>

            <View style={styles.actionSpacer} />

            <Pressable
              style={[styles.actionBtn, styles.actionBtnBuy]}
              onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol: chartSymbol, side: 'buy' } })}
            >
              <View style={styles.actionBtnInnerLeft}>
                <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelBuy]}>BUY</Text>
                <Text style={styles.actionBtnPriceText}>@ {(latestBid || 0).toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
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
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = T.bg; // #F4F7FB in Light, deep dark in Dark
  const CARD_BG = T.glass2; // #FFFFFF in Light
  const CHART_HEADER_BG = T.glass2; // Header is a main card, therefore glass2
  const CHART_HEADER_BORDER = T.border;
  const CHART_CANVAS_BG = T.bgSecondary; // #FFFFFF in Light
  const BOTTOM_AREA_BG = T.bgSecondary;
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const GRID = T.borderSubtle;
  const TEXT = T.text;
  const TEXT_MUTED = T.textMuted;
  const BTN_BG = T.glass1; // Buttons are recessed/interactive, use glass1
  const PILL_BG = T.glass1; // Pills are recessed, use glass1

  return StyleSheet.create({
    screen: { backgroundColor: APP_BG, paddingHorizontal: 0 },
    topHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    headerSpacer: {
      flex: 1,
      alignItems: 'flex-start',
    },
    headerSpacerRight: {
      alignItems: 'flex-end',
    },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountBadgeGroup: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      gap: 8,
    },
    badgeDemo: {
      backgroundColor: isDark ? 'rgba(0, 230, 118, 0.08)' : '#DCFCE7',
      borderColor: isDark ? 'rgba(0, 230, 118, 0.3)' : '#86EFAC',
    },
    badgeLive: {
      backgroundColor: isDark ? 'rgba(250, 204, 21, 0.08)' : '#FEF3C7',
      borderColor: isDark ? 'rgba(250, 204, 21, 0.3)' : '#FDE68A',
    },
    liveIndicatorGlow: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glowDemo: {
      backgroundColor: 'rgba(0, 230, 118, 0.2)',
    },
    glowLive: {
      backgroundColor: 'rgba(250, 204, 21, 0.2)',
    },
    liveIndicator: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dotDemo: {
      backgroundColor: '#00E676',
    },
    dotLive: {
      backgroundColor: isDark ? '#FACC15' : '#713F12',
    },
    accountTypeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    textDemo: {
      color: '#00E676',
    },
    textLive: {
      color: isDark ? '#FACC15' : '#D97706',
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceLabel: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    balanceText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 18,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.4,
    },
    currencyText: {
      fontSize: 12,
      color: isDark ? '#F8FAFC' : '#475569',
      fontWeight: '800',
    },
    card: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    glassToolbar: {
      marginHorizontal: 16,
      borderRadius: 20,
      backgroundColor: CHART_HEADER_BG,
      borderWidth: 1,
      borderColor: CHART_HEADER_BORDER,
      paddingTop: 12,
      paddingBottom: 8,
      marginBottom: 12,
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 24,
      elevation: 4,
    },
    toolbarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    symbolInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    flagStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    flagCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: CARD_BG,
    },
    flagOverlap: {
      marginLeft: -8,
    },
    symbolTextCol: {
      justifyContent: 'center',
    },
    symbolNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    symbolText: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    microBadge: {
      backgroundColor: T.glass2,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: T.border,
    },
    microBadgeText: {
      color: T.textSub,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    symbolSubText: {
      color: isDark ? '#FFFFFF' : '#64748B',
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
    },
    toolbarActions: {
      flexDirection: 'row',
      gap: 8,
    },
    toolbarActionBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? T.border : '#E2E8F0',
    },
    plInfoGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    plLabel: {
      color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B',
      fontSize: 12,
      fontWeight: '800',
      marginRight: 4,
    },
    plValue: {
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.2,
    },
    plDivider: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? '#FFFFFF' : '#E2E8F0',
      marginLeft: 20,
      marginRight: 2,
    },
    chartContainer: {
      flex: 1,
      backgroundColor: CHART_CANVAS_BG,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: CHART_HEADER_BORDER,
      position: 'relative',
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
      backgroundColor: BOTTOM_AREA_BG,
      borderTopWidth: 1,
      borderTopColor: isDark ? T.border : '#E2E8F0',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 16,
    },
    timeframesRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 12,
    },
    tfBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    tfBtnActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9',
    },
    tfText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '600',
    },
    tfTextActive: {
      color: isDark ? '#fff' : '#0F172A',
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(41, 98, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(41, 98, 255, 0.15)' : '#E2E8F0',
      padding: 4,
      marginBottom: 8,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 8,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#FFFFFF',
      shadowColor: isDark ? 'transparent' : '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    segmentText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    segmentTextActive: {
      color: isDark ? '#fff' : '#0F172A',
    },
    sentimentLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    sentimentLabelSell: {
      color: RED,
      fontSize: 11,
      fontWeight: '700',
    },
    sentimentLabelBuy: {
      color: BLUE,
      fontSize: 11,
      fontWeight: '700',
    },
    sentimentBarRow: {
      flexDirection: 'row',
      height: 4,
      marginBottom: 12,
      borderRadius: 2,
      overflow: 'hidden',
    },
    sentimentHalf: {
      height: '100%',
    },
    sentimentSell: {
      backgroundColor: RED,
    },
    sentimentBuy: {
      backgroundColor: BLUE,
    },
    tradeControlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    actionBtn: {
      flex: 1,
      height: 52,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    actionBtnSell: {
      backgroundColor: isDark ? 'rgba(255, 42, 85, 0.1)' : '#FCE7F3',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 42, 85, 0.25)' : '#FBCFE8',
      shadowColor: '#FF2A55',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    actionBtnBuy: {
      backgroundColor: isDark ? 'rgba(41, 98, 255, 0.1)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(41, 98, 255, 0.25)' : '#E2E8F0',
      shadowColor: '#2962FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    actionBtnInnerLeft: {
      flex: 1,
    },
    actionBtnLabelTitle: {
      color: isDark ? TEXT : '#0F172A',
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 2,
      letterSpacing: 0.5,
    },
    actionBtnLabelSell: {
      color: isDark ? TEXT : '#9F1239',
    },
    actionBtnLabelBuy: {
      color: isDark ? TEXT : '#1E3A8A',
    },
    actionBtnPriceText: {
      color: isDark ? TEXT : '#475569',
      fontSize: 12,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      opacity: 0.9,
    },
    actionChevron: {
      opacity: 0.8,
    },
    actionSpacer: {
      width: 12,
    },
    lotSelectorBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(41, 98, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(41, 98, 255, 0.15)' : '#E2E8F0',
    },
    lotStepperBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'transparent' : '#E2E8F0',
      borderRadius: 8,
    },
    lotLabelText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 14,
      fontWeight: '500',
    },
    lotValueText: {
      color: isDark ? '#fff' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
    },
    gridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: GRID,
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
  });
}
