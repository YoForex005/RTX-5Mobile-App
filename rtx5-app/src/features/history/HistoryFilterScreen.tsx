import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';

const presets = ['Today', 'Last week', 'Last month', 'Last 3 months', 'Last 6 months', 'Last year', 'Custom'];

export function HistoryFilterScreen() {
  const { historyRange, setHistoryRange } = useUserPreferences();
  const T = useTheme();
  const s = useMemo(() => makeStyles(T), [T]);

  return (
    <Screen>
      <Text style={s.title}>History</Text>
      <View style={s.symbolRow}>
        <Text style={s.label}>Symbol:</Text>
        <Text style={s.value}>All symbols</Text>
      </View>

      <View style={s.card}>
        {presets.map((preset) => (
          <Pressable key={preset} onPress={() => setHistoryRange(preset)} style={s.option}>
            <Text style={s.optionText}>{preset}</Text>
            <Text style={s.check}>{historyRange === preset ? '✓' : ''}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={s.reportBtn}>
        <Text style={s.reportTitle}>Create a trade report</Text>
        <Text style={s.reportSub}>{historyRange}</Text>
      </Pressable>
    </Screen>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    title: {
      marginTop: spacing.md,
      textAlign: 'center',
      color: T.text,
      fontSize: 24,
      fontWeight: '700',
    },
    symbolRow: {
      margin: spacing.md,
      backgroundColor: T.glass1,
      borderRadius: 10,
      padding: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: T.border,
    },
    label: {
      color: T.textSub,
      fontSize: 16,
    },
    value: {
      color: T.textMuted,
      fontSize: 16,
    },
    card: {
      marginHorizontal: spacing.md,
      backgroundColor: T.glass1,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: T.borderMedium,
    },
    option: {
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderBottomColor: T.borderMedium,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    optionText: {
      color: T.text,
      fontSize: 18,
    },
    check: {
      color: T.accent,
      fontSize: 20,
    },
    reportBtn: {
      margin: spacing.md,
      marginTop: spacing.xl,
      backgroundColor: T.glass1,
      borderRadius: 10,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: T.border,
    },
    reportTitle: {
      color: T.text,
      fontSize: 18,
    },
    reportSub: {
      color: T.textMuted,
      marginTop: 4,
    },
  });
}
