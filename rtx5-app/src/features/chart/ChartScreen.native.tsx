import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Group, Line, Path, Skia, DashPathEffect } from '@shopify/react-native-skia';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUIState } from '../../state/uiState';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, useDerivedValue, runOnJS } from 'react-native-reanimated';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

const getStartPrice = (sym: string) => {
  if (sym.includes('JPY')) return 150.00;
  if (sym.includes('XAU')) return 5180.00;
  return 1.0500;
};

const mapTf = (tf: string) => {
  if (tf.startsWith('M') && tf !== 'MN') return tf.replace('M', '') + ' m';
  if (tf.startsWith('H')) return tf.replace('H', '') + ' h';
  if (tf === 'D1') return '1 d';
  if (tf === 'W1') return '1 w';
  if (tf === 'MN') return '1 M';
  return tf;
};

function generateCandles(count: number, startPrice: number) {
  let price = startPrice;
  const candles = [];
  for (let i = 0; i < count; i++) {
    const isUp = Math.random() > 0.49;
    const range = price * 0.001;
    const open = price;
    let close = price + (isUp ? 1 : -1) * (Math.random() * range);
    if (Math.random() > 0.8) {
      close += (isUp ? 1 : -1) * range * 1.5;
    }
    const high = Math.max(open, close) + Math.random() * (range * 0.4);
    const low = Math.min(open, close) - Math.random() * (range * 0.4);
    price = close;
    candles.push({ open, high, low, close });
  }
  return candles;
}

const CANDLE_WIDTH = 7;
const CANDLE_GAP = 4;

