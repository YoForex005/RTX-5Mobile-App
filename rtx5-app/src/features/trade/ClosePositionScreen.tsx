import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { positions } from '../../mock/tradingData';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';
import { findPositionById, symbolDisplayName } from './tradeFlow';

export function ClosePositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const [submitted, setSubmitted] = useState(false);

  const position = useMemo(
    () => findPositionById(positionId) ?? positions[0],
    [positionId]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Close Position</Text>
        <Text style={styles.subTitle}>Review and confirm closing order</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{position.symbol}</Text>
          <Text style={[styles.side, position.side === 'buy' ? styles.buy : styles.sell]}>
            {position.side} {position.volume.toFixed(2)}
          </Text>
        </View>
        <Text style={styles.instrument}>{symbolDisplayName(position.symbol)}</Text>

        <View style={styles.metrics}>
          <Metric label='Open' value={fmt.price(position.openPrice)} />
          <Metric label='Current' value={fmt.price(position.currentPrice)} />
          <Metric label='P/L' value={fmt.pnl(position.pnl)} negative={position.pnl < 0} positive={position.pnl > 0} />
          <Metric label='Ticket' value={`#${position.id}`} />
        </View>
      </View>

      {submitted ? (
        <View style={styles.success}>
          <Text style={styles.successText}>Close order simulated. Waiting for backend confirmation.</Text>
        </View>
      ) : null}

      <Pressable style={styles.dangerButton} onPress={() => setSubmitted(true)}>
        <Text style={styles.dangerButtonText}>Close Position</Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push({ pathname: '/trade/close-by', params: { positionId: position.id } })}
      >
        <Text style={styles.secondaryButtonText}>Close By Instead</Text>
      </Pressable>
    </Screen>
  );
}

function Metric({
  label,
  value,
  negative = false,
  positive = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, negative && styles.negative, positive && styles.positive]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subTitle: {
    marginTop: 2,
    color: '#7e8ba1',
    fontSize: 12,
  },
  card: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e283b',
    backgroundColor: '#0a111c',
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  symbol: {
    color: '#ecf2fb',
    fontSize: 20,
    fontWeight: '700',
  },
  side: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  buy: {
    color: colors.positive,
  },
  sell: {
    color: colors.negative,
  },
  instrument: {
    marginTop: 4,
    color: '#90a0b7',
    fontSize: 12,
  },
  metrics: {
    marginTop: spacing.md,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: '#9aa8bc',
    fontSize: 13,
  },
  metricValue: {
    color: '#e6edf8',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  negative: {
    color: colors.negative,
  },
  positive: {
    color: colors.positive,
  },
  success: {
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#254f42',
    backgroundColor: '#122f27',
    padding: spacing.md,
  },
  successText: {
    color: '#7be0b5',
    fontSize: 13,
  },
  dangerButton: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    backgroundColor: '#bf342c',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d3a52',
    backgroundColor: '#121a2a',
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#8db8ff',
    fontSize: 15,
    fontWeight: '600',
  },
});
