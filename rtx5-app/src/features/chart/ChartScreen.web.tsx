import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';

const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
const bars = [120, 80, 190, 70, 150, 90, 170, 60, 130, 100, 145, 75, 165, 85, 140, 95, 155, 88, 132, 110];

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

      <Text style={styles.symbol}>
        {chartSymbol} ▾ {chartTimeframe}
      </Text>
      <Text style={styles.sub}>Instrument chart</Text>
      <Text style={styles.sub}>Market closed</Text>

      <View style={styles.chartWrap}>
        <View style={styles.grid}>
          <View style={[styles.gridLine, { top: 60 }]} />
          <View style={[styles.gridLine, { top: 140 }]} />
          <View style={[styles.gridLine, { top: 220 }]} />
          <View style={[styles.gridLine, { top: 300 }]} />
        </View>
        <View style={styles.candleRow}>
          {bars.map((height, index) => (
            <View
              key={`${index}-${height}`}
              style={[
                styles.candle,
                {
                  height,
                  backgroundColor: index % 2 === 0 ? '#2f5a70' : '#3e778f',
                },
              ]}
            />
          ))}
        </View>
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
    height: 420,
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
    backgroundColor: '#1d2330',
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
    color: '#d2d7df',
    fontSize: 13,
  },
  tfActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
