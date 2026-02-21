import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Line, Path, Skia } from '@shopify/react-native-skia';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, useDerivedValue, runOnJS } from 'react-native-reanimated';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

function generateCandles(count: number, startPrice: number) {
  let price = startPrice;
  const candles = [];
  for (let i = 0; i < count; i++) {
    const isUp = Math.random() > 0.49;
    const range = price * 0.002;
    const open = price;
    let close = price + (isUp ? 1 : -1) * (Math.random() * range);
    if (Math.random() > 0.9) {
      close += (isUp ? 1 : -1) * range * 2;
    }
    const high = Math.max(open, close) + Math.random() * (range * 0.5);
    const low = Math.min(open, close) - Math.random() * (range * 0.5);
    price = close;
    candles.push({ open, high, low, close });
  }
  return candles;
}

const CANDLE_WIDTH = 6;
const CANDLE_GAP = 3;

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe } = useUserPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [candles, setCandles] = useState(() => generateCandles(120, chartSymbol.includes('JPY') ? 150.00 : 1.0500));

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

        const range = current.open * 0.0005;
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
    setCandles(generateCandles(120, chartSymbol.includes('JPY') ? 150.00 : 1.0500));
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

  const currentPriceY = candles.length > 0 ? getY(candles[candles.length - 1].close) : -10;

  const crosshairVerticalStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: crosshairX.value,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: G.textMuted,
    opacity: isCrosshairActive.value ? 1 : 0,
    pointerEvents: 'none',
  }));

  const crosshairHorizontalStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: crosshairY.value,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: G.textMuted,
    opacity: isCrosshairActive.value ? 1 : 0,
    pointerEvents: 'none',
  }));

  const crosshairPriceStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      right: 0,
      top: crosshairY.value - 12,
      backgroundColor: G.glass1,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: G.border,
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

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable onPress={() => setTfOpen(true)}>
          <Text style={styles.title}>{chartTimeframe}</Text>
        </Pressable>
        <View style={styles.icons}>
          <Text style={styles.icon}>╂</Text>
          <Text style={styles.icon}>ƒ</Text>
          <Pressable onPress={() => setMenuOpen(true)}>
            <Text style={styles.icon}>⌂</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.symbol}>{chartSymbol} ▾ {chartTimeframe}</Text>
      <Text style={styles.sub}>Instrument chart</Text>
      <Text style={styles.sub}>Market closed</Text>

      <View style={styles.chartWrap} onLayout={handleLayout}>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.gestureWrap}>
            {CHART_HEIGHT > 0 && (
              <Canvas style={styles.canvas}>
                <Line p1={{ x: 0, y: gridLineY1 }} p2={{ x: chartLayout.width, y: gridLineY1 }} color={G.border} strokeWidth={1} />
                <Line p1={{ x: 0, y: gridLineY2 }} p2={{ x: chartLayout.width, y: gridLineY2 }} color={G.border} strokeWidth={1} />
                <Line p1={{ x: 0, y: gridLineY3 }} p2={{ x: chartLayout.width, y: gridLineY3 }} color={G.border} strokeWidth={1} />

                <Group transform={transform}>
                  <Path path={paths.upWicks} color={G.up} style="stroke" strokeWidth={1} />
                  <Path path={paths.upBodies} color={G.up} />
                  <Path path={paths.downWicks} color={G.down} style="stroke" strokeWidth={1} />
                  <Path path={paths.downBodies} color={G.down} />

                  <Line p1={{ x: 0, y: currentPriceY }} p2={{ x: 10000, y: currentPriceY }} color={G.text} strokeWidth={1} style="stroke" />
                </Group>
              </Canvas>
            )}

            <Animated.View style={crosshairVerticalStyle} />
            <Animated.View style={crosshairHorizontalStyle} />
            <Animated.View style={crosshairPriceStyle}>
              <Text style={styles.crosshairText}>{crosshairPriceDisplay}</Text>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      <View style={styles.timeframeRow}>
        {timeframes.map((tf) => (
          <Pressable key={tf} onPress={() => setChartTimeframe(tf)}>
            <Text style={[styles.tfText, chartTimeframe === tf && styles.tfActive]}>{tf}</Text>
          </Pressable>
        ))}
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
  topRow: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: G.text,
    fontSize: 20,
    fontWeight: '700',
  },
  icons: {
    flexDirection: 'row',
    gap: 16,
  },
  icon: {
    color: G.textMuted,
    fontSize: 22,
  },
  symbol: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    color: G.text,
    fontWeight: '700',
  },
  sub: {
    marginHorizontal: spacing.md,
    color: G.textSub,
    fontSize: 14,
  },
  chartWrap: {
    flex: 1,
    marginTop: spacing.sm,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gestureWrap: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  crosshairText: {
    color: G.text,
    fontSize: 12,
  },
  timeframeRow: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.md,
  },
  tfText: {
    color: G.textSub,
    fontSize: 13,
  },
  tfActive: {
    color: G.accent,
    fontWeight: '700',
  },
});

