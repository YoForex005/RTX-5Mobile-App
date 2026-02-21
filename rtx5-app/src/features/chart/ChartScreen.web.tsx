import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

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

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe } = useUserPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [candles, setCandles] = useState(() => generateCandles(120, chartSymbol.includes('JPY') ? 150.00 : 1.0500));

  // Live tick simulation
  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      setCandles(prev => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        const current = { ...next[lastIndex] };

        // Random walk
        const range = current.open * 0.0005;
        const tick = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * range);

        current.close += tick;
        current.high = Math.max(current.high, current.close);
        current.low = Math.min(current.low, current.close);

        next[lastIndex] = current;

        // Spawn literal new candle every 40 ticks
        tickCount++;
        if (tickCount > 40) {
          tickCount = 0;
          next.push({
            open: current.close,
            high: current.close,
            low: current.close,
            close: current.close,
          });
          // Scroll slightly to reveal new candle
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }

        return next;
      });
    }, 250); // fast ticks
    return () => clearInterval(interval);
  }, []);

  // Update starting baseline if symbol changes (hard reset)
  useEffect(() => {
    setCandles(generateCandles(120, chartSymbol.includes('JPY') ? 150.00 : 1.0500));
  }, [chartSymbol, chartTimeframe]);

  const CANDLE_WIDTH = 6;
  const CANDLE_GAP = 3;
  const CHART_WIDTH = Math.max(candles.length * (CANDLE_WIDTH + CANDLE_GAP) + 60, chartLayout.width);
  const CHART_HEIGHT = chartLayout.height;

  const min = useMemo(() => Math.min(...candles.map(c => c.low)) * 0.999, [candles]);
  const max = useMemo(() => Math.max(...candles.map(c => c.high)) * 1.001, [candles]);
  const range = max - min;

  const getY = (val: number) => {
    if (range === 0 || CHART_HEIGHT === 0) return 0;
    return CHART_HEIGHT - ((val - min) / range) * CHART_HEIGHT;
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  };

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

      <Text style={styles.symbol}>
        {chartSymbol} ▾ {chartTimeframe}
      </Text>
      <Text style={styles.sub}>Instrument chart</Text>
      <Text style={styles.sub}>Market closed</Text>

      <View style={styles.chartWrap} onLayout={handleLayout}>
        {CHART_HEIGHT > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            <View style={{ width: CHART_WIDTH, height: CHART_HEIGHT }}>
              {/* Grid Lines */}
              {[0.25, 0.5, 0.75].map(v => (
                <View
                  key={v}
                  style={[styles.gridLine, { top: CHART_HEIGHT * v, width: CHART_WIDTH }]}
                />
              ))}

              {/* Candles */}
              {candles.map((c, i) => {
                const x = i * (CANDLE_WIDTH + CANDLE_GAP) + 10;
                const isUp = c.close >= c.open;
                const color = isUp ? G.up : G.down;
                const openY = getY(c.open);
                const closeY = getY(c.close);
                const highY = getY(c.high);
                const lowY = getY(c.low);
                const topY = Math.min(openY, closeY);
                const bodyHeight = Math.max(Math.abs(openY - closeY), 1);
                const wickX = x + CANDLE_WIDTH / 2;

                return (
                  <View key={i} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, pointerEvents: 'none' }}>
                    <View style={{
                      position: 'absolute',
                      left: wickX,
                      top: highY,
                      height: Math.max(lowY - highY, 1),
                      width: 1,
                      backgroundColor: color
                    }} />
                    <View style={{
                      position: 'absolute',
                      left: x,
                      top: topY,
                      width: CANDLE_WIDTH,
                      height: bodyHeight,
                      backgroundColor: color
                    }} />
                  </View>
                );
              })}

              {/* Current Price Line */}
              {(() => {
                const last = candles[candles.length - 1];
                const liveY = getY(last.close);
                return (
                  <View style={{
                    position: 'absolute',
                    top: liveY,
                    left: 0,
                    right: 0,
                    width: CHART_WIDTH,
                    height: 1,
                    backgroundColor: G.text,
                    opacity: 0.8
                  }} />
                );
              })()}
            </View>
          </ScrollView>
        )}
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
    justifyContent: 'flex-end',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: G.border,
  },
  candleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
  },
  candle: {
    width: 10,
    borderRadius: 2,
    opacity: 0.9,
  },
  timeframeRow: {
    marginTop: spacing.md,
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
