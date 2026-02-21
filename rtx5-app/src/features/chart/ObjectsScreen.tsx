import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../theme';
import { G } from '../../theme/glass';

export function ObjectsScreen() {
  const {
    chartLockAll,
    chartHideAll,
    chartDrawings,
    setChartLockAll,
    setChartHideAll,
    addChartDrawing,
    removeChartDrawing,
  } = useUserPreferences();

  const addDrawing = (label: string) => {
    addChartDrawing(`${label} ${chartDrawings.length + 1}`);
  };

  return (
    <Screen>
      <Text style={styles.title}>Objects</Text>
      <View style={styles.toggleRow}>
        <Pressable style={[styles.toggle, chartLockAll && styles.toggleActive]} onPress={() => setChartLockAll(!chartLockAll)}>
          <Text style={styles.toggleText}>{chartLockAll ? 'Unlock all' : 'Lock all'}</Text>
        </Pressable>
        <Pressable style={[styles.toggle, chartHideAll && styles.toggleActive]} onPress={() => setChartHideAll(!chartHideAll)}>
          <Text style={styles.toggleText}>{chartHideAll ? 'Show all' : 'Hide all'}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Pressable onPress={() => addDrawing('Object')}><Text style={styles.item}>Add Object</Text></Pressable>
        <Pressable onPress={() => addDrawing('Text')}><Text style={styles.item}>Add Text</Text></Pressable>
      </View>
      <View style={styles.toolsRow}>
        <Text style={styles.tool}>■</Text>
        <Text style={styles.tool}>│</Text>
        <Text style={styles.tool}>—</Text>
        <Text style={styles.tool}>／</Text>
        <Text style={styles.tool}>∠</Text>
        <Text style={styles.tool}>⋮</Text>
      </View>
      <Text style={styles.help}>Long tap the object on the chart to edit or delete it</Text>
      <View style={styles.savedWrap}>
        <Text style={styles.savedTitle}>Saved Drawings ({chartDrawings.length})</Text>
        {chartDrawings.map((drawing: string) => (
          <Pressable key={drawing} style={styles.savedRow} onLongPress={() => removeChartDrawing(drawing)}>
            <Text style={styles.savedText}>{drawing}</Text>
            <Text style={styles.savedHint}>hold to remove</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    color: G.text,
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
    backgroundColor: G.glass1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleActive: {
    borderColor: G.borderHi,
  },
  toggleText: {
    color: G.textSub,
    fontSize: 14,
  },
  card: {
    margin: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
  },
  item: {
    color: G.text,
    fontSize: 17,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomColor: G.border,
    borderBottomWidth: 1,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  tool: {
    color: G.accent,
    fontSize: 24,
  },
  help: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: G.textMuted,
    fontSize: 14,
  },
  savedWrap: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
  },
  savedTitle: {
    color: G.text,
    fontSize: 16,
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  savedRow: {
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: G.glass1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  savedText: {
    color: G.text,
    fontSize: 14,
  },
  savedHint: {
    color: G.textMuted,
    fontSize: 12,
  },
});