const APP_BG = G.bg;
const CARD_BG = '#0B0F19'; // Deep Navy Card
const BLUE = '#2962FF'; // Vivid professional blue
const RED = '#FF2A55'; // Vibrant, sharp red
const UP_COLOR = G.up;
const GRID = G.border;
const TEXT = G.text;
const TEXT_MUTED = '#8E9AAF';
const BTN_BG = G.glass2;
const PILL_BG = G.glass1;

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe, isDemoAccount } = useUserPreferences();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [candles, setCandles] = useState(() => generateCandles(120, getStartPrice(chartSymbol)));

  const translateX = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const savedScaleX = useSharedValue(1);

  const crosshairX = useSharedValue(-1);
  const crosshairY = useSharedValue(-1);
  const isCrosshairActive = useSharedValue(false);

  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      setCandles((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        const current = { ...next[lastIndex] };

        const range = current.open * 0.0003;
        const tick = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * range);

        current.close += tick;
        current.high = Math.max(current.high, current.close);
        current.low = Math.min(current.low, current.close);

        next[lastIndex] = current;

        tickCount++;
        if (tickCount > 40) {
          tickCount = 0;
          next.push({
            open: current.close,
            high: current.close,
            low: current.close,
            close: current.close,
          });
        }
        return next;
      });
    }, 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCandles(generateCandles(120, getStartPrice(chartSymbol)));
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

  const minVal = useMemo(() => Math.min(...candles.map((c) => c.low)) * 0.999, [candles]);
  const maxVal = useMemo(() => Math.max(...candles.map((c) => c.high)) * 1.001, [candles]);
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
      } else {
        downWicks.moveTo(wickX, highY);
        downWicks.lineTo(wickX, lowY);
        downBodies.addRect(Skia.XYWHRect(x, topY, CANDLE_WIDTH, bodyHeight));
      }
    });

    return { upWicks, downWicks, upBodies, downBodies };
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
  const askPriceY = getY(candles.length > 0 ? candles[candles.length - 1].close - (chartSymbol.includes('XAU') ? 0.396 : 0.00015) : -10);

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
      runOnJS(setCrosshairPriceDisplay)(price.toFixed(5));
    }
  });

  const latestClose = candles.length > 0 ? candles[candles.length - 1].close : getStartPrice(chartSymbol);
  const latestBid = latestClose;
  const latestAsk = latestClose + (chartSymbol.includes('XAU') ? 0.396 : 0.00015);
  const displayDecimals = chartSymbol.includes('JPY') || chartSymbol.includes('XAU') ? 3 : 5;
  const displaySymbol = chartSymbol.replace('/', '') === 'EURUSD' ? 'EUR/USD' : chartSymbol.replace('/', '') === 'XAUUSD' ? 'XAU/USD' : chartSymbol;

  return (
    <Screen style={styles.screen}>
      <View style={styles.topHeaderRow}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
            <Ionicons name="menu" size={28} color="#fff" />
          </Pressable>
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
        <View style={[styles.headerSpacer, styles.headerSpacerRight]}>
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
              style={styles.avatarImg}
            />
            <View style={styles.avatarDot} />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.glassToolbar}>
          {/* Blue Radial Glow Background */}
          <LinearGradient
            colors={['rgba(37, 99, 235, 0.15)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.toolbarRow}>
            <View style={styles.symbolInfo}>
              <View style={styles.flagStack}>
                <Image
                  source={{ uri: 'https://flagcdn.com/w160/eu.png' }}
                  style={[styles.flagCircle, { zIndex: 2 }]}
                />
                <Image
                  source={{ uri: 'https://flagcdn.com/w160/us.png' }}
                  style={[styles.flagCircle, styles.flagOverlap, { zIndex: 1 }]}
                />
              </View>
              <View style={styles.symbolTextCol}>
                <View style={styles.symbolNameRow}>
                  <Text style={styles.symbolText}>{displaySymbol}</Text>
                  <View style={styles.microBadge}>
                    <Text style={styles.microBadgeText}>FX</Text>
                  </View>
                </View>
                <Text style={styles.symbolSubText}>Euro / US Dollar</Text>
              </View>
            </View>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceText}>1,500.00 <Text style={styles.currencyText}>USD</Text></Text>
            </View>
          </View>

          <View style={styles.plRow}>
            <View style={styles.plInfoGroup}>
              <Text style={styles.plLabel}>Positions:</Text>
              <Text style={styles.plValue}>0</Text>
              <View style={styles.plDivider} />
              <Text style={styles.plLabel}>P&L:</Text>
              <Text style={[styles.plValue, { color: G.textMuted }]}>0.00</Text>
            </View>
            <View style={styles.toolbarActions}>
              <Pressable style={styles.toolbarActionBtn}>
                <Ionicons name="alarm-outline" size={17} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn}>
                <Ionicons name="scan-outline" size={17} color={TEXT_MUTED} />
              </Pressable>
              <Pressable style={styles.toolbarActionBtn}>
                <Ionicons name="options-outline" size={17} color={TEXT_MUTED} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.chartContainer} onLayout={handleLayout}>
          <GestureDetector gesture={composedGesture}>
            <View style={styles.gestureWrap}>
              {CHART_HEIGHT > 0 && (
                <Canvas style={styles.canvas}>
                  <Line p1={{ x: 0, y: gridLineY1 }} p2={{ x: chartLayout.width, y: gridLineY1 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: 0, y: gridLineY2 }} p2={{ x: chartLayout.width, y: gridLineY2 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: 0, y: gridLineY3 }} p2={{ x: chartLayout.width, y: gridLineY3 }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX1, y: 0 }} p2={{ x: gridLineX1, y: chartLayout.height }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX2, y: 0 }} p2={{ x: gridLineX2, y: chartLayout.height }} color={GRID} strokeWidth={1} />
                  <Line p1={{ x: gridLineX3, y: 0 }} p2={{ x: gridLineX3, y: chartLayout.height }} color={GRID} strokeWidth={1} />

                  <Group transform={transform}>
                    <Path path={paths.upWicks} color={BLUE} style="stroke" strokeWidth={1} />
                    <Path path={paths.upBodies} color={BLUE} />
                    <Path path={paths.downWicks} color={RED} style="stroke" strokeWidth={1} />
                    <Path path={paths.downBodies} color={RED} />

                    <Line p1={{ x: 0, y: bidPriceY }} p2={{ x: 10000, y: bidPriceY }} color={BLUE} strokeWidth={1} style="stroke">
                      <DashPathEffect intervals={[4, 4]} />
                    </Line>
                    <Line p1={{ x: 0, y: askPriceY }} p2={{ x: 10000, y: askPriceY }} color={RED} strokeWidth={1} style="stroke">
                      <DashPathEffect intervals={[4, 4]} />
                    </Line>
                  </Group>
                </Canvas>
              )}

              {CHART_HEIGHT > 0 && (
                <>
                  <View style={[styles.priceTagWrap, { top: bidPriceY - 10, backgroundColor: BLUE }]}>
                    <Text style={styles.priceTagText}>{latestBid.toFixed(displayDecimals)}</Text>
                  </View>
                  <View style={[styles.priceTagWrap, { top: askPriceY - 10, backgroundColor: RED }]}>
                    <Text style={styles.priceTagText}>{latestAsk.toFixed(displayDecimals)}</Text>
                  </View>

                  <Text style={[styles.axisLabelY, { top: gridLineY1 - 8 }]}>{(minVal + yRange * 0.75).toFixed(displayDecimals)}</Text>
                  <Text style={[styles.axisLabelY, { top: gridLineY2 - 8 }]}>{(minVal + yRange * 0.5).toFixed(displayDecimals)}</Text>
                  <Text style={[styles.axisLabelY, { top: gridLineY3 - 8 }]}>{(minVal + yRange * 0.25).toFixed(displayDecimals)}</Text>
                </>
              )}

              <View style={styles.xAxis}>
                <Text style={[styles.xTick, { left: '8%' }]}>14:15</Text>
                <Text style={[styles.xTick, { left: '42%' }]}>15:05</Text>
                <Text style={[styles.xTick, { left: '80%' }]}>15:55</Text>
              </View>

              <Animated.View style={crosshairVerticalStyle} />
              <Animated.View style={crosshairHorizontalStyle} />
              <Animated.View style={crosshairPriceStyle}>
                <Text style={styles.crosshairText}>{crosshairPriceDisplay}</Text>
              </Animated.View>
            </View>
          </GestureDetector>
        </View>

        <View style={styles.bottomArea}>
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
            <Pressable style={[styles.actionBtn, styles.actionBtnSell]}>
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>SELL</Text>
                <Text style={styles.actionBtnPriceText}>@ {latestAsk.toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>

            <View style={styles.actionSpacer} />

            <Pressable style={[styles.actionBtn, styles.actionBtnBuy]}>
              <View style={styles.actionBtnInnerLeft}>
                <Text style={styles.actionBtnLabelTitle}>BUY</Text>
                <Text style={styles.actionBtnPriceText}>@ {latestBid.toFixed(displayDecimals)}</Text>
              </View>
              <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={styles.actionChevron} />
            </Pressable>
          </View>

          <View style={styles.lotSelectorBar}>
            <Pressable style={styles.lotStepperBtn}>
              <Ionicons name="remove" size={20} color="#94A3B8" />
            </Pressable>
            <Text style={styles.lotLabelText}>Lot: <Text style={styles.lotValueText}>0.10</Text></Text>
            <Pressable style={styles.lotStepperBtn}>
              <Ionicons name="add" size={20} color="#94A3B8" />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: G.glass1,
    borderWidth: 1,
    borderColor: G.border,
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
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  badgeLive: {
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderColor: 'rgba(250, 204, 21, 0.3)',
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
    backgroundColor: '#FACC15',
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
    color: '#FACC15',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  balanceText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  currencyText: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '800',
  },
  card: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  glassToolbar: {
    marginHorizontal: 16,
    borderRadius: 18, // Match Trade Screen summary block
    backgroundColor: '#0a0f1f', // Match Trade Screen background
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
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
    color: G.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  microBadge: {
    backgroundColor: G.glass2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: G.border,
  },
  microBadgeText: {
    color: G.textSub,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  symbolSubText: {
    color: '#FFFFFF',
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
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    borderTopColor: G.border,
  },
  plInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 4,
  },
  plValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  plDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginLeft: 16,
    marginRight: 6,
  },
  chartContainer: {
    flex: 1,
    backgroundColor: '#060b17',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: GRID,
    position: 'relative',
  },
  gestureWrap: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  overlayPill: {
    /* Removed from mockup, but leaving empty class just in case */
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
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  crosshairText: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  bottomArea: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: G.border,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tfText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  tfTextActive: {
    color: '#fff',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(41, 98, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.15)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  segmentText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: '#fff',
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
    backgroundColor: 'rgba(255, 42, 85, 0.1)', // Subtle red tint
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 85, 0.25)',
    shadowColor: '#FF2A55',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  actionBtnBuy: {
    backgroundColor: 'rgba(41, 98, 255, 0.1)', // Subtle blue tint
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.25)',
    shadowColor: '#2962FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  actionBtnInnerLeft: {
    flex: 1,
  },
  actionBtnLabelTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  actionBtnPriceText: {
    color: TEXT,
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
    backgroundColor: 'rgba(41, 98, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.15)',
  },
  lotStepperBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotLabelText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  lotValueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#2962FF', overflow: 'visible', position: 'relative' },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarDot: { position: 'absolute', bottom: 0, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#089981', borderWidth: 2, borderColor: '#040609' },
});

