import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

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
    color: G.text,
    fontSize: 24,
    fontWeight: '700',
  },
  symbolRow: {
    margin: spacing.md,
    backgroundColor: G.glass1,
    borderRadius: 10,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: G.border,
  },
  label: {
    color: G.textSub,
    fontSize: 16,
  },
  value: {
    color: G.textMuted,
    fontSize: 16,
  },
  card: {
    marginHorizontal: spacing.md,
    backgroundColor: G.glass1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: G.borderMedium,
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomColor: G.borderMedium,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionText: {
    color: G.text,
    fontSize: 18,
  },
  check: {
    color: G.accent,
    fontSize: 20,
  },
  reportBtn: {
    margin: spacing.md,
    marginTop: spacing.xl,
    backgroundColor: G.glass1,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: G.border,
  },
  reportTitle: {
    color: G.text,
    fontSize: 18,
  },
  reportSub: {
    color: G.textMuted,
    marginTop: 4,
  },
});
