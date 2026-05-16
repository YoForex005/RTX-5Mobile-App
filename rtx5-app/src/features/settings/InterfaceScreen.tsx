import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings -> Language Preference (Language picker)
 *
 * Lets the user pick from the supported language list. Selection is
 * persisted to userPreferences and applied immediately app-wide via the
 * useTranslation hook.
 */
import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useUserPreferences } from '../../state/userPreferences';
import { useTranslation } from '../../i18n/useTranslation';
import { SUPPORTED_LANGUAGES } from '../../i18n/translations';
import { safeRouterBack } from '../../utils/navigation';

export function InterfaceScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useTranslation();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);

  return (
    <Screen style={isDark ? { backgroundColor: '#06080D' } : undefined}>
      <View style={styles.header}>
        <Pressable
          onPress={() => safeRouterBack(router, '/(tabs)/settings')}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <View style={styles.headerTitleSpacer} />
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.sectionLabel}>{t('Select language')}</Text>

      <FlatList
        data={SUPPORTED_LANGUAGES}
        extraData={language}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const selected = item.code === language;
          return (
            <Pressable
              onPress={() => setLanguage(item.code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.rowText}>
                <Text style={styles.nativeName}>{item.nativeName}</Text>
                <Text style={styles.englishName}>{item.englishName}</Text>
              </View>
              {selected && <Ionicons name="checkmark" size={22} color={T.accent ?? '#2563EB'} />}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 12,
      backgroundColor: isDark ? '#06080D' : T.bg,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: T.glass1,
    },
    headerTitleSpacer: { flex: 1 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      color: T.textMuted,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: isDark ? '#0E141F' : T.glass1,
      borderRadius: 12,
      marginVertical: 4,
      borderWidth: 1,
      borderColor: T.border,
    },
    rowText: { flex: 1 },
    nativeName: { fontSize: 16, fontWeight: '600', color: T.text },
    englishName: { fontSize: 12, color: T.textMuted, marginTop: 2 },
    divider: { height: 0 },
  });
}
