import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Group, Line, Path, Skia, DashPathEffect } from '@shopify/react-native-skia';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUIState } from '../../state/uiState';
import { useUserPreferences } from '../../state/userPreferences';
import { fmt } from '../../utils/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useLiveCandles } from '../../hooks/useLiveCandles';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, useDerivedValue, runOnJS } from 'react-native-reanimated';

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

const CANDLE_WIDTH = 7;
const CANDLE_GAP = 4;



export function ChartScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const APP_BG = T.bg;
  const CARD_BG = isDark ? '#0B0F19' : T.glass2;
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const GREEN = isDark ? '#22C55E' : T.up;
  const GRID = T.borderSubtle;
  const TEXT = T.text;
  const TEXT_MUTED = T.textMuted;
  const BTN_BG = T.glass2;
  const PILL_BG = T.glass1;
  const { chartSymbol, chartTimeframe, setChartTimeframe, setChartSymbol, isDemoAccount, accountDetails } = useUserPreferences();
  const liveAccount = { balance: 100000, currency: 'USD' };
  const equityHistory: any = null;
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartType, setChartType] = useState<'candles' | 'bars' | 'line'>('candles');
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [lotSize, setLotSize] = useState(0.10);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std'
  const baseSymbol = useMemo(() => chartSymbol.replace(/[a-z_.-].*$/, ''), [chartSymbol]);

  const { candles, latestTick } = useLiveCandles(baseSymbol, chartTimeframe);
  const isLoading = candles.length === 0;
  const isError = false;

  const translateX = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const savedScaleX = useSharedValue(1);

  const crosshairX = useSharedValue(-1);
  const crosshairY = useSharedValue(-1);
  const isCrosshairActive = useSharedValue(false);

  useEffect(() => {
    translateX.value = 0;
    scaleX.value = 1;
    savedScaleX.value = 1;
  }, [chartSymbol, chartTimeframe]);

  const CHART_HEIGHT = chartLayout.height;
  const contentWidth = Math.max(candles.length * (CANDLE_WIDTH + CANDLE_GAP) + 60, chartLayout.width);

  useEffect(() => {
    if (chartLayout.width > 0 && contentWidth > chartLayout.width) {
      translateX.value = chartLayout.width - contentWidth;
    }
  }, [chartLayout.width, contentWidth]);

  const minVal = useMemo(() => candles.length > 0 ? Math.min(...candles.map((c) => c.low)) * 0.999 : 0, [candles]);
  const maxVal = useMemo(() => candles.length > 0 ? Math.max(...candles.map((c) => c.high)) * 1.001 : 0, [candles]);
  const yRange = maxVal - minVal;

  const getY = (val: number) => {
    if (yRange === 0 || CHART_HEIGHT === 0) return 0;
    return CHART_HEIGHT - ((val - minVal) / yRange) * CHART_HEIGHT;
  };

  const paths = useMemo(() => {
    const upWicks = Skia.Path.Make();
    const downWicks = Skia.Path.Make();
    const upBodies = Skia.Path.Make();
    const downBodies = Skia.Path.Make();
    const upOHLC = Skia.Path.Make();
    const downOHLC = Skia.Path.Make();
    const line = Skia.Path.Make();

    candles.forEach((c, i) => {
      const x = i * (CANDLE_WIDTH + CANDLE_GAP) + 10;
      const isUp = c.close >= c.open;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);
      const topY = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(openY - closeY), 1);
      const wickX = x + CANDLE_WIDTH / 2;

      if (isUp) {
        upWicks.moveTo(wickX, highY);
        upWicks.lineTo(wickX, lowY);
        upBodies.addRect(Skia.XYWHRect(x, topY, CANDLE_WIDTH, bodyHeight));
        upOHLC.moveTo(wickX, highY);
        upOHLC.lineTo(wickX, lowY);
        upOHLC.moveTo(wickX - 3, openY);
        upOHLC.lineTo(wickX, openY);
        upOHLC.moveTo(wickX, closeY);
        upOHLC.lineTo(wickX + 3, closeY);
      } else {
        downWicks.moveTo(wickX, highY);
        downWicks.lineTo(wickX, lowY);
        downBodies.addRect(Skia.XYWHRect(x, topY, CANDLE_WIDTH, bodyHeight));
        downOHLC.moveTo(wickX, highY);
        downOHLC.lineTo(wickX, lowY);
        downOHLC.moveTo(wickX - 3, openY);
        downOHLC.lineTo(wickX, openY);
        downOHLC.moveTo(wickX, closeY);
        downOHLC.lineTo(wickX + 3, closeY);
      }
      if (i === 0) line.moveTo(wickX, getY(c.close));
      else line.lineTo(wickX, getY(c.close));
    });

    return { upWicks, downWicks, upBodies, downBodies, upOHLC, downOHLC, line };
  }, [candles, CHART_HEIGHT, minVal, maxVal]);

  const panGesture = Gesture.Pan()
    .onChange((e) => {
      if (isCrosshairActive.value) {
        crosshairX.value += e.changeX;
        crosshairY.value += e.changeY;
      } else {
        translateX.value += e.changeX;
      }
    })
    .onEnd((e) => {
      if (!isCrosshairActive.value) {
        const maxScroll = 0;
        const minScroll = -(contentWidth * scaleX.value - chartLayout.width);

        translateX.value = withDecay({
          velocity: e.velocityX,
          clamp: [Math.min(minScroll, 0), maxScroll],
        });
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = Math.max(0.2, Math.min(savedScaleX.value * e.scale, 10));
      const scaleRatio = newScale / scaleX.value;
      translateX.value = e.focalX + (translateX.value - e.focalX) * scaleRatio;
      scaleX.value = newScale;
    })
    .onEnd(() => {
      savedScaleX.value = scaleX.value;
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart((e) => {
      isCrosshairActive.value = true;
      crosshairX.value = e.x;
      crosshairY.value = e.y;
    })
    .onEnd(() => {
      isCrosshairActive.value = false;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, longPressGesture);

  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { scaleX: scaleX.value },
  ]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  };

  const gridLineY1 = CHART_HEIGHT * 0.25;
  const gridLineY2 = CHART_HEIGHT * 0.5;
  const gridLineY3 = CHART_HEIGHT * 0.75;
  const gridLineX1 = chartLayout.width * 0.25;
  const gridLineX2 = chartLayout.width * 0.5;
  const gridLineX3 = chartLayout.width * 0.75;

  const currentPriceY = candles.length > 0 ? getY(candles[candles.length - 1].close) : -10;
  const bidPriceY = currentPriceY;
  const askSpread = chartSymbol.includes('XAU') ? 0.396 : chartSymbol.includes('BTC') ? 25 : 0.00015;
  const askPriceY = getY(candles.length > 0 ? candles[candles.length - 1].close - askSpread : -10);

  const crosshairVerticalStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: crosshairX.value,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: TEXT_MUTED,
    opacity: isCrosshairActive.value ? 1 : 0,
    pointerEvents: 'none',
  }));

  const crosshairHorizontalStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: crosshairY.value,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: TEXT_MUTED,
    opacity: isCrosshairActive.value ? 1 : 0,
    pointerEvents: 'none',
  }));

  const crosshairPriceStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      right: 0,
      top: crosshairY.value - 12,
      backgroundColor: PILL_BG,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: GRID,
      opacity: isCrosshairActive.value ? 1 : 0,
      pointerEvents: 'none',
    };
  });

  const [crosshairPriceDisplay, setCrosshairPriceDisplay] = useState('0.00');

  useDerivedValue(() => {
    if (isCrosshairActive.value && CHART_HEIGHT > 0) {
      const price = minVal + yRange * (1 - crosshairY.value / CHART_HEIGHT);
      runOnJS(setCrosshairPriceDisplay)((price || 0).toFixed(5));
    }
  });

  const latestClose = latestTick?.close ?? 0;
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.30 : chartSymbol.includes('BTC') ? 25 : 0.00015);

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
      {!isFullscreen && (
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
      )}

      <View style={styles.card}>
        {!isFullscreen && <View style={styles.glassToolbar}>
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
                  <Ionicons name="chevron-down" size={14} color="#94A3B8" />
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
              <Ionicons name="time-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
              <Text style={styles.plLabel}>Positions :</Text>
              <Text style={styles.plValue}>0</Text>
              <View style={styles.plDivider} />
              <Ionicons name="pie-chart-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
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
        </View>}

        {/* Professional Chart Toolbar */}
        <View style={styles.proToolbar}>
          <Pressable style={styles.proToolBtn} onPress={() => setShowChartTypeMenu(true)}>
            <Ionicons
              name={chartType === 'candles' ? 'stats-chart' : chartType === 'bars' ? 'bar-chart-outline' : 'trending-up-outline'}
              size={15}
              color={BLUE}
            />
            <Ionicons name="chevron-down" size={10} color={TEXT_MUTED} />
          </Pressable>
          <View style={styles.proToolSep} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.proTfScroll} contentContainerStyle={styles.proTfScrollContent}>
            {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'].map((tf) => (
              <Pressable key={tf} style={[styles.proTfChip, chartTimeframe === tf && styles.proTfChipActive]} onPress={() => setChartTimeframe(tf)}>
                <Text style={[styles.proTfChipText, chartTimeframe === tf && styles.proTfChipTextActive]}>{tf}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.proToolSep} />
          <Pressable style={styles.proToolBtn} onPress={() => setMenuOpen(true)}>
            <Ionicons name="analytics-outline" size={16} color={TEXT_MUTED} />
          </Pressable>
          <Pressable style={styles.proToolBtn} onPress={() => Alert.alert('Drawing Tools', 'Trend lines, rectangles and Fibonacci retracements coming soon.')}>
            <Ionicons name="pencil-outline" size={16} color={TEXT_MUTED} />
          </Pressable>
          <Pressable style={styles.proToolBtn} onPress={() => Alert.alert('Price Alert', `Set a price alert for ${chartSymbol}`)}>
            <Ionicons name="alarm-outline" size={16} color={TEXT_MUTED} />
          </Pressable>
          <Pressable style={styles.proToolBtn} onPress={() => setIsFullscreen(!isFullscreen)}>
            <Ionicons name={isFullscreen ? 'contract-outline' : 'scan-outline'} size={16} color={isFullscreen ? BLUE : TEXT_MUTED} />
          </Pressable>
        </View>

        <View style={styles.chartContainer} onLayout={handleLayout}>
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

          <GestureDetector gesture={composedGesture}>
            <View style={styles.gestureWrap}>
              {CHART_HEIGHT > 0 && candles.length > 0 && (
                <Canvas style={styles.canvas}>
                  <Line p1={{ x: 0, y: gridLineY1 }} p2={{ x: chartLayout.width, y: gridLineY1 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: 0, y: gridLineY2 }} p2={{ x: chartLayout.width, y: gridLineY2 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: 0, y: gridLineY3 }} p2={{ x: chartLayout.width, y: gridLineY3 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX1, y: 0 }} p2={{ x: gridLineX1, y: chartLayout.height }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX2, y: 0 }} p2={{ x: gridLineX2, y: chartLayout.height }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX3, y: 0 }} p2={{ x: gridLineX3, y: chartLayout.height }} color={GRID} strokeWidth={1} />

                  <Group transform={transform}>
                    {chartType === 'candles' && (
                      <>
                        <Path path={paths.upWicks} color={GREEN} style="stroke" strokeWidth={1} />
                        <Path path={paths.upBodies} color={GREEN} />
                        <Path path={paths.downWicks} color={RED} style="stroke" strokeWidth={1} />
                        <Path path={paths.downBodies} color={RED} />
                      </>
                    )}
                    {chartType === 'bars' && (
                      <>
                        <Path path={paths.upOHLC} color={GREEN} style="stroke" strokeWidth={1.5} />
                        <Path path={paths.downOHLC} color={RED} style="stroke" strokeWidth={1.5} />
                      </>
                    )}
                    {chartType === 'line' && (
                      <Path path={paths.line} color={BLUE} style="stroke" strokeWidth={2} />
                    )}

                    <Line p1={{ x: 0, y: bidPriceY }} p2={{ x: 10000, y: bidPriceY }} color={GREEN} strokeWidth={1} style="stroke">
                      <DashPathEffect intervals={[4, 4]} />
                    </Line>
                    <Line p1={{ x: 0, y: askPriceY }} p2={{ x: 10000, y: askPriceY }} color={RED} strokeWidth={1} style="stroke">
                      <DashPathEffect intervals={[4, 4]} />
                    </Line>
                  </Group>
                </Canvas>
              )}

              {CHART_HEIGHT > 0 && candles.length > 0 && (
                <>
                  <View style={[styles.priceTagWrap, { top: bidPriceY - 10, backgroundColor: GREEN }]}>
                    <Text style={styles.priceTagText}>{(latestBid || 0).toFixed(displayDecimals)}</Text>
                  </View>
                  <View style={[styles.priceTagWrap, { top: askPriceY - 10, backgroundColor: RED }]}>
                    <Text style={styles.priceTagText}>{(latestAsk || 0).toFixed(displayDecimals)}</Text>
                  </View>

                  <Text style={[styles.axisLabelY, { top: gridLineY1 - 8, color: TEXT_MUTED }]}>{(minVal + yRange * 0.75 || 0).toFixed(displayDecimals)}</Text>
                  <Text style={[styles.axisLabelY, { top: gridLineY2 - 8, color: TEXT_MUTED }]}>{(minVal + yRange * 0.5 || 0).toFixed(displayDecimals)}</Text>
                  <Text style={[styles.axisLabelY, { top: gridLineY3 - 8, color: TEXT_MUTED }]}>{(minVal + yRange * 0.25 || 0).toFixed(displayDecimals)}</Text>
                </>
              )}

              {/* Dynamic X-axis time labels from actual candle timestamps */}
              <View style={styles.xAxis}>
                {candles.length > 0 && xAxisLabels.map((label, i) => (
                  <Text key={i} style={[styles.xTick, { left: label.position, color: TEXT_MUTED }]}>{label.text}</Text>
                ))}
              </View>

              <Animated.View style={crosshairVerticalStyle} />
              <Animated.View style={crosshairHorizontalStyle} />
              <Animated.View style={crosshairPriceStyle}>
                <Text style={styles.crosshairText}>{crosshairPriceDisplay}</Text>
              </Animated.View>

              {isFullscreen && (
                <Pressable style={styles.fullscreenExitBtn} onPress={() => setIsFullscreen(false)}>
                  <Ionicons name="contract-outline" size={22} color="#fff" />
                </Pressable>
              )}
            </View>
          </GestureDetector>
        </View>

        {!isFullscreen && <View style={styles.bottomArea}>
          <View style={styles.timeframesRow}>
            {['M1', 'M5', 'M15', 'H1', 'H4', 'D1'].map((tf) => (
              <Pressable key={tf} onPress={() => setChartTimeframe(tf)} style={[styles.tfBtn, chartTimeframe === tf && styles.tfBtnActive]}>
                <Text style={[styles.tfText, chartTimeframe === tf && styles.tfTextActive]}>{tf}</Text>
              </Pressable>
            ))}
          </View>

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
              <Ionicons name="remove" size={20} color="#94A3B8" />
            </Pressable>
            <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>{(lotSize || 0).toFixed(2)}</Text></Text>
            <Pressable style={styles.lotStepperBtn} onPress={() => setLotSize(prev => +((prev || 0) + 0.01).toFixed(2))}>
              <Ionicons name="add" size={20} color="#94A3B8" />
            </Pressable>
          </View>
        </View>}
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
          { label: 'OHLC Bars', onPress: () => setChartType('bars') },
          { label: 'Line', onPress: () => setChartType('line') },
        ]}
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
  const GREEN = isDark ? '#22C55E' : T.up; // Use theme up color
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
      backgroundColor: isDark ? 'rgba(250, 204, 21, 0.08)' : '#FDE047', // Gold background from image
      borderColor: isDark ? 'rgba(250, 204, 21, 0.3)' : '#FACC15',
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.4,
      shadowRadius: 10,
      elevation: isDark ? 0 : 4,
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
      color: isDark ? '#FACC15' : '#713F12', // Deep brown text for the gold badge
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    balanceLabel: {
      color: isDark ? '#FFFFFF' : '#64748B',
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
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.1)',
    },
    plInfoGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    plLabel: {
      color: '#64748B',
      fontSize: 12,
      fontWeight: '600',
      marginRight: 4,
    },
    plValue: {
      color: '#3B82F6',
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    plDivider: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#475569',
      marginHorizontal: 8,
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
    overlayPill: {
    },
    overlayPillText: {
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
      paddingVertical: 6,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tfBtnActive: {
      borderBottomColor: isDark ? '#fff' : '#0F172A',
    },
    tfText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '600',
    },
    tfTextActive: {
      color: isDark ? '#fff' : '#0F172A',
      fontWeight: '800',
    },
    segmentedControl: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1E293B' : '#E2E8F0',
      marginBottom: 16,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    segmentBtnActive: {
      borderBottomColor: isDark ? '#FFFFFF' : '#0F172A',
    },
    segmentText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    segmentTextActive: {
      color: isDark ? '#fff' : '#0F172A',
      fontWeight: '800',
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
      elevation: isDark ? 2 : 0,
    },
    actionBtnBuy: {
      backgroundColor: isDark ? 'rgba(41, 98, 255, 0.1)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(41, 98, 255, 0.25)' : '#E2E8F0',
      shadowColor: '#2962FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: isDark ? 2 : 0,
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
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatarWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#2962FF', overflow: 'visible', position: 'relative' },
    avatarImg: { width: 36, height: 36, borderRadius: 18 },
    avatarDot: { position: 'absolute', bottom: 0, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#089981', borderWidth: 2, borderColor: '#040609' },
    fullscreenExitBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    proToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      backgroundColor: isDark ? '#0B0F19' : T.bgSecondary,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
      gap: 2,
    },
    proToolSep: {
      width: 1,
      height: 18,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      marginHorizontal: 4,
    },
    proToolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 5,
      borderRadius: 6,
    },
    proTfScroll: {
      flex: 1,
    },
    proTfScrollContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 4,
    },
    proTfChip: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 5,
    },
    proTfChipActive: {
      backgroundColor: BLUE,
    },
    proTfChipText: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 11,
      fontWeight: '600',
    },
    proTfChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
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
