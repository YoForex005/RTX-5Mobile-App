/**
 * Chart Feature UI: ObjectsScreen
 * 
 * Manages user-drawn chart objects. Allows locking/unlocking, showing/hiding,
 * and deleting stored persistent chart drawings (like trendlines and fib retracements).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const addDrawing = (label: string) => {
    addChartDrawing(`${label} ${chartDrawings.length + 1}`);
  };

  return (
    <Screen style={s.screen}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={s.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={s.headerTitleWrap} pointerEvents="none">
            <Text style={s.headerTitle} numberOfLines={1}>Objects</Text>
          </View>
          <View style={s.headerBackBtn} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : T.border,
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
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
