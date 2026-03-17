import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { ThemeColors } from '../../theme/glass';
import { useMemo } from 'react';

export function ObjectsScreen() {
  const {
    chartLockAll,
    chartHideAll,
    chartDrawings,
    setChartLockAll,
    setChartHideAll,
    addChartDrawing,
    removeChartDrawing,
    themeMode,
  } = useUserPreferences();
  const T = useTheme();
  const s = useMemo(() => makeStyles(T), [T]);

  const addDrawing = (label: string) => {
    addChartDrawing(`${label} ${chartDrawings.length + 1}`);
  };

  return (
    <Screen>
      <Text style={s.title}>Objects</Text>
      <View style={s.toggleRow}>
        <Pressable style={[s.toggle, chartLockAll && s.toggleActive]} onPress={() => setChartLockAll(!chartLockAll)}>
          <Text style={s.toggleText}>{chartLockAll ? 'Unlock all' : 'Lock all'}</Text>
        </Pressable>
        <Pressable style={[s.toggle, chartHideAll && s.toggleActive]} onPress={() => setChartHideAll(!chartHideAll)}>
          <Text style={s.toggleText}>{chartHideAll ? 'Show all' : 'Hide all'}</Text>
        </Pressable>
      </View>
      <View style={s.card}>
        <Pressable onPress={() => addDrawing('Object')}><Text style={s.item}>Add Object</Text></Pressable>
        <Pressable onPress={() => addDrawing('Text')}><Text style={s.item}>Add Text</Text></Pressable>
      </View>
      <View style={s.toolsRow}>
        <Text style={s.tool}>■</Text>
        <Text style={s.tool}>│</Text>
        <Text style={s.tool}>—</Text>
        <Text style={s.tool}>／</Text>
        <Text style={s.tool}>∠</Text>
        <Text style={s.tool}>⋮</Text>
      </View>
      <Text style={s.help}>Long tap the object on the chart to edit or delete it</Text>
      <View style={s.savedWrap}>
        <Text style={s.savedTitle}>Saved Drawings ({chartDrawings.length})</Text>
        {chartDrawings.map((drawing: string) => (
          <Pressable key={drawing} style={s.savedRow} onLongPress={() => removeChartDrawing(drawing)}>
            <Text style={s.savedText}>{drawing}</Text>
            <Text style={s.savedHint}>hold to remove</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    title: {
      marginTop: spacing.md,
      marginHorizontal: spacing.md,
      color: T.text,
      fontSize: 24,
      fontWeight: '700',
    },
    toggleRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    toggle: {
      flex: 1,
      backgroundColor: T.glass1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    toggleActive: {
      borderColor: T.borderHi,
    },
    toggleText: {
      color: T.textSub,
      fontSize: 14,
    },
    card: {
      margin: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass1,
    },
    item: {
      color: T.text,
      fontSize: 17,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderBottomColor: T.border,
      borderBottomWidth: 1,
    },
    toolsRow: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
    },
    tool: {
      color: T.accent,
      fontSize: 24,
    },
    help: {
      marginTop: spacing.xl,
      textAlign: 'center',
      color: T.textMuted,
      fontSize: 14,
    },
    savedWrap: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.md,
    },
    savedTitle: {
      color: T.text,
      fontSize: 16,
      marginBottom: spacing.sm,
      fontWeight: '700',
    },
    savedRow: {
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass1,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    savedText: {
      color: T.text,
      fontSize: 14,
    },
    savedHint: {
      color: T.textMuted,
      fontSize: 12,
    },
  });
}
