import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';

const presets = ['Today', 'Last week', 'Last month', 'Last 3 months', 'Last 6 months', 'Last year', 'Custom'];

export function HistoryFilterScreen() {
  const { historyRange, setHistoryRange } = useUserPreferences();

  return (
    <Screen>
      <Text style={styles.title}>History</Text>
      <View style={styles.symbolRow}>
        <Text style={styles.label}>Symbol:</Text>
        <Text style={styles.value}>All symbols</Text>
      </View>

      <View style={styles.card}>
        {presets.map((preset) => (
          <Pressable key={preset} onPress={() => setHistoryRange(preset)} style={styles.option}>
            <Text style={styles.optionText}>{preset}</Text>
            <Text style={styles.check}>{historyRange === preset ? '✓' : ''}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.reportBtn}>
        <Text style={styles.reportTitle}>Create a trade report</Text>
        <Text style={styles.reportSub}>{historyRange}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  symbolRow: {
    margin: spacing.md,
    backgroundColor: '#161b24',
    borderRadius: 10,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#cbd1dc',
    fontSize: 16,
  },
  value: {
    color: '#b7bfcd',
    fontSize: 16,
  },
  card: {
    marginHorizontal: spacing.md,
    backgroundColor: '#171b24',
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomColor: '#232938',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionText: {
    color: '#eef2f7',
    fontSize: 18,
  },
  check: {
    color: colors.accent,
    fontSize: 20,
  },
  reportBtn: {
    margin: spacing.md,
    marginTop: spacing.xl,
    backgroundColor: '#171b24',
    borderRadius: 10,
    padding: spacing.md,
  },
  reportTitle: {
    color: '#e5e7eb',
    fontSize: 18,
  },
  reportSub: {
    color: '#8d95a3',
    marginTop: 4,
  },
});
