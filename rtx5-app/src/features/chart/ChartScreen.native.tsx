import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Line, Path, Skia } from '@shopify/react-native-skia';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';

const points = [
  [10, 230], [25, 190], [50, 320], [75, 170], [100, 280], [130, 160], [160, 220], [190, 120],
  [220, 240], [255, 160], [290, 210], [320, 150], [350, 260], [390, 180], [430, 220], [470, 170],
];

const path = points.reduce((acc, [x, y], idx) => {
  if (idx === 0) {
    acc.moveTo(x, y);
  } else {
    acc.lineTo(x, y);
  }
  return acc;
}, Skia.Path.Make());

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

export function ChartScreen() {
  const { chartSymbol, chartTimeframe, setChartTimeframe } = useUserPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);

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

      <View style={styles.chartWrap}>
        <Canvas style={styles.chartCanvas}>
          <Line p1={{ x: 0, y: 260 }} p2={{ x: 500, y: 260 }} color='#1d2330' strokeWidth={1} />
          <Line p1={{ x: 0, y: 180 }} p2={{ x: 500, y: 180 }} color='#1d2330' strokeWidth={1} />
          <Line p1={{ x: 0, y: 100 }} p2={{ x: 500, y: 100 }} color='#1d2330' strokeWidth={1} />
          <Path path={path} color='#2f5a70' style='stroke' strokeWidth={2} />
        </Canvas>
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
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  icons: {
    flexDirection: 'row',
    gap: 16,
  },
  icon: {
    color: '#cfd4de',
    fontSize: 22,
  },
  symbol: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    color: '#d8dbe3',
    fontWeight: '700',
  },
  sub: {
    marginHorizontal: spacing.md,
    color: '#99a1af',
    fontSize: 14,
  },
  chartWrap: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: '#171b25',
    backgroundColor: '#06080d',
    borderRadius: 4,
    overflow: 'hidden',
  },
  chartCanvas: {
    width: '100%',
    height: 420,
  },
  timeframeRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.md,
  },
  tfText: {
    color: '#d2d7df',
    fontSize: 13,
  },
  tfActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
