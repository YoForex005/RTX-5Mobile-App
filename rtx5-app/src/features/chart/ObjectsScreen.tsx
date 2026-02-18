import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';

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
        {chartDrawings.map((drawing) => (
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
    color: colors.text,
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
    backgroundColor: '#171b24',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    borderColor: '#2b78d1',
    borderWidth: 1,
  },
  toggleText: {
    color: '#d5dae2',
    fontSize: 14,
  },
  card: {
    margin: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1b1f2a',
    backgroundColor: '#12151d',
  },
  item: {
    color: colors.text,
    fontSize: 17,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomColor: '#1d2230',
    borderBottomWidth: 1,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  tool: {
    color: colors.accent,
    fontSize: 24,
  },
  help: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: '#6e7686',
    fontSize: 14,
  },
  savedWrap: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
  },
  savedTitle: {
    color: '#d5dae2',
    fontSize: 16,
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  savedRow: {
    borderWidth: 1,
    borderColor: '#1c2231',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  savedText: {
    color: '#e8ecf3',
    fontSize: 14,
  },
  savedHint: {
    color: '#7f8797',
    fontSize: 12,
  },
});
