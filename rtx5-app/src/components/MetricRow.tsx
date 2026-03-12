import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

type Props = {
  label: string;
  value: string;
  compact?: boolean;
  withDivider?: boolean;
};

export function MetricRow({ label, value, compact = false, withDivider = false }: Props) {
  const T = useTheme();

  return (
    <View style={[styles.row, compact && styles.rowCompact, withDivider && { borderBottomWidth: 1, borderBottomColor: T.border }]}>
      <Text style={[styles.label, { color: T.textMuted }, compact && styles.labelCompact]}>{label}</Text>
      <Text style={[styles.value, { color: T.text }, compact && styles.valueCompact]}>{value}</Text>
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
  label: {
    fontSize: 16,
  },
  labelCompact: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontSize: 14,
  },
});
