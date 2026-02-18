import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';
import { bulkModeLabel, filterPositionsForBulk } from './tradeFlow';

export function BulkOperationScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [submitted, setSubmitted] = useState(false);

  const title = bulkModeLabel(mode);
  const affectedPositions = useMemo(
    () => filterPositionsForBulk(mode),
    [mode]
  );
  const totalPnl = affectedPositions.reduce((sum, position) => sum + position.pnl, 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Bulk Operations</Text>
        <Text style={styles.subTitle}>{title}</Text>
      </View>

      <View style={styles.summaryCard}>
        <Row label='Affected Positions' value={String(affectedPositions.length)} />
        <Row label='Total Exposure P/L' value={fmt.pnl(totalPnl)} danger={totalPnl < 0} positive={totalPnl > 0} />
      </View>

      <View style={styles.previewCard}>
        {affectedPositions.slice(0, 6).map((position) => (
          <View key={position.id} style={styles.previewRow}>
            <Text style={styles.previewLeft}>#{position.id} {position.symbol} {position.side} {position.volume.toFixed(2)}</Text>
            <Text style={[styles.previewRight, position.pnl < 0 ? styles.danger : styles.positive]}>{fmt.pnl(position.pnl)}</Text>
          </View>
        ))}
        {affectedPositions.length === 0 ? (
          <Text style={styles.emptyText}>No positions match this operation.</Text>
        ) : null}
      </View>

      {submitted ? (
        <View style={styles.success}>
          <Text style={styles.successText}>Bulk operation simulated and queued for backend execution.</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.executeButton, affectedPositions.length === 0 && styles.executeDisabled]}
        onPress={() => setSubmitted(true)}
        disabled={affectedPositions.length === 0}
      >
        <Text style={styles.executeText}>Execute Bulk Operation</Text>
      </Pressable>
    </Screen>
  );
}

function Row({
  label,
  value,
  danger = false,
  positive = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, danger && styles.danger, positive && styles.positive]}>{value}</Text>
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
  summaryCard: {
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2a3e',
    backgroundColor: '#0a111c',
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#9da9bc',
    fontSize: 13,
  },
  summaryValue: {
    color: '#e5ecf8',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  previewCard: {
    marginHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1d2739',
    backgroundColor: '#0b121d',
    overflow: 'hidden',
  },
  previewRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#172236',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewLeft: {
    color: '#cfd7e5',
    fontSize: 12,
    flex: 1,
  },
  previewRight: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    padding: spacing.md,
    color: '#7f8ba0',
    fontSize: 13,
  },
  success: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
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
  executeButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: 8,
    backgroundColor: '#bf342c',
    alignItems: 'center',
    paddingVertical: 12,
  },
  executeDisabled: {
    opacity: 0.4,
  },
  executeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  danger: {
    color: colors.negative,
  },
  positive: {
    color: colors.positive,
  },
});
