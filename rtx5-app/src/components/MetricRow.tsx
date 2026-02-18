import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  label: string;
  value: string;
  compact?: boolean;
  withDivider?: boolean;
};

export function MetricRow({ label, value, compact = false, withDivider = false }: Props) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, withDivider && styles.rowDivider]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCompact: {
    paddingVertical: 8,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a2233',
  },
  label: {
    color: '#c8d0de',
    fontSize: 16,
  },
  labelCompact: {
    color: '#a3b1c6',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  value: {
    color: '#e7ecf5',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontSize: 14,
  },
});
