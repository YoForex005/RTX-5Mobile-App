/**
 * Chart Feature UI: IndicatorConfigScreen
 *
 * MT5-style indicator configuration screen. Parameters, Style, Levels,
 * and Visualization sections — each style line and level opens its own
 * dedicated editor screen, mirroring MT5's mobile flow.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTheme } from '../../../ui/theme/useTheme';
import { useIndicatorEditState } from '../indicatorEditState';
import { getIndicatorMeta } from '../indicatorRegistry';
import { ConfigBody } from './ConfigBody';
import { makeIndicatorConfigStyles } from './styles';

export function IndicatorConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();

  const meta = useMemo(() => getIndicatorMeta(id as string), [id]);
  const initialize = useIndicatorEditState((s) => s.initialize);
  const clear = useIndicatorEditState((s) => s.clear);
  const editMeta = useIndicatorEditState((s) => s.meta);

  useEffect(() => {
    if (meta && (!editMeta || editMeta.id !== meta.id)) {
      initialize(meta);
    }
  }, [meta, editMeta, initialize]);

  const bgColor = isDark ? '#06080D' : '#F4F5F7';
  const styles = useMemo(() => makeIndicatorConfigStyles(bgColor, isDark, T), [bgColor, isDark, T]);

  if (!meta) {
    return (
      <Screen style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>Unknown</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </Screen>
    );
  }

  return (
    <ConfigBody
      metaId={meta.id}
      styles={styles}
      isDark={isDark}
      insets={insets}
      T={T}
      onDone={() => {
        clear();
        router.back();
      }}
    />
  );
}
